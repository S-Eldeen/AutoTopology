import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore.js';

const NAV_ITEMS = [
  { id: 'how-it-works', label: 'How it works' },
  { id: 'use-cases', label: 'Use cases' },
  { id: 'networks', label: 'Capabilities' },
  { id: 'privacy-policy', label: 'Privacy & Policy' },
];

/**
 * Header — sticky nav, dark navy with emerald accents.
 * Transparent over hero → solid navy with border on scroll.
 */
export default function Header({ showNav = true }) {
  const [scrolled, setScrolled] = useState(false);
  const [activeId, setActiveId] = useState(NAV_ITEMS[0].id);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, visible: false });
  const navRef = useRef(null);
  const linkRefs = useRef({});
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const updateIndicator = () => {
    const nav = navRef.current;
    const activeLink = linkRefs.current[activeId];
    if (!nav || !activeLink) {
      setIndicator((prev) => ({ ...prev, visible: false }));
      return;
    }

    const navRect = nav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    setIndicator({
      left: linkRect.left - navRect.left,
      width: linkRect.width,
      visible: true,
    });
  };

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      setScrolled(window.scrollY > 16);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const markerY = window.innerHeight * 0.35;
        let nextActive = NAV_ITEMS[0].id;

        for (const item of NAV_ITEMS) {
          const section = document.getElementById(item.id);
          if (!section) continue;
          const rect = section.getBoundingClientRect();
          if (rect.top <= markerY) nextActive = item.id;
        }

        setActiveId(nextActive);
      });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  useLayoutEffect(() => {
    updateIndicator();
  }, [activeId, scrolled]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicator, { passive: true });
    return () => window.removeEventListener('resize', updateIndicator);
  }, [activeId]);

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
        {showNav && (
        <div ref={navRef} className="relative hidden md:flex items-center gap-8 text-sm">
          <span
            className="pointer-events-none absolute -bottom-2 h-0.5 rounded-full bg-brand-400 shadow-[0_0_12px_rgba(16,185,129,0.75)] transition-[transform,width,opacity] duration-200 ease-out"
            style={{
              width: indicator.width,
              opacity: indicator.visible ? 1 : 0,
              transform: `translateX(${indicator.left}px)`,
            }}
            aria-hidden
          />
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              ref={(node) => { linkRefs.current[item.id] = node; }}
              href={`/#${item.id}`}
              className={`relative transition-colors ${
                activeId === item.id ? 'text-brand-400' : 'text-navy-300 hover:text-brand-400'
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
        )}

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
