import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paymentSchemas } from '../middleware/schemas.js';
import { NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import {
  confirmCheckoutSession,
  constructStripeEvent,
  createCheckoutSession,
  handleCheckoutCompleted,
} from '../services/payment.service.js';

const router = Router();

router.post('/checkout', requireAuth, validate(paymentSchemas.checkout), async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) throw new NotFoundError('User not found');
    const result = await createCheckoutSession(user, req.body.plan);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/confirm', requireAuth, validate(paymentSchemas.confirm), async (req, res, next) => {
  try {
    const result = await confirmCheckoutSession(req.user, req.body.sessionId);
    res.json(result);
  } catch (err) { next(err); }
});

export async function stripeWebhookHandler(req, res, next) {
  try {
    const signature = req.headers['stripe-signature'];
    const event = constructStripeEvent(req.body, signature);

    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event.data.object);
      logger.info(`Stripe checkout completed: ${event.data.object.id}`);
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}

export default router;
