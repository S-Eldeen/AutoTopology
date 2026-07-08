import { Link } from 'react-router-dom';
import BrandWordmark from '../common/BrandWordmark.jsx';

/**
 * Footer — 3-column dark footer with brand block, product, and company.
 * No "Architecture" column (that exposed internals). No "graduation project" text.
 */
const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Use cases', href: '#use-cases' },
      { label: 'Supported devices', href: '#catalog' },
      { label: 'Capabilities', href: '#networks' },
      { label: 'Security analyzer', href: '#security-feature' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Our vision', href: '#' },
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Get started', href: '/register' },
      { label: 'Sign in', href: '/login' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-navy-950 border-t border-navy-800">
      <div className="max-w-7xl mx-auto px-6 py-14">
        {/* Top: brand + columns */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 lg:gap-12">
          {/* Brand block */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-3">
              <BrandWordmark />
            </Link>
            <p className="text-sm text-navy-400 leading-relaxed mb-4">
              AI-powered network topology generation. Describe it. Review it. Run it.
            </p>
            <div className="flex items-center gap-2 text-xs text-navy-500">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
              <span>All systems operational</span>
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">{col.title}</h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('#') ? (
                      <a href={link.href} className="text-sm text-navy-400 hover:text-brand-400 transition-colors">
                        {link.label}
                      </a>
                    ) : (
                      <Link to={link.href} className="text-sm text-navy-400 hover:text-brand-400 transition-colors">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="my-8 h-px bg-navy-800" />

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-navy-500">
          <p>© 2026 StructuraNet AI. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              GNS3 Compatible
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Enterprise-grade Security
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
