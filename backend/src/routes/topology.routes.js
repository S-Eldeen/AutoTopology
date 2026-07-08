/**
 * Topology routes — read-only fetch (data arrives via SSE).
 */
import { Router } from 'express';
import { Topology } from '../models/Topology.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFoundError, ForbiddenError, asyncHandler } from '../utils/errors.js';

const router = Router();

// ── GET /api/topology/:id — fetch topology for canvas ──────
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const topology = await Topology.findById(req.params.id);
  if (!topology) throw new NotFoundError('Topology not found');
  if (topology.userId.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('Not your topology');
  }
  res.json({
    topology_id: topology._id,
    topology_dict: topology.topologyDict,
    name: topology.name,
    nodeCount: topology.nodeCount,
    linkCount: topology.linkCount,
    designReview: topology.designReview,
    assumptions: topology.assumptions,
    request: topology.request,
    createdAt: topology.createdAt,
  });
}));

export default router;
