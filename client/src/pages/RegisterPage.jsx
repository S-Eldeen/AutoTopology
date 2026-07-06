import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';

const BrandLogo = ({ className = 'w-9 h-9' }) => (
  <div className={`${className} rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center shadow-md shadow-emerald-500/30`}>
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 8v8M18 8v8M8 6h8M8 18h8M8 8l2.5 2.5M16 8l-2.5 2.5M8 16l2.5-2.5M16 16l-2.5-2.5" />
    </svg>
  </div>
);

// ── Animated network topology background ────────────────────
const NetworkBackground = () => {
  const nodes = [
    { x: 80, y: 60, r: 4, delay: '0s' },
    { x: 200, y: 40, r: 3, delay: '0.5s' },
    { x: 320, y: 80, r: 5, delay: '1s' },
    { x: 440, y: 50, r: 3, delay: '1.5s' },
    { x: 120, y: 160, r: 4, delay: '0.3s' },
    { x: 260, y: 200, r: 3, delay: '0.8s' },
    { x: 380, y: 180, r: 4, delay: '1.3s' },
    { x: 60, y: 280, r: 3, delay: '0.6s' },
    { x: 200, y: 320, r: 5, delay: '1.1s' },
    { x: 340, y: 300, r: 3, delay: '0.4s' },
    { x: 460, y: 260, r: 4, delay: '0.9s' },
  ];
  const links = [
    [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 6],
    [4, 5], [5, 6], [4, 7], [5, 8], [6, 9], [7, 8],
    [8, 9], [9, 10], [3, 10], [6, 10],
  ];
  return (
    <svg
      viewBox="0 0 520 360"
      className="absolute inset-0 w-full h-full"
      preserveAspectRatio="xMidYMid slice"
      style={{ opacity: 0.08 }}
      aria-hidden
    >
      {links.map(([a, b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke="#34d399" strokeWidth="1" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={n.r} fill="#34d399"
          style={{ animation: `auth-node-pulse 3s ease-in-out infinite`, animationDelay: n.delay, transformOrigin: `${n.x}px ${n.y}px` }}
        />
      ))}
    </svg>
  );
};

// ── Feature items with unique icons ──────────────────────────
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = passwordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
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
    <div className="min-h-screen grid lg:grid-cols-[3fr_2fr]" style={{ background: '#020706' }}>
      {/* ─────────────── Left: Brand panel (60%) ─────────────── */}
      <div className="relative hidden lg:flex flex-col justify-center text-white overflow-hidden" style={{ background: 'radial-gradient(circle at 72% 48%, rgba(7,155,107,0.16), transparent 34%), linear-gradient(135deg, #020706 0%, #061411 50%, #020706 100%)' }}>
        {/* Green glow — same as landing page */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-brand-500/14 to-transparent rounded-full blur-3xl pointer-events-none" aria-hidden />

        <div className="relative px-10 max-w-lg z-10">
          <Link to="/" className="flex items-center gap-2.5 group mb-8">
            <BrandLogo />
            <span className="font-semibold text-lg tracking-tight">
              StructuraNet<span className="text-emerald-400"> AI</span>
            </span>
          </Link>
          <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4">
            Start designing
            <br />
            <span className="bg-gradient-to-r from-emerald-300 via-emerald-200 to-emerald-300 bg-clip-text text-transparent">
              production-grade networks.
            </span>
          </h1>
          <p className="text-zinc-400 leading-relaxed mb-6">
            Create a free account and get a GNS3-ready topology with full Cisco IOS
            configurations in seconds.
          </p>
          <ul className="space-y-3">
            {FEATURES.map((f, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-zinc-300">
                <span className="mt-0.5 flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20 text-emerald-400">
                  {f.icon}
                </span>
                <span className="pt-1">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="absolute bottom-6 left-10 text-xs text-zinc-600 z-10">
          © {new Date().getFullYear()} StructuraNet AI · Early access available
        </div>
      </div>

      {/* ─────────────── Right: Form panel (40%) — creamy off-white ─────────────── */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-12 relative overflow-hidden bg-[#FAFAF9]">
        <div className="lg:hidden absolute top-6 left-6">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo className="w-8 h-8" />
            <span className="font-semibold text-zinc-900">StructuraNet AI</span>
          </Link>
        </div>

        <div className="w-full max-w-sm animate-fade-in-up relative z-10">
          
            <div className="mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 tracking-tight">Create your account</h2>
              <p className="text-zinc-500 mt-1.5 text-sm">Start designing networks with AI in seconds.</p>
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 animate-fade-in-down">
                <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl bg-white border border-gray-200 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15 transition-all"
                  placeholder="Jane Doe"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl bg-white border border-gray-200 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15 transition-all"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl bg-white border border-gray-200 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15 transition-all"
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
                              : 'bg-gray-200'
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

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 text-base rounded-xl text-white font-medium transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(180deg, #10b981, #0d9668)", boxShadow: "0 1px 0 rgba(255,255,255,0.12) inset, 0 4px 14px rgba(16,185,129,0.25)" }}
              >
                {loading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating account…
                  </>
                ) : (
                  'Create account'
                )}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-zinc-500">
              Already have an account?{' '}
              <Link to="/login" className="text-emerald-600 hover:text-emerald-500 font-medium hover:underline underline-offset-2">
                Sign in
              </Link>
            </div>
        </div>
      </div>

      <style>{`
        @keyframes auth-node-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}