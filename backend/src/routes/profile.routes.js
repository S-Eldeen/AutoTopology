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
import { AppError, NotFoundError, EngineError, asyncHandler } from '../utils/errors.js';
import aiEngine from '../services/ai-engine.bridge.js';
import logger from '../utils/logger.js';
import { ensureFreshUsage, usagePayload } from '../services/plan.service.js';

const router = Router();

async function findUser(userId) {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User not found');
  return user;
}

// ── GET /api/profile ───────────────────────────────────────
// Returns the user's GNS3 calibration profile (imageMap + isCalibrated).
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = await findUser(req.user._id);
  res.json({ profile: user.gns3Profile || { isCalibrated: false, imageMap: {} } });
}));

// ── GET /api/profile/usage ─────────────────────────────────
router.get('/usage', requireAuth, asyncHandler(async (req, res) => {
  const user = await findUser(req.user._id);
  const usage = await ensureFreshUsage(user);
  res.json({ usage });
}));

// ── PATCH /api/profile/plan ────────────────────────────────
router.patch('/plan', requireAuth, validate(profileSchemas.updatePlan), asyncHandler(async (req, res) => {
  const user = await findUser(req.user._id);
  if (req.body.plan !== 'free') {
    throw new AppError('Use checkout to upgrade to a paid plan', 402, 'PAYMENT_REQUIRED');
  }
  user.plan = req.body.plan;
  await user.save();
  const usage = usagePayload(user);
  res.json({ user: { ...user.toJSON(), usage }, usage });
}));

// ── PUT /api/profile ───────────────────────────────────────
// Save the user's GNS3 environment capability + image map. Marks the
// profile as calibrated once saved (even an empty save = "skip" sets
// isCalibrated=true so the onboarding popup does not reappear).
router.put('/', requireAuth, validate(profileSchemas.update), asyncHandler(async (req, res) => {
  const user = await findUser(req.user._id);

  const b = req.body;
  if (b.gns3Version !== undefined) user.gns3Profile.gns3Version = b.gns3Version;
  if (b.supportsIou !== undefined) user.gns3Profile.supportsIou = b.supportsIou;
  if (b.supportsQemu !== undefined) user.gns3Profile.supportsQemu = b.supportsQemu;
  if (b.supportsDocker !== undefined) user.gns3Profile.supportsDocker = b.supportsDocker;
  if (b.strictValidation !== undefined) user.gns3Profile.strictValidation = b.strictValidation;
  if (b.requireTemplateImageMap !== undefined) user.gns3Profile.requireTemplateImageMap = b.requireTemplateImageMap;
  if (b.imageMap !== undefined) {
    const cleanImageMap = Object.fromEntries(
      Object.entries(b.imageMap)
        .map(([template, image]) => [template.trim(), image.trim()])
        .filter(([template, image]) => template && image)
    );
    user.gns3Profile.imageMap = new Map(Object.entries(cleanImageMap));
    // A populated calibration map means appliance selection must be limited
    // to those installed images, including for profiles saved by older clients.
    if (b.requireTemplateImageMap === undefined) {
      user.gns3Profile.requireTemplateImageMap = Object.keys(cleanImageMap).length > 0;
    }
  }
  user.gns3Profile.isCalibrated = true;
  user.gns3Profile.updatedAt = new Date();
  await user.save();

  res.json({ profile: user.gns3Profile });
}));

// ── GET /api/profile/catalog ───────────────────────────────
// Returns the full appliance catalog from the Python AI engine (the single
// source of truth for device definitions). The frontend uses this to render
// a searchable dropdown of all supported devices in the onboarding popup,
// so the user can map each template to their installed image filename.
router.get('/catalog', requireAuth, asyncHandler(async (req, res) => {
  const result = await aiEngine.catalog();
  if (!result || !result.devices) {
    throw new EngineError('Appliance catalog returned no devices');
  }
  logger.info(`Profile catalog served: ${result.count} devices`);
  res.json({
    count: result.count,
    devices: result.devices,
  });
}));

export default router;
