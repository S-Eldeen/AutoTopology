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
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import sseService from '../services/sse.service.js';
import * as orchestrator from '../services/chat.orchestrator.js';
import logger from '../utils/logger.js';
import { ensureFreshUsage, isDesignRequest } from '../services/plan.service.js';

const router = Router();

// ── GET /api/sessions — list user's sessions ───────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const sessions = await Session.find({ userId: req.user._id })
      .sort({ starred: -1, lastActivityAt: -1 })
      .select('title starred share createdAt lastActivityAt currentTopologyId currentExportId')
      .limit(100);
    res.json({ sessions });
  } catch (err) { next(err); }
});

// ── POST /api/sessions — create new session ────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const session = await Session.create({
      userId: req.user._id,
      title: 'New Chat',
      messages: [],
    });
    res.status(201).json({ sessionId: session._id, session });
  } catch (err) { next(err); }
});

// ── GET /api/sessions/:id — full session with messages ─────
router.get('/share/:token', async (req, res, next) => {
  try {
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
  } catch (err) { next(err); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.userId.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('Not your session');
    }
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
  } catch (err) { next(err); }
});

// ── PATCH /api/sessions/:id/title ──────────────────────────
router.patch('/:id/title', requireAuth, validate(sessionSchemas.updateTitle), async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.userId.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('Not your session');
    }
    session.title = req.body.title;
    await session.save();
    res.json({ ok: true, session });
  } catch (err) { next(err); }
});

// ── PATCH /api/sessions/:id/star ───────────────────────────
router.patch('/:id/star', requireAuth, validate(sessionSchemas.updateStarred), async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.userId.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('Not your session');
    }
    session.starred = req.body.starred;
    await session.save();
    res.json({ ok: true, session });
  } catch (err) { next(err); }
});

// ── DELETE /api/sessions/:id ───────────────────────────────
router.patch('/:id/share', requireAuth, validate(sessionSchemas.updateShare), async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.userId.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('Not your session');
    }
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
  } catch (err) { next(err); }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.userId.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('Not your session');
    }
    await Session.deleteOne({ _id: session._id });
    await Topology.deleteMany({ sessionId: session._id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/sessions/:id/stream — SSE endpoint ────────────
router.get('/:id/stream', sseAuth, async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.userId.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('Not your session');
    }
    sseService.subscribe(session._id.toString(), res);
  } catch (err) { next(err); }
});

// ── POST /api/sessions/:id/messages — send user message ────
router.post('/:id/messages', requireAuth, validate(messageSchemas.create), async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.userId.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('Not your session');
    }

    if (isDesignRequest(req.body.content)) {
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
  } catch (err) { next(err); }
});

export default router;
