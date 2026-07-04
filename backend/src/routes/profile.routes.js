/**
 * Profile routes — GNS3 image-map calibration + appliance catalog.
 *
 * The user's profile maps each device template (e.g. "Cisco 7200") to the
 * image filename installed on their GNS3 server. This map is forwarded to
 * the Python AI engine so generated .gns3project files reference images
 * the user actually has — otherwise GNS3 refuses to open the project.
 */
import { Router } from 'express';
import { User } from '../models/User.js';
import { validate } from '../middleware/validate.js';
import { profileSchemas } from '../middleware/schemas.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError, NotFoundError, EngineError } from '../utils/errors.js';
import aiEngine from '../services/ai-engine.bridge.js';
import logger from '../utils/logger.js';
import { ensureFreshUsage, usagePayload } from '../services/plan.service.js';

const router = Router();

// ── GET /api/profile ───────────────────────────────────────
// Returns the user's GNS3 calibration profile (imageMap + isCalibrated).
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) throw new NotFoundError('User not found');
    res.json({ profile: user.gns3Profile || { isCalibrated: false, imageMap: {} } });
  } catch (err) { next(err); }
});

// ── GET /api/profile/usage ─────────────────────────────────
router.get('/usage', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) throw new NotFoundError('User not found');
    const usage = await ensureFreshUsage(user);
    res.json({ usage });
  } catch (err) { next(err); }
});

// ── PATCH /api/profile/plan ────────────────────────────────
router.patch('/plan', requireAuth, validate(profileSchemas.updatePlan), async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) throw new NotFoundError('User not found');
    if (req.body.plan !== 'free') {
      throw new AppError('Use checkout to upgrade to a paid plan', 402, 'PAYMENT_REQUIRED');
    }
    user.plan = req.body.plan;
    await user.save();
    const usage = usagePayload(user);
    res.json({ user: { ...user.toJSON(), usage }, usage });
  } catch (err) { next(err); }
});

// ── PUT /api/profile ───────────────────────────────────────
// Save the user's GNS3 environment capability + image map. Marks the
// profile as calibrated once saved (even an empty save = "skip" sets
// isCalibrated=true so the onboarding popup does not reappear).
router.put('/', requireAuth, validate(profileSchemas.update), async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) throw new NotFoundError('User not found');

    const b = req.body;
    if (b.gns3Version !== undefined) user.gns3Profile.gns3Version = b.gns3Version;
    if (b.supportsIou !== undefined) user.gns3Profile.supportsIou = b.supportsIou;
    if (b.supportsQemu !== undefined) user.gns3Profile.supportsQemu = b.supportsQemu;
    if (b.supportsDocker !== undefined) user.gns3Profile.supportsDocker = b.supportsDocker;
    if (b.strictValidation !== undefined) user.gns3Profile.strictValidation = b.strictValidation;
    if (b.requireTemplateImageMap !== undefined) user.gns3Profile.requireTemplateImageMap = b.requireTemplateImageMap;
    if (b.imageMap !== undefined) {
      user.gns3Profile.imageMap = new Map(Object.entries(b.imageMap));
    }
    user.gns3Profile.isCalibrated = true;
    user.gns3Profile.updatedAt = new Date();
    await user.save();

    res.json({ profile: user.gns3Profile });
  } catch (err) { next(err); }
});

// ── GET /api/profile/catalog ───────────────────────────────
// Returns the full appliance catalog from the Python AI engine (the single
// source of truth for device definitions). The frontend uses this to render
// a searchable dropdown of all supported devices in the onboarding popup,
// so the user can map each template to their installed image filename.
//
// This endpoint spawns `python wrapper.py catalog` and returns the parsed
// JSON. It is cached for 5 minutes on the client via the Axios interceptor
// (see services/api.js) to avoid re-spawning Python on every modal open.
router.get('/catalog', requireAuth, async (req, res, next) => {
  try {
    const result = await aiEngine.catalog();
    if (!result || !result.devices) {
      throw new EngineError('Appliance catalog returned no devices');
    }
    logger.info(`Profile catalog served: ${result.count} devices`);
    res.json({
      count: result.count,
      devices: result.devices,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
