import { useEffect, useMemo, useState } from 'react';
import { Clock, X } from 'lucide-react';

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function DesignLimitModal({ usage, onClose }) {
  const resetDate = useMemo(() => {
    const date = usage?.resetAt ? new Date(usage.resetAt) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }, [usage?.resetAt]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!usage) return null;

  const resetTime = resetDate
    ? resetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'the next reset time';
  const countdown = resetDate ? formatDuration(resetDate.getTime() - now) : null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/12 text-amber-300 ring-1 ring-amber-400/30">
              <Clock size={20} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">Daily design limit reached</h2>
              <p className="mt-1 text-xs text-zinc-500">{usage.used} of {usage.limit} designs used today</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm leading-6 text-zinc-300">
            You have reached the maximum number of AI network designs for today. New design requests are blocked until your daily counter resets.
          </p>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-300">Come back at</p>
            <p className="mt-1 text-lg font-semibold text-white">{resetTime}</p>
            {countdown && (
              <p className="mt-1 text-sm text-zinc-400">Time remaining: {countdown}</p>
            )}
          </div>

          <p className="text-xs leading-5 text-zinc-500">
            You can still review existing chats and exports while you wait. Once the reset time arrives, design prompts will work again automatically.
          </p>
        </div>

        <div className="flex justify-end border-t border-white/[0.08] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
