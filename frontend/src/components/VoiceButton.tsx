import React from 'react';
import { Mic, MicOff, Square } from 'lucide-react';
import { motion } from 'framer-motion';

interface VoiceButtonProps {
  isListening: boolean;
  onToggle: () => void;
  onStopHearing: () => void;
  isSupported?: boolean;
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  isListening,
  onToggle,
  onStopHearing,
  isSupported = true,
}) => {
  return (
    <div className="flex items-center space-x-2">
      {/* Main Mic Activation / Toggle Button */}
      <div className="relative flex items-center justify-center">
        {/* Animated Ripple Waves when Listening */}
        {isListening && (
          <>
            <motion.div
              animate={{ scale: [1, 1.8], opacity: [0.8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
              className="absolute w-12 h-12 rounded-full border-2 border-cyan-400 -z-10"
            />
            <motion.div
              animate={{ scale: [1, 2.3], opacity: [0.5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.4, ease: 'easeOut' }}
              className="absolute w-12 h-12 rounded-full border border-cyan-300 -z-10"
            />
          </>
        )}

        <button
          onClick={onToggle}
          title={
            !isSupported
              ? 'Voice input not supported in this browser'
              : isListening
              ? 'Click to Stop Listening'
              : 'Click to Start Voice Input'
          }
          className={`relative group flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 ${
            isListening
              ? 'bg-cyan-400 text-gray-950 shadow-[0_0_25px_#00f0ff]'
              : 'bg-gray-900/90 border border-cyan-500/50 text-cyan-400 hover:border-cyan-300 hover:bg-cyan-950/60 shadow-[0_0_15px_rgba(0,240,255,0.2)]'
          }`}
        >
          {isListening ? (
            <Mic className="w-5 h-5 animate-pulse" />
          ) : (
            <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />
          )}

          {/* Not supported badge */}
          {!isSupported && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5">
              <MicOff className="w-2.5 h-2.5" />
            </div>
          )}
        </button>
      </div>

      {/* Explicit STOP HEARING Button (Visible when listening is active) */}
      {isListening && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, x: -10 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={onStopHearing}
          title="Stop Hearing & Cancel Voice Input"
          className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-red-950/80 border border-red-500 text-red-300 hover:bg-red-900 hover:border-red-400 text-xs font-mono font-bold shadow-[0_0_15px_rgba(255,50,50,0.4)] animate-pulse transition-all"
        >
          <Square className="w-3.5 h-3.5 fill-red-400 text-red-400" />
          <span className="whitespace-nowrap">STOP HEARING</span>
        </motion.button>
      )}
    </div>
  );
};
