import { useState, useEffect } from 'react';
import { PanelLeft, Plus, Share2 } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import Sidebar from './Sidebar.jsx';
import EmptyState from './EmptyState.jsx';
import ConversationView from './ConversationView.jsx';
import ShareChatDialog from './ShareChatDialog.jsx';

export default function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);

  const {
    sessions, activeSessionId, messages, isStreaming,
    loadSessions, createSession, selectSession, deleteSession,
    renameSession, toggleStarSession, reset,
  } = useChatStore();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    loadSessions();
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
        streamingSessionId={activeSessionId}
        onLogout={handleLogout}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Top bar — left: sidebar toggle + StructuraNet word, right: share + new chat */}
      <div className="absolute top-0 left-0 right-0 z-20 h-14 flex items-center justify-between px-4"
        style={{ background: 'rgba(10,11,13,0.55)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Left: sidebar toggle + brand name */}
        <div className="flex items-center gap-2">
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

        {/* Right: share + new chat */}
        <div className="flex items-center gap-1.5">
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
      </div>

      <div className="flex-1 flex flex-col min-w-0 relative z-10 pt-14">
        <div className="flex-1 overflow-hidden">
          {showEmptyState ? <EmptyState onNewChat={handleNewChat} /> : <ConversationView />}
        </div>
      </div>

      {shareTarget && (
        <ShareChatDialog
          session={sessions.find((s) => s._id === shareTarget._id) || shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}
