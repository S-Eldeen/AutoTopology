/**
 * Topology model — stores the topology_dict from AI engine.
 */
import mongoose from 'mongoose';

const topologySchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // Original natural-language request that generated this topology
  request: { type: String, required: true },
  // Full topology_dict from Python wrapper
  topologyDict: { type: mongoose.Schema.Types.Mixed, required: true },
  // Lightweight summary for lists
  name: { type: String, default: 'Untitled' },
  nodeCount: { type: Number, default: 0 },
  linkCount: { type: Number, default: 0 },
  // Design review + assumptions from AI engine
  // (AI engine may return either a string or an array of strings — accept both)
  designReview: { type: [String], default: null },
  assumptions: { type: [String], default: null },
  // A design consumes quota only when the user confirms this topology.
  usageCountedAt: { type: Date, default: null },
  // Phase1 file path (server-side, for re-running edit/export)
  phase1File: { type: String, default: null },
}, {
  timestamps: true,
  toJSON: {
    transform(_doc, ret) {
      delete ret.__v;
      return ret;
    },
  },
});

topologySchema.index({ sessionId: 1, createdAt: -1 });

export const Topology = mongoose.model('Topology', topologySchema);
export default Topology;
