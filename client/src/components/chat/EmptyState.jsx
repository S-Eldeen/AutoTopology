import { useState } from 'react';
import { ArrowUp, Mic, AudioLines } from 'lucide-react';
import ActionChipsBar from './ActionChipsBar.jsx';
import { useChatStore } from '../../stores/chatStore.js';
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea.js';
import { useVoiceInput } from '../../hooks/useVoiceInput.js';

export default function EmptyState() {
  const [text, setText] = useState('');
  const inputRef = useAutoResizeTextarea(text);
  const { sendMessage, createSession, activeSessionId, error } = useChatStore();
  const {
    isListening,
    isVoiceSupported,
    voiceMessage,
    toggleListening,
  } = useVoiceInput({ text, setText });

  const handleSend = async () => {
    if (!text.trim()) return;
    await sendMessage(text.trim());
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handlePromptSelect = (prompt) => {
    setText(prompt);
    document.querySelector('[data-chat-input]')?.focus();
  };

  return (
    <div className="h-full flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-2xl">
        {/* Greeting */}
        <div className="text-center mb-9">
          <h1 className="text-[26px] font-semibold text-white/95 mb-2 tracking-tight">
            Design a network
          </h1>
          <p className="text-[15px] text-zinc-500">
            Describe what you want to build, or pick a starting point below
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {voiceMessage && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {voiceMessage}
          </div>
        )}

        {/* Input */}
        <div className="flex items-end gap-2 rounded-[22px] px-5 py-4 transition-all focus-within:border-emerald-500/25"
          style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
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
              className={`flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
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
            className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-white disabled:bg-white/10 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
            style={text.trim() ? { background: 'linear-gradient(180deg, #10b981, #0d9668)' } : undefined}
            aria-label="Send message"
          >
            <ArrowUp size={16} />
          </button>
        </div>

        {/* Action chips */}
        <div className="mt-6">
          <ActionChipsBar onPromptSelect={handlePromptSelect} />
        </div>
      </div>
    </div>
  );
}
