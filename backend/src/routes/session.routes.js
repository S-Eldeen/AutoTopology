/**
 * Chat session routes — create, list, get, delete, send message, SSE stream.
 */
import { Router } from 'express';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { Topology } from '../models/Topology.js';
import { ExportJob } from '../models/Export.js';
import { validate } from '../middleware/validate.js';
import { sessionSchemas, messageSchemas } from '../middleware/schemas.js';
import { requireAuth, sseAuth } from '../middleware/auth.js';
import { NotFoundError, ForbiddenError, asyncHandler } from '../utils/errors.js';
import sseService from '../services/sse.service.js';
import * as orchestrator from '../services/chat.orchestrator.js';
import logger from '../utils/logger.js';
import { ensureFreshUsage, isTopologyConfirmation } from '../services/plan.service.js';

const router = Router();

async function findOwnedSession(sessionId, userId) {
  const session = await Session.findById(sessionId);
  if (!session) throw new NotFoundError('Session not found');
  if (session.userId.toString() !== userId.toString()) {
    throw new ForbiddenError('Not your session');
  }
  return session;
}

// ── GET /api/sessions — list user's sessions ───────────────
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const sessions = await Session.find({ userId: req.user._id })
    .sort({ starred: -1, lastActivityAt: -1 })
    .select('title starred share createdAt lastActivityAt currentTopologyId currentExportId')
    .limit(100);
  res.json({ sessions });
}));

// ── POST /api/sessions — create new session ────────────────
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const session = await Session.create({
    userId: req.user._id,
    title: 'New Chat',
    messages: [],
  });
  res.status(201).json({ sessionId: session._id, session });
}));

// ── GET /api/sessions/share/:token — public shared chat ────
router.get('/share/:token', asyncHandler(async (req, res) => {
  const session = await Session.findOne({
    'share.token': req.params.token,
    'share.enabled': true,
  }).select('title messages createdAt lastActivityAt share.updatedAt');
  if (!session) throw new NotFoundError('Shared chat not found or access was revoked');
  res.json({
    session: {
      _id: session._id,
      title: session.title,
      messages: session.messages,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      sharedAt: session.share?.updatedAt,
    },
  });
}));

// ── GET /api/sessions/:id — full session with messages ─────
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req.params.id, req.user._id);
  let topology = null;
  if (session.currentTopologyId) {
    topology = await Topology.findById(session.currentTopologyId);
  }
  // Also fetch the export job (if any) so the frontend can reattach
  // the download buttons to the correct message when reloading a session.
  let exportJob = null;
  if (session.currentExportId) {
    exportJob = await ExportJob.findById(session.currentExportId);
  }
  res.json({ session, topology, exportJob });
}));

// ── PATCH /api/sessions/:id/title ──────────────────────────
router.patch('/:id/title', requireAuth, validate(sessionSchemas.updateTitle), asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req.params.id, req.user._id);
  session.title = req.body.title;
  await session.save();
  res.json({ ok: true, session });
}));

// ── PATCH /api/sessions/:id/star ───────────────────────────
router.patch('/:id/star', requireAuth, validate(sessionSchemas.updateStarred), asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req.params.id, req.user._id);
  session.starred = req.body.starred;
  await session.save();
  res.json({ ok: true, session });
}));

// ── PATCH /api/sessions/:id/share — enable/disable sharing ─
router.patch('/:id/share', requireAuth, validate(sessionSchemas.updateShare), asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req.params.id, req.user._id);
  if (req.body.enabled) {
    session.enableShare();
  } else {
    session.disableShare();
  }
  await session.save();
  res.json({
    ok: true,
    share: {
      enabled: session.share.enabled,
      token: session.share.enabled ? session.share.token : null,
      updatedAt: session.share.updatedAt,
    },
  });
}));

// ── DELETE /api/sessions/:id ───────────────────────────────
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req.params.id, req.user._id);
  await Session.deleteOne({ _id: session._id });
  await Topology.deleteMany({ sessionId: session._id });
  res.json({ ok: true });
}));

// ── GET /api/sessions/:id/stream — SSE endpoint ────────────
router.get('/:id/stream', sseAuth, asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req.params.id, req.user._id);
  sseService.subscribe(session._id.toString(), res);
}));

// ── POST /api/sessions/:id/messages — send user message ────
router.post('/:id/messages', requireAuth, validate(messageSchemas.create), asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req.params.id, req.user._id);

  if (isTopologyConfirmation(req.body.content)) {
    const user = await User.findById(req.user._id);
    if (!user) throw new NotFoundError('User not found');
    const usage = await ensureFreshUsage(user);
    if (usage.remaining <= 0) {
      return res.status(429).json({
        error: {
          message: `Daily design limit reached. Your limit resets at ${new Date(usage.resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tomorrow.`,
          code: 'PLAN_LIMIT_REACHED',
          usage,
        },
      });
    }
  }

  // Kick off the orchestrator (don't await — runs in background, streams via SSE)
  const sessionId = session._id.toString();
  orchestrator.dispatch(sessionId, req.user._id.toString(), req.body.content)
    .catch(err => {
      logger.error(`Orchestrator failed for session ${sessionId}:`, err);
      sseService.broadcast(sessionId, 'error', { message: err.message });
    });

  res.status(202).json({ ok: true, messageId: 'pending' });
}));

export default router;
