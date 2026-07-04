import { useState, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import ChatTopBar from './ChatTopBar.jsx';
import Sidebar from './Sidebar.jsx';
import EmptyState from './EmptyState.jsx';
import ConversationView from './ConversationView.jsx';
import ShareChatDialog from './ShareChatDialog.jsx';

/**
 * ChatLayout — root container for the chat page.
 *
 * Responsibilities:
 *  - Manages sidebar open/closed state (closed by default)
 *  - Cmd/Ctrl+B keyboard shortcut to toggle sidebar
 *  - Renders TopBar, Sidebar (conditionally), and EmptyState OR ConversationView
 *  - Loads sessions on mount, cleans up SSE on unmount
 */
export default function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);

  const {
    sessions, activeSessionId, messages,
    isStreaming, streamingSessionId,
    loadSessions, createSession, selectSession, deleteSession,
    renameSession, toggleStarSession, reset,
  } = useChatStore();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  // ── Load sessions on mount ─────────────────────────────
  useEffect(() => {
    loadSessions();
    return () => reset();
  }, []); // eslint-disable-line

  // ── Cmd/Ctrl+B to toggle sidebar ───────────────────────
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

  // ── Determine view: empty state or conversation ────────
  const activeMessages = activeSessionId ? (messages[activeSessionId] || []) : [];
  const activeSession = sessions.find((session) => session._id === activeSessionId);
  const showEmptyState = !activeSessionId || activeMessages.length === 0;

  const handleNewChat = async () => {
    await createSession();
    setSidebarOpen(false);
  };

  const handleSelectSession = async (id) => {
    await selectSession(id);
    setSidebarOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <div className="flex h-screen text-zinc-100 overflow-hidden relative bg-zinc-950">
      {/* Green glow — bigger and brighter, like landing page */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-brand-500/15 to-transparent rounded-full blur-3xl pointer-events-none z-0" aria-hidden />
      {/* Network nodes + lines */}
      <svg className="absolute inset-0 w-full h-full z-0" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" style={{ opacity: 0.06 }} aria-hidden>
        <line x1="80" y1="60" x2="220" y2="120" stroke="#10B981" strokeWidth="1" /><line x1="220" y1="120" x2="380" y2="80" stroke="#10B981" strokeWidth="1" /><line x1="380" y1="80" x2="520" y2="140" stroke="#10B981" strokeWidth="1" /><line x1="520" y1="140" x2="680" y2="100" stroke="#10B981" strokeWidth="1" /><line x1="680" y1="100" x2="840" y2="160" stroke="#10B981" strokeWidth="1" /><line x1="840" y1="160" x2="1000" y2="120" stroke="#10B981" strokeWidth="1" /><line x1="1000" y1="120" x2="1120" y2="180" stroke="#10B981" strokeWidth="1" /><line x1="80" y1="60" x2="140" y2="220" stroke="#10B981" strokeWidth="1" /><line x1="220" y1="120" x2="300" y2="260" stroke="#10B981" strokeWidth="1" /><line x1="380" y1="80" x2="440" y2="240" stroke="#10B981" strokeWidth="1" /><line x1="520" y1="140" x2="580" y2="300" stroke="#10B981" strokeWidth="1" /><line x1="680" y1="100" x2="740" y2="280" stroke="#10B981" strokeWidth="1" /><line x1="840" y1="160" x2="900" y2="320" stroke="#10B981" strokeWidth="1" /><line x1="1000" y1="120" x2="1060" y2="260" stroke="#10B981" strokeWidth="1" /><line x1="140" y1="220" x2="300" y2="260" stroke="#10B981" strokeWidth="1" /><line x1="300" y1="260" x2="440" y2="240" stroke="#10B981" strokeWidth="1" /><line x1="440" y1="240" x2="580" y2="300" stroke="#10B981" strokeWidth="1" /><line x1="580" y1="300" x2="740" y2="280" stroke="#10B981" strokeWidth="1" /><line x1="740" y1="280" x2="900" y2="320" stroke="#10B981" strokeWidth="1" /><line x1="900" y1="320" x2="1060" y2="260" stroke="#10B981" strokeWidth="1" /><line x1="140" y1="220" x2="200" y2="400" stroke="#10B981" strokeWidth="1" /><line x1="300" y1="260" x2="360" y2="420" stroke="#10B981" strokeWidth="1" /><line x1="440" y1="240" x2="500" y2="440" stroke="#10B981" strokeWidth="1" /><line x1="580" y1="300" x2="640" y2="460" stroke="#10B981" strokeWidth="1" /><line x1="740" y1="280" x2="800" y2="440" stroke="#10B981" strokeWidth="1" /><line x1="900" y1="320" x2="960" y2="480" stroke="#10B981" strokeWidth="1" /><line x1="1060" y1="260" x2="1100" y2="420" stroke="#10B981" strokeWidth="1" /><line x1="200" y1="400" x2="360" y2="420" stroke="#10B981" strokeWidth="1" /><line x1="360" y1="420" x2="500" y2="440" stroke="#10B981" strokeWidth="1" /><line x1="500" y1="440" x2="640" y2="460" stroke="#10B981" strokeWidth="1" /><line x1="640" y1="460" x2="800" y2="440" stroke="#10B981" strokeWidth="1" /><line x1="800" y1="440" x2="960" y2="480" stroke="#10B981" strokeWidth="1" /><line x1="960" y1="480" x2="1100" y2="420" stroke="#10B981" strokeWidth="1" /><line x1="200" y1="400" x2="260" y2="600" stroke="#10B981" strokeWidth="1" /><line x1="360" y1="420" x2="420" y2="620" stroke="#10B981" strokeWidth="1" /><line x1="500" y1="440" x2="560" y2="640" stroke="#10B981" strokeWidth="1" /><line x1="640" y1="460" x2="700" y2="620" stroke="#10B981" strokeWidth="1" /><line x1="800" y1="440" x2="860" y2="660" stroke="#10B981" strokeWidth="1" /><line x1="960" y1="480" x2="1020" y2="640" stroke="#10B981" strokeWidth="1" /><line x1="260" y1="600" x2="420" y2="620" stroke="#10B981" strokeWidth="1" /><line x1="420" y1="620" x2="560" y2="640" stroke="#10B981" strokeWidth="1" /><line x1="560" y1="640" x2="700" y2="620" stroke="#10B981" strokeWidth="1" /><line x1="700" y1="620" x2="860" y2="660" stroke="#10B981" strokeWidth="1" /><line x1="860" y1="660" x2="1020" y2="640" stroke="#10B981" strokeWidth="1" /><circle cx="80" cy="60" r="3" fill="#10B981" /><circle cx="220" cy="120" r="3" fill="#10B981" /><circle cx="380" cy="80" r="3" fill="#10B981" /><circle cx="520" cy="140" r="3" fill="#10B981" /><circle cx="680" cy="100" r="3" fill="#10B981" /><circle cx="840" cy="160" r="3" fill="#10B981" /><circle cx="1000" cy="120" r="3" fill="#10B981" /><circle cx="1120" cy="180" r="3" fill="#10B981" /><circle cx="140" cy="220" r="3" fill="#10B981" /><circle cx="300" cy="260" r="3" fill="#10B981" /><circle cx="440" cy="240" r="3" fill="#10B981" /><circle cx="580" cy="300" r="3" fill="#10B981" /><circle cx="740" cy="280" r="3" fill="#10B981" /><circle cx="900" cy="320" r="3" fill="#10B981" /><circle cx="1060" cy="260" r="3" fill="#10B981" /><circle cx="200" cy="400" r="3" fill="#10B981" /><circle cx="360" cy="420" r="3" fill="#10B981" /><circle cx="500" cy="440" r="3" fill="#10B981" /><circle cx="640" cy="460" r="3" fill="#10B981" /><circle cx="800" cy="440" r="3" fill="#10B981" /><circle cx="960" cy="480" r="3" fill="#10B981" /><circle cx="1100" cy="420" r="3" fill="#10B981" /><circle cx="260" cy="600" r="3" fill="#10B981" /><circle cx="420" cy="620" r="3" fill="#10B981" /><circle cx="560" cy="640" r="3" fill="#10B981" /><circle cx="700" cy="620" r="3" fill="#10B981" /><circle cx="860" cy="660" r="3" fill="#10B981" /><circle cx="1020" cy="640" r="3" fill="#10B981" />
      </svg>
      {/* ── Sidebar (slide-in, closed by default) ──────── */}
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

      {/* ── Main chat area ─────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <ChatTopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((p) => !p)}
          activeSessionId={activeSessionId}
          onShare={() => activeSession && setShareTarget(activeSession)}
        />

        {/* ── Chat content (empty state or conversation) ── */}
        <div className="flex-1 overflow-hidden">
          {showEmptyState ? (
            <EmptyState onNewChat={handleNewChat} />
          ) : (
            <ConversationView />
          )}
        </div>
      </div>
      {shareTarget && (
        <ShareChatDialog
          session={sessions.find((session) => session._id === shareTarget._id) || shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}
