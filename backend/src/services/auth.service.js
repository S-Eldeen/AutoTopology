/**
 * Auth service — pure business logic, no HTTP concerns.
 *
 * Token strategy:
 *   - Access token:  JWT signed with JWT_SECRET, 15min expiry, carries { sub, email, role }
 *   - Refresh token: JWT signed with JWT_REFRESH_SECRET, 7d expiry, carries { sub, ua }
 *   - Refresh tokens are ALSO stored hashed in DB so we can revoke them
 *
 * Why both? The JWT lets us verify without a DB lookup. The DB hash lets us
 * revoke (logout, token theft detection).
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../config/index.js';
import { User } from '../models/User.js';
import { AuthError, ConflictError, ValidationError, NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { ensureFreshUsage, usagePayload } from './plan.service.js';

function serializeUser(user) {
  return { ...user.toJSON(), usage: usagePayload(user) };
}

// ── Token signing ──────────────────────────────────────────
function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiry }
  );
}

function signRefreshToken(user, userAgent = '') {
  return jwt.sign(
    { sub: user._id.toString(), ua: userAgent },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiry }
  );
}

function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── Public API ─────────────────────────────────────────────

/**
 * Register a new user.
 * @returns {{ user, accessToken, refreshToken }}
 */
export async function register({ email, password, name }) {
  // Check for existing user first
  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  if (!password || password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  if (!name || name.trim().length < 2) {
    throw new ValidationError('Name must be at least 2 characters');
  }

  const passwordHash = await User.hashPassword(password);
  const user = new User({
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash,
  });

  // Issue refresh token (sign JWT + store hash in DB)
  const refreshToken = signRefreshToken(user);
  user.refreshTokens.push({
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    userAgent: '',
  });

  await user.save();
  await ensureFreshUsage(user);

  const accessToken = signAccessToken(user);
  logger.info(`User registered: ${user.email}`);
  return { user: serializeUser(user), accessToken, refreshToken };
}

/**
 * Authenticate with email + password.
 *
 * Strict validation:
 *   - Rejects empty email/password with ValidationError (400) BEFORE bcrypt
 *   - Returns generic AuthError (401) for both "user not found" and "wrong password"
 *     to prevent user enumeration attacks
 *   - Guards against missing passwordHash (e.g. legacy/malformed user docs)
 *
 * @returns {{ user, accessToken, refreshToken }}
 */
export async function login({ email, password, userAgent = '' }) {
  // ── Strict input validation (throws 400 BEFORE bcrypt) ────
  if (!email || typeof email !== 'string' || !email.trim()) {
    throw new ValidationError('Email is required');
  }
  if (!password || typeof password !== 'string' || !password.length) {
    throw new ValidationError('Password is required');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  // ── User not found — return same error as wrong password ──
  // (prevents user enumeration: attacker can't tell if email exists)
  if (!user) {
    throw new AuthError('Invalid email or password');
  }

  // ── Guard against malformed user doc (no passwordHash) ────
  if (!user.passwordHash) {
    logger.error(`User ${user.email} has no passwordHash — data integrity issue`);
    throw new AuthError('Invalid email or password');
  }

  // ── Safe bcrypt compare (passwordHash is guaranteed non-undefined) ──
  let ok = false;
  try {
    ok = await user.verifyPassword(password);
  } catch (err) {
    logger.error(`bcrypt.compare failed for ${user.email}:`, err.message);
    throw new AuthError('Invalid email or password');
  }
  if (!ok) {
    throw new AuthError('Invalid email or password');
  }

  const refreshToken = signRefreshToken(user, userAgent);
  user.refreshTokens.push({
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    userAgent,
  });

  // Prune expired tokens
  const now = new Date();
  user.refreshTokens = user.refreshTokens.filter(t => t.expiresAt > now);

  await user.save();
  await ensureFreshUsage(user);

  const accessToken = signAccessToken(user);
  logger.info(`User logged in: ${user.email}`);
  return { user: serializeUser(user), accessToken, refreshToken };
}

/**
 * Issue a new access token from a refresh token.
 * Rotates the refresh token (old one revoked, new one issued).
 */
export async function refresh({ refreshToken }) {
  if (!refreshToken) {
    throw new AuthError('Missing refresh token');
  }

  // Verify JWT signature + expiry
  let payload;
  try {
    payload = jwt.verify(refreshToken, config.jwt.refreshSecret);
  } catch {
    throw new AuthError('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user) throw new NotFoundError('User not found');

  // Verify the token is in the DB (not revoked)
  const tokenHash = hashRefreshToken(refreshToken);
  const match = user.refreshTokens.find(
    t => t.tokenHash === tokenHash && t.expiresAt > new Date()
  );
  if (!match) {
    // Possible token theft — revoke all sessions for safety
    user.revokeAllRefreshTokens();
    await user.save();
    throw new AuthError('Refresh token not recognized — all sessions revoked for security');
  }

  // Rotate: revoke this token, issue a new one
  user.refreshTokens = user.refreshTokens.filter(t => t.tokenHash !== tokenHash);
  const newRefreshToken = signRefreshToken(user, payload.ua || '');
  user.refreshTokens.push({
    tokenHash: hashRefreshToken(newRefreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    userAgent: payload.ua || '',
  });

  await user.save();
  await ensureFreshUsage(user);

  const accessToken = signAccessToken(user);
  return { user: serializeUser(user), accessToken, refreshToken: newRefreshToken };
}

/**
 * Logout — revoke the provided refresh token.
 */
export async function logout({ refreshToken }) {
  if (!refreshToken) return { ok: true };

  let payload;
  try {
    payload = jwt.verify(refreshToken, config.jwt.refreshSecret);
  } catch {
    return { ok: true }; // already expired/invalid — nothing to do
  }

  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (user) {
    const tokenHash = hashRefreshToken(refreshToken);
    user.refreshTokens = user.refreshTokens.filter(t => t.tokenHash !== tokenHash);
    await user.save();
  }
  return { ok: true };
}

/**
 * Get current user (already attached by auth middleware).
 */
export async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User not found');
  await ensureFreshUsage(user);
  return { user: serializeUser(user) };
}
