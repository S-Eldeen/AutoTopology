import { ArrowUp, Square, Copy, Check, Mic, AudioLines } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore } from '../../stores/chatStore.js';
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea.js';
import { useVoiceInput } from '../../hooks/useVoiceInput.js';
import ActionTrace from './ActionTrace.jsx';
import DownloadKit from './DownloadKit.jsx';
import TopologyPreviewCard from './TopologyPreviewCard.jsx';

export default function ConversationView() {
  const {
    activeSessionId, messages, streamingText, isStreaming, activeTool, error,
    sendMessage, stopStreaming,
  } = useChatStore();

  const [text, setText] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useAutoResizeTextarea(text);
  const {
    isListening,
    isVoiceSupported,
    voiceMessage,
    toggleListening,
  } = useVoiceInput({ text, setText });

  const activeMessages = activeSessionId ? (messages[activeSessionId] || []) : [];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeMessages, streamingText, activeTool]);

  const handleSend = async () => {
    if (!text.trim() || isStreaming) return;
    await sendMessage(text.trim());
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="h-full flex flex-col">
      {/* ── Message stream ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
          {activeMessages.map((msg, i) => (
            <MessageItem key={i} message={msg} />
          ))}

          {/* Streaming text */}
          {isStreaming && streamingText && (
            <div className="animate-fade-in-up">
              <div className="prose prose-invert max-w-none text-[15.5px] leading-[1.75] streaming-cursor">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Active tool indicator */}
          {activeTool && (
            <div className="rounded-2xl p-5 animate-fade-in-up border border-emerald-500/[0.15]"
              style={{ background: 'linear-gradient(180deg, rgba(16,185,129,0.06), rgba(16,185,129,0.02))' }}>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span className="text-[13px] font-medium text-emerald-300/90">
                  {activeTool.tool === 'generate_topology' && 'Generating topology'}
                  {activeTool.tool === 'edit_topology' && 'Editing topology'}
                  {activeTool.tool === 'export_project' && 'Building deployment kit'}
                </span>
              </div>
              {activeTool.steps?.length > 0 && (
                <div className="space-y-1.5">
                  {activeTool.steps.slice(-4).map((step, i) => {
                    const label = typeof step === 'string' ? step : step?.label;
                    return (
                      <div key={step?.id || i} className="flex items-start gap-2 text-[13px] text-zinc-400 animate-fade-in">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-500/70 flex-shrink-0" />
                        {label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Thinking indicator */}
          {isStreaming && !streamingText && !activeTool && (
            <div className="flex items-center gap-2 text-[14px] text-zinc-500">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-pulse" style={{ animationDelay: '0.15s' }} />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Input area ── */}
      <div className="flex-shrink-0 px-6 pb-6 pt-2">
        <div className="max-w-3xl mx-auto">
          {error && (
            <div className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          {voiceMessage && (
            <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {voiceMessage}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-[22px] px-5 py-3.5 transition-all focus-within:border-emerald-500/25"
            style={{
              background: 'rgba(255,255,255,0.035)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
            }}>
            <textarea
              ref={inputRef}
              data-chat-input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the network you want to build..."
              rows={1}
              className="flex-1 bg-transparent text-[15px] text-white placeholder-zinc-500 resize-none focus:outline-none leading-relaxed transition-[height] duration-150 ease-out overscroll-contain max-h-32"
              style={{ minHeight: '24px', height: '24px', overflowY: 'hidden' }}
            />
            {isVoiceSupported && (
              <button
                type="button"
                onClick={toggleListening}
                disabled={isStreaming}
                className={`flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
                  isListening
                    ? 'bg-red-500/15 text-red-300 ring-1 ring-red-400/40 animate-pulse'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white disabled:text-zinc-600 disabled:hover:bg-transparent'
                }`}
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                title={isListening ? 'Stop voice input' : 'Start voice input'}
              >
                {isListening ? <AudioLines size={16} /> : <Mic size={16} />}
              </button>
            )}
            <button
              onClick={isStreaming ? stopStreaming : handleSend}
              disabled={!isStreaming && !text.trim()}
              className={`flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full transition-all ${
                isStreaming
                  ? 'bg-white text-zinc-900 hover:bg-zinc-200'
                  : 'text-white disabled:bg-white/10 disabled:text-zinc-500 disabled:cursor-not-allowed'
              }`}
              style={!isStreaming && text.trim() ? { background: 'linear-gradient(180deg, #10b981, #0d9668)' } : undefined}
              aria-label={isStreaming ? 'Stop generating' : 'Send message'}
              title={isStreaming ? 'Stop generating' : 'Send message'}
            >
              {isStreaming ? <Square size={13} fill="currentColor" /> : <ArrowUp size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Copy button (reusable) ──
function CopyButton({ text, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={handleCopy} className={`inline-flex items-center gap-1.5 text-xs transition-colors ${className} ${copied ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

// ── Code block with copy button ──
function CodeBlock({ children, className }) {
  const codeText = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : String(children || '');
  const langMatch = className?.match(/language-(\w+)/);
  const lang = langMatch ? langMatch[1] : '';

  return (
    <div className="relative group my-3">
      <div className="rounded-xl overflow-hidden border border-white/[0.07]" style={{ background: 'rgba(0,0,0,0.3)' }}>
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/[0.06]">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{lang || 'code'}</span>
          <CopyButton text={codeText} label="Copy" className="!text-[11px]" />
        </div>
        <pre className="overflow-x-auto p-3.5 text-xs leading-relaxed"><code className={className}>{children}</code></pre>
      </div>
    </div>
  );
}

// ── Message item ──
// Assistant messages render as plain text — no avatar/logo, matches a clean
// document-style thread (like ChatGPT). User messages stay as a soft glass bubble on the right.
function MessageItem({ message }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in-up">
        <div className="max-w-[78%] rounded-[20px] rounded-br-md px-5 py-3 text-[15px] leading-relaxed text-white"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up group">
      <div className="prose prose-invert max-w-none text-[15.5px] leading-[1.75]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ inline, className, children, ...props }) {
              if (inline) {
                return <code className="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-emerald-300 text-[0.875em] font-mono" {...props}>{children}</code>;
              }
              return <CodeBlock className={className}>{children}</CodeBlock>;
            },
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>

      {message.toolSummary && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-zinc-400 rounded-lg px-2.5 py-1.5 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <span className="w-1 h-1 rounded-full bg-emerald-400" />
          {message.toolSummary}
        </div>
      )}

      {/* Past tool trace (collapsible) */}
      {message.toolTrace && (
        <div className="mt-3">
          <ActionTrace trace={message.toolTrace} defaultOpen={false} />
        </div>
      )}

      {message.topology && <div className="mt-4"><TopologyPreviewCard topology={message.topology} /></div>}
      {message.exportKit && <div className="mt-4"><DownloadKit exportKit={message.exportKit} /></div>}

      {/* Copy button — appears on hover */}
      {message.content && (
        <div className="mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={message.content} label="Copy" />
        </div>
      )}
    </div>
  );
}
