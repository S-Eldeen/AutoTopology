/**
 * BrandWordmark — logo mark + "StructuraNet AI" text used in the landing
 * Header and Footer. `hoverGlow` enables the Header's hover shadow (the
 * parent link must have the `group` class for it to trigger).
 */
export default function BrandWordmark({ hoverGlow = false }) {
  return (
    <>
      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30${hoverGlow ? ' group-hover:shadow-brand-500/50 transition-shadow' : ''}`}>
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
    </>
  );
}
