import { PanelLeft, Plus, Share2 } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore.js';
import { useAuthStore } from '../../stores/authStore.js';

/**
 * ChatTopBar — fixed top bar (zinc + emerald status).
 *
 * Layout:
 *  - Left: sidebar toggle + new chat button
 *  - Center: session title (truncated)
 *  - Right: status indicator (Ready / Generating / Streaming / Thinking)
 */
export default function ChatTopBar({ sidebarOpen, onToggleSidebar, activeSessionId, onShare }) {
  const sessions = useChatStore((s) => s.sessions);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeTool = useChatStore((s) => s.activeTool);
  const streamingText = useChatStore((s) => s.streamingText);
  const createSession = useChatStore((s) => s.createSession);
  const user = useAuthStore((s) => s.user);
  const usage = user?.usage;

  // ── Determine status ────────────────────────────────────
  let status = 'Ready';
  let statusColor = 'bg-zinc-500';

  if (activeTool) {
    status = 'Generating';
    statusColor = 'bg-emerald-400 animate-pulse';
  } else if (isStreaming && streamingText) {
    status = 'Streaming';
    statusColor = 'bg-emerald-400 animate-pulse';
  } else if (isStreaming) {
    status = 'Thinking';
    statusColor = 'bg-emerald-400 animate-pulse';
  }

  const activeSession = sessions.find((s) => s._id === activeSessionId);
  const title = activeSession?.title || 'New Chat';

  return (
    <header className="flex-shrink-0 h-14 border-b border-white/[0.08] bg-[#020706]/78 backdrop-blur-md flex items-center px-3 gap-2">
      {/* ── Left: sidebar toggle + new chat ─────────────── */}
      <button
        onClick={onToggleSidebar}
        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        title="Toggle sidebar (Ctrl/Cmd+B)"
        aria-label="Toggle sidebar"
      >
        <PanelLeft size={18} />
      </button>

      <button
        onClick={() => createSession()}
        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        title="New chat"
        aria-label="New chat"
      >
        <Plus size={18} />
      </button>

      {/* ── Center: session title ───────────────────────── */}
      <div className="flex-1 min-w-0 flex justify-center">
        <span className="text-sm font-medium text-zinc-300 truncate max-w-md">
          {title}
        </span>
      </div>

      {/* ── Right: status + account ─────────────────────── */}
      <div className="flex items-center gap-2">
        {activeSessionId && (
          <button
            onClick={onShare}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-black/25 text-zinc-400 hover:text-white"
            title="Share chat"
            aria-label="Share chat"
          >
            <Share2 size={15} />
          </button>
        )}
        {usage && (
          <div className="hidden items-center rounded-lg border border-white/[0.08] bg-black/25 px-3 py-1.5 text-xs text-zinc-400 sm:flex">
            <span className="text-zinc-200">{usage.used} / {usage.limit}</span>
            <span className="ml-1">designs used today</span>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/25 border border-white/[0.08]">
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span className="text-xs font-medium text-zinc-400">{status}</span>
        </div>
      </div>
    </header>
  );
}
