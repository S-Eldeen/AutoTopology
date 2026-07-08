import { ArrowUp, Square, Copy, Check, Mic, AudioLines } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isDesignPrompt, useChatStore } from '../../stores/chatStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea.js';
import { useVoiceInput } from '../../hooks/useVoiceInput.js';
import ActionTrace from './ActionTrace.jsx';
import DownloadKit from './DownloadKit.jsx';
import TopologyPreviewCard from './TopologyPreviewCard.jsx';

/**
 * ConversationView — active conversation UI.
 *
 * Design system (Zinc + Emerald accent):
 *  - Background: zinc-950 (deep, slightly warmer than pure black)
 *  - User bubbles: zinc-800 with subtle emerald border (elegant, not blinding)
 *  - AI responses: prose prose-invert (Tailwind Typography plugin) — text-[16px] leading-relaxed
 *  - Streaming cursor: pulsing emerald block at the end of streaming text
 *  - Max width: max-w-4xl (wide, not cramped)
 *  - No emojis (server-side stripping safety net guarantees this)
 */
export default function ConversationView() {
  const {
    activeSessionId, messages, streamingText, isStreaming, activeTool, error,
    sendMessage, stopStreaming, openDesignLimitModal,
  } = useChatStore();
  const usage = useAuthStore((s) => s.user?.usage);

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
  const isDesignBlocked = !!usage && usage.remaining <= 0 && isDesignPrompt(text);

  // ── Auto-scroll to bottom on new content ────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeMessages, streamingText, activeTool]);

  useEffect(() => {
    if (isDesignBlocked) openDesignLimitModal(usage);
  }, [isDesignBlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    if (!text.trim() || isStreaming) return;
    if (isDesignBlocked) {
      openDesignLimitModal(usage);
      return;
    }
    await sendMessage(text.trim());
    setText('');
  };

  const handleTopologyAction = async (action) => {
    if (isStreaming) return;
    if (action === 'confirm') {
      await sendMessage('This topology is confirmed. Generate the configurations and export the GNS3 project.');
      return;
    }

    const editPrompt = 'Edit this topology: ';
    setText(editPrompt);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(editPrompt.length, editPrompt.length);
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Subtle green glow anchored above the input area */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2"
        style={{
          width: 700,
          height: 220,
          background: 'radial-gradient(ellipse at center bottom, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.04) 35%, transparent 70%)',
          filter: 'blur(40px)',
          zIndex: 0,
        }}
      />
      {/* ── Message stream ──────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative" style={{ zIndex: 1 }}>
        <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
          {activeMessages.map((msg, i) => (
            <MessageItem key={i} message={msg} onTopologyAction={handleTopologyAction} />
          ))}

          {/* ── Streaming text ── */}
          {isStreaming && streamingText && (
            <div className="animate-fade-in-up">
              <div className="prose prose-invert max-w-none text-[15.5px] leading-[1.75] streaming-cursor">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* ── Tool indicator (glass-box) ───────────────── */}
          {activeTool && (
            <div className="animate-fade-in-up">
              <ActionTrace trace={activeTool} />
            </div>
          )}

          {/* ── Thinking indicator ── */}
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
      <div className="flex-shrink-0 px-6 pb-6 pt-2 relative" style={{ zIndex: 1 }}>
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
          <div className="glow-input-wrap flex items-end gap-2 rounded-[22px] px-5 py-3.5"
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
              placeholder="e.g., A small office with 2 routers, a switch, and 5 PCs"
              rows={1}
              className="flex-1 bg-transparent text-[15px] text-white placeholder-zinc-500 resize-none focus:outline-none leading-relaxed transition-[height] duration-150 ease-out overscroll-contain"
              style={{ minHeight: '24px', height: '24px', overflowY: 'hidden' }}
            />
            {isVoiceSupported && (
              <button
                type="button"
                onClick={toggleListening}
                disabled={isStreaming}
                className={`flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
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
              disabled={!isStreaming && (!text.trim() || isDesignBlocked)}
              className={`flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full transition-all ${
                isStreaming
                  ? 'bg-white text-zinc-900 hover:bg-zinc-200'
                  : 'text-white disabled:bg-white/10 disabled:text-zinc-500 disabled:cursor-not-allowed'
              }`}
              style={!isStreaming && text.trim() && !isDesignBlocked ? { background: 'linear-gradient(180deg, #10b981, #0d9668)' } : undefined}
              aria-label={isStreaming ? 'Stop generating' : 'Send message'}
              title={isDesignBlocked ? 'Daily design limit reached' : isStreaming ? 'Stop generating' : 'Send message'}
            >
              {isStreaming ? <Square size={13} fill="currentColor" /> : <ArrowUp size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Copy button (reusable) ─────────────────────────────────
function CopyButton({ text, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 text-xs transition-colors ${className} ${
        copied ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-200'
      }`}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

// ── Code block with copy button on the right ──────────────
function CodeBlock({ children, className }) {
  // Extract the raw text from the children (ReactMarkdown passes the code as a string)
  const codeText = typeof children === 'string'
    ? children
    : Array.isArray(children)
      ? children.join('')
      : String(children || '');

  // Detect language from className (ReactMarkdown adds "language-xxx")
  const langMatch = className?.match(/language-(\w+)/);
  const lang = langMatch ? langMatch[1] : '';

  return (
    <div className="relative group my-3">
      <div className="rounded-xl overflow-hidden border border-white/[0.07]" style={{ background: 'rgba(0,0,0,0.3)' }}>
        {/* Header bar with language + copy button */}
        <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/[0.06]">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
            {lang || 'code'}
          </span>
          <CopyButton text={codeText} label="Copy" className="!text-[11px]" />
        </div>
        {/* Code content */}
        <pre className="overflow-x-auto p-3.5 text-xs leading-relaxed">
          <code className={className}>{children}</code>
        </pre>
      </div>
    </div>
  );
}

// ── Message item ────────────────────────────────────────────
function MessageItem({ message, onTopologyAction }) {
  const isUser = message.role === 'user';

  if (isUser) {
    // User bubble: solid glass, no emerald border (cleaner, like ChatGPT)
    return (
      <div className="flex justify-end animate-fade-in-up">
        <div className="max-w-[78%] rounded-[20px] rounded-br-md px-5 py-3 text-[15px] leading-relaxed text-white"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant response — prose prose-invert for clean markdown rendering.
  // The topology preview and download kit are ATTACHED to the message that
  // produced them (msg.topology / msg.exportKit), so they render inline in
  // the correct chronological position — not floating at the bottom of the
  // conversation. This keeps them anchored even when the user sends more
  // messages afterward.
  return (
    <div className="animate-fade-in-up group">
      <div className="prose prose-invert max-w-none text-[15.5px] leading-[1.75]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Render fenced code blocks with the CodeBlock component (copy button)
              code({ node, inline, className, children, ...props }) {
                if (inline) {
                  // Inline code — no copy button, just styled
                  return (
                    <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-300 text-[0.875em] font-mono" {...props}>
                      {children}
                    </code>
                  );
                }
                // Fenced code block — use CodeBlock with copy button
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
        {/* Topology preview — inline with this message */}
        {message.toolTrace && (
          <div className="mt-3">
            <ActionTrace trace={message.toolTrace} defaultOpen={false} />
          </div>
        )}
        {message.topology && (
          <div className="mt-4">
            <TopologyPreviewCard topology={message.topology} onAction={onTopologyAction} />
          </div>
        )}
        {/* Download kit — inline with this message */}
        {message.exportKit && (
          <div className="mt-4">
            <DownloadKit exportKit={message.exportKit} />
          </div>
        )}
        {/* Copy button — appears on hover */}
        {message.content && (
          <div className="mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={message.content} label="Copy" />
          </div>
        )}
    </div>
  );
}
