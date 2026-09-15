import React from 'react';
import { Wifi, WifiOff, RefreshCw, Activity } from 'lucide-react';
import type { ConnectionState } from '../hooks/useJarvisSocket';

interface ConnectionStatusProps {
  status: ConnectionState;
  latency: number | null;
  onReconnect: () => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  latency,
  onReconnect,
}) => {
  const getStatusDisplay = () => {
    switch (status) {
      case 'connected':
        return {
          label: 'ONLINE // SECURE',
          color: 'text-cyan-400',
          dot: 'bg-cyan-400 shadow-[0_0_8px_#00f0ff]',
          border: 'border-cyan-500/30',
          bg: 'bg-cyan-950/40',
        };
      case 'connecting':
        return {
          label: 'SYNCING CORE...',
          color: 'text-amber-400',
          dot: 'bg-amber-400 animate-ping',
          border: 'border-amber-500/30',
          bg: 'bg-amber-950/40',
        };
      case 'error':
      case 'disconnected':
      default:
        return {
          label: 'OFFLINE // RECONNECTING',
          color: 'text-red-400',
          dot: 'bg-red-500 shadow-[0_0_8px_#ff3344]',
          border: 'border-red-500/30',
          bg: 'bg-red-950/40',
        };
    }
  };

  const current = getStatusDisplay();

  return (
    <div
      className={`flex items-center space-x-3 px-3 py-1.5 rounded-lg border ${current.border} ${current.bg} backdrop-blur-sm transition-all`}
    >
      <div className="flex items-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${current.dot}`} />
        {status === 'connected' ? (
          <Wifi className={`w-3.5 h-3.5 ${current.color}`} />
        ) : (
          <WifiOff className={`w-3.5 h-3.5 ${current.color}`} />
        )}
        <span className={`font-mono text-xs font-semibold tracking-wider ${current.color}`}>
          {current.label}
        </span>
      </div>

      {status === 'connected' && latency !== null && (
        <div className="flex items-center space-x-1 pl-2 border-l border-cyan-500/20 font-mono text-[10px] text-slate-400">
          <Activity className="w-2.5 h-2.5 text-cyan-400" />
          <span>{latency}ms</span>
        </div>
      )}

      {status !== 'connected' && (
        <button
          onClick={onReconnect}
          className="flex items-center space-x-1 text-[10px] font-mono text-cyan-400 hover:text-cyan-200 underline uppercase ml-1"
        >
          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
};
