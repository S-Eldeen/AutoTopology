import { ArrowLeft, Check, Crown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PLANS } from '../constants/plans.js';
import { useAuthStore } from '../stores/authStore.js';

export default function PlansPage() {
  const user = useAuthStore((s) => s.user);
  const updatePlan = useAuthStore((s) => s.updatePlan);
  const confirmPayment = useAuthStore((s) => s.confirmPayment);
  const [searchParams] = useSearchParams();
  const [busyPlan, setBusyPlan] = useState(null);
  const [notice, setNotice] = useState('');
  const currentPlan = user?.usage?.plan || user?.plan || 'free';

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    const sessionId = searchParams.get('session_id');
    if (checkout === 'cancel') {
      setNotice('Payment was canceled. Your plan was not changed.');
      return;
    }
    if (checkout !== 'success' || !sessionId) return;

    let active = true;
    setNotice('Confirming payment...');
    confirmPayment(sessionId)
      .then(() => {
        if (active) setNotice('Payment confirmed. Your plan is active.');
      })
      .catch((err) => {
        if (active) setNotice(err.response?.data?.error?.message || 'Could not confirm payment yet.');
      });

    return () => { active = false; };
  }, [confirmPayment, searchParams]);

  const handlePlanChange = async (plan) => {
    setBusyPlan(plan);
    setNotice('');
    try {
      const result = await updatePlan(plan);
      if (result?.devMode) {
        setNotice('Dev payment mode is on. Plan updated without Stripe checkout.');
      } else if (plan === 'free') {
        setNotice('Plan changed to Free.');
      }
    } catch (err) {
      setNotice(err.response?.data?.error?.message || 'Could not change plan.');
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            <ArrowLeft size={16} />
            Back to chat
          </Link>
          <div className="text-right">
            <p className="text-sm font-medium">{user?.name || 'User'}</p>
            <p className="text-xs text-zinc-500">{user?.email}</p>
          </div>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Subscription Plans</h1>
          <p className="mt-2 text-zinc-400">Choose the daily design limit that fits your workflow.</p>
          {notice && (
            <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
              {notice}
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const action = isCurrent
              ? 'Current plan'
              : PLANS.findIndex((item) => item.id === plan.id) > PLANS.findIndex((item) => item.id === currentPlan)
                ? 'Pay & upgrade'
                : 'Downgrade';
            const isBusy = busyPlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`rounded-lg border p-5 ${
                  isCurrent
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-zinc-800 bg-zinc-900/80'
                }`}
              >
                <div className="mb-5 flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{plan.name}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{plan.description}</p>
                  </div>
                  {isCurrent && (
                    <span className="rounded-full bg-emerald-500/15 p-2 text-emerald-300">
                      <Crown size={18} />
                    </span>
                  )}
                </div>

                <div className="mb-5">
                  <span className="text-4xl font-semibold">{plan.limit}</span>
                  <span className="ml-2 text-sm text-zinc-400">designs / day</span>
                </div>

                <div className="mb-5 flex items-center gap-2 text-sm text-zinc-300">
                  <Check size={16} className="text-emerald-400" />
                  {plan.limit} AI network designs every rolling day
                </div>

                <button
                  disabled={isCurrent || isBusy}
                  onClick={() => handlePlanChange(plan.id)}
                  className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    isCurrent
                      ? 'cursor-default bg-zinc-800 text-zinc-500'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  {isBusy ? 'Processing...' : action}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
