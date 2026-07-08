import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';
import MockChat from './MockChat.jsx';
import NetworkMeshBackground from '../common/NetworkMeshBackground.jsx';

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
      <NetworkMeshBackground />

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
