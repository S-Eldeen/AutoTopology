import { useState, useEffect } from 'react';
import { PanelLeft, Plus, Share2 } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import Sidebar from './Sidebar.jsx';
import EmptyState from './EmptyState.jsx';
import ConversationView from './ConversationView.jsx';
import ShareChatDialog from './ShareChatDialog.jsx';
import DesignLimitModal from './DesignLimitModal.jsx';

export default function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);

  const {
    sessions, activeSessionId, messages, isStreaming, streamingSessionId,
    loadSessions, createSession, selectSession, deleteSession,
    renameSession, toggleStarSession, reset, designLimitModal, closeDesignLimitModal,
  } = useChatStore();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const fetchUsage = useAuthStore((s) => s.fetchUsage);
  const usage = user?.usage;

  const resetTime = usage?.resetAt
    ? new Date(usage.resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const usageTitle = usage
    ? `${usage.used} used, ${usage.remaining} remaining${resetTime ? `. Resets at ${resetTime}` : ''}`
    : undefined;

  useEffect(() => {
    loadSessions();
    fetchUsage().catch(() => {});
    return () => reset();
  }, []); // eslint-disable-line

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const activeMessages = activeSessionId ? (messages[activeSessionId] || []) : [];
  const activeSession = sessions.find((s) => s._id === activeSessionId);
  const showEmptyState = (!activeSessionId || activeMessages.length === 0) && !isStreaming;

  const handleNewChat = async () => { await createSession(); setSidebarOpen(false); };
  const handleSelectSession = async (id) => { await selectSession(id); setSidebarOpen(false); };
  const handleLogout = async () => { await logout(); window.location.href = '/'; };

  return (
    <div
      className="flex h-screen text-zinc-100 overflow-hidden relative"
      style={{ background: 'radial-gradient(1200px 600px at 50% -10%, rgba(16,185,129,0.07), transparent 60%), #0a0b0d' }}
    >
      {/* Ambient green glow orbs — decorative, behind everything */}
      <div className="glow-orb glow-orb-a" style={{ width: 420, height: 420, top: -120, left: -100 }} aria-hidden />
      <div className="glow-orb glow-orb-b" style={{ width: 380, height: 380, bottom: -100, right: -80 }} aria-hidden />
      <div className="glow-orb glow-orb-static" style={{ width: 260, height: 260, top: '40%', left: '60%', opacity: 0.35 }} aria-hidden />
      <Sidebar
        open={sidebarOpen}
        sessions={sessions}
        activeSessionId={activeSessionId}
        user={user}
        onNewChat={handleNewChat}
        onSelect={handleSelectSession}
        onDelete={deleteSession}
        onRename={renameSession}
        onToggleStar={toggleStarSession}
        onShare={(session) => setShareTarget(session)}
        isStreaming={isStreaming}
        streamingSessionId={streamingSessionId}
        onLogout={handleLogout}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content — fills the whole screen, no top bar */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Floating buttons — top left: sidebar toggle + brand */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen((p) => !p)}
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Toggle sidebar"
            title="Toggle sidebar (Ctrl/Cmd+B)"
          >
            <PanelLeft size={17} />
          </button>
          <span className="text-[15px] font-semibold text-white/90 tracking-tight select-none">
            StructuraNet <span className="text-emerald-400">AI</span>
          </span>
        </div>

        {/* Floating buttons — top right: share + new chat */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
          {usage && (
            <div
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-3 py-2 text-xs text-zinc-400"
              style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(14px)' }}
              title={usageTitle}
            >
              <span className="hidden sm:inline">Used designs</span>
              <span className="font-semibold text-zinc-100">{usage.used}</span>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-300">{usage.limit}</span>
            </div>
          )}
          {activeSessionId && !showEmptyState && (
            <button
              onClick={() => activeSession && setShareTarget(activeSession)}
              className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
              aria-label="Share chat"
              title="Share chat"
            >
              <Share2 size={16} />
            </button>
          )}
          <button
            onClick={handleNewChat}
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="New chat"
            title="New chat"
          >
            <Plus size={17} />
          </button>
        </div>

        {/* Content fills the entire screen */}
        <div className="flex-1 overflow-hidden">
          {showEmptyState ? <EmptyState /> : <ConversationView />}
        </div>
      </div>

      {shareTarget && (
        <ShareChatDialog
          session={sessions.find((s) => s._id === shareTarget._id) || shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}

      {designLimitModal && (
        <DesignLimitModal usage={designLimitModal} onClose={closeDesignLimitModal} />
      )}
    </div>
  );
}
