import Header from '../components/landing/Header.jsx';
import Hero from '../components/landing/Hero.jsx';
import StatsStrip from '../components/landing/StatsStrip.jsx';
import HowItWorks from '../components/landing/HowItWorks.jsx';
import UseCases from '../components/landing/UseCases.jsx';
import SupportedNetworks from '../components/landing/SupportedNetworks.jsx';
import Vision from '../components/landing/Vision.jsx';
import PrivacyPolicySection from '../components/landing/PrivacyPolicySection.jsx';
import FinalCTA from '../components/landing/FinalCTA.jsx';
import Footer from '../components/landing/Footer.jsx';

/**
 * LandingPage — product landing page for StructuraNet.
 *
 * Section order:
 *   1. Header (sticky nav)
 *   2. Hero (headline + mock chat animation)
 *   3. StatsStrip (4 product stats)
 *   4. HowItWorks (3-step workflow — user-facing, no jargon)
 *   5. UseCases (6 concrete scenarios — "What You Can Build")
 *   6. SupportedNetworks (6 capability cards)
 *   7. Vision (company vision + mission)
 *   8. PrivacyPolicySection (plain-language privacy summary)
 *   9. FinalCTA (green gradient CTA)
 *   10. Footer
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cream-50">
      <Header />
      <main>
        <Hero />
        <StatsStrip />
        <HowItWorks />
        <UseCases />
        <SupportedNetworks />
        <Vision />
        <PrivacyPolicySection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
