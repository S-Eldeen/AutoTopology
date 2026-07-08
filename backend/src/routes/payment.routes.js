import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paymentSchemas } from '../middleware/schemas.js';
import { NotFoundError, asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import {
  confirmCheckoutSession,
  constructStripeEvent,
  createCheckoutSession,
  handleCheckoutCompleted,
} from '../services/payment.service.js';

const router = Router();

router.post('/checkout', requireAuth, validate(paymentSchemas.checkout), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new NotFoundError('User not found');
  const result = await createCheckoutSession(user, req.body.plan);
  res.json(result);
}));

router.post('/confirm', requireAuth, validate(paymentSchemas.confirm), asyncHandler(async (req, res) => {
  const result = await confirmCheckoutSession(req.user, req.body.sessionId);
  res.json(result);
}));

export const stripeWebhookHandler = asyncHandler(async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const event = constructStripeEvent(req.body, signature);

  if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted(event.data.object);
    logger.info(`Stripe checkout completed: ${event.data.object.id}`);
  }

  res.json({ received: true });
});

export default router;
