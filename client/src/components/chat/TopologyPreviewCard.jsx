import { useState, useMemo } from 'react';
import { Network, Maximize2, Check } from 'lucide-react';
import TopologyFullCanvas from '../topology/TopologyFullCanvas.jsx';
import { computeHierarchicalLayout, getNodeColor } from '../topology/topologyLayout.js';

/**
 * TopologyPreviewCard — inline topology summary shown in the conversation
 * when the AI finishes generating a topology.
 *
 * The preview is now a full-width landscape panel (not a cramped square),
 * with the hierarchical layout computed directly at preview resolution so
 * nodes get real spacing instead of being squished from a bigger canvas.
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

  // Compute the layout directly at preview resolution (landscape, with
  // headroom) instead of computing for a big canvas and scaling down —
  // that's what caused the cramped/overlapping dots before.
  const PREVIEW_W = 520;
  const PREVIEW_H = 190;

  const layout = useMemo(
    () => computeHierarchicalLayout(nodes, links, {
      width: PREVIEW_W,
      height: PREVIEW_H,
    }),
    [nodes, links]
  );

  if (!topology || nodes.length === 0) return null;

  const name = topology?.topology_data?.name || topology?.name || 'Topology';
  const nodeCount = topology?.topology_data?.node_count || nodes.length;
  const linkCount = topology?.topology_data?.link_count || links.length;

  return (
    <>
      <div
        className="rounded-2xl overflow-hidden transition-colors hover:border-white/[0.1]"
        style={{
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Header row */}
        <div
          className="flex items-center gap-2.5 px-4 py-3 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.1)' }}
          >
            <Network size={13} className="text-emerald-400" />
          </div>
          <span className="text-[13.5px] font-medium text-white/90 truncate flex-1">{name}</span>
          <span
            className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-300 rounded-full px-2 py-0.5 flex-shrink-0"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <Check size={10} strokeWidth={3} />
            Ready
          </span>
        </div>

        {/* Preview panel — full-width landscape, real spacing */}
        <div
          className="relative mx-4 mt-4 rounded-xl overflow-hidden"
          style={{
            background: 'radial-gradient(ellipse at 50% 30%, rgba(16,185,129,0.06), transparent 65%), rgba(0,0,0,0.28)',
            border: '1px solid rgba(255,255,255,0.06)',
            height: '150px',
          }}
        >
          {/* Faint dot grid */}
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
              backgroundSize: '14px 14px',
            }}
          />
          <svg viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} className="relative w-full h-full" preserveAspectRatio="xMidYMid meet">
            {/* Edges */}
            {layout.edges.map((e, i) => (
              <line
                key={i}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke="#71717a"
                strokeWidth="1.1"
                opacity="0.4"
                strokeLinecap="round"
              />
            ))}
            {/* Nodes with soft glow ring */}
            {layout.positionedNodes.map((n) => {
              const color = getNodeColor(n);
              return (
                <g key={n.node_id}>
                  <circle cx={n.x} cy={n.y} r="9" fill={color} opacity="0.15" />
                  <circle cx={n.x} cy={n.y} r="4.5" fill={color} stroke="rgba(10,11,13,0.9)" strokeWidth="1.5" />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Stats + action */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex items-baseline gap-2.5">
            <span className="text-lg font-semibold text-white/95">{nodeCount}</span>
            <span className="text-[11.5px] text-zinc-500">devices</span>
            <span className="text-zinc-700">·</span>
            <span className="text-lg font-semibold text-white/95">{linkCount}</span>
            <span className="text-[11.5px] text-zinc-500">links</span>
          </div>
          <button
            onClick={() => setShowFull(true)}
            className="inline-flex items-center gap-1.5 rounded-lg text-zinc-300 hover:text-white text-[12.5px] font-medium px-3 py-1.5 transition-all flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
          >
            <Maximize2 size={12} />
            View full topology
          </button>
        </div>
        <p className="px-4 pb-3.5 -mt-2 text-[11.5px] text-zinc-500 leading-relaxed">
          Review the generated topology, then ask for changes or approve &amp; export.
        </p>
      </div>

      {showFull && (
        <TopologyFullCanvas topology={topology} onClose={() => setShowFull(false)} />
      )}
    </>
  );
}