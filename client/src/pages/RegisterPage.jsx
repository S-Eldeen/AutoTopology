import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';
import AuthLayout, { FormErrorBanner, PrivacyCheckbox, SubmitButton } from '../components/auth/AuthLayout.jsx';

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    text: 'No credit card required — free for academic use',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    text: 'Three security profiles: None, Basic, Enterprise',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    text: 'Iterative editing through natural-language chat',
  },
];

const STRENGTH_LEVELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

function passwordStrength(pw) {
  if (!pw) return -1;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score - 1, 4);
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = passwordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!acceptedPrivacy) {
      setError('Please accept the Privacy Policy before continuing.');
      return;
    }
    setLoading(true);
    try {
      await register(email, password, name);
      navigate('/chat');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      headline={(
        <>
          Start designing
          <br />
          <span className="bg-gradient-to-r from-emerald-300 via-emerald-200 to-emerald-300 bg-clip-text text-transparent">
            production-grade networks.
          </span>
        </>
      )}
      description="Create a free account and get a GNS3-ready topology with full Cisco IOS configurations in seconds."
      features={FEATURES}
    >
      <div className="rounded-2xl border border-white/[0.08] bg-[#050b0a]/78 backdrop-blur-sm p-8 shadow-2xl shadow-black/25">
        <div className="mb-7">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Create your account</h2>
          <p className="text-zinc-500 mt-1.5 text-sm">Start designing networks with AI in seconds.</p>
        </div>

        <FormErrorBanner message={error} />

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input rounded-xl"
              placeholder="Jane Doe"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input rounded-xl"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input rounded-xl"
              placeholder="At least 8 characters"
            />
            {password && (
              <div className="mt-2.5 flex items-center gap-2">
                <div className="flex-1 flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i <= strength
                          ? strength <= 1
                            ? 'bg-red-500'
                            : strength === 2
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          : 'bg-zinc-800'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-zinc-500 w-16 text-right">
                  {strength >= 0 ? STRENGTH_LEVELS[strength] : ''}
                </span>
              </div>
            )}
          </div>

          <PrivacyCheckbox checked={acceptedPrivacy} onChange={setAcceptedPrivacy} />

          <SubmitButton loading={loading} loadingLabel="Creating account…">
            Create account
          </SubmitButton>
        </form>

        <div className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <Link to="/login" className="text-emerald-400 hover:text-emerald-300 font-medium hover:underline underline-offset-2">
            Sign in
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
