import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Link as LinkIcon, X } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore.js';

export default function ShareChatDialog({ session, onClose }) {
  const updateShareSession = useChatStore((s) => s.updateShareSession);
  const [share, setShare] = useState(session?.share || { enabled: false, token: null });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setShare(session?.share || { enabled: false, token: null });
    setCopied(false);
    setError('');
  }, [session]);

  const link = useMemo(() => {
    if (!share?.enabled || !share?.token) return '';
    return `${window.location.origin}/share/${share.token}`;
  }, [share]);

  if (!session) return null;

  const setEnabled = async (enabled) => {
    setLoading(true);
    setError('');
    try {
      const nextShare = await updateShareSession(session._id, enabled);
      setShare(nextShare);
      setCopied(false);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not update sharing.');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy link.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Share chat</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Recipients can open a read-only view of this conversation.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"
            aria-label="Close share dialog"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
          <p className="truncate text-xs font-medium text-zinc-200">{session.title || 'New Chat'}</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Sharing is {share?.enabled ? 'enabled' : 'disabled'} for this chat.
          </p>
        </div>

        {share?.enabled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
              <LinkIcon size={15} className="flex-shrink-0 text-zinc-500" />
              <input
                readOnly
                value={link}
                className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 outline-none"
                onFocus={(event) => event.target.select()}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyLink}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <button
                disabled={loading}
                onClick={() => setEnabled(false)}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          </div>
        ) : (
          <button
            disabled={loading}
            onClick={() => setEnabled(true)}
            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Creating link...' : 'Enable sharing'}
          </button>
        )}

        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
      </div>
    </div>
  );
}
