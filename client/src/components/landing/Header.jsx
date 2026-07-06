import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';

/**
 * Header — sticky nav, dark navy with emerald accents.
 * Transparent over hero → solid navy with border on scroll.
 */
export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
        scrolled
          ? 'bg-[#020706]/82 backdrop-blur-md border-b border-white/[0.08] shadow-lg shadow-black/20'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30 group-hover:shadow-brand-500/50 transition-shadow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="2" />
              <circle cx="18" cy="6" r="2" />
              <circle cx="6" cy="18" r="2" />
              <circle cx="18" cy="18" r="2" />
              <path d="M8 6h8M6 8v8M18 8v8M8 18h8" />
            </svg>
          </span>
          <span className="font-semibold text-white text-base tracking-tight">
            StructuraNet <span className="text-brand-400">AI</span>
          </span>
        </Link>

        {/* Center nav links */}
        <div className="hidden md:flex items-center gap-8 text-sm">
          <a href="#how-it-works" className="text-navy-300 hover:text-brand-400 transition-colors">How it works</a>
          <a href="#use-cases" className="text-navy-300 hover:text-brand-400 transition-colors">Use cases</a>
          <a href="#catalog" className="text-navy-300 hover:text-brand-400 transition-colors">Devices</a>
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Link to="/chat" className="btn-primary text-sm">
              Open Chat
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost text-sm hidden sm:inline-flex">Log in</Link>
              <Link to="/register" className="btn-primary text-sm">
                Get Started
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
