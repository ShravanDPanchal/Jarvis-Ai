import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Cpu,
  Database,
  Server,
  RefreshCw,
  ShieldCheck,
  Volume2,
  VolumeX,
  Mic,
  ToggleLeft,
  ToggleRight,
  Brain,
  Plus,
  Trash2,
  Sparkles,
  Play,
  Pause,
  Download,
  FileAudio,
  Radio,
  Sliders,
  CheckCircle2,
  Skull,
  Zap,
  Sun,
  Shield,
  Languages,
  UserCheck
} from 'lucide-react';
import type { VoiceOutputMode } from '../hooks/useJarvisSocket';
import type { AgentPersonaId, SupportedLanguage } from '../types/agent';
import { AGENT_PERSONAS, SUPPORTED_LANGUAGES } from '../types/agent';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  persona: AgentPersonaId;
  onSelectPersona: (p: AgentPersonaId) => void;
  language: SupportedLanguage;
  onSelectLanguage: (l: SupportedLanguage) => void;
  onPreviewVoice: (p: AgentPersonaId, l: SupportedLanguage, sample?: string) => void;
  systemDetails: {
    ai_provider?: string;
    groq_model?: string;
    history_count?: number;
    status?: string;
    voice_available?: boolean;
    learned_facts_count?: number;
    learned_rules_count?: number;
  } | null;
  voiceOutputMode: VoiceOutputMode;
  onSetVoiceMode: (mode: VoiceOutputMode) => void;
  autoListen: boolean;
  onToggleAutoListen: () => void;
  onClearMemory: () => void;
  selectedMicId: string;
  onSelectMic: (deviceId: string) => void;
  phoneMicMode: boolean;
  onTogglePhoneMicMode: () => void;
  gainBoost: number;
  onSetGainBoost: (gain: number) => void;
}

interface NeuralKnowledge {
  user_profile: Record<string, string>;
  learned_rules: string[];
  interaction_stats?: {
    total_learned_facts?: number;
    corrections_applied?: number;
  };
}

interface VoiceRecording {
  filename: string;
  size_bytes: number;
  formatted_size: string;
  created_at: string;
  url: string;
  transcript?: string;
}

const getBackendUrl = (path: string = ''): string => {
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : '127.0.0.1';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (isHttps) {
    return `${window.location.origin}${cleanPath}`;
  }
  return `http://${host}:8000${cleanPath}`;
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  persona,
  onSelectPersona,
  language,
  onSelectLanguage,
  onPreviewVoice,
  systemDetails,
  voiceOutputMode,
  onSetVoiceMode,
  autoListen,
  onToggleAutoListen,
  onClearMemory,
  selectedMicId,
  onSelectMic,
  phoneMicMode,
  onTogglePhoneMicMode,
  gainBoost,
  onSetGainBoost,
}) => {
  const [knowledge, setKnowledge] = useState<NeuralKnowledge>({
    user_profile: {},
    learned_rules: [],
  });
  const [recordings, setRecordings] = useState<VoiceRecording[]>([]);
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [playbackBoost, setPlaybackBoost] = useState(true);
  const [playbackGainMultiplier, setPlaybackGainMultiplier] = useState<number>(3.0);
  const playbackAudioCtxRef = useRef<AudioContext | null>(null);
  const playbackSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // Microphone device enumeration
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  // Live Mic Test State
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [testCountdown, setTestCountdown] = useState<number | null>(null);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  const [micAudioLevel, setMicAudioLevel] = useState<number>(0);
  const [isMonitoringLevel, setIsMonitoringLevel] = useState(false);

  const testStreamRef = useRef<MediaStream | null>(null);
  const testRecorderRef = useRef<MediaRecorder | null>(null);
  const testAudioChunksRef = useRef<Blob[]>([]);
  const monitorAudioCtxRef = useRef<AudioContext | null>(null);
  const monitorAnimFrameRef = useRef<number | null>(null);

  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [isAddingFact, setIsAddingFact] = useState(false);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [loadingRecordings, setLoadingRecordings] = useState(false);

  // Enumerate audio input devices
  const enumerateMics = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      setLoadingDevices(true);
      let devices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devices.some((d) => d.kind === 'audioinput' && d.label);
      if (!hasLabels && navigator.mediaDevices.getUserMedia) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          devices = await navigator.mediaDevices.enumerateDevices();
          tempStream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
      }
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      setAudioDevices(audioInputs);
    } catch (e) {
      console.warn('Error enumerating audio devices:', e);
    } finally {
      setLoadingDevices(false);
    }
  };

  const fetchKnowledge = async () => {
    try {
      setLoadingKnowledge(true);
      const res = await fetch(getBackendUrl('/api/memory/knowledge'));
      if (res.ok) {
        const data = await res.json();
        setKnowledge(data);
      }
    } catch (e) {
      console.warn('Could not fetch neural knowledge:', e);
    } finally {
      setLoadingKnowledge(false);
    }
  };

  const fetchRecordings = async () => {
    try {
      setLoadingRecordings(true);
      const res = await fetch(getBackendUrl('/api/recordings'));
      if (res.ok) {
        const data = await res.json();
        setRecordings(data.recordings || []);
      }
    } catch (e) {
      console.warn('Could not fetch recordings:', e);
    } finally {
      setLoadingRecordings(false);
    }
  };

  // Start live microphone level meter
  const startLevelMonitoring = async () => {
    if (isMonitoringLevel) {
      stopLevelMonitoring();
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      monitorAudioCtxRef.current = audioCtx;

      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
          echoCancellation: !phoneMicMode,
          noiseSuppression: !phoneMicMode,
          autoGainControl: !phoneMicMode,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testStreamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      const gain = audioCtx.createGain();
      gain.gain.value = gainBoost;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(gain);
      gain.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateMeter = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalized = Math.min(100, Math.round((average / 128) * 100 * 1.5));
        setMicAudioLevel(normalized);
        monitorAnimFrameRef.current = requestAnimationFrame(updateMeter);
      };

      setIsMonitoringLevel(true);
      updateMeter();
    } catch (e) {
      console.warn('Failed to start level monitoring:', e);
      stopLevelMonitoring();
    }
  };

  const stopLevelMonitoring = () => {
    if (monitorAnimFrameRef.current) {
      cancelAnimationFrame(monitorAnimFrameRef.current);
      monitorAnimFrameRef.current = null;
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    if (monitorAudioCtxRef.current && monitorAudioCtxRef.current.state !== 'closed') {
      try {
        monitorAudioCtxRef.current.close();
      } catch {}
      monitorAudioCtxRef.current = null;
    }
    setIsMonitoringLevel(false);
    setMicAudioLevel(0);
  };

  // Run 3-second live mic test with instant playback
  const runMicTest = async () => {
    if (isTestingMic) return;
    stopLevelMonitoring();
    setIsTestingMic(true);
    setTestCountdown(3);
    testAudioChunksRef.current = [];
    setTestAudioUrl(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      monitorAudioCtxRef.current = audioCtx;

      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
          echoCancellation: !phoneMicMode,
          noiseSuppression: !phoneMicMode,
          autoGainControl: !phoneMicMode,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testStreamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      const gain = audioCtx.createGain();
      gain.gain.value = gainBoost;

      const dest = audioCtx.createMediaStreamDestination();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;

      source.connect(gain);
      gain.connect(analyser);
      gain.connect(dest);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const updateMeter = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setMicAudioLevel(Math.min(100, Math.round((average / 128) * 100 * 1.5)));
        if (monitorAudioCtxRef.current) {
          monitorAnimFrameRef.current = requestAnimationFrame(updateMeter);
        }
      };
      updateMeter();

      const recorder = new MediaRecorder(dest.stream);
      testRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          testAudioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (testAudioChunksRef.current.length > 0) {
          const blob = new Blob(testAudioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const url = URL.createObjectURL(blob);
          setTestAudioUrl(url);
          const testAudio = new Audio(url);
          testAudio.play();
        }
        stopLevelMonitoring();
        setIsTestingMic(false);
        setTestCountdown(null);
      };

      recorder.start(100);

      let count = 3;
      const timer = setInterval(() => {
        count -= 1;
        setTestCountdown(count);
        if (count <= 0) {
          clearInterval(timer);
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
      }, 1000);
    } catch (e) {
      console.error('Error running mic test:', e);
      setIsTestingMic(false);
      setTestCountdown(null);
      stopLevelMonitoring();
    }
  };

  const stopActivePlayback = () => {
    if (playbackSourceNodeRef.current) {
      try {
        playbackSourceNodeRef.current.stop();
        playbackSourceNodeRef.current.disconnect();
      } catch {}
      playbackSourceNodeRef.current = null;
    }
    if (audioElement) {
      audioElement.pause();
      setAudioElement(null);
    }
    setPlayingFile(null);
  };

  useEffect(() => {
    if (isOpen) {
      fetchKnowledge();
      fetchRecordings();
      enumerateMics();
    } else {
      stopActivePlayback();
      stopLevelMonitoring();
    }
  }, [isOpen]);

  const handlePlayAudio = async (rec: VoiceRecording) => {
    if (playingFile === rec.filename) {
      stopActivePlayback();
      return;
    }

    stopActivePlayback();
    setPlayingFile(rec.filename);

    const audioUrl = rec.url.startsWith('http') ? rec.url : getBackendUrl(rec.url);

    try {
      // 1. Fetch the audio file arrayBuffer from backend
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();

      // 2. Initialize / resume Web Audio context
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = playbackAudioCtxRef.current || new AudioCtx();
      playbackAudioCtxRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // 3. Decode audio data
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;

      if (playbackBoost) {
        // Dynamics compressor to boost quiet phone mic frequencies and level out peaks
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-32, audioCtx.currentTime);
        compressor.knee.setValueAtTime(24, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(8, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

        // Gain amplification node (up to 5x boost for quiet phone mics)
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(playbackGainMultiplier, audioCtx.currentTime);

        source.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(audioCtx.destination);
      } else {
        source.connect(audioCtx.destination);
      }

      source.onended = () => {
        setPlayingFile(null);
        playbackSourceNodeRef.current = null;
      };

      playbackSourceNodeRef.current = source;
      source.start(0);
    } catch (e) {
      console.warn('[Playback note - falling back to HTML5 Audio]', e);
      // Fallback to standard Audio element if decode fails
      try {
        const audio = new Audio(audioUrl);
        audio.volume = 1.0;
        audio.onended = () => setPlayingFile(null);
        audio.onerror = () => setPlayingFile(null);
        audio.play();
        setAudioElement(audio);
      } catch (audioErr) {
        console.error('Audio playback failed:', audioErr);
        setPlayingFile(null);
      }
    }
  };

  const handleDeleteRecording = async (filename: string) => {
    try {
      if (playingFile === filename) {
        stopActivePlayback();
      }
      const res = await fetch(getBackendUrl(`/api/recordings/file/${encodeURIComponent(filename)}`), {
        method: 'DELETE',
      });
      if (res.ok) {
        setRecordings((prev) => prev.filter((r) => r.filename !== filename));
      }
    } catch (e) {
      console.error('Error deleting recording:', e);
    }
  };

  const handleAddFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newVal.trim()) return;

    try {
      const res = await fetch(getBackendUrl('/api/memory/fact'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey.trim(), value: newVal.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setKnowledge(data.knowledge);
        setNewKey('');
        setNewVal('');
        setIsAddingFact(false);
      }
    } catch (e) {
      console.error('Error adding fact:', e);
    }
  };

  const handleDeleteFact = async (key: string) => {
    try {
      const res = await fetch(getBackendUrl(`/api/memory/fact/${encodeURIComponent(key)}`), {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        setKnowledge(data.knowledge);
      }
    } catch (e) {
      console.error('Error deleting fact:', e);
    }
  };

  const handleDeleteRule = async (rule: string) => {
    try {
      const res = await fetch(getBackendUrl('/api/memory/rule'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule }),
      });
      if (res.ok) {
        const data = await res.json();
        setKnowledge(data.knowledge);
      }
    } catch (e) {
      console.error('Error deleting rule:', e);
    }
  };

  const handleClearKnowledge = async () => {
    try {
      const res = await fetch(getBackendUrl('/api/memory/clear-knowledge'), {
        method: 'POST',
      });
      if (res.ok) {
        setKnowledge({ user_profile: {}, learned_rules: [] });
      }
    } catch (e) {
      console.error('Error clearing knowledge:', e);
    }
  };

  if (!isOpen) return null;

  const profileEntries = Object.entries(knowledge.user_profile || {});

  const getPersonaIcon = (id: AgentPersonaId) => {
    switch (id) {
      case 'ultron':
        return <Skull className="w-5 h-5 text-purple-400" />;
      case 'friday':
        return <Zap className="w-5 h-5 text-emerald-400" />;
      case 'vision':
        return <Sun className="w-5 h-5 text-lime-400" />;
      case 'karen':
        return <Sparkles className="w-5 h-5 text-pink-400" />;
      case 'titan':
        return <Cpu className="w-5 h-5 text-orange-400" />;
      case 'jarvis':
      default:
        return <Shield className="w-5 h-5 text-cyan-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-3xl bg-gray-950 border border-cyan-500/40 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,240,255,0.2)] hud-corner-tl hud-corner-br flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-900/90 border-b border-cyan-500/30 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <h2 className="font-mono text-sm font-bold tracking-widest text-cyan-300 uppercase">
              AI MATRIX CONTROL // PERSONAS & LANGUAGE ENGINE
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-cyan-300 transition-colors rounded hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 font-sans overflow-y-auto flex-1">
          
          {/* SECTION 1: AI AGENT PERSONAS (JARVIS, ULTRON, FRIDAY, VISION, KAREN, TITAN) */}
          <div className="p-4 bg-gray-900/70 border border-cyan-500/40 rounded-xl space-y-4 shadow-[0_0_20px_rgba(0,240,255,0.08)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyan-300 font-mono text-xs font-bold uppercase tracking-wider">
                <UserCheck className="w-4 h-4 text-cyan-400" />
                <span>🤖 Select AI Voice Agent Persona (6 Agents Available)</span>
              </div>
              <span className="font-mono text-[10px] text-cyan-400 bg-cyan-900/40 px-2 py-0.5 rounded border border-cyan-500/30">
                ACTIVE: {AGENT_PERSONAS[persona]?.name}
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Switch between 6 distinct AI intelligence personas. Each agent features custom personality prompts, tailored voice pitch, timbre, and Arc Reactor core illumination.
            </p>

            {/* Persona Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {(Object.keys(AGENT_PERSONAS) as AgentPersonaId[]).map((pId) => {
                const config = AGENT_PERSONAS[pId];
                const isSelected = persona === pId;

                return (
                  <div
                    key={pId}
                    onClick={() => onSelectPersona(pId)}
                    className={`relative p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group ${
                      isSelected
                        ? `bg-gray-950 ${config.borderClass} ${config.glowClass}`
                        : 'bg-gray-950/60 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
                        <div className="flex items-center space-x-2">
                          <div className={`p-1.5 rounded-lg ${config.bgClass}`}>
                            {getPersonaIcon(pId)}
                          </div>
                          <div>
                            <span className={`font-mono text-xs font-black block ${config.textClass}`}>
                              {config.name}
                            </span>
                            <span className="font-mono text-[8px] text-slate-400 uppercase tracking-tighter">
                              {config.title}
                            </span>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: config.color }} />
                        )}
                      </div>

                      <p className="text-[10px] text-slate-300 mt-2 leading-relaxed line-clamp-2">
                        {config.description}
                      </p>

                      <div className="mt-1.5 italic text-[9px] text-slate-500 font-mono">
                        "{config.tagline}"
                      </div>
                    </div>

                    <div className="pt-3 flex items-center justify-between border-t border-white/5 mt-2">
                      <span className="font-mono text-[9px] text-slate-500">
                        Pitch: {config.pitch}x • Spd: {config.rate}x
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreviewVoice(pId, language);
                        }}
                        className="px-2 py-0.5 rounded bg-gray-900 hover:bg-gray-800 border border-white/10 text-[10px] font-mono text-cyan-300 flex items-center space-x-1"
                        title="Audition Persona Voice"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>Audition</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: MULTILINGUAL ENGINE (HINDI, GUJARATI, ENGLISH) */}
          <div className="p-4 bg-cyan-950/20 border border-cyan-500/40 rounded-xl space-y-4 shadow-[0_0_20px_rgba(0,240,255,0.08)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyan-300 font-mono text-xs font-bold uppercase tracking-wider">
                <Languages className="w-4 h-4 text-cyan-400" />
                <span>🌍 Multilingual Engine (Hindi & Gujarati Native Phonetics)</span>
              </div>
              <span className="font-mono text-[10px] text-cyan-400 bg-cyan-900/40 px-2 py-0.5 rounded border border-cyan-500/30">
                ACTIVE LANG: {language.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Language Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono text-slate-300">
                  Target Response Language:
                </label>
                <div className="relative">
                  <select
                    value={language}
                    onChange={(e) => onSelectLanguage(e.target.value as SupportedLanguage)}
                    className="w-full bg-gray-950 border border-cyan-500/40 rounded-lg px-3 py-2 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400 appearance-none pr-8 cursor-pointer"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.id} value={lang.id}>
                        {lang.flag} {lang.name} — {lang.nativeName}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-2.5 pointer-events-none text-cyan-400">
                    ▼
                  </div>
                </div>
              </div>

              {/* Real-Time Audition Quick Tests */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono text-slate-300">
                  Audition {AGENT_PERSONAS[persona]?.name} in Native Languages:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => onPreviewVoice(persona, 'english')}
                    className="p-1.5 rounded bg-gray-900 hover:bg-cyan-950 border border-cyan-500/30 font-mono text-[10px] text-cyan-300 flex items-center justify-center space-x-1"
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    <span>English</span>
                  </button>
                  <button
                    onClick={() => onPreviewVoice(persona, 'hindi')}
                    className="p-1.5 rounded bg-gray-900 hover:bg-cyan-950 border border-cyan-500/30 font-mono text-[10px] text-cyan-300 flex items-center justify-center space-x-1"
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    <span>हिंदी</span>
                  </button>
                  <button
                    onClick={() => onPreviewVoice(persona, 'gujarati')}
                    className="p-1.5 rounded bg-gray-900 hover:bg-cyan-950 border border-cyan-500/30 font-mono text-[10px] text-cyan-300 flex items-center justify-center space-x-1"
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    <span>ગુજરાતી</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: MICROPHONE HARDWARE & PHONE MIC CONFIGURATION */}
          <div className="p-4 bg-cyan-950/20 border border-cyan-500/40 rounded-xl space-y-4 shadow-[0_0_20px_rgba(0,240,255,0.08)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyan-300 font-mono text-xs font-bold uppercase tracking-wider">
                <Mic className="w-4 h-4 text-cyan-400" />
                <span>🎙️ Microphone Input & Phone Mic Config</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="font-mono text-[10px] text-cyan-400 bg-cyan-900/40 px-2 py-0.5 rounded border border-cyan-500/30">
                  {audioDevices.length} DEVICES DETECTED
                </span>
                <button
                  onClick={enumerateMics}
                  title="Rescan connected audio devices"
                  className="p-1 text-slate-400 hover:text-cyan-300 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingDevices ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Mic Device Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-mono text-slate-300">
                Select Audio Input Device:
              </label>
              <div className="relative">
                <select
                  value={selectedMicId}
                  onChange={(e) => onSelectMic(e.target.value)}
                  className="w-full bg-gray-950 border border-cyan-500/40 rounded-lg px-3 py-2 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400 appearance-none pr-8 cursor-pointer"
                >
                  <option value="">Default System Microphone</option>
                  {audioDevices.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Microphone ${idx + 1}`}
                      {d.label.toLowerCase().includes('audiorelay') || d.label.toLowerCase().includes('wo mic')
                        ? ' ★ [PHONE MIC APP]'
                        : ''}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-2.5 pointer-events-none text-cyan-400">
                  ▼
                </div>
              </div>
            </div>

            {/* Phone Mic High-Fidelity Mode Toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-950/70 border border-cyan-500/30 rounded-lg">
              <div className="space-y-0.5 pr-2">
                <div className="flex items-center space-x-1.5 font-mono text-xs font-bold text-cyan-300">
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Phone Mic / High-Fidelity Mode</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Disables browser echo cancellation & noise filters that mute AudioRelay / WO Mic streams.
                </p>
              </div>
              <button
                onClick={onTogglePhoneMicMode}
                className="text-cyan-400 hover:text-cyan-200 transition-colors flex-shrink-0"
              >
                {phoneMicMode ? (
                  <ToggleRight className="w-8 h-8 text-cyan-400" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-slate-500" />
                )}
              </button>
            </div>

            {/* Mic Gain Amplification Slider */}
            <div className="p-3 bg-gray-950/70 border border-cyan-500/30 rounded-lg space-y-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Microphone Gain Boost:</span>
                </div>
                <span className="font-bold text-cyan-300">
                  {Math.round(gainBoost * 100)}% ({gainBoost >= 1.5 ? 'Amplified' : 'Standard'})
                </span>
              </div>
              <input
                type="range"
                min="0.8"
                max="3.5"
                step="0.1"
                value={gainBoost}
                onChange={(e) => onSetGainBoost(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>80% (Soft)</span>
                <span>150% (Recommended for Phone Mic)</span>
                <span>350% (Maximum)</span>
              </div>
            </div>

            {/* Live Mic Audio Meter & Test Tool */}
            <div className="p-3 bg-gray-950/70 border border-cyan-500/30 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Live Mic Level & Playback Verification</span>
                </span>
                <button
                  onClick={startLevelMonitoring}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] transition-all ${
                    isMonitoringLevel
                      ? 'bg-red-950/70 border border-red-500 text-red-300'
                      : 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/60'
                  }`}
                >
                  {isMonitoringLevel ? 'Stop Meter' : 'Monitor Live'}
                </button>
              </div>

              {/* Volume Bar */}
              <div className="w-full bg-gray-900 rounded-full h-3 p-0.5 border border-cyan-500/20 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-75"
                  style={{
                    width: `${micAudioLevel}%`,
                    backgroundColor:
                      micAudioLevel > 75 ? '#f59e0b' : micAudioLevel > 15 ? '#06b6d4' : '#64748b',
                    boxShadow: micAudioLevel > 15 ? '0 0 8px rgba(0,240,255,0.6)' : 'none',
                  }}
                />
              </div>

              {/* 3-Second Mic Test Action */}
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={runMicTest}
                  disabled={isTestingMic}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-all ${
                    isTestingMic
                      ? 'bg-red-900 text-white animate-pulse border border-red-400'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-gray-950 shadow-[0_0_10px_#00f0ff]'
                  }`}
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>
                    {isTestingMic
                      ? `Testing Mic (${testCountdown}s)... Speak Now!`
                      : 'Record 3s Test Clip & Play'}
                  </span>
                </button>

                {testAudioUrl && (
                  <span className="flex items-center space-x-1 font-mono text-[10px] text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Test Audio Played OK</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 4: VOICE AUDIO ARCHIVE (RECORDINGS) */}
          <div className="p-4 bg-gray-900/70 border border-cyan-500/30 rounded-xl space-y-3 shadow-[0_0_15px_rgba(0,240,255,0.05)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
                <FileAudio className="w-4 h-4 text-cyan-400" />
                <span>🎙️ Voice Audio Archive (`recordings/`)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-[10px] text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                  {recordings.length} SAVED CLIPS
                </span>
                <button
                  onClick={fetchRecordings}
                  title="Refresh Recordings List"
                  className="p-1 text-slate-400 hover:text-cyan-300 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingRecordings ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-gray-950/60 rounded-lg border border-cyan-500/20 text-xs">
              <div className="flex items-center space-x-2">
                <Volume2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span className="text-slate-300 font-mono text-[11px]">Phone Mic Playback Boost:</span>
              </div>
              <div className="flex items-center space-x-1.5 font-mono text-[10px]">
                {[1.0, 2.5, 3.5, 5.0].map((multiplier) => (
                  <button
                    key={multiplier}
                    onClick={() => {
                      setPlaybackGainMultiplier(multiplier);
                      setPlaybackBoost(true);
                    }}
                    className={`px-2 py-0.5 rounded border transition-all ${
                      playbackBoost && playbackGainMultiplier === multiplier
                        ? 'bg-cyan-950 border-cyan-400 text-cyan-300 font-bold shadow-[0_0_6px_rgba(0,240,255,0.4)]'
                        : 'bg-gray-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {multiplier === 1.0 ? '1x (Normal)' : `${multiplier}x Boost`}
                  </button>
                ))}
                <button
                  onClick={() => setPlaybackBoost((v) => !v)}
                  className={`px-2 py-0.5 rounded border transition-all ${
                    !playbackBoost
                      ? 'bg-red-950/50 border-red-500 text-red-300'
                      : 'bg-gray-900 border-slate-800 text-slate-500'
                  }`}
                >
                  {playbackBoost ? 'Active' : 'Off'}
                </button>
              </div>
            </div>

            {/* Recordings List */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {recordings.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-2 text-center bg-gray-950/40 rounded-lg">
                  No voice recordings saved yet. Click the Arc Reactor or Mic and speak into your phone mic to save clips!
                </div>
              ) : (
                recordings.map((rec) => (
                  <div
                    key={rec.filename}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-gray-950/80 border border-cyan-500/20 text-xs font-mono group hover:border-cyan-400/40 transition-all"
                  >
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <button
                        onClick={() => handlePlayAudio(rec)}
                        className={`p-2 rounded-full transition-all ${
                          playingFile === rec.filename
                            ? 'bg-cyan-500 text-gray-950 shadow-[0_0_12px_#00f0ff]'
                            : 'bg-gray-900 text-cyan-400 hover:bg-cyan-950 border border-cyan-500/30'
                        }`}
                        title={playingFile === rec.filename ? 'Pause' : 'Play Audio'}
                      >
                        {playingFile === rec.filename ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                      </button>
                      <div className="overflow-hidden">
                        <span className="text-slate-200 block text-[11px] font-semibold truncate">
                          {rec.filename}
                        </span>
                        {rec.transcript && (
                          <span className="text-cyan-300/90 block text-[10px] italic truncate font-sans">
                            "{rec.transcript}"
                          </span>
                        )}
                        <span className="text-slate-500 block text-[9px]">
                          {rec.created_at} • {rec.formatted_size}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      <a
                        href={rec.url}
                        download={rec.filename}
                        className="text-slate-400 hover:text-cyan-300 p-1.5 rounded hover:bg-white/5 transition-colors"
                        title="Download audio file"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleDeleteRecording(rec.filename)}
                        className="text-slate-500 hover:text-red-400 p-1.5 rounded hover:bg-red-950/30 transition-colors opacity-70 group-hover:opacity-100"
                        title="Delete recording"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* SECTION 5: CONTINUOUS SELF-LEARNING KNOWLEDGE */}
          <div className="p-4 bg-gray-900/70 border border-cyan-500/30 rounded-xl space-y-3 shadow-[0_0_15px_rgba(0,240,255,0.05)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
                <Brain className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span>🧠 Continuous Self-Learning Memory</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-[10px] text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                  {profileEntries.length + (knowledge.learned_rules?.length || 0)} FACTS & RULES
                </span>
                <button
                  onClick={fetchKnowledge}
                  title="Refresh Learned Knowledge"
                  className="p-1 text-slate-400 hover:text-cyan-300 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingKnowledge ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Jarvis automatically reflects on your conversations and extracts personal facts, habits, and preferences to continuously personalize his answers.
            </p>

            {/* Facts Cards */}
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                LEARNED USER FACTS:
              </span>
              {profileEntries.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-1">
                  No explicit facts extracted yet. Talk to Jarvis (e.g. "My name is...", "I work with React") to see him learn automatically!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {profileEntries.map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between p-2 rounded-lg bg-gray-950/80 border border-cyan-500/20 text-xs font-mono group"
                    >
                      <div className="overflow-hidden">
                        <span className="text-slate-400 block text-[9px] uppercase">{k.replace('_', ' ')}</span>
                        <span className="text-cyan-200 font-semibold truncate block">{v}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteFact(k)}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1 opacity-60 group-hover:opacity-100"
                        title="Forget this fact"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Learned Rules */}
            {knowledge.learned_rules && knowledge.learned_rules.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-cyan-500/10">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                  ADAPTIVE BEHAVIORAL RULES:
                </span>
                <div className="space-y-1">
                  {knowledge.learned_rules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded bg-gray-950/60 border border-amber-500/20 text-xs font-mono text-amber-200/90 group"
                    >
                      <div className="flex items-center space-x-1.5">
                        <Sparkles className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        <span>{rule}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteRule(rule)}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1"
                        title="Delete rule"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Custom Fact Form */}
            {isAddingFact ? (
              <form onSubmit={handleAddFact} className="pt-2 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Key (e.g. Favorite Language)"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="bg-gray-950 border border-cyan-500/40 rounded px-2.5 py-1 text-xs text-cyan-200 focus:outline-none focus:border-cyan-400 font-mono"
                />
                <input
                  type="text"
                  placeholder="Value (e.g. TypeScript)"
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value)}
                  className="bg-gray-950 border border-cyan-500/40 rounded px-2.5 py-1 text-xs text-cyan-200 focus:outline-none focus:border-cyan-400 font-mono flex-1"
                />
                <div className="flex space-x-1">
                  <button
                    type="submit"
                    className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-gray-950 text-xs font-mono font-bold rounded"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingFact(false)}
                    className="px-2 py-1 bg-gray-800 text-slate-300 text-xs font-mono rounded"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between pt-2 border-t border-cyan-500/10">
                <button
                  onClick={() => setIsAddingFact(true)}
                  className="flex items-center space-x-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-200 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Teach Custom Fact Manually</span>
                </button>
                {(profileEntries.length > 0 || (knowledge.learned_rules?.length || 0) > 0) && (
                  <button
                    onClick={handleClearKnowledge}
                    className="text-[10px] font-mono text-red-400/80 hover:text-red-300 underline"
                  >
                    Reset Learned Memory
                  </button>
                )}
              </div>
            )}
          </div>

          {/* SECTION 6: CONVERSATION CONTROLS & TTS OUTPUT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Auto-Listen Mode */}
            <div className="p-4 bg-gray-900/50 border border-cyan-500/20 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs font-semibold uppercase tracking-wider">
                  <Mic className="w-4 h-4" />
                  <span>Auto-Listen Loop</span>
                </div>
                <button
                  onClick={onToggleAutoListen}
                  className="text-cyan-400 hover:text-cyan-200 transition-colors flex items-center space-x-1"
                >
                  {autoListen ? (
                    <ToggleRight className="w-7 h-7 text-cyan-400" />
                  ) : (
                    <ToggleLeft className="w-7 h-7 text-slate-500" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Automatically opens the mic after Jarvis speaks. Auto-times out after 10s of silence.
              </p>
            </div>

            {/* Voice Output Mode */}
            <div className="p-4 bg-gray-900/50 border border-cyan-500/20 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs font-semibold uppercase tracking-wider">
                <Volume2 className="w-4 h-4" />
                <span>Voice Speech Output</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-1 font-mono text-[10px]">
                <button
                  onClick={() => onSetVoiceMode('browser')}
                  className={`p-2 rounded border flex flex-col items-center space-y-1 transition-all ${
                    voiceOutputMode === 'browser'
                      ? 'bg-cyan-950 border-cyan-400 text-cyan-200 shadow-[0_0_8px_rgba(0,240,255,0.3)]'
                      : 'bg-gray-950 border-cyan-500/20 text-slate-400'
                  }`}
                >
                  <Volume2 className="w-3 h-3 text-cyan-400" />
                  <span className="font-bold">Web TTS</span>
                </button>
                <button
                  onClick={() => onSetVoiceMode('server')}
                  className={`p-2 rounded border flex flex-col items-center space-y-1 transition-all ${
                    voiceOutputMode === 'server'
                      ? 'bg-cyan-950 border-cyan-400 text-cyan-200 shadow-[0_0_8px_rgba(0,240,255,0.3)]'
                      : 'bg-gray-950 border-cyan-500/20 text-slate-400'
                  }`}
                >
                  <Mic className="w-3 h-3 text-sky-400" />
                  <span className="font-bold">PC Voice</span>
                </button>
                <button
                  onClick={() => onSetVoiceMode('mute')}
                  className={`p-2 rounded border flex flex-col items-center space-y-1 transition-all ${
                    voiceOutputMode === 'mute'
                      ? 'bg-red-950 border-red-400 text-red-200 shadow-[0_0_8px_rgba(255,50,50,0.3)]'
                      : 'bg-gray-950 border-cyan-500/20 text-slate-400'
                  }`}
                >
                  <VolumeX className="w-3 h-3 text-red-400" />
                  <span className="font-bold">Mute</span>
                </button>
              </div>
            </div>
          </div>

          {/* AI Core Status Section */}
          <div className="p-4 bg-gray-900/50 border border-cyan-500/20 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs font-semibold uppercase tracking-wider">
              <Server className="w-4 h-4" />
              <span>AI Core Status</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 pt-1 text-xs font-mono">
              <div className="p-2.5 bg-gray-950/80 rounded-lg border border-cyan-500/10">
                <span className="text-slate-400 block text-[10px]">ACTIVE PROVIDER</span>
                <span className="text-cyan-300 font-bold uppercase">
                  {systemDetails?.ai_provider || 'Groq AI'}
                </span>
              </div>

              <div className="p-2.5 bg-gray-950/80 rounded-lg border border-cyan-500/10">
                <span className="text-slate-400 block text-[10px]">ACTIVE MODEL</span>
                <span className="text-cyan-300 font-bold">
                  {systemDetails?.groq_model || 'qwen-2.5-32b'}
                </span>
              </div>
            </div>
          </div>

          {/* Memory Reset Section */}
          <div className="p-4 bg-gray-900/50 border border-cyan-500/20 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono text-xs font-semibold uppercase tracking-wider">
                <Database className="w-4 h-4" />
                <span>Conversation Chat Logs</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                TURNS: {systemDetails?.history_count ?? 0}
              </span>
            </div>

            <button
              onClick={() => {
                onClearMemory();
                onClose();
              }}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-red-950/50 border border-red-500/40 text-red-300 hover:bg-red-900/50 text-xs font-mono transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Flush Chat History</span>
            </button>
          </div>

          {/* Security & System Info */}
          <div className="p-3 bg-gray-900/50 border border-cyan-500/20 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="font-mono text-xs text-emerald-300 uppercase tracking-wider">
                FastAPI WebSocket Bridge Online
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-500">ws://127.0.0.1:8000/ws</span>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-900/90 border-t border-cyan-500/30 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-gray-950 font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_12px_#00f0ff]"
          >
            Save & Close HUD
          </button>
        </div>

      </div>
    </div>
  );
};

