import { useState, useMemo } from 'react';
import { Network, Maximize2, Check } from 'lucide-react';
import TopologyFullCanvas from '../topology/TopologyFullCanvas.jsx';
import { computeHierarchicalLayout, getNodeColor } from '../topology/topologyLayout.js';

/**
 * TopologyPreviewCard — inline topology summary shown in the conversation
 * when the AI finishes generating a topology.
 *
 * Renders a compact card with:
 *  - Topology name + device/link counts
 *  - A mini SVG preview using a HIERARCHICAL LAYERED layout (NAT/FW at top →
 *    routers → switches → PCs at bottom) so connections flow downward with
 *    minimal crossings — readable, not a hairball.
 *  - A "View full topology" button that opens TopologyFullCanvas (full-screen
 *    modal with the same hierarchical layout + zoom/pan/click-to-inspect).
 */
export default function TopologyPreviewCard({ topology }) {
  const [showFull, setShowFull] = useState(false);

  const nodes = useMemo(
    () => topology?.topology_dict?.topology?.nodes || [],
    [topology]
  );
  const links = useMemo(
    () => topology?.topology_dict?.topology?.links || [],
    [topology]
  );

  // Compute hierarchical layout for the mini preview (compact 200x140 canvas)
  const layout = useMemo(
    () => computeHierarchicalLayout(nodes, links, {
      width: 200,
      height: 140,
      nodeWidth: 0,   // not used for positioning in mini (we just need centers)
      nodeHeight: 0,
    }),
    [nodes, links]
  );

  if (!topology || nodes.length === 0) return null;

  const name = topology?.topology_data?.name || topology?.name || 'Topology';
  const nodeCount = topology?.topology_data?.node_count || nodes.length;
  const linkCount = topology?.topology_data?.link_count || links.length;

  // Scale the layout (which was computed for 200x140) to fit the 96x96 box
  // with a small margin.
  const scaleX = 96 / 200;
  const scaleY = 96 / 140;

  return (
    <>
      {/* Main card (renders inline — no avatar, the parent MessageItem provides it) */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <Network size={15} className="text-emerald-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-white truncate flex-1">{name}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5 flex-shrink-0">
            <Check size={10} strokeWidth={3} />
            Ready
          </span>
        </div>

        {/* Body: mini preview + stats + button */}
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Mini SVG preview — hierarchical layout */}
          <div className="flex-shrink-0 w-24 h-24 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center overflow-hidden">
            <svg viewBox="0 0 96 96" className="w-full h-full">
              {/* Edges (straight lines — easy to trace) */}
              {layout.edges.map((e, i) => (
                <line
                  key={i}
                  x1={e.x1 * scaleX}
                  y1={e.y1 * scaleY}
                  x2={e.x2 * scaleX}
                  y2={e.y2 * scaleY}
                  stroke="#475569"
                  strokeWidth="0.7"
                  opacity="0.55"
                />
              ))}
              {/* Nodes (small dots colored by role) */}
              {layout.positionedNodes.map((n) => (
                <circle
                  key={n.node_id}
                  cx={n.x * scaleX}
                  cy={n.y * scaleY}
                  r="2.8"
                  fill={getNodeColor(n)}
                  stroke="white"
                  strokeWidth="0.5"
                />
              ))}
            </svg>
          </div>

          {/* Stats + action */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 mb-1">
              <span className="text-xl font-semibold text-white">{nodeCount}</span>
              <span className="text-xs text-zinc-500">devices</span>
              <span className="text-zinc-700">·</span>
              <span className="text-xl font-semibold text-white">{linkCount}</span>
              <span className="text-xs text-zinc-500">links</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed mb-2.5">
              Review the generated topology, then ask for changes or approve &amp; export.
            </p>
            <button
              onClick={() => setShowFull(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-medium px-3 py-1.5 transition-colors border border-zinc-600"
            >
              <Maximize2 size={12} />
              View full topology
            </button>
          </div>
        </div>
      </div>

      {/* Full-screen topology modal */}
      {showFull && (
        <TopologyFullCanvas topology={topology} onClose={() => setShowFull(false)} />
      )}
    </>
  );
}
