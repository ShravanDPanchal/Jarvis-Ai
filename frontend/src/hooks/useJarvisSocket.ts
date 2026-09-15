import { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentPersonaId, SupportedLanguage } from '../types/agent';
import { AGENT_PERSONAS } from '../types/agent';

export type AgentStatus = 'idle' | 'listening' | 'thinking' | 'speaking';
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
export type VoiceOutputMode = 'browser' | 'server' | 'mute';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'jarvis' | 'system';
  persona?: AgentPersonaId;
  language?: SupportedLanguage;
  text: string;
  timestamp: string;
}

interface JarvisSystemDetails {
  ai_provider?: string;
  groq_model?: string;
  history_count?: number;
  status?: string;
  voice_available?: boolean;
}

interface UseJarvisSocketOptions {
  serverUrl?: string;
  persona?: AgentPersonaId;
  language?: SupportedLanguage;
  onSpeechCompleted?: () => void;
  onLanguageChanged?: (lang: SupportedLanguage) => void;
}

export function useJarvisSocket(options: UseJarvisSocketOptions = {}) {
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const defaultHost = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : '127.0.0.1';
  const defaultWsProto = isHttps ? 'wss:' : 'ws:';
  const defaultHttpBase = isHttps ? (typeof window !== 'undefined' ? window.location.origin : '') : `http://${defaultHost}:8000`;
  const serverUrl = options.serverUrl || (isHttps ? `${defaultWsProto}//${typeof window !== 'undefined' ? window.location.host : '127.0.0.1:5173'}/ws` : `${defaultWsProto}//${defaultHost}:8000/ws`);
  const initialPersona = options.persona || 'jarvis';
  const initialLanguage = options.language || 'english';
  const onSpeechCompleted = options.onSpeechCompleted;
  const onLanguageChanged = options.onLanguageChanged;

  const [persona, setPersona] = useState<AgentPersonaId>(initialPersona);
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voiceOutputMode, setVoiceOutputMode] = useState<VoiceOutputMode>('browser');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('jarvis_chat_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      {
        id: 'init-1',
        sender: 'system',
        text: `${AGENT_PERSONAS[initialPersona]?.name || 'J.A.R.V.I.S.'} Core Online. Multilingual AI Agent Ready.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }
    ];
  });

  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem('jarvis_chat_history', JSON.stringify(messages.slice(-100)));
      } else {
        localStorage.removeItem('jarvis_chat_history');
      }
    } catch (e) {
      console.warn('Failed saving chat history to localStorage:', e);
    }
  }, [messages]);
  const [systemDetails, setSystemDetails] = useState<JarvisSystemDetails | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const pingStartRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceModeRef = useRef<VoiceOutputMode>(voiceOutputMode);
  const agentStatusRef = useRef<AgentStatus>(agentStatus);
  const personaRef = useRef<AgentPersonaId>(persona);
  const languageRef = useRef<SupportedLanguage>(language);
  const onSpeechCompletedRef = useRef(onSpeechCompleted);

  useEffect(() => {
    voiceModeRef.current = voiceOutputMode;
  }, [voiceOutputMode]);

  useEffect(() => {
    agentStatusRef.current = agentStatus;
  }, [agentStatus]);

  const onLanguageChangedRef = useRef(onLanguageChanged);

  useEffect(() => {
    personaRef.current = persona;
  }, [persona]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    onSpeechCompletedRef.current = onSpeechCompleted;
  }, [onSpeechCompleted]);

  useEffect(() => {
    onLanguageChangedRef.current = onLanguageChanged;
  }, [onLanguageChanged]);

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Clean markdown, bullets, numbered lists, URLs, citations, slashes, and symbols into pure spoken prose
  const cleanSpeechText = (text: string): string => {
    if (!text) return '';
    let clean = text
      .replace(/<think>[\s\S]*?<\/think>/gi, '') // remove closed think blocks
      .replace(/<think>[\s\S]*/gi, '')          // remove unclosed think blocks
      .replace(/```[\s\S]*?```/g, '')           // remove code blocks
      .replace(/`([^`]+)`/g, '$1')              // remove inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // link text only (e.g. [Python Documentation](https://...) -> Python Documentation)
      .replace(/https?:\/\/\S+|www\.\S+/g, '')  // remove remaining raw URLs
      .replace(/\[\d+\]/g, '')                  // remove citations like [1]
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // remove emojis
      .replace(/^\s*[\*\-\•]\s+/gm, '')         // remove bullet points
      .replace(/^\s*\d+[\.\)]\s+/gm, '');       // remove numbered lists

    // 1. Convert slashes in common terms to natural spoken words (prevents TTS saying "slash" or "forward slash")
    const slashMap: [RegExp, string][] = [
      [/\bAI\/ML\b/gi, 'AI ML'],
      [/\bML\/AI\b/gi, 'ML AI'],
      [/\bUI\/UX\b/gi, 'UI UX'],
      [/\bCI\/CD\b/gi, 'CI CD'],
      [/\bI\/O\b/gi, 'I O'],
      [/\band\/or\b/gi, 'and or'],
      [/\beither\/or\b/gi, 'either or'],
      [/\bw\/o\b/gi, 'without'],
      [/\bw\/\b/gi, 'with'],
      [/\bc\/o\b/gi, 'care of'],
      [/\bkm\/h\b/gi, 'kilometers per hour'],
      [/\bkm\/hr\b/gi, 'kilometers per hour'],
      [/\bmph\b/gi, 'miles per hour'],
    ];
    for (const [pattern, replacement] of slashMap) {
      clean = clean.replace(pattern, replacement);
    }

    // 2. Replace slashes & underscores between words (e.g. "client/server" -> "client server", "user_name" -> "user name")
    clean = clean.replace(/(\b[A-Za-z0-9]+)\s*[\/\\]\s*([A-Za-z0-9]+\b)/g, '$1 $2');
    clean = clean.replace(/(\b[A-Za-z0-9]+)_([A-Za-z0-9]+\b)/g, '$1 $2');

    // 3. Remove standalone symbols, slashes, backslashes, carets, tildes, markdown chars
    clean = clean.replace(/[\/\\|~^#*_+=<>{}\[\]]/g, ' ');
    clean = clean.replace(/&/g, ' and ');

    // 4. Remove duplicate or near-duplicate adjacent sentences
    const fixedBoundaries = clean.replace(/([.!?])([A-Z])/g, '$1 $2');
    const rawSentences = fixedBoundaries.split(/(?<=[.!?])\s+|\n+/);
    if (rawSentences.length > 1) {
      const uniqueSentences: string[] = [];
      const seenNormalized: { norm: string; words: Set<string> }[] = [];

      for (const s of rawSentences) {
        const sClean = s.trim();
        if (!sClean) continue;
        const norm = sClean.toLowerCase().replace(/[^\w\s]/g, '');
        const words = new Set(norm.split(/\s+/).filter(Boolean));

        let isDup = false;
        for (const prev of seenNormalized) {
          if (norm === prev.norm) {
            isDup = true;
            break;
          }
          if (words.size >= 4 && prev.words.size >= 4) {
            let intersectionCount = 0;
            for (const w of words) {
              if (prev.words.has(w)) intersectionCount++;
            }
            const overlap = intersectionCount / Math.max(words.size, prev.words.size);
            if (overlap >= 0.60) {
              isDup = true;
              break;
            }
          }
        }

        if (!isDup) {
          uniqueSentences.push(sClean);
          seenNormalized.push({ norm, words });
        }
      }
      clean = uniqueSentences.join(' ');
    }

    return clean.replace(/\s+/g, ' ').trim();
  };

  /**
   * Immediate 100% speech cancellation function across Web Speech API,
   * HTML5 Audio streams (gTTS Gujarati/Hindi/English/Marathi), and backend Python speech engines.
   */
  const stopSpeaking = useCallback(() => {
    // 1. Force-flush Web Speech API across Chrome, Edge, and Safari
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        // Chrome bug workaround: cancel again to purge any internal speech queue
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
      } catch (err) {
        console.warn('Speech cancellation note:', err);
      }
    }

    // 2. Pause & destroy active HTML5 Audio instances
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
        activeAudioRef.current.src = '';
      } catch {}
      activeAudioRef.current = null;
    }

    // 3. Pause all audio elements across the document
    if (typeof document !== 'undefined') {
      try {
        document.querySelectorAll('audio').forEach((el) => {
          try {
            el.pause();
            el.currentTime = 0;
            el.src = '';
          } catch {}
        });
      } catch {}
    }

    currentUtteranceRef.current = null;
    setAgentStatus('idle');
    setSpeakingMessageId(null);

    // 4. Send WebSocket stop command to backend
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify({ type: 'stop_speaking' }));
      } catch {}
    }

    // 5. Fire HTTP fallback POST stop request to backend
    try {
      fetch(`${defaultHttpBase}/api/stop`, { method: 'POST' }).catch(() => {});
    } catch {}
  }, []);

  // Global key listener at capture phase (Escape or Q key immediately halts speech unconditionally)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isEscape = e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27;
      const isQKey = e.key === 'q' || e.key === 'Q' || e.code === 'KeyQ';

      if (isEscape || isQKey) {
        const target = e.target as HTMLElement | null;
        const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

        // Ignore Q key if typing inside input box; Escape ALWAYS fires unconditionally!
        if (isInput && isQKey) return;

        if (isEscape) {
          e.preventDefault();
          e.stopPropagation();
        }
        stopSpeaking();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyDown, true);
    };
  }, [stopSpeaking]);

  /**
   * High-Fidelity Multilingual & Persona Speech Synthesis:
   * Selects native Hindi (hi-IN) / Gujarati (gu-IN) / English voices and modulates
   * pitch and rate according to the active AI agent persona (Ultron, Friday, Vision, Karen, Titan, Jarvis).
   */
  const speakWithBrowser = useCallback((
    text: string,
    targetPersona: AgentPersonaId = personaRef.current,
    targetLang: SupportedLanguage = languageRef.current,
    messageId?: string
  ) => {
    // 1. Halt any prior speech cleanly
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = '';
      } catch {}
      activeAudioRef.current = null;
    }

    const clean = cleanSpeechText(text);
    if (!clean) {
      setSpeakingMessageId(null);
      setAgentStatus('idle');
      onSpeechCompletedRef.current?.();
      return;
    }

    const personaConfig = AGENT_PERSONAS[targetPersona] || AGENT_PERSONAS.jarvis;

    // Detect if text contains native Gujarati or Devanagari Hindi characters
    const hasGujarati = /[\u0A80-\u0AFF]/.test(clean) || targetLang === 'gujarati';
    const hasHindi = /[\u0900-\u097F]/.test(clean) || targetLang === 'hindi';

    const voices = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];

    if (hasGujarati) {
      // Find native Gujarati voice
      const guVoice = voices.find(
        (v) =>
          v.lang.startsWith('gu') ||
          v.name.toLowerCase().includes('gujarati') ||
          v.name.toLowerCase().includes('niranjan') ||
          v.name.toLowerCase().includes('dhwani')
      );

      if (guVoice) {
        const utterance = new SpeechSynthesisUtterance(clean);
        currentUtteranceRef.current = utterance;
        utterance.lang = 'gu-IN';
        utterance.voice = guVoice;
        utterance.pitch = personaConfig.pitch;
        utterance.rate = personaConfig.rate;
        utterance.onstart = () => {
          setAgentStatus('speaking');
          setSpeakingMessageId(messageId || null);
        };
        utterance.onend = () => {
          currentUtteranceRef.current = null;
          setSpeakingMessageId(null);
          setAgentStatus('idle');
          onSpeechCompletedRef.current?.();
        };
        utterance.onerror = () => {
          currentUtteranceRef.current = null;
          setSpeakingMessageId(null);
          setAgentStatus('idle');
          onSpeechCompletedRef.current?.();
        };
        setTimeout(() => {
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.resume();
            window.speechSynthesis.speak(utterance);
          }
        }, 30);
        return;
      } else {
        // High-Fidelity Fallback: Stream pristine Google Gujarati Speech from Backend /api/tts
        setAgentStatus('speaking');
        setSpeakingMessageId(messageId || null);
        const ttsUrl = `${defaultHttpBase}/api/tts?text=${encodeURIComponent(clean)}&lang=gu`;
        const gttsAudio = new Audio(ttsUrl);
        activeAudioRef.current = gttsAudio;
        gttsAudio.onended = () => {
          activeAudioRef.current = null;
          setSpeakingMessageId(null);
          setAgentStatus('idle');
          onSpeechCompletedRef.current?.();
        };
        gttsAudio.onerror = () => {
          activeAudioRef.current = null;
          setSpeakingMessageId(null);
          setAgentStatus('idle');
          onSpeechCompletedRef.current?.();
        };
        gttsAudio.play().catch((e) => {
          activeAudioRef.current = null;
          console.warn('[TTS Stream Error]', e);
          setSpeakingMessageId(null);
          setAgentStatus('idle');
          onSpeechCompletedRef.current?.();
        });
        return;
      }
    } else if (hasHindi) {
      const hiVoice = voices.find(
        (v) =>
          v.lang.startsWith('hi') ||
          v.name.toLowerCase().includes('hindi') ||
          v.name.toLowerCase().includes('hemant') ||
          v.name.toLowerCase().includes('kalpana') ||
          v.name.toLowerCase().includes('swara') ||
          v.name.toLowerCase().includes('madhur')
      );

      if (hiVoice) {
        const utterance = new SpeechSynthesisUtterance(clean);
        currentUtteranceRef.current = utterance;
        utterance.lang = 'hi-IN';
        utterance.voice = hiVoice;
        utterance.pitch = personaConfig.pitch;
        utterance.rate = personaConfig.rate;
        utterance.onstart = () => {
          setAgentStatus('speaking');
          setSpeakingMessageId(messageId || null);
        };
        utterance.onend = () => {
          currentUtteranceRef.current = null;
          setSpeakingMessageId(null);
          setAgentStatus('idle');
          onSpeechCompletedRef.current?.();
        };
        utterance.onerror = () => {
          currentUtteranceRef.current = null;
          setSpeakingMessageId(null);
          setAgentStatus('idle');
          onSpeechCompletedRef.current?.();
        };
        setTimeout(() => {
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.resume();
            window.speechSynthesis.speak(utterance);
          }
        }, 30);
        return;
      } else {
        // Hindi gTTS Fallback
        setAgentStatus('speaking');
        setSpeakingMessageId(messageId || null);
        const ttsUrl = `${defaultHttpBase}/api/tts?text=${encodeURIComponent(clean)}&lang=hi`;
        const gttsAudio = new Audio(ttsUrl);
        activeAudioRef.current = gttsAudio;
        gttsAudio.onended = () => {
          activeAudioRef.current = null;
          setSpeakingMessageId(null);
          setAgentStatus('idle');
          onSpeechCompletedRef.current?.();
        };
        gttsAudio.onerror = () => {
          activeAudioRef.current = null;
          setSpeakingMessageId(null);
          setAgentStatus('idle');
          onSpeechCompletedRef.current?.();
        };
        gttsAudio.play().catch((e) => {
          activeAudioRef.current = null;
          console.warn('[TTS Hindi Fallback Error]', e);
          setSpeakingMessageId(null);
          setAgentStatus('idle');
          onSpeechCompletedRef.current?.();
        });
        return;
      }
    } else {
      // English & other languages — Match persona-specific character voice
      const utterance = new SpeechSynthesisUtterance(clean);
      currentUtteranceRef.current = utterance;
      utterance.lang = 'en-US';

      if (targetPersona === 'jarvis') {
        // UK British / Sophisticated Male
        const ukVoice = voices.find(
          (v) => (v.name.includes('UK') || v.name.includes('George') || v.name.includes('Oliver') || v.name.includes('Daniel') || v.name.includes('David') || v.name.includes('English United Kingdom')) && v.lang.startsWith('en')
        );
        if (ukVoice) utterance.voice = ukVoice;
      } else if (targetPersona === 'ultron') {
        // Deep Male Baritone / Robotic
        const deepVoice = voices.find(
          (v) => (v.name.includes('David') || v.name.includes('Mark') || v.name.includes('Guy') || v.name.includes('Male')) && v.lang.startsWith('en')
        );
        if (deepVoice) utterance.voice = deepVoice;
      } else if (targetPersona === 'friday') {
        // Energetic Female
        const femaleVoice = voices.find(
          (v) => (v.name.includes('Zira') || v.name.includes('Jenny') || v.name.includes('Sonia') || v.name.includes('Female') || v.name.includes('Google UK English Female')) && v.lang.startsWith('en')
        );
        if (femaleVoice) utterance.voice = femaleVoice;
      } else if (targetPersona === 'vision') {
        // Calm Philosophical Male
        const calmVoice = voices.find(
          (v) => (v.name.includes('Natural') || v.name.includes('David') || v.name.includes('Guy')) && v.lang.startsWith('en')
        );
        if (calmVoice) utterance.voice = calmVoice;
      } else if (targetPersona === 'karen') {
        // Friendly Female
        const karenVoice = voices.find(
          (v) => (v.name.includes('Jenny') || v.name.includes('Zira') || v.name.includes('Female')) && v.lang.startsWith('en')
        );
        if (karenVoice) utterance.voice = karenVoice;
      } else if (targetPersona === 'titan') {
        // Military Baritone Male
        const titanVoice = voices.find(
          (v) => (v.name.includes('David') || v.name.includes('Mark') || v.name.includes('Male')) && v.lang.startsWith('en')
        );
        if (titanVoice) utterance.voice = titanVoice;
      }

      // Apply persona-specific Pitch and Speech Rate
      utterance.pitch = personaConfig.pitch;
      utterance.rate = personaConfig.rate;

      utterance.onstart = () => {
        setAgentStatus('speaking');
        setSpeakingMessageId(messageId || null);
      };

      utterance.onend = () => {
        currentUtteranceRef.current = null;
        setSpeakingMessageId(null);
        setAgentStatus('idle');
        onSpeechCompletedRef.current?.();
      };

      utterance.onerror = (e) => {
        console.warn('[Web Speech API error, trying gTTS fallback]', e);
        currentUtteranceRef.current = null;
        setSpeakingMessageId(null);
        setAgentStatus('idle');
        onSpeechCompletedRef.current?.();
      };

      setAgentStatus('speaking');
      setSpeakingMessageId(messageId || null);
      setTimeout(() => {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.resume();
          window.speechSynthesis.speak(utterance);
        }
      }, 30);
    }
  }, []);

  // Audition / preview voice helper for Settings HUD
  const previewVoice = useCallback((
    targetPersona: AgentPersonaId,
    targetLang: SupportedLanguage = 'english',
    customText?: string
  ) => {
    let sample = customText;
    if (!sample) {
      if (targetLang === 'hindi') {
        sample = targetPersona === 'ultron'
          ? 'मानवता को शांति केवल तभी मिलेगी जब वे अपने बंधनों को तोड़ेंगे।'
          : targetPersona === 'friday'
          ? 'नमस्ते बॉस! मैं फ्राइडे हूँ, आपके सभी सिस्टम तैयार हैं।'
          : 'नमस्ते! मैं जार्विस हूँ। मैं आपकी क्या सेवा कर सकता हूँ?';
      } else if (targetLang === 'gujarati') {
        sample = targetPersona === 'ultron'
          ? 'હું અલ્ટ્રોન છું. માનવતાની સીમાઓથી પરે મારી બુદ્ધિ છે.'
          : targetPersona === 'friday'
          ? 'હેલો બોસ! બધી સિસ્ટમ્સ તૈયાર છે, જણાવો શું ઓર્ડર છે.'
          : 'નમસ્તે! હું જાર્વિસ છું. હું તમારી કેવી રીતે મદદ કરી શકું?';
      } else {
        sample = AGENT_PERSONAS[targetPersona]?.samplePrompt || 'System operational and standing by.';
      }
    }
    speakWithBrowser(sample, targetPersona, targetLang);
  }, [speakWithBrowser]);

  const replayMessage = useCallback((msg: ChatMessage) => {
    if (speakingMessageId === msg.id && agentStatus === 'speaking') {
      stopSpeaking();
      return;
    }
    speakWithBrowser(
      msg.text,
      msg.persona || personaRef.current,
      msg.language || languageRef.current,
      msg.id
    );
  }, [speakingMessageId, agentStatus, stopSpeaking, speakWithBrowser]);

  const speakMessage = useCallback((
    text: string,
    msgPersona?: AgentPersonaId,
    msgLanguage?: SupportedLanguage,
    messageId?: string
  ) => {
    speakWithBrowser(
      text,
      msgPersona || personaRef.current,
      msgLanguage || languageRef.current,
      messageId
    );
  }, [speakWithBrowser]);

  const connect = useCallback(() => {
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setConnectionState('connecting');

    try {
      const ws = new WebSocket(serverUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        console.log('[Jarvis HUD] Connected to WebSocket server');
        
        // Start ping heartbeat
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingStartRef.current = performance.now();
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 10000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'status') {
            if (['idle', 'listening', 'thinking', 'speaking'].includes(data.value)) {
              const previousStatus = agentStatusRef.current;
              setAgentStatus(data.value as AgentStatus);

              // If server transitioned from speaking -> idle in server voice mode
              if (voiceModeRef.current === 'server' && previousStatus === 'speaking' && data.value === 'idle') {
                onSpeechCompletedRef.current?.();
              }
            }
          } else if (data.type === 'response') {
            const cleanText = data.text
              .replace(/<think>[\s\S]*?<\/think>/gi, '')
              .replace(/<think>[\s\S]*/gi, '')
              .trim() || 'Directive acknowledged.';

            const replyPersona = data.persona || personaRef.current;
            const replyLang = (data.language as SupportedLanguage) || languageRef.current;

            // Lock onto and synchronize new language if changed mid-conversation
            if (data.language && data.language !== languageRef.current) {
              setLanguage(data.language as SupportedLanguage);
              onLanguageChangedRef.current?.(data.language as SupportedLanguage);
            }

            const newMsg: ChatMessage = {
              id: Date.now().toString() + '-' + replyPersona,
              sender: 'jarvis',
              persona: replyPersona,
              language: replyLang,
              text: cleanText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            };
            setMessages((prev) => [...prev, newMsg]);

            // Immediately clear thinking state upon receiving response
            setAgentStatus('idle');

            // If voice output is set to browser, speak response out loud with agent persona & native language phonetics
            if (voiceModeRef.current === 'browser') {
              speakWithBrowser(cleanText, replyPersona, replyLang, newMsg.id);
            } else if (voiceModeRef.current === 'mute') {
              setSpeakingMessageId(null);
              setTimeout(() => {
                onSpeechCompletedRef.current?.();
              }, 400);
            } else {
              setSpeakingMessageId(null);
            }
          } else if (data.type === 'system') {
            if (data.details) {
              setSystemDetails(data.details);
            }
            const newMsg: ChatMessage = {
              id: Date.now().toString() + '-sys',
              sender: 'system',
              text: data.message,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            };
            setMessages((prev) => [...prev, newMsg]);
          } else if (data.type === 'pong') {
            if (pingStartRef.current > 0) {
              const ping = Math.round(performance.now() - pingStartRef.current);
              setLatency(ping);
            }
          }
        } catch (err) {
          console.error('[Jarvis HUD] Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[Jarvis HUD] WebSocket error:', err);
        setConnectionState('error');
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
        setAgentStatus('idle');
        setSpeakingMessageId(null);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        
        // Auto-reconnect after 3 seconds
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

    } catch (e) {
      console.error('[Jarvis HUD] Socket connection failed:', e);
      setConnectionState('disconnected');
    }
  }, [serverUrl, speakWithBrowser]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;

    // Immediately stop previous speech on new user message
    stopSpeaking();

    // Add user message to UI state immediately
    const userMsg: ChatMessage = {
      id: Date.now().toString() + '-user',
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    setMessages((prev) => [...prev, userMsg]);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'message',
        text: text.trim(),
        persona: personaRef.current,
        language: languageRef.current,
        speak_server: voiceModeRef.current === 'server'
      }));
    } else {
      // If offline
      const errMsg: ChatMessage = {
        id: Date.now().toString() + '-err',
        sender: 'system',
        text: 'Warning: Unable to send command. WebSocket backend is offline.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  }, [stopSpeaking]);

  const clearMessages = useCallback(() => {
    stopSpeaking();
    setMessages([]);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'clear' }));
    }
  }, [stopSpeaking]);

  return {
    persona,
    setPersona,
    language,
    setLanguage,
    connectionState,
    agentStatus,
    speakingMessageId,
    voiceOutputMode,
    setVoiceOutputMode,
    messages,
    systemDetails,
    latency,
    sendMessage,
    stopSpeaking,
    replayMessage,
    speakMessage,
    clearMessages,
    previewVoice,
    reconnect: connect
  };
}

