export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    limit: 3,
    description: 'For quick tests and small lab ideas.',
  },
  {
    id: 'plus',
    name: 'Plus',
    limit: 7,
    description: 'For regular design work and revisions.',
  },
  {
    id: 'pro',
    name: 'Pro',
    limit: 10,
    description: 'For heavier daily topology planning.',
  },
];

export function planLabel(plan) {
  return PLANS.find((item) => item.id === plan)?.name || 'Free';
}
