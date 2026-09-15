import React from 'react';
import { motion } from 'framer-motion';
import { Mic, Skull, Zap, Sun, Sparkles, Shield, Cpu } from 'lucide-react';
import type { AgentStatus } from '../hooks/useJarvisSocket';
import type { AgentPersonaId } from '../types/agent';
import { AGENT_PERSONAS } from '../types/agent';

interface ArcReactorProps {
  status: AgentStatus;
  persona?: AgentPersonaId;
  onClick?: () => void;
}

export const ArcReactor: React.FC<ArcReactorProps> = ({ status, persona = 'jarvis', onClick }) => {
  const personaConfig = AGENT_PERSONAS[persona] || AGENT_PERSONAS.jarvis;

  // Theme colors and animations according to status and persona
  const getTheme = () => {
    const baseColor = personaConfig.color;

    switch (status) {
      case 'thinking':
        return {
          glowColor: persona === 'ultron' ? 'rgba(168, 85, 247, 0.8)' : 'rgba(255, 183, 0, 0.8)',
          coreBg: persona === 'ultron' ? 'from-purple-600 via-violet-500 to-fuchsia-200' : 'from-amber-500 via-orange-400 to-yellow-200',
          ringColor: persona === 'ultron' ? 'border-purple-400/60' : 'border-amber-400/60',
          subText: 'PROCESSING NEURAL DIRECTIVE',
          accentColor: persona === 'ultron' ? '#a855f7' : '#ffb700',
          rotationSpeed: 3,
        };
      case 'speaking':
        return {
          glowColor: `${baseColor}E6`,
          coreBg:
            persona === 'ultron'
              ? 'from-purple-500 via-violet-400 to-white'
              : persona === 'friday'
              ? 'from-emerald-400 via-teal-300 to-white'
              : persona === 'vision'
              ? 'from-lime-400 via-yellow-300 to-white'
              : persona === 'karen'
              ? 'from-pink-400 via-rose-300 to-white'
              : persona === 'titan'
              ? 'from-orange-500 via-amber-400 to-white'
              : 'from-cyan-400 via-sky-300 to-white',
          ringColor: `border-[${baseColor}]/80`,
          subText: 'CLICK ORB TO HALT SPEECH',
          accentColor: baseColor,
          rotationSpeed: 6,
        };
      case 'listening':
        return {
          glowColor: `${baseColor}F2`,
          coreBg:
            persona === 'ultron'
              ? 'from-purple-500 via-violet-400 to-indigo-200'
              : persona === 'friday'
              ? 'from-teal-400 via-emerald-300 to-cyan-100'
              : persona === 'vision'
              ? 'from-lime-400 via-yellow-300 to-emerald-200'
              : persona === 'titan'
              ? 'from-orange-500 via-amber-400 to-yellow-100'
              : 'from-sky-400 via-teal-300 to-cyan-100',
          ringColor: `border-[${baseColor}]/90`,
          subText: 'LISTENING... SPEAK NOW',
          accentColor: baseColor,
          rotationSpeed: 8,
        };
      case 'idle':
      default:
        return {
          glowColor: `${baseColor}66`,
          coreBg:
            persona === 'ultron'
              ? 'from-purple-700 via-violet-600 to-purple-300'
              : persona === 'friday'
              ? 'from-emerald-600 via-teal-500 to-emerald-200'
              : persona === 'vision'
              ? 'from-lime-600 via-yellow-500 to-emerald-400'
              : persona === 'karen'
              ? 'from-pink-600 via-rose-500 to-pink-200'
              : persona === 'titan'
              ? 'from-orange-600 via-amber-600 to-orange-200'
              : 'from-cyan-600 via-sky-400 to-cyan-200',
          ringColor: `border-[${baseColor}]/40`,
          subText: `CLICK ORB TO ENGAGE ${personaConfig.name}`,
          accentColor: baseColor,
          rotationSpeed: 20,
        };
    }
  };

  const renderPersonaIcon = () => {
    if (status === 'listening') return <Mic className="w-4 h-4 text-white animate-pulse" />;
    switch (persona) {
      case 'ultron':
        return <Skull className="w-4 h-4 text-purple-100" />;
      case 'friday':
        return <Zap className="w-4 h-4 text-emerald-100" />;
      case 'vision':
        return <Sun className="w-4 h-4 text-lime-100" />;
      case 'karen':
        return <Sparkles className="w-4 h-4 text-pink-100" />;
      case 'titan':
        return <Cpu className="w-4 h-4 text-orange-100" />;
      case 'jarvis':
      default:
        return <Shield className="w-4 h-4 text-cyan-100" />;
    }
  };

  const theme = getTheme();

  return (
    <div
      onClick={onClick}
      className="relative flex flex-col items-center justify-center cursor-pointer select-none group"
      title={
        status === 'speaking'
          ? 'Click to Stop Speaking'
          : status === 'listening'
          ? 'Listening... Click to Stop'
          : 'Click Arc Reactor to Speak'
      }
    >
      {/* Outer Glow Halo */}
      <motion.div
        animate={{
          scale: status === 'speaking' || status === 'listening' ? [1, 1.15, 1] : status === 'thinking' ? [1, 1.08, 1] : [1, 1.03, 1],
          opacity: status === 'speaking' || status === 'listening' ? [0.6, 0.95, 0.6] : [0.3, 0.6, 0.3],
        }}
        transition={{ duration: status === 'speaking' || status === 'listening' ? 1.2 : 2.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          boxShadow: `0 0 70px ${theme.glowColor}, inset 0 0 50px ${theme.glowColor}`,
        }}
        className="w-56 h-56 md:w-64 md:h-64 rounded-full absolute -z-10 blur-xl group-hover:scale-110 transition-transform duration-300"
      />

      {/* Main Container HUD Circles */}
      <div className="relative w-52 h-52 md:w-60 md:h-60 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
        
        {/* Outermost Segmented Ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: theme.rotationSpeed * 3, repeat: Infinity, ease: 'linear' }}
          className={`absolute inset-0 rounded-full border-2 border-dashed ${theme.ringColor}`}
        />

        {/* Counter-rotating Ring with Notches */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: theme.rotationSpeed * 2, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-3 rounded-full border border-cyan-500/30 flex items-center justify-center"
        >
          <div className="absolute top-0 w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_#00f0ff]" />
          <div className="absolute bottom-0 w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_#00f0ff]" />
          <div className="absolute left-0 w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_#00f0ff]" />
          <div className="absolute right-0 w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_#00f0ff]" />
        </motion.div>

        {/* Middle Arc Reactor Segments */}
        <div className="absolute inset-7 rounded-full border-2 border-cyan-400/50 flex items-center justify-center p-2">
          {/* 10 Segmented Arc Slots */}
          {[...Array(10)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-full h-full flex justify-center items-start"
              style={{ transform: `rotate(${i * 36}deg)` }}
            >
              <div
                className="w-2.5 h-4 rounded-sm transition-all duration-300 shadow-[0_0_6px]"
                style={{
                  backgroundColor: theme.accentColor,
                  boxShadow: `0 0 8px ${theme.accentColor}`,
                  opacity: status === 'thinking' && i % 2 === 0 ? 0.4 : 0.85,
                }}
              />
            </motion.div>
          ))}
        </div>

        {/* Inner Core Pulse Ring */}
        <motion.div
          animate={{
            scale: status === 'speaking' || status === 'listening' ? [1, 1.18, 0.95, 1.1, 1] : [1, 1.05, 1],
          }}
          transition={{
            duration: status === 'speaking' || status === 'listening' ? 0.8 : 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute inset-14 rounded-full border border-white/60 bg-gray-950/70 backdrop-blur-md flex items-center justify-center shadow-inner"
        >
          {/* Glowing Center Orb */}
          <div
            className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-tr ${theme.coreBg} flex items-center justify-center shadow-[0_0_30px_${theme.accentColor}] relative overflow-hidden`}
          >
            {/* Core Energy Flare */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/80 via-transparent to-transparent opacity-70"
            />
            
            {/* Inner Tri-Blade Core or Persona Icon */}
            <div className="w-8 h-8 rounded-full border border-white/80 flex items-center justify-center bg-gray-950/40">
              {renderPersonaIcon()}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Status HUD Text */}
      <div className="mt-5 text-center">
        <div className="font-mono text-xs tracking-widest text-cyan-400/70 uppercase">
          CORE PROTOCOL
        </div>
        <div
          className="font-mono text-sm md:text-base font-bold tracking-widest transition-colors duration-300"
          style={{ color: theme.accentColor, textShadow: `0 0 10px ${theme.accentColor}` }}
        >
          {status.toUpperCase()}
        </div>
        <div className="font-mono text-[10px] tracking-wider text-slate-400/80 mt-0.5 group-hover:text-cyan-300 transition-colors">
          {theme.subText}
        </div>
      </div>
    </div>
  );
};
