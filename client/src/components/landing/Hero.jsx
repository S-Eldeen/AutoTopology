import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import MockChat from './MockChat.jsx';

/**
 * Hero — dark navy background with emerald glow, headline + CTAs + mock chat.
 */
export default function Hero() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <section className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-28 bg-navy-950">
      {/* Background — grid + radial glow */}
      <div className="absolute inset-0 bg-grid-dark opacity-60" aria-hidden />
      <div className="absolute inset-0 bg-radial-glow-green" aria-hidden />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_61%_44%,rgba(7,155,107,0.16),transparent_32%)]" aria-hidden />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[840px] h-[520px] bg-gradient-to-b from-brand-500/14 to-transparent rounded-full blur-3xl" aria-hidden />
      {/* Network nodes + lines pattern — green dots connected by thin lines */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" style={{ opacity: 0.06 }} aria-hidden>
        <line x1="80" y1="60" x2="220" y2="120" stroke="#10B981" strokeWidth="1" />
        <line x1="220" y1="120" x2="380" y2="80" stroke="#10B981" strokeWidth="1" />
        <line x1="380" y1="80" x2="520" y2="140" stroke="#10B981" strokeWidth="1" />
        <line x1="520" y1="140" x2="680" y2="100" stroke="#10B981" strokeWidth="1" />
        <line x1="680" y1="100" x2="840" y2="160" stroke="#10B981" strokeWidth="1" />
        <line x1="840" y1="160" x2="1000" y2="120" stroke="#10B981" strokeWidth="1" />
        <line x1="1000" y1="120" x2="1120" y2="180" stroke="#10B981" strokeWidth="1" />
        <line x1="80" y1="60" x2="140" y2="220" stroke="#10B981" strokeWidth="1" />
        <line x1="220" y1="120" x2="300" y2="260" stroke="#10B981" strokeWidth="1" />
        <line x1="380" y1="80" x2="440" y2="240" stroke="#10B981" strokeWidth="1" />
        <line x1="520" y1="140" x2="580" y2="300" stroke="#10B981" strokeWidth="1" />
        <line x1="680" y1="100" x2="740" y2="280" stroke="#10B981" strokeWidth="1" />
        <line x1="840" y1="160" x2="900" y2="320" stroke="#10B981" strokeWidth="1" />
        <line x1="1000" y1="120" x2="1060" y2="260" stroke="#10B981" strokeWidth="1" />
        <line x1="140" y1="220" x2="300" y2="260" stroke="#10B981" strokeWidth="1" />
        <line x1="300" y1="260" x2="440" y2="240" stroke="#10B981" strokeWidth="1" />
        <line x1="440" y1="240" x2="580" y2="300" stroke="#10B981" strokeWidth="1" />
        <line x1="580" y1="300" x2="740" y2="280" stroke="#10B981" strokeWidth="1" />
        <line x1="740" y1="280" x2="900" y2="320" stroke="#10B981" strokeWidth="1" />
        <line x1="900" y1="320" x2="1060" y2="260" stroke="#10B981" strokeWidth="1" />
        <line x1="140" y1="220" x2="200" y2="400" stroke="#10B981" strokeWidth="1" />
        <line x1="300" y1="260" x2="360" y2="420" stroke="#10B981" strokeWidth="1" />
        <line x1="440" y1="240" x2="500" y2="440" stroke="#10B981" strokeWidth="1" />
        <line x1="580" y1="300" x2="640" y2="460" stroke="#10B981" strokeWidth="1" />
        <line x1="740" y1="280" x2="800" y2="440" stroke="#10B981" strokeWidth="1" />
        <line x1="900" y1="320" x2="960" y2="480" stroke="#10B981" strokeWidth="1" />
        <line x1="1060" y1="260" x2="1100" y2="420" stroke="#10B981" strokeWidth="1" />
        <line x1="200" y1="400" x2="360" y2="420" stroke="#10B981" strokeWidth="1" />
        <line x1="360" y1="420" x2="500" y2="440" stroke="#10B981" strokeWidth="1" />
        <line x1="500" y1="440" x2="640" y2="460" stroke="#10B981" strokeWidth="1" />
        <line x1="640" y1="460" x2="800" y2="440" stroke="#10B981" strokeWidth="1" />
        <line x1="800" y1="440" x2="960" y2="480" stroke="#10B981" strokeWidth="1" />
        <line x1="960" y1="480" x2="1100" y2="420" stroke="#10B981" strokeWidth="1" />
        <line x1="200" y1="400" x2="260" y2="600" stroke="#10B981" strokeWidth="1" />
        <line x1="360" y1="420" x2="420" y2="620" stroke="#10B981" strokeWidth="1" />
        <line x1="500" y1="440" x2="560" y2="640" stroke="#10B981" strokeWidth="1" />
        <line x1="640" y1="460" x2="700" y2="620" stroke="#10B981" strokeWidth="1" />
        <line x1="800" y1="440" x2="860" y2="660" stroke="#10B981" strokeWidth="1" />
        <line x1="960" y1="480" x2="1020" y2="640" stroke="#10B981" strokeWidth="1" />
        <line x1="260" y1="600" x2="420" y2="620" stroke="#10B981" strokeWidth="1" />
        <line x1="420" y1="620" x2="560" y2="640" stroke="#10B981" strokeWidth="1" />
        <line x1="560" y1="640" x2="700" y2="620" stroke="#10B981" strokeWidth="1" />
        <line x1="700" y1="620" x2="860" y2="660" stroke="#10B981" strokeWidth="1" />
        <line x1="860" y1="660" x2="1020" y2="640" stroke="#10B981" strokeWidth="1" />
        <circle cx="80" cy="60" r="3" fill="#10B981" />
        <circle cx="220" cy="120" r="3" fill="#10B981" />
        <circle cx="380" cy="80" r="3" fill="#10B981" />
        <circle cx="520" cy="140" r="3" fill="#10B981" />
        <circle cx="680" cy="100" r="3" fill="#10B981" />
        <circle cx="840" cy="160" r="3" fill="#10B981" />
        <circle cx="1000" cy="120" r="3" fill="#10B981" />
        <circle cx="1120" cy="180" r="3" fill="#10B981" />
        <circle cx="140" cy="220" r="3" fill="#10B981" />
        <circle cx="300" cy="260" r="3" fill="#10B981" />
        <circle cx="440" cy="240" r="3" fill="#10B981" />
        <circle cx="580" cy="300" r="3" fill="#10B981" />
        <circle cx="740" cy="280" r="3" fill="#10B981" />
        <circle cx="900" cy="320" r="3" fill="#10B981" />
        <circle cx="1060" cy="260" r="3" fill="#10B981" />
        <circle cx="200" cy="400" r="3" fill="#10B981" />
        <circle cx="360" cy="420" r="3" fill="#10B981" />
        <circle cx="500" cy="440" r="3" fill="#10B981" />
        <circle cx="640" cy="460" r="3" fill="#10B981" />
        <circle cx="800" cy="440" r="3" fill="#10B981" />
        <circle cx="960" cy="480" r="3" fill="#10B981" />
        <circle cx="1100" cy="420" r="3" fill="#10B981" />
        <circle cx="260" cy="600" r="3" fill="#10B981" />
        <circle cx="420" cy="620" r="3" fill="#10B981" />
        <circle cx="560" cy="640" r="3" fill="#10B981" />
        <circle cx="700" cy="620" r="3" fill="#10B981" />
        <circle cx="860" cy="660" r="3" fill="#10B981" />
        <circle cx="1020" cy="640" r="3" fill="#10B981" />
      </svg>

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: copy + CTAs */}
          <div className="text-center lg:text-left">
            {/* Status badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 backdrop-blur-sm px-3 py-1 text-xs text-brand-400 mb-6 animate-fade-in-down">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
              </span>
              <span className="font-medium">Live</span>
              <span className="text-brand-500/70">·</span>
              <span>45 devices · 3 security profiles</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1] mb-6 animate-fade-in-up">
              Design production-grade networks{' '}
              <span className="text-gradient-brand">in plain English.</span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-navy-300 max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              Describe the network you want. StructuraNet AI designs a complete topology with
              full Cisco IOS configurations and exports a ready-to-run GNS3 project in seconds —
              not hours.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start mb-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <Link to={isAuthenticated ? '/chat' : '/register'} className="btn-primary text-base px-6 py-3 w-full sm:w-auto">
                {isAuthenticated ? 'Open Chat' : 'Get Started Free'}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </Link>
              <a href="#how-it-works" className="btn-secondary text-base px-6 py-3 w-full sm:w-auto">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Watch Demo
              </a>
            </div>

            {/* Trust signals */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 justify-center lg:justify-start text-xs text-navy-400 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                No credit card
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                45-device catalog
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Open architecture
              </span>
            </div>
          </div>

          {/* Right: animated mock chat */}
          <div className="relative animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            <MockChat />
          </div>
        </div>
      </div>
    </section>
  );
}
