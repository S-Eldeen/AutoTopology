import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import AuthLayout, { FormErrorBanner, PrivacyCheckbox, SubmitButton } from '../components/auth/AuthLayout.jsx';

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4.5 4.5 0 0 1 4.5 4.5c0 1.5-.5 2.5-1.5 3.5s-1.5 2-1.5 3.5" />
        <path d="M8 14a4 4 0 0 0 8 0c0-1.5-.5-2.5-1.5-3.5s-1.5-2-1.5-3.5" />
        <path d="M12 18v3" />
      </svg>
    ),
    text: 'Glass-box AI reasoning with full tool-call visibility',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    text: 'One-click GNS3 project export with Cisco IOS configs',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    text: 'Iterative editing — surgically modify any topology',
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!acceptedPrivacy) {
      setError('Please accept the Privacy Policy before continuing.');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      navigate('/chat');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      headline={(
        <>
          Design networks<br />
          <span className="bg-gradient-to-r from-emerald-300 via-emerald-200 to-emerald-300 bg-clip-text text-transparent">
            in plain English.
          </span>
        </>
      )}
      description="Sign in to pick up where you left off — your topologies, exports, and calibration are waiting."
      features={FEATURES}
    >
      {/* Form card — subtle container with border + radius */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#050b0a]/78 backdrop-blur-sm p-8 shadow-2xl shadow-black/25">
        <div className="mb-7">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Welcome back</h2>
          <p className="text-zinc-500 mt-1.5 text-sm">Sign in to StructuraNet AI to continue designing.</p>
        </div>

        <FormErrorBanner message={error} />

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input rounded-xl"
              placeholder="you@example.com"
              autoFocus
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-zinc-300">Password</label>
              <button type="button" className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input rounded-xl"
              placeholder="••••••••"
            />
          </div>

          <PrivacyCheckbox checked={acceptedPrivacy} onChange={setAcceptedPrivacy} />

          <SubmitButton loading={loading} loadingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </form>

        <div className="mt-6 text-center text-sm text-zinc-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-emerald-400 hover:text-emerald-300 font-medium hover:underline underline-offset-2">
            Create one
          </Link>
        </div>
      </div>

      <div className="mt-5 text-center">
        <Link to="/" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
          ← Back to home
        </Link>
      </div>
    </AuthLayout>
  );
}
