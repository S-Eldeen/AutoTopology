/**
 * Auth routes — register, login, refresh, me, logout.
 */
import { Router } from 'express';
import * as authService from '../services/auth.service.js';
import { validate } from '../middleware/validate.js';
import { authSchemas } from '../middleware/schemas.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/errors.js';

const router = Router();

// ── POST /api/auth/register ────────────────────────────────
router.post('/register',
  validate(authSchemas.register),
  asyncHandler(async (req, res) => {
    const { user, accessToken, refreshToken } = await authService.register(req.body);
    res.status(201).json({ user, accessToken, refreshToken });
  })
);

// ── POST /api/auth/login ───────────────────────────────────
router.post('/login',
  validate(authSchemas.login),
  asyncHandler(async (req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    const { user, accessToken, refreshToken } = await authService.login({
      ...req.body,
      userAgent,
    });
    res.json({ user, accessToken, refreshToken });
  })
);

// ── POST /api/auth/refresh ─────────────────────────────────
router.post('/refresh',
  validate(authSchemas.refresh),
  asyncHandler(async (req, res) => {
    const { user, accessToken, refreshToken } = await authService.refresh(req.body);
    res.json({ user, accessToken, refreshToken });
  })
);

// ── GET /api/auth/me ───────────────────────────────────────
router.get('/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { user } = await authService.getMe(req.user._id);
    res.json({ user });
  })
);

// ── POST /api/auth/logout ──────────────────────────────────
router.post('/logout',
  requireAuth,
  validate(authSchemas.logout),
  asyncHandler(async (req, res) => {
    await authService.logout(req.body);
    res.json({ ok: true });
  })
);

export default router;
