import { useState, useCallback, useRef, useEffect } from 'react';
import type { SupportedLanguage } from '../types/agent';

export interface UseVoiceRecognitionOptions {
  onResult?: (text: string) => void;
  onStopRequested?: () => void;
  isAgentSpeaking?: boolean;
  deviceId?: string;
  phoneMicMode?: boolean;
  gainBoost?: number;
  language?: SupportedLanguage;
}

export interface UseVoiceRecognitionReturn {
  isListening: boolean;
  transcript: string;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

const LANG_CODE_MAP: Record<SupportedLanguage, string> = {
  english: 'en-US',
  hindi: 'hi-IN',
  gujarati: 'gu-IN',
  marathi: 'mr-IN',
  spanish: 'es-ES',
  japanese: 'ja-JP',
  chinese: 'zh-CN',
  russian: 'ru-RU',
};

const STOP_KEYWORDS = [
  'stop', 'ruko', 'roko', 'thamba', 'bas', 'chup', 'ruk', 'thobho',
  'quiet', 'cancel', 'shut up', 'pause', 'enough', 'shh', 'rukja',
  'bas karo', 'ruk jao', 'stop speaking', 'stop talking', 'stop jarvis',
  'jarvis stop', 'karen stop', 'friday stop', 'ultron stop'
];

/**
 * Enhanced Web Speech API recognition hook with:
 * 1. Intelligent multi-clause sentence accumulator for long, complex statements.
 * 2. Adaptive silence debounce (VAD) to prevent premature cutoffs during natural pauses.
 * 3. Dynamic BCP-47 language matching (Hindi, Gujarati, English, etc.) for high recognition accuracy.
 * 4. Safe stop-word filter that prevents false cutoffs in long questions containing words like "stop".
 * 5. Automatic MediaRecorder audio archiving with phone mic gain boost.
 */
export function useVoiceRecognition(
  optionsOrCb: UseVoiceRecognitionOptions | ((text: string) => void) = {}
): UseVoiceRecognitionReturn {
  const options: UseVoiceRecognitionOptions =
    typeof optionsOrCb === 'function'
      ? { onResult: optionsOrCb }
      : optionsOrCb || {};

  const {
    onResult,
    onStopRequested,
    isAgentSpeaking,
    deviceId,
    phoneMicMode = true,
    gainBoost = 1.8,
    language = 'english',
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Check browser support for SpeechRecognition
  const isSupported =
    typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const onResultRef = useRef(onResult);
  const onStopRequestedRef = useRef(onStopRequested);
  const isAgentSpeakingRef = useRef(isAgentSpeaking);
  const languageRef = useRef(language);

  // Sentence Accumulation & Silence Debounce State
  const accumulatedFinalRef = useRef<string>('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTranscriptRef = useRef<string>('');
  const shouldKeepListeningRef = useRef<boolean>(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    onStopRequestedRef.current = onStopRequested;
  }, [onStopRequested]);

  useEffect(() => {
    isAgentSpeakingRef.current = isAgentSpeaking;
  }, [isAgentSpeaking]);

  useEffect(() => {
    languageRef.current = language;
    // If active recognition is running and language changes, update recognition.lang
    if (recognitionRef.current) {
      const code = LANG_CODE_MAP[language] || 'en-US';
      try {
        recognitionRef.current.lang = code;
      } catch {}
    }
  }, [language]);

  // Upload recorded audio blob to backend
  const uploadAudioRecording = async (blob: Blob, spokenText: string) => {
    try {
      if (blob.size < 500) return; // skip empty headers/noise

      const ext = blob.type.includes('ogg') ? '.ogg' : blob.type.includes('mp4') ? '.mp4' : '.webm';
      const formData = new FormData();
      formData.append('file', blob, `user_voice_${Date.now()}${ext}`);
      formData.append('transcript', spokenText || '');

      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : '127.0.0.1';
      const baseUrl = isHttps ? window.location.origin : `http://${host}:8000`;

      await fetch(`${baseUrl}/api/recordings/upload`, {
        method: 'POST',
        body: formData,
      });
      console.log(`[AudioArchive] Successfully saved utterance clip (${blob.size} bytes): "${spokenText}"`);
    } catch (e) {
      console.warn('[AudioArchive] Background recording upload note:', e);
    }
  };

  const cleanupAudio = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  const stopListening = useCallback(() => {
    shouldKeepListeningRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    // 1. Stop Speech Recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore if already stopped
      }
    }

    // 2. Stop MediaRecorder safely & upload any remaining captured utterance
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        if (recorder.state === 'recording') {
          recorder.requestData();
        }
        if (audioChunksRef.current.length > 0) {
          const chunksToUpload = [...audioChunksRef.current];
          audioChunksRef.current = [];
          const mimeType = recorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(chunksToUpload, { type: mimeType });
          uploadAudioRecording(audioBlob, finalTranscriptRef.current || transcript);
        }
        recorder.stop();
      } catch (e) {
        console.warn('[VoiceRecognition] Error stopping recorder:', e);
        cleanupAudio();
      }
    } else {
      cleanupAudio();
    }

    accumulatedFinalRef.current = '';
    setIsListening(false);
  }, [transcript]);

  const startListening = useCallback(async () => {
    if (!isSupported) {
      setError('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Brave.');
      return;
    }

    shouldKeepListeningRef.current = true;
    setError(null);
    setTranscript('');
    finalTranscriptRef.current = '';
    accumulatedFinalRef.current = '';

    // If audioContext is suspended, resume it
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch {}
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    try {
      // 1. Start background microphone media stream with optimized settings for phone mic / external mic
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !streamRef.current) {
        try {
          const audioConstraints: MediaTrackConstraints = {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            echoCancellation: phoneMicMode ? false : true,
            noiseSuppression: phoneMicMode ? false : true,
            autoGainControl: phoneMicMode ? false : true,
          };

          let stream: MediaStream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
          } catch (deviceConstraintErr) {
            console.warn('[VoiceRecognition] Exact device constraint failed, falling back to default mic:', deviceConstraintErr);
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: phoneMicMode ? false : true,
                noiseSuppression: phoneMicMode ? false : true,
                autoGainControl: phoneMicMode ? false : true,
              },
            });
          }
          streamRef.current = stream;

          // 2. Apply Web Audio Gain amplification + Dynamic Compressor
          let recordStream: MediaStream = stream;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
              const audioCtx = new AudioCtx();
              audioContextRef.current = audioCtx;

              if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
              }

              const sourceNode = audioCtx.createMediaStreamSource(stream);
              const compressor = audioCtx.createDynamicsCompressor();
              compressor.threshold.setValueAtTime(-36, audioCtx.currentTime);
              compressor.knee.setValueAtTime(30, audioCtx.currentTime);
              compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
              compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
              compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

              const gainNode = audioCtx.createGain();
              const effectiveGain = Math.max(2.0, gainBoost);
              gainNode.gain.setValueAtTime(effectiveGain, audioCtx.currentTime);

              const destination = audioCtx.createMediaStreamDestination();
              sourceNode.connect(compressor);
              compressor.connect(gainNode);
              gainNode.connect(destination);
              recordStream = destination.stream;
            }
          } catch (audioCtxErr) {
            console.warn('[VoiceRecognition] AudioContext gain amplification note:', audioCtxErr);
          }

          // Pick best supported MediaRecorder MIME type
          const mimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
          ];
          const selectedMime = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';

          const recorder = selectedMime
            ? new MediaRecorder(recordStream, { mimeType: selectedMime })
            : new MediaRecorder(recordStream);

          mediaRecorderRef.current = recorder;

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunksRef.current.push(e.data);
            }
          };

          recorder.onstop = () => {
            if (audioChunksRef.current.length > 0) {
              const mimeType = recorder.mimeType || 'audio/webm';
              const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
              uploadAudioRecording(audioBlob, finalTranscriptRef.current);
            }
            cleanupAudio();
          };

          recorder.start(200);
        } catch (streamErr) {
          console.warn('[VoiceRecognition] MediaRecorder setup note:', streamErr);
        }
      }

      // 3. Initialize Speech Recognition with language alignment and continuous multi-clause support
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.lang = LANG_CODE_MAP[languageRef.current] || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      // Dispatches complete statement after user finishes speaking and saves audio clip
      const dispatchFinalStatement = () => {
        const fullStatement = accumulatedFinalRef.current.trim();
        if (fullStatement.length > 0) {
          console.log(`[VoiceRecognition] Complete statement dispatched: "${fullStatement}"`);
          finalTranscriptRef.current = fullStatement;
          accumulatedFinalRef.current = '';
          setTranscript('');

          // 1. Immediately request the latest audio chunk from MediaRecorder for this utterance
          const recorder = mediaRecorderRef.current;
          if (recorder && recorder.state === 'recording') {
            try {
              recorder.requestData();
            } catch (err) {
              console.warn('[VoiceRecognition] requestData note:', err);
            }
          }

          // 2. Package and upload audio blob for this specific utterance
          setTimeout(() => {
            if (audioChunksRef.current.length > 0) {
              const chunksToUpload = [...audioChunksRef.current];
              audioChunksRef.current = []; // Fresh buffer for next utterance
              const mimeType = recorder?.mimeType || 'audio/webm';
              const audioBlob = new Blob(chunksToUpload, { type: mimeType });
              uploadAudioRecording(audioBlob, fullStatement);
            }
          }, 60);

          // 3. Dispatch text result to AI agent
          if (onResultRef.current) {
            onResultRef.current(fullStatement);
          }
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interimText = '';
        let newFinalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            // Pick highest confidence alternative
            const topAlternative = res[0]?.transcript || '';
            if (topAlternative.trim()) {
              newFinalChunk += ' ' + topAlternative.trim();
            }
          } else {
            interimText += ' ' + (res[0]?.transcript || '');
          }
        }

        if (newFinalChunk.trim()) {
          const trimmedChunk = newFinalChunk.trim();
          if (accumulatedFinalRef.current) {
            accumulatedFinalRef.current = `${accumulatedFinalRef.current} ${trimmedChunk}`.trim();
          } else {
            accumulatedFinalRef.current = trimmedChunk;
          }
        }

        const liveCombinedText = `${accumulatedFinalRef.current} ${interimText}`.trim();
        setTranscript(liveCombinedText);

        const textLower = liveCombinedText.toLowerCase();
        const words = textLower.split(/\s+/).filter(Boolean);

        // 1. Precise Stop Word / Barge-In Detection
        // Only trigger an instant stop if:
        // A) The AI is currently speaking and user speaks anything (barge-in interrupt), OR
        // B) The utterance is short (<= 3 words) and is explicitly a stop command.
        const isExactStopCommand =
          words.length <= 3 &&
          STOP_KEYWORDS.some(
            (kw) =>
              textLower === kw ||
              textLower === `jarvis ${kw}` ||
              textLower === `${kw} jarvis` ||
              textLower === `hey jarvis ${kw}` ||
              textLower === `please ${kw}`
          );

        if (isAgentSpeakingRef.current && words.length > 0) {
          console.log(`[VoiceRecognition] Barge-in detected ('${liveCombinedText}'). Halting speech immediately.`);
          if (onStopRequestedRef.current) {
            onStopRequestedRef.current();
          }
        } else if (isExactStopCommand) {
          console.log(`[VoiceRecognition] Stop command detected ('${liveCombinedText}'). Halting speech and clearing buffer.`);
          if (onStopRequestedRef.current) {
            onStopRequestedRef.current();
          }
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          setTranscript('');
          accumulatedFinalRef.current = '';
          finalTranscriptRef.current = '';
          return;
        }

        // 2. Intelligent Silence Debounce (1100ms):
        // Allows long, multi-clause questions with natural pauses between sentences to be fully captured.
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        if (accumulatedFinalRef.current.trim().length > 0) {
          silenceTimerRef.current = setTimeout(() => {
            dispatchFinalStatement();
          }, 1100);
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please allow microphone permission in your browser.');
          shouldKeepListeningRef.current = false;
          stopListening();
        } else if (event.error === 'no-speech' || event.error === 'network') {
          // Normal brief silence or network pause — keep continuous listening active
        } else {
          console.warn('[VoiceRecognition] Speech event note:', event.error);
        }
      };

      recognition.onend = () => {
        // If an accumulated sentence was waiting when speech paused, dispatch it now
        if (accumulatedFinalRef.current.trim().length > 0) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          dispatchFinalStatement();
        }

        // Continuous auto-restart: If should keep listening, immediately restart speech recognition
        if (shouldKeepListeningRef.current) {
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            if (shouldKeepListeningRef.current && recognitionRef.current) {
              try {
                // Ensure active language is synced upon restart
                recognitionRef.current.lang = LANG_CODE_MAP[languageRef.current] || 'en-US';
                recognitionRef.current.start();
              } catch (e) {
                console.warn('[VoiceRecognition] Auto-restart note:', e);
              }
            }
          }, 60);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error('[VoiceRecognition] Failed to start:', e);
      setError('Failed to activate microphone.');
      stopListening();
    }
  }, [isSupported, deviceId, phoneMicMode, gainBoost, stopListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    accumulatedFinalRef.current = '';
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
