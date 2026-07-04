/**
 * Express app — middleware stack + route mounting.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import config from './config/index.js';
import logger from './utils/logger.js';
import { notFoundHandler, errorHandler } from './utils/errors.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import sessionRoutes from './routes/session.routes.js';
import topologyRoutes from './routes/topology.routes.js';
import exportRoutes from './routes/export.routes.js';
import paymentRoutes, { stripeWebhookHandler } from './routes/payment.routes.js';

const app = express();

// ── Security & middleware ───────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));

// Stripe webhooks need the original raw body for signature verification.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan(config.env === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// Rate limiting (skip for SSE)
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  skip: (req) => req.path.includes('/stream'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests, please slow down', code: 'RATE_LIMIT' } },
});
app.use('/api/', limiter);

// ── Health check ────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const mongoState = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const mongoStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoState];
  res.json({
    ok: mongoState === 1,
    env: config.env,
    mongo: mongoStatus,
    ts: Date.now(),
  });
});

// ── API routes ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/topology', topologyRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/payments', paymentRoutes);

// ── 404 + error handler (must be last) ──────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
