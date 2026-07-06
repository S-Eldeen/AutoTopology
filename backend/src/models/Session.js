/**
 * Chat Session model — owns messages + topology reference.
 */
import mongoose from 'mongoose';
import crypto from 'crypto';

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true,
  },
  content: { type: String, required: true },
  // For assistant messages: which tool was invoked, if any
  tool: {
    type: String,
    enum: [null, 'generate_topology', 'edit_topology', 'export_project', 'search_kb'],
    default: null,
  },
  // Snapshot of tool result summary (for history replay)
  toolSummary: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    default: 'New Chat',
    trim: true,
    maxlength: 200,
  },
  starred: {
    type: Boolean,
    default: false,
    index: true,
  },
  share: {
    enabled: { type: Boolean, default: false, index: true },
    token: { type: String, default: null, index: true },
    updatedAt: { type: Date, default: null },
  },
  messages: [messageSchema],
  // Reference to the latest topology generated in this session
  currentTopologyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topology',
    default: null,
  },
  // Explicit per-project security profile. Null means the user has not
  // chosen yet, so generation/export must ask before proceeding.
  securityProfile: {
    type: String,
    enum: [null, 'none', 'basic', 'enterprise'],
    default: null,
  },
  pendingSecurityProfileAction: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  // Tracks active export job, if any
  currentExportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Export',
    default: null,
  },
  // Original user request (preserved across edits for context)
  originalRequest: { type: String, default: null },
  lastActivityAt: { type: Date, default: Date.now, index: true },
}, {
  timestamps: true,
  toJSON: {
    transform(_doc, ret) {
      delete ret.__v;
      return ret;
    },
  },
});

// ── Auto-title from first user message ──────────────────────
sessionSchema.methods.autoTitle = function () {
  if (this.title !== 'New Chat') return;
  const firstUser = this.messages.find(m => m.role === 'user');
  if (firstUser) {
    this.title = firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '…' : '');
  }
};

sessionSchema.methods.touch = function () {
  this.lastActivityAt = new Date();
};

sessionSchema.methods.enableShare = function () {
  if (!this.share?.token) {
    this.share = this.share || {};
    this.share.token = crypto.randomBytes(24).toString('hex');
  }
  this.share.enabled = true;
  this.share.updatedAt = new Date();
};

sessionSchema.methods.disableShare = function () {
  this.share = this.share || {};
  this.share.enabled = false;
  this.share.updatedAt = new Date();
};

export const Session = mongoose.model('Session', sessionSchema);
export default Session;
