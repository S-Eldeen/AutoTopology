import Stripe from 'stripe';
import config from '../config/index.js';
import { User } from '../models/User.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import { normalizePlan, usagePayload } from './plan.service.js';

const PAID_PLANS = new Set(['plus', 'pro']);

function paymentsDevMode() {
  return String(process.env.PAYMENTS_DEV_MODE || '').toLowerCase() === 'true';
}

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}

function priceIdForPlan(plan) {
  return {
    plus: process.env.STRIPE_PLUS_PRICE_ID,
    pro: process.env.STRIPE_PRO_PRICE_ID,
  }[plan]?.trim();
}

function checkoutUrls() {
  return {
    success_url: process.env.STRIPE_SUCCESS_URL
      || `${config.clientUrl}/plans?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: process.env.STRIPE_CANCEL_URL
      || `${config.clientUrl}/plans?checkout=cancel`,
  };
}

export function isPaidPlan(plan) {
  return PAID_PLANS.has(normalizePlan(plan));
}

export async function applyPlan(userId, plan) {
  const normalized = normalizePlan(plan);
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User not found');
  user.plan = normalized;
  await user.save();
  const usage = usagePayload(user);
  return { user: { ...user.toJSON(), usage }, usage };
}

export async function createCheckoutSession(user, plan) {
  const normalized = normalizePlan(plan);
  if (!isPaidPlan(normalized)) {
    return applyPlan(user._id, normalized);
  }

  const stripe = stripeClient();
  const priceId = priceIdForPlan(normalized);
  if (paymentsDevMode()) {
    const result = await applyPlan(user._id, normalized);
    return { ...result, devMode: true };
  }
  if (!stripe || !priceId) {
    throw new AppError('Stripe is not configured for this plan', 503, 'PAYMENTS_NOT_CONFIGURED');
  }

  try {
    const price = await stripe.prices.retrieve(priceId);
    const mode = price.type === 'recurring' ? 'subscription' : 'payment';
    const metadata = {
      userId: user._id.toString(),
      plan: normalized,
    };
    const sessionPayload = {
      mode,
      customer_email: user.email,
      client_reference_id: user._id.toString(),
      line_items: [{ price: priceId, quantity: 1 }],
      ...checkoutUrls(),
      metadata,
    };

    if (mode === 'subscription') {
      sessionPayload.subscription_data = { metadata };
    }

    const session = await stripe.checkout.sessions.create(sessionPayload);
    return { sessionId: session.id, url: session.url };
  } catch (err) {
    throw new AppError(
      err.message || 'Stripe checkout session failed',
      err.statusCode || 502,
      err.code || 'STRIPE_CHECKOUT_ERROR',
      { plan: normalized }
    );
  }
}

export async function confirmCheckoutSession(user, sessionId) {
  const stripe = stripeClient();
  if (!stripe) throw new AppError('Stripe is not configured', 503, 'PAYMENTS_NOT_CONFIGURED');

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const userId = user._id.toString();
  if (session.client_reference_id !== userId && session.metadata?.userId !== userId) {
    throw new ValidationError('Checkout session does not belong to this user');
  }

  const plan = normalizePlan(session.metadata?.plan);
  if (!isPaidPlan(plan)) throw new ValidationError('Checkout session has no paid plan');
  if (session.status !== 'complete' && session.payment_status !== 'paid') {
    throw new AppError('Checkout session is not paid yet', 409, 'PAYMENT_PENDING');
  }

  return applyPlan(userId, plan);
}

export async function handleCheckoutCompleted(session) {
  const plan = normalizePlan(session.metadata?.plan);
  const userId = session.metadata?.userId || session.client_reference_id;
  if (!userId || !isPaidPlan(plan)) return null;
  return applyPlan(userId, plan);
}

export function constructStripeEvent(rawBody, signature) {
  const stripe = stripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    throw new AppError('Stripe webhook is not configured', 503, 'PAYMENTS_NOT_CONFIGURED');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
