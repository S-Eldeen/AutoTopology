/**
 * User model — auth + profile + GNS3 calibration.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [80, 'Name must be at most 80 characters'],
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  plan: {
    type: String,
    enum: ['free', 'plus', 'pro'],
    default: 'free',
    index: true,
  },
  designUsage: {
    used: { type: Number, default: 0, min: 0 },
    windowStartedAt: { type: Date, default: Date.now },
  },
  // Refresh tokens — stored hashed so DB leak doesn't grant access
  refreshTokens: [{
    tokenHash: String,
    issuedAt: { type: Date, default: Date.now },
    expiresAt: Date,
    userAgent: String,
    _id: false,
  }],
  // GNS3 calibration (saved during onboarding popup).
  //
  // The user maps each device template (e.g. "Cisco 7200") to the image
  // filename installed on their GNS3 server. This map is forwarded to the
  // Python AI engine so generated .gns3project files reference images the
  // user actually has — otherwise GNS3 refuses to open the project.
  //
  // The environment fields (gns3Version, supportsIou/Qemu/Docker) control
  // which device types the LLM is allowed to pick from — devices whose
  // backend the user lacks are filtered out of the inventory before the
  // LLM ever sees them. See ai-engine/structranet/generation/preflight.py.
  gns3Profile: {
    isCalibrated: { type: Boolean, default: false },

    // ── Environment capability (collected in onboarding) ──────────────
    gns3Version: { type: String, default: '2.2' },
    supportsIou: { type: Boolean, default: false },
    supportsQemu: { type: Boolean, default: true },
    supportsDocker: { type: Boolean, default: false },
    strictValidation: { type: Boolean, default: true },
    requireTemplateImageMap: { type: Boolean, default: false },

    // ── Image map (templateName → image filename) ─────────────────────
    imageMap: { type: Map, of: String, default: {} },

    updatedAt: { type: Date, default: null },
  },
}, {
  timestamps: true,
  toJSON: {
    transform(_doc, ret) {
      delete ret.passwordHash;
      delete ret.refreshTokens;
      delete ret.__v;
      return ret;
    },
  },
});

// ── Password hashing ────────────────────────────────────────
userSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 12);
};

userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// ── Refresh token management (hashed) ───────────────────────
userSchema.methods.issueRefreshToken = function (userAgent = '') {
  const raw = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  this.refreshTokens.push({ tokenHash, expiresAt, userAgent });
  return { raw, expiresAt };
};

userSchema.methods.verifyRefreshToken = function (raw) {
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  return this.refreshTokens.find(
    t => t.tokenHash === tokenHash && t.expiresAt > new Date()
  );
};

userSchema.methods.revokeRefreshToken = function (raw) {
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  this.refreshTokens = this.refreshTokens.filter(t => t.tokenHash !== tokenHash);
};

userSchema.methods.revokeAllRefreshTokens = function () {
  this.refreshTokens = [];
};

// ── Prune expired tokens on save ────────────────────────────
userSchema.pre('save', function (next) {
  if (this.isModified('refreshTokens')) {
    const now = new Date();
    this.refreshTokens = this.refreshTokens.filter(t => t.expiresAt > now);
  }
  next();
});

export const User = mongoose.model('User', userSchema);
export default User;
