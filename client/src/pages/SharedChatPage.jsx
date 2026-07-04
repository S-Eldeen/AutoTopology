import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Lock, MessageSquare } from 'lucide-react';
import { sessionApi } from '../services/endpoints.js';

function SharedMessage({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'rounded-br-md border border-emerald-500/30 bg-zinc-800 text-white'
          : 'rounded-bl-md border border-zinc-800 bg-zinc-900/80 text-zinc-200'
      }`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        {message.toolSummary && (
          <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
            {message.toolSummary}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SharedChatPage() {
  const { token } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    sessionApi.getShared(token)
      .then(({ session }) => {
        if (active) {
          setSession(session);
          setError('');
        }
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.error?.message || 'Shared chat is not available.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 bg-zinc-950/90">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft size={16} />
            StructuraNet AI
          </Link>
          <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400">
            <Lock size={13} />
            Read-only shared chat
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {loading && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
            Loading shared conversation...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
            <h1 className="text-base font-semibold text-red-200">Shared chat unavailable</h1>
            <p className="mt-2 text-sm text-red-200/80">{error}</p>
          </div>
        )}

        {!loading && session && (
          <>
            <div className="mb-8">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <MessageSquare size={18} />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{session.title || 'Shared Chat'}</h1>
              <p className="mt-2 text-sm text-zinc-500">
                This is a read-only snapshot of the conversation. You cannot send messages from this view.
              </p>
            </div>

            <div className="space-y-5">
              {(session.messages || [])
                .filter((message) => message.role !== 'system')
                .map((message) => (
                  <SharedMessage key={message._id || `${message.role}-${message.createdAt}`} message={message} />
                ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
