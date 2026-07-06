import Header from '../components/landing/Header.jsx';
import Footer from '../components/landing/Footer.jsx';

const SECTIONS = [
  {
    title: 'What We Collect',
    body: [
      'Account information: your name, email address, password hash, plan, billing status, and basic account settings.',
      'Prompts and generated work: chat messages, network design requests, generated topology data, device mappings, configuration outputs, and export metadata.',
      'Usage information: actions such as creating sessions, generating designs, exporting projects, plan usage counts, reset dates, and error logs needed to keep the service reliable.',
      'Payment information: payment events and subscription status from our payment processor. We do not store full card numbers on StructuraNet AI servers.',
      'Technical information: browser, device, IP address, timestamps, authentication tokens, and security logs used for login, abuse prevention, and debugging.',
    ],
  },
  {
    title: 'How We Use Data',
    body: [
      'We use account data to sign you in, manage your plan, and keep your workspace available.',
      'We use prompts, generated topology data, and GNS3 image settings to build, edit, export, and restore your network projects.',
      'We use usage and technical data to enforce plan limits, troubleshoot problems, prevent abuse, and improve product quality.',
      'We use payment status to activate paid features, show billing state, and handle subscription changes.',
    ],
  },
  {
    title: 'How Data Is Stored',
    body: [
      'Account, session, topology, and profile data are stored in our application database.',
      'Generated export files may be stored on the backend file system or hosting storage so you can download GNS3 projects, configs, and manifests.',
      'Passwords are stored as hashes, not plain text. Access tokens and refresh tokens are used to keep your session secure.',
      'We limit access to production data to people and systems that need it to operate, support, or secure the service.',
    ],
  },
  {
    title: 'How Long We Keep Data',
    body: [
      'Account data is kept while your account is active.',
      'Chat sessions, prompts, topologies, exports, and GNS3 profile settings are kept so you can return to your projects unless you delete them or request deletion.',
      'Operational logs and security events may be kept for a limited period for troubleshooting, abuse prevention, and compliance.',
      'If you request deletion, we will remove or anonymize data we no longer need, unless we must keep some records for legal, security, payment, or abuse-prevention reasons.',
    ],
  },
  {
    title: 'Third-Party Services',
    body: [
      'Hosting and infrastructure providers run the application, database, storage, and networking needed to provide the service.',
      'AI model providers process prompts and project context to generate topology and configuration results.',
      'Payment processors handle checkout, billing, subscription status, and payment confirmations.',
      'Analytics or logging tools may help us understand reliability, errors, performance, and product usage. We aim to collect only what is useful for operating and improving the product.',
    ],
  },
  {
    title: 'Cookies and Local Storage',
    body: [
      'We use cookies or browser storage for authentication, session continuity, preferences, and product behavior such as remembering workspace state.',
      'If analytics are enabled, cookies or similar technologies may help measure aggregate usage and performance.',
      'You can block or delete cookies in your browser, but some features, including sign-in, may stop working correctly.',
    ],
  },
  {
    title: 'Your Choices and Rights',
    body: [
      'You can update account and GNS3 image settings from the app where those controls are available.',
      'You can ask us to export your account, chat, topology, and project data where technically feasible.',
      'You can ask us to delete your account or project data.',
      'You can ask us to correct inaccurate account information.',
      'To make a data request, contact the StructuraNet AI team with the email address attached to your account.',
    ],
  },
  {
    title: 'Security',
    body: [
      'We use authentication, access controls, and operational monitoring to protect the service.',
      'No online service can guarantee perfect security. Please use a strong password and keep your account credentials private.',
      'Avoid entering secrets such as production passwords, private keys, or customer confidential data into prompts unless your team has approved that workflow.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#020706] text-white">
      <Header />
      <main className="pt-28 pb-16">
        <section className="max-w-4xl mx-auto px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-400">Privacy Policy</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">StructuraNet AI Privacy Policy</h1>
          <p className="mt-4 text-sm text-navy-400">Last updated: July 6, 2026</p>

          <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            This page is written in plain language for product transparency. The final wording should be reviewed by a qualified legal reviewer before launch.
          </div>

          <p className="mt-8 text-lg leading-8 text-navy-200">
            This policy explains what StructuraNet AI collects, why we collect it, how it is stored, and what choices users have. We try to collect the information needed to run the product, generate network designs, support exports, keep accounts secure, and improve reliability.
          </p>

          <div className="mt-10 space-y-8">
            {SECTIONS.map((section) => (
              <section key={section.title} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
                <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-navy-300">
                  {section.body.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section className="mt-8 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
            <h2 className="text-xl font-semibold tracking-tight">Contact</h2>
            <p className="mt-4 text-sm leading-6 text-navy-300">
              For privacy questions, data export requests, or deletion requests, contact the StructuraNet AI team using the support channel provided in the application or from the email address associated with your account.
            </p>
          </section>
        </section>
      </main>
      <Footer />
    </div>
  );
}
