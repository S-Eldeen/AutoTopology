import { useState } from 'react';
import { ArrowUp, AudioLines, Mic } from 'lucide-react';
import ActionChipsBar from './ActionChipsBar.jsx';
import { useChatStore } from '../../stores/chatStore.js';
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea.js';
import { useVoiceInput } from '../../hooks/useVoiceInput.js';

/**
 * EmptyState — Claude-style new chat screen.
 *
 * Zinc + Emerald design system:
 *  - Background: zinc-950
 *  - Input card: card-elevated (zinc-900/80 with backdrop blur)
 *  - Action chips: zinc-900 with emerald hover
 *  - Send button: emerald-600 (soft, not blinding)
 *  - Max width: max-w-4xl (wide, not cramped)
 */
export default function EmptyState({ onNewChat }) {
  const [text, setText] = useState('');
  const inputRef = useAutoResizeTextarea(text);
  const { sendMessage, createSession, activeSessionId, topology, error } = useChatStore();
  const {
    isListening,
    isVoiceSupported,
    voiceMessage,
    toggleListening,
  } = useVoiceInput({ text, setText });

  const handleSend = async () => {
    if (!text.trim()) return;
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = await createSession();
    }
    await sendMessage(text.trim());
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePromptSelect = (prompt) => {
    setText(prompt);
    const textarea = document.querySelector('[data-chat-input]');
    if (textarea) textarea.focus();
  };

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div className="w-full max-w-3xl relative z-10">
        {/* ── Greeting ──────────────────────────────────── */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-white mb-2">
            Design a network
          </h1>
          <p className="text-base text-zinc-400">
            Describe what you want to build, or pick a starting point below
          </p>
        </div>

        {/* ── Small pill input (ChatGPT style, no hint text) ── */}
        <div className="relative">
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
          <div className="flex items-end gap-2 rounded-[20px] border border-white/[0.10] bg-[#050b0a]/90 px-5 py-3 focus-within:border-brand-500/60 focus-within:ring-1 focus-within:ring-brand-500/25 transition-all shadow-lg shadow-black/25">
            <textarea
              ref={inputRef}
              data-chat-input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the network you want to build..."
              rows={1}
              className="flex-1 bg-transparent text-[15px] text-white placeholder-zinc-500 resize-none focus:outline-none leading-relaxed transition-[height] duration-150 ease-out overscroll-contain"
              style={{ minHeight: '24px', height: '24px', overflowY: 'hidden' }}
            />
            {isVoiceSupported && (
              <button
                type="button"
                onClick={toggleListening}
                className={`flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                  isListening
                    ? 'bg-red-500/15 text-red-300 ring-1 ring-red-400/40 animate-pulse'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                }`}
                aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                title={isListening ? 'Stop voice input' : 'Start voice input'}
              >
                {isListening ? <AudioLines size={16} /> : <Mic size={16} />}
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-500 text-white hover:bg-brand-600 disabled:bg-zinc-700 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>

        {/* ── Action chips ──────────────────────────────── */}
        <div className="mt-6">
          <ActionChipsBar
            hasTopology={!!topology}
            onPromptSelect={handlePromptSelect}
          />
        </div>
      </div>
    </div>
  );
}
