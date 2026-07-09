import {
  X, Plus, MessageSquare, Trash2, LogOut, User, Settings, HelpCircle,
  ChevronDown, MoreVertical, Star, Pencil, Share2, ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';

/**
 * Sidebar — slide-in drawer.
 * Deep zinc-900 (not pure black) for softer transition to white workspace.
 * Profile section uses a clean popover instead of raw text links.
 *
 * The "Settings" button reopens the GNS3 image-map calibration popup so
 * users can update their image mappings after the initial onboarding.
 */
export default function Sidebar({
  open, sessions, activeSessionId, user,
  onNewChat, onSelect, onDelete, onRename, onToggleStar,
  onShare, isStreaming, streamingSessionId, onLogout, onClose,
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuSessionId, setMenuSessionId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busySessionId, setBusySessionId] = useState(null);
  const menuRef = useRef(null);
  const openProfileModal = useAuthStore((s) => s.openProfileModal);
  const starredSessions = useMemo(() => sessions.filter((session) => session.starred), [sessions]);
  const recentSessions = useMemo(() => sessions.filter((session) => !session.starred), [sessions]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        setMenuSessionId(null);
        if (renamingId) {
          setRenamingId(null);
          setRenameError('');
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, renamingId]);

  useEffect(() => {
    const handler = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuSessionId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isSessionStreaming = (sessionId) => Boolean(isStreaming && streamingSessionId === sessionId);

  const startRename = (session) => {
    if (isSessionStreaming(session._id)) return;
    setRenamingId(session._id);
    setRenameValue(session.title || 'New Chat');
    setRenameError('');
    setMenuSessionId(null);
  };

  const saveRename = async (sessionId) => {
    if (busySessionId === sessionId) return;
    const cleanName = renameValue.trim();
    if (!cleanName) {
      setRenameError('Name required');
      return;
    }
    setBusySessionId(sessionId);
    try {
      await onRename(sessionId, cleanName);
      setRenamingId(null);
      setRenameError('');
    } finally {
      setBusySessionId(null);
    }
  };

  const toggleStar = async (session) => {
    if (isSessionStreaming(session._id)) return;
    setBusySessionId(session._id);
    try {
      await onToggleStar(session._id);
      setMenuSessionId(null);
    } finally {
      setBusySessionId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isSessionStreaming(deleteTarget._id)) return;
    setBusySessionId(deleteTarget._id);
    try {
      await onDelete(deleteTarget._id);
      setDeleteTarget(null);
      setMenuSessionId(null);
    } finally {
      setBusySessionId(null);
    }
  };

  const renderSessionList = (items) => (
    <ul className="space-y-0.5">
      {items.map((session) => {
        const active = activeSessionId === session._id;
        const streamingThisSession = isSessionStreaming(session._id);
        const disabled = streamingThisSession || busySessionId === session._id;
        const renaming = renamingId === session._id;

        return (
          <li key={session._id} className="relative">
            <div
              className={`group flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition-colors ${
                active
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              } ${renaming ? 'items-start' : 'cursor-pointer'}`}
              onClick={() => {
                if (!renaming) onSelect(session._id);
              }}
            >
              <MessageSquare size={14} className="mt-0.5 flex-shrink-0 opacity-60" />
              {renaming ? (
                <div className="min-w-0 flex-1" onClick={(event) => event.stopPropagation()}>
                  <input
                    autoFocus
                    value={renameValue}
                    disabled={disabled}
                    onChange={(event) => {
                      setRenameValue(event.target.value);
                      setRenameError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        saveRename(session._id);
                      }
                      if (event.key === 'Escape') {
                        setRenamingId(null);
                        setRenameError('');
                      }
                    }}
                    onBlur={() => {
                      if (renamingId !== session._id || busySessionId === session._id) return;
                      if (renameValue.trim()) {
                        saveRename(session._id);
                      } else {
                        setRenameError('Name required');
                      }
                    }}
                    className="h-7 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-[13px] text-white outline-none focus:border-emerald-500 disabled:opacity-60"
                  />
                  {renameError && <p className="mt-1 text-[10px] text-red-400">{renameError}</p>}
                </div>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{session.title || 'New Chat'}</span>
                  {session.starred && <Star size={12} className="flex-shrink-0 fill-amber-400 text-amber-400" />}
                  {streamingThisSession && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="Streaming" />
                  )}
                  <button
                    disabled={disabled}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuSessionId((current) => (current === session._id ? null : session._id));
                    }}
                    className="p-1 rounded-md text-zinc-500 opacity-0 transition-all hover:bg-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 group-hover:opacity-100"
                    aria-label="Chat actions"
                  >
                    <MoreVertical size={14} />
                  </button>
                </>
              )}
            </div>

            {menuSessionId === session._id && !renaming && (
              <div
                ref={menuRef}
                className="absolute right-1 top-9 z-50 w-36 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  disabled={disabled}
                  onClick={() => toggleStar(session)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Star size={13} className={session.starred ? 'fill-amber-400 text-amber-400' : 'text-zinc-400'} />
                  {session.starred ? 'Unstar' : 'Star'}
                </button>
                <button
                  disabled={disabled}
                  onClick={() => startRename(session)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Pencil size={13} className="text-zinc-400" />
                  Rename
                </button>
                <button
                  disabled={disabled}
                  onClick={() => {
                    onShare(session);
                    setMenuSessionId(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Share2 size={13} className="text-zinc-400" />
                  Share
                </button>
                <button
                  disabled={disabled}
                  onClick={() => {
                    setDeleteTarget(session);
                    setMenuSessionId(null);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:bg-black/20"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-[280px] bg-[#050b0a]/95 border-r border-white/[0.08] z-40 flex flex-col transition-transform duration-300 ease-out font-sans antialiased ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/[0.08] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" />
                <path d="M8 6h8M6 8v8M18 8v8M8 18h8" />
              </svg>
            </span>
            <span className="font-semibold text-white text-sm">StructuraNet <span className="text-emerald-400">AI</span></span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* New Chat — desaturated emerald */}
        <div className="space-y-2 p-3 border-b border-white/[0.08] flex-shrink-0">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium px-3 py-2.5 transition-colors shadow-sm shadow-brand-500/20"
          >
            <Plus size={16} />
            <span>New Chat</span>
          </button>
          <Link
            to="/security"
            onClick={onClose}
            className="w-full flex items-center gap-2 rounded-xl border border-emerald-400/20 px-3 py-2.5 text-sm font-medium text-emerald-200 transition-colors hover:border-emerald-300/40 hover:bg-emerald-400/[0.12] hover:text-white"
            style={{ background: 'rgba(16,185,129,0.08)' }}
          >
            <ShieldCheck size={16} />
            <span>Security</span>
          </Link>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {sessions.length === 0 ? (
            <div className="text-center py-8 px-4">
              <MessageSquare size={20} className="mx-auto text-zinc-700 mb-2" />
              <p className="text-xs text-zinc-500">No chats yet</p>
              <p className="text-[11px] text-zinc-600 mt-1">Start a new conversation to begin</p>
            </div>
          ) : (
            <>
              {starredSessions.length > 0 && (
                <>
                  <p className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Starred</p>
                  {renderSessionList(starredSessions)}
                </>
              )}
              {recentSessions.length > 0 && (
                <>
                  <p className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Recent</p>
                  {renderSessionList(recentSessions)}
                </>
              )}
            </>
          )}
        </div>

        {/* Profile popover */}
        <div className="border-t border-white/[0.08] p-3 flex-shrink-0 relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="w-full flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-zinc-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-semibold text-xs shadow-sm flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() || <User size={14} />}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium text-white truncate">{user?.name || 'User'}</div>
            </div>
            <ChevronDown size={14} className={`text-zinc-500 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
          </button>

          {profileOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-1 rounded-xl border border-zinc-700 bg-zinc-800 shadow-xl overflow-hidden animate-fade-in">
              <button
                onClick={() => {
                  openProfileModal();
                  setProfileOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                <Settings size={14} className="text-zinc-500" />
                GNS3 Image Settings
              </button>
              <a
                href="/#how-it-works"
                onClick={() => setProfileOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                <HelpCircle size={14} className="text-zinc-500" />
                Help
              </a>
              <Link
                to="/privacy"
                onClick={() => setProfileOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                <ShieldCheck size={14} className="text-zinc-500" />
                Privacy Policy
              </Link>
              <a
                href="/plans"
                onMouseDown={() => window.location.assign('/plans')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                <Settings size={14} className="text-zinc-500" />
                Manage plan
              </a>
              <div className="h-px bg-zinc-700" />
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-red-400 hover:bg-zinc-700 transition-colors"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
            <h2 className="text-sm font-semibold text-white">Delete chat?</h2>
            <p className="mt-2 text-sm text-zinc-400">
              This permanently removes "{deleteTarget.title || 'New Chat'}".
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                disabled={busySessionId === deleteTarget._id || isSessionStreaming(deleteTarget._id)}
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
