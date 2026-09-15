import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Trash2,
  Bot,
  User,
  Terminal,
  Sparkles,
  Square,
  X,
  Copy,
  Check,
  Download,
  MessageSquare,
  ExternalLink,
  Volume2,
} from 'lucide-react';
import type { ChatMessage, AgentStatus } from '../hooks/useJarvisSocket';
import { AGENT_PERSONAS } from '../types/agent';

interface ChatPanelProps {
  messages: ChatMessage[];
  agentStatus: AgentStatus;
  speakingMessageId?: string | null;
  onSendMessage: (text: string) => void;
  onClearMessages: () => void;
  onStopSpeaking: () => void;
  onReplayMessage?: (msg: ChatMessage) => void;
  onClose?: () => void;
}

const QUICK_PROMPTS = [
  'Who are you?',
  'What capabilities are active?',
  'Give me a tactical briefing',
  'Tell me a witty joke',
];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  agentStatus,
  speakingMessageId,
  onSendMessage,
  onClearMessages,
  onStopSpeaking,
  onReplayMessage,
  onClose,
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentStatus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleQuickPrompt = (prompt: string) => {
    onSendMessage(prompt);
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportChat = () => {
    const textLog = messages
      .map(
        (m) =>
          `[${m.timestamp}] ${m.sender.toUpperCase()}${
            m.persona ? ` (${m.persona.toUpperCase()})` : ''
          }: ${m.text}`
      )
      .join('\n\n');

    const blob = new Blob([textLog], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis_chat_history_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Renders formatted message content with clickable links (opening in new tab),
   * bold text, inline code snippets, and plain text.
   */
  const renderFormattedMessage = (text: string): React.ReactNode => {
    if (!text) return null;

    // Pattern matches:
    // Group 1..3: Markdown link [Title](https://... or www....)
    // Group 4: Raw URL http://, https://, or www.
    // Group 5..6: Bold **text**
    // Group 7..8: Inline code `code`
    const regex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+|www\.[^\s)]+)\))|((?:https?:\/\/|www\.)[^\s)]+)|(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        elements.push(text.substring(lastIndex, match.index));
      }

      const key = `token-${match.index}`;

      if (match[1]) {
        // Markdown link [Title](url)
        const linkTitle = match[2];
        let linkUrl = match[3].replace(/[),;:!?*_~#>]+$/, '').trim();
        if (linkUrl.startsWith('www.')) {
          linkUrl = 'https://' + linkUrl;
        }

        // Defensive YouTube Auto-Healing for older history items or incomplete paths
        if (/youtube\.com\/(c|channel|user|@)\/?$/i.test(linkUrl) || linkUrl === 'https://youtube.com/c' || linkUrl === 'https://www.youtube.com/c') {
          const cleanQuery = linkTitle.replace(/https?:\/\/\S+/g, '').replace(/[\–\—\-\:\(\)\[\]\|\_]/g, ' ').trim();
          linkUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery || 'Dubai real estate')}`;
        }

        elements.push(
          <a
            key={key}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${linkUrl} in new tab`}
            className="inline-flex items-center gap-1 font-semibold text-cyan-300 hover:text-cyan-100 underline decoration-cyan-400/70 hover:decoration-cyan-300 underline-offset-4 bg-cyan-950/60 hover:bg-cyan-900/80 px-1.5 py-0.5 rounded transition-all shadow-[0_0_8px_rgba(0,240,255,0.15)] group/link break-all my-0.5"
          >
            <span>{linkTitle}</span>
            <ExternalLink className="w-3 h-3 text-cyan-400 group-hover/link:text-cyan-200 flex-shrink-0 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5" />
          </a>
        );
      } else if (match[4]) {
        // Raw URL
        let rawUrl = match[4];
        let trailingPunct = '';
        const punctMatch = rawUrl.match(/([.,;:!?]+)$/);
        if (punctMatch) {
          trailingPunct = punctMatch[1];
          rawUrl = rawUrl.slice(0, -trailingPunct.length);
        }
        let href = rawUrl;
        if (href.startsWith('www.')) {
          href = 'https://' + href;
        }

        elements.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${href} in new tab`}
            className="inline-flex items-center gap-1 font-semibold text-cyan-300 hover:text-cyan-100 underline decoration-cyan-400/70 hover:decoration-cyan-300 underline-offset-4 bg-cyan-950/60 hover:bg-cyan-900/80 px-1.5 py-0.5 rounded transition-all shadow-[0_0_8px_rgba(0,240,255,0.15)] group/link break-all my-0.5"
          >
            <span>{rawUrl}</span>
            <ExternalLink className="w-3 h-3 text-cyan-400 group-hover/link:text-cyan-200 flex-shrink-0 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5" />
          </a>
        );
        if (trailingPunct) {
          elements.push(trailingPunct);
        }
      } else if (match[5]) {
        // Bold text **text**
        elements.push(
          <strong key={key} className="font-bold text-white">
            {match[6]}
          </strong>
        );
      } else if (match[7]) {
        // Inline code `code`
        elements.push(
          <code
            key={key}
            className="px-1.5 py-0.5 rounded bg-black/50 border border-cyan-500/30 text-cyan-200 font-mono text-xs"
          >
            {match[8]}
          </code>
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      elements.push(text.substring(lastIndex));
    }

    return elements;
  };

  return (
    <div className="relative flex flex-col h-full bg-gray-950/95 backdrop-blur-md border border-cyan-500/30 overflow-hidden shadow-[0_0_30px_rgba(0,240,255,0.12)]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/90 border-b border-cyan-500/20 flex-shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-500/30 text-cyan-400">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-bold tracking-widest text-cyan-300 uppercase">
                CONVERSATION ARCHIVE
              </span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-400 border border-cyan-500/30">
                {messages.length} LOGS
              </span>
            </div>
            <span className="font-mono text-[10px] text-slate-400">
              Live Human & Agent Interaction History
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {/* Active Stop Speech button in Header when speaking */}
          {agentStatus === 'speaking' && (
            <button
              onClick={onStopSpeaking}
              title="Interrupt & Stop Speaking (ESC)"
              className="flex items-center space-x-1 px-2 py-1 rounded bg-red-950/80 border border-red-500 text-red-300 hover:bg-red-900 text-[11px] font-mono animate-pulse shadow-[0_0_10px_rgba(255,50,50,0.5)] transition-all"
            >
              <Square className="w-3 h-3 fill-red-400 text-red-400" />
              <span>STOP</span>
            </button>
          )}

          {/* Export Transcript */}
          {messages.length > 0 && (
            <button
              onClick={handleExportChat}
              title="Export / Download Chat Transcript"
              className="p-1.5 text-slate-400 hover:text-cyan-300 transition-colors rounded hover:bg-cyan-950/60"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Clear Logs */}
          <button
            onClick={onClearMessages}
            title="Clear Chat Logs"
            className="p-1.5 text-slate-400 hover:text-red-400 transition-colors rounded hover:bg-red-950/60"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Close Panel Button */}
          {onClose && (
            <button
              onClick={onClose}
              title="Close Conversation Panel"
              className="p-1.5 text-slate-400 hover:text-cyan-200 transition-colors rounded hover:bg-white/10 ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-3">
            <MessageSquare className="w-10 h-10 text-slate-600 stroke-[1.5]" />
            <div className="font-mono text-xs uppercase tracking-wider text-slate-400">
              No Conversation Logs Yet
            </div>
            <p className="text-xs text-slate-500 max-w-xs">
              Speak using the microphone or type below to start talking with Jarvis and view the conversation timeline.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isJarvis = msg.sender === 'jarvis';
            const isSystem = msg.sender === 'system';
            const personaConfig = msg.persona ? AGENT_PERSONAS[msg.persona] : null;
            const isCurrentlySpeaking = speakingMessageId === msg.id && agentStatus === 'speaking';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} transition-all group`}
              >
                {/* Sender label and timestamp */}
                <div className="flex items-center space-x-1.5 mb-1 px-1">
                  {isUser && <User className="w-3 h-3 text-cyan-400" />}
                  {isJarvis && (
                    <Bot
                      className="w-3 h-3"
                      style={{ color: personaConfig?.color || '#38bdf8' }}
                    />
                  )}
                  {isSystem && <Terminal className="w-3 h-3 text-amber-400" />}
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider font-semibold"
                    style={{
                      color: isUser
                        ? '#22d3ee'
                        : isJarvis
                        ? personaConfig?.color || '#38bdf8'
                        : '#fbbf24',
                    }}
                  >
                    {isUser
                      ? 'YOU'
                      : isJarvis
                      ? personaConfig?.name || 'J.A.R.V.I.S.'
                      : 'SYSTEM PROTOCOL'}
                  </span>
                  <span className="font-mono text-[9px] text-slate-500">
                    [{msg.timestamp}]
                  </span>

                  {/* Sound / Replay AI Response Icon */}
                  {isJarvis && onReplayMessage && (
                    <button
                      onClick={() => {
                        if (isCurrentlySpeaking) {
                          onStopSpeaking();
                        } else {
                          onReplayMessage(msg);
                        }
                      }}
                      title={isCurrentlySpeaking ? "Stop speech (ESC)" : "Hear AI response again"}
                      aria-label={isCurrentlySpeaking ? "Stop speech" : "Hear AI response again"}
                      className={`p-1 rounded transition-all flex items-center gap-1 cursor-pointer ${
                        isCurrentlySpeaking
                          ? 'text-cyan-300 bg-cyan-950/90 border border-cyan-400/80 shadow-[0_0_10px_rgba(0,240,255,0.4)] animate-pulse'
                          : 'text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/60 opacity-80 group-hover:opacity-100'
                      }`}
                    >
                      {isCurrentlySpeaking ? (
                        <>
                          <Volume2 className="w-3.5 h-3.5 text-cyan-300 animate-bounce" />
                          <span className="font-mono text-[9px] text-cyan-300 font-bold uppercase tracking-wider hidden sm:inline">
                            PLAYING
                          </span>
                        </>
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 hover:scale-110 transition-transform" />
                      )}
                    </button>
                  )}

                  {/* Copy snippet button */}
                  <button
                    onClick={() => handleCopyText(msg.id, msg.text)}
                    title="Copy message"
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-500 hover:text-cyan-300 rounded hover:bg-cyan-950/40"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed transition-all ${
                    isUser
                      ? 'bg-cyan-950/80 border border-cyan-500/40 text-cyan-100 shadow-[0_0_12px_rgba(0,240,255,0.15)] rounded-tr-sm'
                      : isJarvis
                      ? `bg-gray-900/90 border text-slate-100 shadow-[0_0_15px_rgba(0,0,0,0.5)] rounded-tl-sm ${
                          isCurrentlySpeaking ? 'ring-1 ring-cyan-400/80 shadow-[0_0_16px_rgba(0,240,255,0.3)]' : ''
                        }`
                      : 'bg-amber-950/40 border border-amber-500/30 text-amber-200/90 font-mono text-xs'
                  }`}
                  style={{
                    borderColor: isJarvis && personaConfig ? `${personaConfig.color}40` : undefined,
                  }}
                >
                  <div className="whitespace-pre-wrap select-text">{renderFormattedMessage(msg.text)}</div>
                </div>
              </div>
            );
          })
        )}

        {/* Thinking indicator: Only show when status is thinking AND awaiting reply for latest user prompt */}
        {agentStatus === 'thinking' && messages.length > 0 && messages[messages.length - 1].sender === 'user' && (
          <div className="flex items-center space-x-2 py-2 px-3 bg-amber-950/30 border border-amber-500/30 rounded-lg w-fit">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            <span className="font-mono text-xs text-amber-300 tracking-wider">
              Agent is synthesizing neural response...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick suggestions */}
      <div className="px-3 py-2 bg-gray-900/60 border-t border-cyan-500/10 flex items-center space-x-2 overflow-x-auto no-scrollbar flex-shrink-0">
        <span className="font-mono text-[10px] text-slate-500 whitespace-nowrap">
          QUICK:
        </span>
        {QUICK_PROMPTS.map((prompt, index) => (
          <button
            key={index}
            onClick={() => handleQuickPrompt(prompt)}
            className="px-2 py-1 rounded bg-cyan-950/60 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-900/60 hover:border-cyan-400 text-[11px] font-mono whitespace-nowrap transition-all"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <form
        onSubmit={handleSubmit}
        className="p-3 bg-gray-900/95 border-t border-cyan-500/30 flex items-center space-x-2 flex-shrink-0"
      >
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type directive or question..."
            className="w-full bg-gray-950 border border-cyan-500/40 rounded-lg px-3.5 py-2 text-sm text-cyan-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-mono"
          />
        </div>

        {agentStatus === 'speaking' ? (
          <button
            type="button"
            onClick={onStopSpeaking}
            title="Stop Speech Immediately (ESC)"
            className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all shadow-[0_0_12px_rgba(255,50,50,0.5)] flex items-center space-x-1.5 font-mono text-xs font-bold"
          >
            <Square className="w-3.5 h-3.5 fill-white" />
            <span>STOP</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 bg-gradient-to-r from-cyan-600 to-sky-500 hover:from-cyan-500 hover:to-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-[0_0_12px_rgba(0,240,255,0.4)] flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </form>
    </div>
  );
};
