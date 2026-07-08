import { Link } from 'react-router-dom';

const PRIVACY_POINTS = [
  {
    title: 'Project data',
    body: 'Prompts, generated topologies, configs, exports, and GNS3 image mappings are used to build and restore your network projects.',
  },
  {
    title: 'Account and usage',
    body: 'Account details, plan status, and daily design usage help us run authentication, limits, billing, and support.',
  },
  {
    title: 'Your controls',
    body: 'You can request deletion, correction, or export of your data, and the full policy explains how retention works.',
  },
];

export default function PrivacyPolicySection() {
  return (
    <section id="privacy-policy" className="relative py-20 lg:py-28 bg-navy-900 border-y border-navy-800 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
      <div className="absolute -right-32 top-16 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl" aria-hidden />

      <div className="relative max-w-6xl mx-auto px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-400 tracking-wider uppercase mb-3">Privacy & Policy</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            Clear privacy rules for your network designs
          </h2>
          <p className="mt-4 text-lg text-navy-300 leading-relaxed">
            StructuraNet AI stores only the information needed to run accounts, generate projects, manage plan usage, and provide exports. The full policy explains collected data, third-party services, retention, cookies, and user rights in plain language.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PRIVACY_POINTS.map((point) => (
            <div key={point.title} className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-5">
              <h3 className="text-sm font-semibold text-white">{point.title}</h3>
              <p className="mt-2 text-sm leading-6 text-navy-300">{point.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link to="/privacy" className="btn-primary text-sm">
            Read full policy
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Link>
          <span className="text-xs text-navy-500">Final wording should be reviewed before launch.</span>
        </div>
      </div>
    </section>
  );
}
