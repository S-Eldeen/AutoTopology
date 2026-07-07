import { PanelLeft, Plus, Share2 } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore.js';
import { useAuthStore } from '../../stores/authStore.js';

export default function ChatTopBar({ sidebarOpen, onToggleSidebar, activeSessionId, onShare }) {
  const sessions = useChatStore((s) => s.sessions);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeTool = useChatStore((s) => s.activeTool);
  const streamingText = useChatStore((s) => s.streamingText);
  const createSession = useChatStore((s) => s.createSession);
  const user = useAuthStore((s) => s.user);
  const usage = user?.usage;

  let status = 'Ready';
  let dotClass = 'bg-zinc-600';
  if (activeTool) { status = 'Generating'; dotClass = 'bg-emerald-400 animate-pulse'; }
  else if (isStreaming && streamingText) { status = 'Streaming'; dotClass = 'bg-emerald-400 animate-pulse'; }
  else if (isStreaming) { status = 'Thinking'; dotClass = 'bg-emerald-400 animate-pulse'; }

  const activeSession = sessions.find((s) => s._id === activeSessionId);
  const title = activeSession?.title || 'New Chat';

  return (
    <header className="flex-shrink-0 h-14 flex items-center px-3 gap-2 border-b border-white/[0.06]"
      style={{ background: 'rgba(12,13,16,0.55)', backdropFilter: 'blur(14px)' }}>
      <button onClick={onToggleSidebar} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors" aria-label="Toggle sidebar">
        <PanelLeft size={17} />
      </button>
      <button onClick={() => createSession()} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors" aria-label="New chat">
        <Plus size={17} />
      </button>

      <div className="flex-1 min-w-0 flex justify-center">
        <span className="text-[13px] font-medium text-zinc-400 truncate max-w-md">{title}</span>
      </div>

      <div className="flex items-center gap-2">
        {activeSessionId && (
          <button
            onClick={onShare}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Share chat"
            aria-label="Share chat"
          >
            <Share2 size={15} />
          </button>
        )}
        {usage && (
          <div className="hidden items-center rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs text-zinc-400 sm:flex" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <span className="text-zinc-200">{usage.used} / {usage.limit}</span>
            <span className="ml-1">designs</span>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
          <span className="text-[11px] font-medium text-zinc-400">{status}</span>
        </div>
      </div>
    </header>
  );
}
