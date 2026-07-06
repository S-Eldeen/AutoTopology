export const PLAN_LIMITS = {
  free: 3,
  plus: 7,
  pro: 10,
};

export const PLAN_NAMES = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
};

export function normalizePlan(plan) {
  return Object.prototype.hasOwnProperty.call(PLAN_LIMITS, plan) ? plan : 'free';
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function resetUsageIfNeeded(user, now = new Date()) {
  const todayStartedAt = startOfUtcDay(now);

  if (!user.designUsage) {
    user.designUsage = { used: 0, windowStartedAt: todayStartedAt };
    return true;
  }

  const started = user.designUsage.windowStartedAt
    ? new Date(user.designUsage.windowStartedAt)
    : todayStartedAt;
  const startedDay = startOfUtcDay(started);

  if (startedDay.getTime() !== todayStartedAt.getTime()) {
    user.designUsage.used = 0;
    user.designUsage.windowStartedAt = todayStartedAt;
    return true;
  }
  return false;
}

export function usagePayload(user, now = new Date()) {
  const plan = normalizePlan(user.plan);
  const todayStartedAt = startOfUtcDay(now);
  const storedStarted = user.designUsage?.windowStartedAt
    ? new Date(user.designUsage.windowStartedAt)
    : now;
  const started = startOfUtcDay(storedStarted);
  const isCurrentDay = started.getTime() === todayStartedAt.getTime();
  const resetAt = addUtcDays(todayStartedAt, 1);
  const limit = PLAN_LIMITS[plan];
  const used = isCurrentDay ? Math.min(Number(user.designUsage?.used || 0), limit) : 0;

  return {
    plan,
    planName: PLAN_NAMES[plan],
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetAt: resetAt.toISOString(),
  };
}

export async function ensureFreshUsage(user) {
  const changed = resetUsageIfNeeded(user);
  if (changed) await user.save();
  return usagePayload(user);
}

export async function consumeDesign(user) {
  resetUsageIfNeeded(user);
  const payload = usagePayload(user);
  if (payload.used >= payload.limit) {
    const err = new Error('Daily design limit reached');
    err.code = 'PLAN_LIMIT_REACHED';
    err.usage = payload;
    throw err;
  }
  user.designUsage.used = payload.used + 1;
  await user.save();
  return usagePayload(user);
}

export function isDesignRequest(content = '') {
  const msg = String(content).toLowerCase();
  return /\b(build|create|generate|design|make|draw|plan)\b.*\b(network|topology|diagram|router|switch|pc|host|firewall|site|branch|branches|vlan|company)\b/i.test(msg)
    || /\b(give|make|create|design|build)\b.*\b(network\s*)?design\s+for\b/i.test(msg);
}
