import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Shield,
  Volume2,
  VolumeX,
  Radio,
  Square,
  AlertCircle,
  Mic,
  Languages,
  Skull,
  Zap,
  Sun,
  Sparkles,
  Cpu,
  MicOff,
  Activity,
  MessageSquare,
  Eraser
} from 'lucide-react';
import { ArcReactor } from './components/ArcReactor';
import { ConnectionStatus } from './components/ConnectionStatus';
import { AudioVisualizer } from './components/AudioVisualizer';
import { SettingsPanel } from './components/SettingsPanel';
import { ChatPanel } from './components/ChatPanel';
import { ReactiveBackgroundGrid } from './components/ReactiveBackgroundGrid';
import { useJarvisSocket } from './hooks/useJarvisSocket';
import { useVoiceRecognition } from './hooks/useVoiceRecognition';
import type { AgentPersonaId, SupportedLanguage } from './types/agent';
import { AGENT_PERSONAS, SUPPORTED_LANGUAGES } from './types/agent';

export function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [autoListen, setAutoListen] = useState(true);
  const [clearGridTrigger, setClearGridTrigger] = useState(0);
  const [gridBlockCount, setGridBlockCount] = useState(0);

  // Agent Persona and Language state with persistence
  const [persona, setPersonaState] = useState<AgentPersonaId>(() => {
    const saved = localStorage.getItem('jarvis_agent_persona');
    return (saved as AgentPersonaId) in AGENT_PERSONAS ? (saved as AgentPersonaId) : 'jarvis';
  });

  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const saved = localStorage.getItem('jarvis_language');
    return (saved as SupportedLanguage) || 'english';
  });

  const setPersona = (newPersona: AgentPersonaId) => {
    setPersonaState(newPersona);
    localStorage.setItem('jarvis_agent_persona', newPersona);
  };

  const setLanguage = (newLang: SupportedLanguage) => {
    setLanguageState(newLang);
    localStorage.setItem('jarvis_language', newLang);
  };

  // Microphone device & phone mic optimization preferences
  const [selectedMicId, setSelectedMicIdState] = useState<string>(() => {
    return localStorage.getItem('jarvis_mic_device_id') || '';
  });
  const [phoneMicMode, setPhoneMicModeState] = useState<boolean>(() => {
    const saved = localStorage.getItem('jarvis_phone_mic_mode');
    return saved !== null ? saved === 'true' : true;
  });
  const [gainBoost, setGainBoostState] = useState<number>(() => {
    const saved = localStorage.getItem('jarvis_mic_gain_boost');
    return saved ? parseFloat(saved) : 1.8;
  });

  const setSelectedMicId = (deviceId: string) => {
    setSelectedMicIdState(deviceId);
    localStorage.setItem('jarvis_mic_device_id', deviceId);
  };

  const togglePhoneMicMode = () => {
    setPhoneMicModeState((prev) => {
      const next = !prev;
      localStorage.setItem('jarvis_phone_mic_mode', String(next));
      return next;
    });
  };

  const setGainBoost = (gain: number) => {
    setGainBoostState(gain);
    localStorage.setItem('jarvis_mic_gain_boost', String(gain));
  };

  // WebSocket bridge connection hook
  const {
    setPersona: setSocketPersona,
    setLanguage: setSocketLanguage,
    connectionState,
    agentStatus,
    speakingMessageId,
    voiceOutputMode,
    setVoiceOutputMode,
    systemDetails,
    latency,
    messages,
    sendMessage,
    stopSpeaking,
    replayMessage,
    clearMessages,
    previewVoice,
    reconnect,
  } = useJarvisSocket({
    persona,
    language,
    onSpeechCompleted: () => {
      if (autoListen) {
        setTimeout(() => {
          startListening();
        }, 200);
      }
    },
    onLanguageChanged: (newLang) => {
      setLanguage(newLang);
    },
  });

  // Voice Recognition hook with real-time barge-in and phone mic optimization
  const {
    isListening,
    error: voiceError,
    isSupported: isVoiceSupported,
    startListening,
    stopListening,
  } = useVoiceRecognition({
    onResult: (spokenText) => {
      if (spokenText) {
        sendMessage(spokenText);
      }
    },
    onStopRequested: () => {
      stopSpeaking();
    },
    isAgentSpeaking: agentStatus === 'speaking',
    deviceId: selectedMicId,
    phoneMicMode,
    gainBoost,
    language,
  });

  // Explicit stop hearing action: cancels mic
  const handleStopHearing = useCallback(() => {
    stopListening();
  }, [stopListening]);

  // Keep continuous listening active in Auto-Listen mode so saying "STOP" or asking questions always works
  useEffect(() => {
    if (autoListen && !isListening && isVoiceSupported) {
      const timer = setTimeout(() => {
        startListening();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoListen, isListening, isVoiceSupported, startListening]);

  // Keep socket hook synced with state
  useEffect(() => {
    setSocketPersona(persona);
  }, [persona, setSocketPersona]);

  useEffect(() => {
    setSocketLanguage(language);
  }, [language, setSocketLanguage]);

  // Central Orb click & Spacebar toggle handler
  const handleOrbClick = useCallback(() => {
    if (agentStatus === 'speaking') {
      stopSpeaking();
      return;
    }
    if (isListening) {
      handleStopHearing();
    } else {
      startListening();
    }
  }, [agentStatus, isListening, stopSpeaking, handleStopHearing, startListening]);

  // Toggle voice recognition manually from button
  const handleToggleVoice = () => {
    handleOrbClick();
  };

  // Global Keyboard listener:
  // - Spacebar: Toggles Arc Reactor orb (Activates / Deactivates listening, or halts speech)
  // - Escape: Halts speech & listening and closes open drawers/modals
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      // 1. Escape Key
      if (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        stopSpeaking();
        handleStopHearing();
        setIsChatOpen(false);
        setIsSettingsOpen(false);
        return;
      }

      // 2. Spacebar Key: Activate / Deactivate Orb
      const isSpace = e.code === 'Space' || e.key === ' ' || e.keyCode === 32;
      if (isSpace) {
        const target = e.target as HTMLElement | null;
        const isTyping =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable ||
            target.getAttribute('role') === 'textbox');

        // Allow normal space insertion when user is typing inside chat/settings text boxes
        if (isTyping) return;

        e.preventDefault();
        e.stopPropagation();
        handleOrbClick();
      }
    };

    window.addEventListener('keydown', handleGlobalKey, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKey, true);
    };
  }, [stopSpeaking, handleStopHearing, handleOrbClick]);

  // Toggle voice output mode (cycle: browser -> server -> mute -> browser)
  const cycleVoiceOutputMode = () => {
    if (voiceOutputMode === 'browser') setVoiceOutputMode('server');
    else if (voiceOutputMode === 'server') setVoiceOutputMode('mute');
    else setVoiceOutputMode('browser');
  };

  // Clock timer
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const activePersonaConfig = AGENT_PERSONAS[persona] || AGENT_PERSONAS.jarvis;

  const renderHeaderIcon = () => {
    switch (persona) {
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

  const getStatusDisplay = () => {
    if (agentStatus === 'speaking') {
      return {
        title: `TRANSMITTING SPEECH // ${activePersonaConfig.name}`,
        subtitle: 'Press [SPACEBAR], [ESC], say "STOP" / "RUKO", or click Core to interrupt',
        colorClass: activePersonaConfig.textClass,
      };
    }
    if (isListening) {
      return {
        title: 'CONTINUOUS LIVE VOICE // ALWAYS LISTENING',
        subtitle: `Hands-free active in ${language.toUpperCase()} (Press [SPACEBAR] or [ESC] to stop)`,
        colorClass: 'text-emerald-400',
      };
    }
    if (agentStatus === 'thinking') {
      return {
        title: 'PROCESSING NEURAL QUERY...',
        subtitle: 'Synthesizing concise spoken response',
        colorClass: 'text-amber-300',
      };
    }
    return {
      title: `${activePersonaConfig.name} STANDBY // READY`,
      subtitle: 'Press [SPACEBAR] or click Arc Reactor to start live continuous talk',
      colorClass: 'text-slate-400',
    };
  };

  const statusInfo = getStatusDisplay();

  return (
    <div className="relative w-screen h-screen bg-gray-950 text-slate-100 flex flex-col overflow-hidden select-none">
      {/* 3D Cursor-Reactive Futuristic Background Grid */}
      <ReactiveBackgroundGrid
        persona={persona}
        clearTrigger={clearGridTrigger}
        onActiveCountChange={setGridBlockCount}
      />

      {/* Ambient background scanlines & glow */}
      <div className="absolute inset-0 hud-scanlines pointer-events-none z-10" />
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[140px] pointer-events-none transition-colors duration-700 opacity-20 z-10"
        style={{ backgroundColor: activePersonaConfig.color }}
      />

      {/* Top HUD Header */}
      <header className="relative z-20 flex items-center justify-between px-6 py-3 border-b border-cyan-500/20 bg-gray-950/80 backdrop-blur-md">
        {/* Logo and Active Persona Header */}
        <div className="flex items-center space-x-3">
          <div
            className="p-2.5 rounded-xl border transition-all duration-300 shadow-md"
            style={{
              borderColor: `${activePersonaConfig.color}60`,
              backgroundColor: `${activePersonaConfig.color}15`,
            }}
          >
            {renderHeaderIcon()}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1
                className="font-mono text-lg font-black tracking-widest uppercase transition-colors duration-300"
                style={{
                  color: activePersonaConfig.color,
                  textShadow: `0 0 12px ${activePersonaConfig.color}80`,
                }}
              >
                {activePersonaConfig.name}
              </h1>
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded border uppercase"
                style={{
                  borderColor: `${activePersonaConfig.color}50`,
                  color: activePersonaConfig.color,
                  backgroundColor: `${activePersonaConfig.color}15`,
                }}
              >
                VOICE-TO-VOICE AGENT
              </span>
            </div>
            <span className="font-mono text-[10px] text-slate-400 tracking-wider">
              {activePersonaConfig.codename}
            </span>
          </div>
        </div>

        {/* Center: Quick 6-Persona Matrix Selector */}
        <div className="hidden lg:flex items-center space-x-1 p-1 bg-gray-900/90 border border-cyan-500/30 rounded-xl shadow-inner">
          {(Object.keys(AGENT_PERSONAS) as AgentPersonaId[]).map((pId) => {
            const cfg = AGENT_PERSONAS[pId];
            const isSel = persona === pId;
            return (
              <button
                key={pId}
                onClick={() => setPersona(pId)}
                title={`Switch Voice Agent to ${cfg.name}`}
                className={`px-3 py-1.5 rounded-lg font-mono text-[11px] font-bold transition-all flex items-center space-x-1.5 ${
                  isSel
                    ? 'bg-gray-950 text-white shadow-[0_0_12px_rgba(0,240,255,0.4)] border'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                style={{
                  borderColor: isSel ? cfg.color : 'transparent',
                  color: isSel ? cfg.color : undefined,
                }}
              >
                <span>{cfg.name}</span>
              </button>
            );
          })}
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Language Selector Dropdown */}
          <div className="relative">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
              title="Select Native Speech Language (English, Hindi, Gujarati, Marathi)"
              className="bg-gray-900/90 border border-cyan-500/40 rounded-lg px-2.5 py-1.5 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-300 cursor-pointer appearance-none pr-7 shadow-sm"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
            <Languages className="w-3.5 h-3.5 text-cyan-400 absolute right-2 top-2.5 pointer-events-none" />
          </div>

          {/* Auto-Listen Continuous Mode Badge */}
          <button
            onClick={() => setAutoListen((v) => !v)}
            title={`Continuous Auto-Listen: ${autoListen ? 'ON' : 'OFF'}`}
            className={`hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-[11px] transition-all ${
              autoListen
                ? 'bg-cyan-950/60 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(0,240,255,0.2)]'
                : 'bg-gray-900/80 border-slate-700 text-slate-500'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{autoListen ? 'AUTO-LISTEN: ON' : 'AUTO-LISTEN: OFF'}</span>
          </button>

          {/* Voice Output Mode Toggle */}
          <button
            onClick={cycleVoiceOutputMode}
            title={`Voice Output: ${voiceOutputMode.toUpperCase()}`}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-gray-900/80 border border-cyan-500/30 text-cyan-400 hover:border-cyan-300 transition-all font-mono text-[11px]"
          >
            {voiceOutputMode === 'browser' && <Volume2 className="w-3.5 h-3.5 text-cyan-400" />}
            {voiceOutputMode === 'server' && <Radio className="w-3.5 h-3.5 text-sky-400 animate-pulse" />}
            {voiceOutputMode === 'mute' && <VolumeX className="w-3.5 h-3.5 text-red-400" />}
            <span className="hidden sm:inline uppercase font-bold">
              {voiceOutputMode === 'browser' ? 'Web TTS' : voiceOutputMode === 'server' ? 'PC Voice' : 'Muted'}
            </span>
          </button>

          <ConnectionStatus
            status={connectionState}
            latency={latency}
            onReconnect={reconnect}
          />

          {/* Chat & Conversation History Button */}
          <button
            onClick={() => setIsChatOpen((prev) => !prev)}
            title="Open Conversation History & Chat Logs"
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-[11px] font-bold transition-all ${
              isChatOpen
                ? 'bg-cyan-950/90 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                : 'bg-gray-900/80 border-cyan-500/30 text-cyan-400 hover:border-cyan-300 hover:bg-cyan-950/50'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CHAT</span>
            {messages.length > 0 && (
              <span className="bg-cyan-400 text-gray-950 text-[9px] font-mono font-black px-1.5 py-0.2 rounded-full">
                {messages.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            title="Microphone & Agent Settings"
            className="p-2 rounded-lg bg-gray-900/80 border border-cyan-500/30 text-cyan-400 hover:border-cyan-300 hover:bg-cyan-950/50 transition-all shadow-[0_0_10px_rgba(0,240,255,0.15)]"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Full-Screen Voice Dashboard */}
      <main className="relative z-20 flex-1 flex flex-col items-center justify-between p-6 md:p-8 overflow-hidden max-w-5xl mx-auto w-full">
        
        {/* Top Status & System Protocol HUD */}
        <div className="w-full flex items-center justify-between px-4 py-2 bg-gray-900/60 border border-cyan-500/20 rounded-xl backdrop-blur-sm">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-mono text-xs font-bold text-cyan-300 tracking-wider">
              VOICE PROTOCOL // REAL-TIME HUMAN TURN-TAKING ACTIVE
            </span>
          </div>
          <div className="font-mono text-xs text-slate-400">
            {currentTime}
          </div>
        </div>

        {/* Central Glowing Hero Arc Reactor Core */}
        <div className="my-auto flex flex-col items-center justify-center space-y-6">
          <ArcReactor
            status={isListening ? 'listening' : agentStatus}
            persona={persona}
            onClick={handleOrbClick}
          />

          {/* Central Spoken Status Banner */}
          <div className="text-center space-y-1.5">
            <div
              className={`font-mono text-sm md:text-base font-black tracking-widest transition-colors duration-300 ${statusInfo.colorClass}`}
            >
              {statusInfo.title}
            </div>
            <div className="font-mono text-xs text-slate-400 tracking-wider">
              {statusInfo.subtitle}
            </div>
          </div>

          {/* Continuous Live Voice Indicator */}
          {isListening && (
            <div className="flex items-center space-x-2 px-4 py-1.5 bg-emerald-950/80 border border-emerald-400/60 rounded-full font-mono text-xs text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-bold tracking-wider">
                LIVE CONTINUOUS MIC // ALWAYS LISTENING
              </span>
            </div>
          )}

          {agentStatus === 'speaking' && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                stopSpeaking();
              }}
              className="flex items-center space-x-2 px-5 py-2 rounded-full bg-red-950/90 border border-red-500 text-red-200 font-mono text-xs font-bold tracking-wider animate-pulse hover:bg-red-900 shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all cursor-pointer"
            >
              <Square className="w-3 h-3 fill-red-400" />
              <span>STOP SPEECH (ESC / SAY "STOP" / "RUKO")</span>
            </button>
          )}

          {voiceError && (
            <div className="flex items-center space-x-2 px-4 py-1.5 bg-red-950/70 border border-red-500/50 rounded-xl text-red-300 font-mono text-xs">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span>{voiceError}</span>
            </div>
          )}
        </div>

        {/* Bottom Section: Full-Width Frequency Spectrum Visualizer & Microphone Core Controls */}
        <div className="w-full space-y-4">
          <AudioVisualizer
            status={isListening ? 'listening' : agentStatus}
            persona={persona}
            barCount={48}
          />

          {/* Voice Action Bar */}
          <div className="flex items-center justify-center space-x-4 pt-2">
            <button
              onClick={handleToggleVoice}
              disabled={!isVoiceSupported}
              className={`flex items-center space-x-3 px-8 py-3.5 rounded-2xl font-mono text-sm font-black uppercase tracking-widest transition-all duration-300 shadow-xl cursor-pointer ${
                isListening
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_25px_rgba(239,68,68,0.6)] animate-pulse border border-red-400'
                  : agentStatus === 'speaking'
                  ? 'bg-amber-500 hover:bg-amber-400 text-gray-950 shadow-[0_0_25px_rgba(245,158,11,0.6)] animate-pulse border border-amber-300'
                  : 'hover:scale-105 hover:brightness-110 active:scale-95'
              }`}
              style={
                !isListening && agentStatus !== 'speaking'
                  ? {
                      backgroundColor: activePersonaConfig.color,
                      color: ['ultron', 'karen'].includes(persona) ? '#ffffff' : '#030712',
                      boxShadow: `0 0 30px ${activePersonaConfig.color}90, 0 0 10px ${activePersonaConfig.color}40`,
                      border: `1px solid ${activePersonaConfig.color}`,
                    }
                  : undefined
              }
            >
              {isListening ? (
                <>
                  <MicOff className="w-5 h-5" />
                  <span>STOP LISTENING</span>
                </>
              ) : agentStatus === 'speaking' ? (
                <>
                  <Square className="w-5 h-5 fill-current" />
                  <span>HALT AI SPEECH</span>
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  <span>SPEAK TO {activePersonaConfig.name}</span>
                </>
              )}
            </button>
          </div>
        </div>

      </main>

      {/* Floating Right-Side Conversation Toggle */}
      <button
        onClick={() => setIsChatOpen((prev) => !prev)}
        title="Open Conversation History & Chat Logs"
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-gray-900/90 hover:bg-cyan-950 border-l border-t border-b border-cyan-500/40 hover:border-cyan-300 text-cyan-300 px-2 py-3.5 rounded-l-xl shadow-[0_0_20px_rgba(0,240,255,0.25)] flex flex-col items-center space-y-2 transition-all hover:-translate-x-1 backdrop-blur-md group cursor-pointer"
      >
        <div className="relative">
          <MessageSquare className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
          {messages.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-cyan-400 text-gray-950 font-mono text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center">
              {messages.length > 99 ? '99+' : messages.length}
            </span>
          )}
        </div>
        <span className="font-mono text-[9px] font-bold tracking-widest uppercase [writing-mode:vertical-rl] rotate-180 text-cyan-300/90 group-hover:text-cyan-100">
          CHAT LOGS
        </span>
      </button>

      {/* Floating Right-Side Eraser Button (Positioned right below Chat Logs toggle) */}
      <button
        onClick={() => setClearGridTrigger((prev) => prev + 1)}
        title="Clear Grid Pattern"
        className="fixed right-0 top-[calc(50%+58px)] z-40 bg-gray-900/90 hover:bg-gray-800 border-l border-t border-b p-2.5 rounded-l-xl backdrop-blur-md transition-all hover:-translate-x-1 group cursor-pointer"
        style={{
          borderColor: gridBlockCount > 0 ? `${activePersonaConfig.color}60` : 'rgba(0, 240, 255, 0.25)',
          color: gridBlockCount > 0 ? activePersonaConfig.color : '#94a3b8',
          boxShadow: gridBlockCount > 0 ? `0 0 15px ${activePersonaConfig.color}35` : 'none',
        }}
      >
        <Eraser className="w-4 h-4 group-hover:-rotate-12 group-hover:scale-110 transition-transform" />
      </button>

      {/* Right Side Chat Drawer Modal */}
      <div
        className={`fixed inset-0 z-50 transition-all duration-300 ${
          isChatOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
        }`}
      >
        {/* Backdrop overlay */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
            isChatOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setIsChatOpen(false)}
        />

        {/* Sliding Drawer Container */}
        <div
          className={`absolute top-0 right-0 bottom-0 w-full sm:w-[480px] md:w-[520px] bg-gray-950 border-l border-cyan-500/40 shadow-[-15px_0_50px_rgba(0,240,255,0.2)] transform transition-transform duration-300 ease-in-out flex flex-col z-10 ${
            isChatOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <ChatPanel
            messages={messages}
            agentStatus={agentStatus}
            speakingMessageId={speakingMessageId}
            onSendMessage={sendMessage}
            onClearMessages={clearMessages}
            onStopSpeaking={stopSpeaking}
            onReplayMessage={replayMessage}
            onClose={() => setIsChatOpen(false)}
          />
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        persona={persona}
        onSelectPersona={setPersona}
        language={language}
        onSelectLanguage={setLanguage}
        onPreviewVoice={previewVoice}
        systemDetails={systemDetails}
        voiceOutputMode={voiceOutputMode}
        onSetVoiceMode={setVoiceOutputMode}
        autoListen={autoListen}
        onToggleAutoListen={() => setAutoListen((v) => !v)}
        onClearMemory={clearMessages}
        selectedMicId={selectedMicId}
        onSelectMic={setSelectedMicId}
        phoneMicMode={phoneMicMode}
        onTogglePhoneMicMode={togglePhoneMicMode}
        gainBoost={gainBoost}
        onSetGainBoost={setGainBoost}
      />
    </div>
  );
}

export default App;
