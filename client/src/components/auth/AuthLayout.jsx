import { Link } from 'react-router-dom';
import BrandLogo from '../common/BrandLogo.jsx';
import NetworkMeshBackground from '../common/NetworkMeshBackground.jsx';

/**
 * AuthLayout — the two-panel shell shared by LoginPage and RegisterPage.
 *
 * Left (desktop only): brand panel with logo, headline, description, and a
 * feature list. Right: dark gradient panel that centers the form card
 * passed as children, with a mobile logo in the corner.
 */
export default function AuthLayout({ headline, description, features, children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[3fr_2fr]" style={{ background: '#020706' }}>
      {/* ─────────────── Left: Brand panel (60%) ─────────────── */}
      <div className="relative hidden lg:flex flex-col justify-between text-white overflow-hidden" style={{ background: 'radial-gradient(circle at 72% 48%, rgba(7,155,107,0.16), transparent 34%), linear-gradient(135deg, #020706 0%, #061411 50%, #020706 100%)' }}>
        {/* Green glow — same as landing page */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-brand-500/14 to-transparent rounded-full blur-3xl pointer-events-none" aria-hidden />
        <NetworkMeshBackground />

        {/* Top: Logo */}
        <div className="relative p-10 z-10">
          <Link to="/" className="flex items-center gap-2.5 group">
            <BrandLogo />
            <span className="font-semibold text-lg tracking-tight">
              StructuraNet<span className="text-emerald-400"> AI</span>
            </span>
          </Link>
        </div>

        {/* Middle: Headline + features */}
        <div className="relative px-10 pb-10 max-w-lg z-10">
          <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4">{headline}</h1>
          <p className="text-zinc-400 leading-relaxed mb-8">{description}</p>

          <ul className="space-y-4">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-zinc-300">
                <span className="mt-0.5 flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20 text-emerald-400">
                  {f.icon}
                </span>
                <span className="pt-1">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom: copyright */}
        <div className="relative p-10 text-xs text-zinc-600 z-10">
          © {new Date().getFullYear()} StructuraNet AI · Early access available
        </div>
      </div>

      {/* ─────────────── Right: Form panel (40%) ─────────────── */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-12 relative overflow-hidden" style={{ background: 'radial-gradient(circle at 38% 56%, rgba(7,155,107,0.12), transparent 35%), linear-gradient(135deg, #020706 0%, #061411 50%, #020706 100%)' }}>
        {/* Green glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[400px] bg-gradient-to-b from-brand-500/14 to-transparent rounded-full blur-3xl pointer-events-none" aria-hidden />
        <NetworkMeshBackground />
        {/* Mobile logo */}
        <div className="lg:hidden absolute top-6 left-6">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo className="w-8 h-8" />
            <span className="font-semibold text-white">StructuraNet AI</span>
          </Link>
        </div>

        <div className="w-full max-w-sm animate-fade-in-up relative z-10">{children}</div>
      </div>
    </div>
  );
}

/** Red error banner shown above the auth forms. */
export function FormErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 animate-fade-in-down">
      <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

/** "I accept the Privacy Policy" checkbox row. */
export function PrivacyCheckbox({ checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-3 text-sm text-zinc-400 transition-colors hover:border-blue-400/40 hover:bg-blue-500/5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
          checked
            ? 'border-blue-400 bg-blue-500 text-white'
            : 'border-zinc-600 bg-zinc-950 text-transparent'
        }`}
        aria-hidden
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span>
        I accept the{' '}
        <Link to="/privacy" className="font-medium text-blue-300 hover:text-blue-200 hover:underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </span>
    </label>
  );
}

/** Full-width primary submit button with a loading spinner state. */
export function SubmitButton({ loading, loadingLabel, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="btn-primary w-full py-3 text-base rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-transform"
    >
      {loading ? (
        <>
          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
