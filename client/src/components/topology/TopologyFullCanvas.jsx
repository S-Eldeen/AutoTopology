/**
 * Full-canvas topology viewer — full-screen modal.
 *
 * Clean hierarchical design (matches reference):
 *  - 6-tier vertical layout: NAT → Firewall → Router → Switch → Server → Endpoint
 *  - Solid teal straight edges (no curves, no animation, no gradient)
 *  - Plain SVG node cards (no foreignObject — faster, cleaner)
 *  - Draggable nodes (pointer events), zoom/pan (d3-zoom on background)
 *  - Click a node to inspect details in the right panel
 *  - Layer labels on the left edge, color-coded legend
 *
 * Removed (unnecessary per design review):
 *  - Animated dashed flow on edges (visual noise)
 *  - Gradient edge stroke (use solid teal)
 *  - Selection ping ring animation (use a simple highlight ring)
 *  - foreignObject + HTML divs for nodes (use plain SVG rect + text)
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import { X, Sun, Moon, Download, Cpu, Network, Shield, Globe, Monitor, Server, Cloud } from 'lucide-react';
import {
  computeHierarchicalLayout,
  getNodeColor,
  getNodeRole,
} from './topologyLayout.js';

function NodeIcon({ node }) {
  const role = getNodeRole(node);
  switch (role) {
    case 'Internet / NAT': return <Globe size={15} />;
    case 'Firewall':       return <Shield size={15} />;
    case 'Router':         return <Cpu size={15} />;
    case 'Switch':         return <Network size={15} />;
    case 'Server':         return <Server size={15} />;
    case 'Endpoint':       return <Monitor size={15} />;
    default:               return <Server size={15} />;
  }
}

const NODE_W = 140;
const NODE_H = 42;
const EDGE_COLOR_DARK = '#22d3ee';   // teal on dark bg
const EDGE_COLOR_LIGHT = '#0891b2';  // darker teal on light bg (better contrast)

export default function TopologyFullCanvas({ topology, onClose }) {
  const svgRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [positions, setPositions] = useState({});
  const [lightMode, setLightMode] = useState(false);

  // Theme-derived colors — switched based on lightMode
  const theme = lightMode ? {
    bg: '#f8fafc',           // slate-50
    panelBg: 'rgba(255,255,255,0.95)',
    panelBorder: '#e2e8f0',  // slate-200
    text: '#0f172a',         // slate-900
    textMuted: '#475569',    // slate-600
    textSubtle: '#94a3b8',   // slate-400
    cardBg: 'rgba(255,255,255,0.98)',
    cardBorder: '#cbd5e1',   // slate-300
    cardBorderSelected: '#10b981',
    nodeText: '#0f172a',     // slate-900
    nodeSubtext: '#475569',  // slate-600
    layerLabel: '#64748b',   // slate-500
    edge: EDGE_COLOR_LIGHT,
    edgeSelected: '#059669', // emerald-600
    gridColor: '%2334d399',
    gridOpacity: '0.12',
    headerBg: 'rgba(255,255,255,0.9)',
    headerBorder: '#e2e8f0',
    kbdBg: 'rgba(241,245,249,0.8)',  // slate-100
    kbdBorder: '#cbd5e1',
  } : {
    bg: '#09090b',           // zinc-950
    panelBg: 'rgba(24,24,27,0.8)',   // zinc-900
    panelBorder: '#3f3f46',  // zinc-700
    text: '#ffffff',
    textMuted: '#a1a1aa',    // zinc-400
    textSubtle: '#71717a',   // zinc-500
    cardBg: 'rgba(24,24,27,0.96)',
    cardBorder: 'rgba(63,63,70,0.9)',
    cardBorderSelected: '#10b981',
    nodeText: '#fafafa',
    nodeSubtext: '#a1a1aa',
    layerLabel: '#52525b',   // zinc-600
    edge: EDGE_COLOR_DARK,
    edgeSelected: '#34d399',
    gridColor: '%2334d399',
    gridOpacity: '0.08',
    headerBg: 'rgba(24,24,27,0.8)',
    headerBorder: '#27272a', // zinc-800
    kbdBg: 'rgba(39,39,42,0.6)',   // zinc-800
    kbdBorder: '#3f3f46',
  };

  const nodes = useMemo(
    () => topology?.topology_dict?.topology?.nodes || [],
    [topology]
  );
  const links = useMemo(
    () => topology?.topology_dict?.topology?.links || [],
    [topology]
  );

  const layout = useMemo(
    () => computeHierarchicalLayout(nodes, links, {
      width: 1100, height: 720, nodeWidth: NODE_W, nodeHeight: NODE_H,
    }),
    [nodes, links]
  );

  // ── Persist rearranged node positions to localStorage ─────────────
  // Keyed by topologyId so each topology remembers its own layout.
  // When the user drags nodes, we save positions; on reopen, we restore them.
  const topoId = topology?.topologyId || topology?.topology_data?.name || 'default';
  const STORAGE_KEY = `structuranet:topo-positions:${topoId}`;

  // Initialize positions: load from localStorage if present, else use layout
  useEffect(() => {
    let saved = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch { /* ignore corrupt storage */ }

    const newPos = {};
    layout.positionedNodes.forEach(n => {
      // Use saved position if it exists for this node, else use computed layout
      newPos[n.node_id] = (saved && saved[n.node_id])
        ? saved[n.node_id]
        : { x: n.x, y: n.y };
    });
    setPositions(newPos);
  }, [layout, STORAGE_KEY]);

  // Save positions to localStorage whenever they change (debounced via effect)
  useEffect(() => {
    if (Object.keys(positions).length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch { /* storage full or unavailable — ignore */ }
  }, [positions, STORAGE_KEY]);

  // ── Edges: straight lines, connect to top/bottom edge of cards ──
  const edges = useMemo(() => {
    return links.map((l, i) => {
      const a = l.nodes?.[0]?.node_id;
      const b = l.nodes?.[1]?.node_id;
      const pa = positions[a];
      const pb = positions[b];
      if (!pa || !pb) return null;
      const aIsHigher = pa.y < pb.y;
      const halfH = NODE_H / 2;
      return {
        id: i,
        source_id: a, target_id: b,
        x1: pa.x, y1: aIsHigher ? pa.y + halfH : pa.y - halfH,
        x2: pb.x, y2: aIsHigher ? pb.y - halfH : pb.y + halfH,
      };
    }).filter(Boolean);
  }, [links, positions]);

  // ── d3-zoom on the SVG background (pan + scroll-to-zoom) ──────────
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    const z = zoom().scaleExtent([0.3, 3]).on('zoom', (event) => {
      svg.select('g.zoom-layer').attr('transform', event.transform);
    });
    svg.call(z);
    svg.call(z.transform, zoomIdentity);
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Node dragging (pointer events) ────────────────────────────────
  const dragRef = useRef(null);

  const onNodePointerDown = useCallback((e, nodeId) => {
    e.stopPropagation();
    e.preventDefault();
    const pt = positions[nodeId];
    if (!pt) return;
    dragRef.current = {
      nodeId,
      startClientX: e.clientX, startClientY: e.clientY,
      startNodeX: pt.x, startNodeY: pt.y,
    };
    e.target.setPointerCapture?.(e.pointerId);
  }, [positions]);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const g = svg.querySelector('g.zoom-layer');
    const ctm = g.getScreenCTM();
    if (!ctm) return;
    const inv = ctm.inverse();
    const svgP = pt.matrixTransform(inv);
    pt.x = d.startClientX; pt.y = d.startClientY;
    const startSvgP = pt.matrixTransform(inv);
    const dx = svgP.x - startSvgP.x;
    const dy = svgP.y - startSvgP.y;
    setPositions(prev => ({
      ...prev,
      [d.nodeId]: { x: d.startNodeX + dx, y: d.startNodeY + dy },
    }));
  }, []);

  const onPointerUp = useCallback((e) => {
    if (dragRef.current) {
      e.target.releasePointerCapture?.(e.pointerId);
      dragRef.current = null;
    }
  }, []);

  const name = topology?.topology_data?.name || 'Topology';
  const nodeCount = topology?.topology_data?.node_count || nodes.length;
  const linkCount = topology?.topology_data?.link_count || links.length;

  // ── Download the topology as a high-quality PDF ───────────────────
  // Approach: serialize the SVG (clone it, strip foreignObject which doesn't
  // render to canvas reliably, reset the zoom transform), convert to a PNG
  // via a canvas at 2x resolution, then embed the PNG in a single-page PDF
  // using jsPDF.
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadPDF = useCallback(async () => {
    if (!svgRef.current || pdfLoading) return;
    setPdfLoading(true);
    try {
      // ── Compute the bounding box of all nodes (including dragged positions) ──
      // This ensures the PDF canvas is sized to fit every node + padding, so
      // nothing gets clipped at the edges. We use the live `positions` state
      // (which reflects any drag rearrangement the user has done).
      const posValues = Object.values(positions);
      if (posValues.length === 0) throw new Error('No nodes to export');

      const xs = posValues.map(p => p.x);
      const ys = posValues.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      // Padding around the content (accounts for node card width/height + margin)
      const pad = 100;
      const contentW = (maxX - minX) + pad * 2;
      const contentH = (maxY - minY) + pad * 2;
      // Offset to shift all nodes so minX → pad, minY → pad (top-left origin)
      const offsetX = pad - minX;
      const offsetY = pad - minY;

      // ── Clone the SVG and prepare it for export ──────────────────────
      const origSvg = svgRef.current;
      const clone = origSvg.cloneNode(true);

      // Remove foreignObject elements (lucide icons) — they don't serialize
      // reliably to canvas and can taint the canvas in some browsers.
      clone.querySelectorAll('foreignObject').forEach(fo => fo.remove());

      // Apply a translate transform to the zoom-layer so all nodes shift
      // into the visible canvas area (offset by offsetX/offsetY)
      const zoomLayer = clone.querySelector('g.zoom-layer');
      if (zoomLayer) {
        zoomLayer.setAttribute('transform', `translate(${offsetX}, ${offsetY}) scale(1)`);
      }

      // Set the SVG dimensions to fit the content bounding box
      clone.setAttribute('width', contentW);
      clone.setAttribute('height', contentH);
      clone.setAttribute('viewBox', `0 0 ${contentW} ${contentH}`);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      // Insert a background rect as the first child
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('x', '0');
      bgRect.setAttribute('y', '0');
      bgRect.setAttribute('width', contentW);
      bgRect.setAttribute('height', contentH);
      bgRect.setAttribute('fill', lightMode ? '#f8fafc' : '#09090b');
      clone.insertBefore(bgRect, clone.firstChild);

      const svgStr = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      // Load the SVG into an Image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to render SVG to image'));
        img.src = svgUrl;
      });

      // 2x resolution for crisp output
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = contentW * scale;
      canvas.height = contentH * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = lightMode ? '#f8fafc' : '#09090b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);

      const pngDataUrl = canvas.toDataURL('image/png');

      // ── Build the PDF with jsPDF ─────────────────────────────────────
      const { jsPDF } = await import('jspdf');

      // Choose orientation based on the content aspect ratio
      const isLandscape = contentW >= contentH;
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const pageW = isLandscape ? 297 : 210;
      const pageH = isLandscape ? 210 : 297;
      const margin = 10;
      const availW = pageW - 2 * margin;
      const availH = pageH - 2 * margin;

      // Scale the image to fit the page while preserving aspect ratio
      const imgRatio = contentW / contentH;
      const pageRatio = availW / availH;
      let drawW, drawH;
      if (imgRatio > pageRatio) {
        drawW = availW;
        drawH = availW / imgRatio;
      } else {
        drawH = availH;
        drawW = availH * imgRatio;
      }
      const pdfOffsetX = (pageW - drawW) / 2;
      const pdfOffsetY = (pageH - drawH) / 2;

      pdf.addImage(pngDataUrl, 'PNG', pdfOffsetX, pdfOffsetY, drawW, drawH);
      pdf.save(`${name.replace(/[^a-zA-Z0-9_-]/g, '_')}_topology.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert(`Failed to generate PDF: ${err.message}. Check the browser console for details.`);
    } finally {
      setPdfLoading(false);
    }
  }, [lightMode, name, pdfLoading, positions]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-fade-in"
      style={{ background: lightMode ? 'rgba(248,250,252,0.85)' : 'rgba(9,9,11,0.8)', backdropFilter: 'blur(12px)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b backdrop-blur-xl"
        style={{ background: theme.headerBg, borderColor: theme.headerBorder }}>
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/30 flex items-center justify-center">
            <Network size={18} />
          </div>
          <div>
            <h2 className="font-semibold leading-none" style={{ color: theme.text }}>{name}</h2>
            <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
              {nodeCount} devices · {linkCount} links · Drag nodes to rearrange · Click for details
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Download as PDF */}
          <button
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors border disabled:opacity-50 disabled:cursor-wait"
            style={{
              background: lightMode ? '#fff' : 'rgba(39,39,42,0.6)',
              borderColor: lightMode ? '#cbd5e1' : '#3f3f46',
              color: lightMode ? '#475569' : '#a1a1aa',
            }}
            aria-label="Download as PDF"
            title="Download as PDF"
          >
            {pdfLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download size={15} />
            )}
            <span className="hidden sm:inline">{pdfLoading ? 'Generating…' : 'PDF'}</span>
          </button>
          {/* Light/Dark mode toggle */}
          <button
            onClick={() => setLightMode(!lightMode)}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors"
            style={{
              background: lightMode ? '#fff' : 'rgba(39,39,42,0.6)',
              borderColor: lightMode ? '#cbd5e1' : '#3f3f46',
              color: lightMode ? '#475569' : '#a1a1aa',
            }}
            aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            title={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {lightMode ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] rounded-md px-2.5 py-1.5 ring-1 ring-inset"
            style={{ color: theme.textMuted, background: theme.kbdBg, borderColor: theme.kbdBorder }}>
            <kbd className="font-mono" style={{ color: theme.text }}>Scroll</kbd> zoom ·
            <kbd className="font-mono ml-1" style={{ color: theme.text }}>Drag bg</kbd> pan ·
            <kbd className="font-mono ml-1" style={{ color: theme.text }}>Esc</kbd> close
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white text-zinc-900 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 active:scale-[0.98] transition-all shadow-sm"
          >
            <X size={16} />
            Close
          </button>
        </div>
      </header>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden" style={{ background: theme.bg }}>
        {/* Grid background */}
        <div className="absolute inset-0" style={{
          opacity: lightMode ? 0.5 : 0.3,
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none' stroke='${theme.gridColor}' stroke-opacity='${theme.gridOpacity}' stroke-width='1'/%3E%3C/svg%3E")`,
        }} />

        <svg
          ref={svgRef}
          className="w-full h-full relative"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <g className="zoom-layer">
            {/* ── Layer labels (left edge) ─────────────────────── */}
            {layout.layers.map((layer) => {
              const sample = layout.positionedNodes.find(n => n.layerIdx === layer.layerIdx);
              if (!sample) return null;
              return (
                <text key={layer.tier} x={20} y={sample.y}
                  fill={theme.layerLabel} fontSize="11" fontWeight="600" fontStyle="italic"
                  dominantBaseline="middle">
                  {layer.label}
                </text>
              );
            })}

            {/* ── Edges (solid teal straight lines) ───────────── */}
            {edges.map((e) => {
              const involves = selected && (e.source_id === selected.node_id || e.target_id === selected.node_id);
              return (
                <line key={e.id} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                  stroke={involves ? theme.edgeSelected : theme.edge}
                  strokeWidth={involves ? 2.5 : 1.6}
                  strokeLinecap="round"
                  opacity={involves ? 0.95 : 0.6}
                  style={{ pointerEvents: 'none' }}
                />
              );
            })}

            {/* ── Nodes (plain SVG cards — no foreignObject) ───── */}
            {layout.positionedNodes.map((n) => {
              const pos = positions[n.node_id] || { x: n.x, y: n.y };
              const color = getNodeColor(n);
              const isSelected = selected?.node_id === n.node_id;
              return (
                <g key={n.node_id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => onNodePointerDown(e, n.node_id)}
                  onClick={(e) => { e.stopPropagation(); setSelected(n); }}
                >
                  {/* selection highlight ring (simple, no animation) */}
                  {isSelected && (
                    <rect x={-NODE_W/2 - 3} y={-NODE_H/2 - 3} width={NODE_W + 6} height={NODE_H + 6}
                      rx={11} fill="none" stroke={theme.cardBorderSelected} strokeWidth="1.5" opacity="0.8" />
                  )}
                  {/* card background */}
                  <rect x={-NODE_W/2} y={-NODE_H/2} width={NODE_W} height={NODE_H} rx={8}
                    fill={theme.cardBg}
                    stroke={isSelected ? theme.cardBorderSelected : theme.cardBorder}
                    strokeWidth="1"
                  />
                  {/* colored left accent bar */}
                  <rect x={-NODE_W/2} y={-NODE_H/2} width={4} height={NODE_H}
                    fill={color} rx={2} />
                  {/* icon chip (small circle with icon) */}
                  <circle cx={-NODE_W/2 + 22} cy={0} r={11}
                    fill={`${color}22`} />
                  <foreignObject x={-NODE_W/2 + 11} y={-8} width={22} height={22} style={{ pointerEvents: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color }}>
                      <NodeIcon node={n} />
                    </div>
                  </foreignObject>
                  {/* device name */}
                  <text x={-NODE_W/2 + 40} y={-3}
                    fill={theme.nodeText} fontSize="12" fontWeight="600"
                    dominantBaseline="middle"
                    style={{ pointerEvents: 'none' }}>
                    {n.name && n.name.length > 14 ? n.name.slice(0, 13) + '…' : n.name}
                  </text>
                  {/* template/type (smaller, gray) */}
                  <text x={-NODE_W/2 + 40} y={10}
                    fill={theme.nodeSubtext} fontSize="9"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    dominantBaseline="middle"
                    style={{ pointerEvents: 'none' }}>
                    {(n.template_name || n.node_type || '').slice(0, 18)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Stats */}
        <div className="absolute top-4 right-4 rounded-xl border shadow-xl backdrop-blur-xl px-4 py-2.5"
          style={{ background: theme.panelBg, borderColor: theme.panelBorder }}>
          <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: theme.textSubtle }}>Topology</div>
          <div className="text-sm font-semibold" style={{ color: theme.text }}>
            {nodeCount} <span style={{ color: theme.textMuted, fontWeight: 'normal' }}>nodes</span>
            <span className="mx-1.5" style={{ color: theme.textSubtle }}>·</span>
            {linkCount} <span style={{ color: theme.textMuted, fontWeight: 'normal' }}>links</span>
          </div>
          <div className="text-[10px] mt-1" style={{ color: theme.textSubtle }}>Drag any node to rearrange</div>
        </div>

        {/* Node detail panel */}
        {selected && (
          <div className="absolute top-0 right-0 h-full w-80 backdrop-blur-xl border-l shadow-2xl animate-fade-in-up overflow-y-auto"
            style={{ background: theme.panelBg, borderColor: theme.panelBorder }}>
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ background: getNodeColor(selected) }}>
                    <NodeIcon node={selected} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base leading-none" style={{ color: theme.text }}>{selected.name}</h3>
                    <p className="text-xs mt-1" style={{ color: theme.textSubtle }}>{getNodeRole(selected)}</p>
                  </div>
                </div>
                <button onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: theme.textSubtle }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = lightMode ? '#f1f5f9' : '#27272a'; e.currentTarget.style.color = theme.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.textSubtle; }}
                >
                  <X size={18} />
                </button>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3 py-2 border-b" style={{ borderColor: theme.panelBorder }}>
                  <dt className="font-medium" style={{ color: theme.textSubtle }}>Node ID</dt>
                  <dd className="font-mono truncate" style={{ color: theme.textMuted }}>{selected.node_id}</dd>
                </div>
                <div className="flex justify-between gap-3 py-2 border-b" style={{ borderColor: theme.panelBorder }}>
                  <dt className="font-medium" style={{ color: theme.textSubtle }}>Type</dt>
                  <dd style={{ color: theme.textMuted }}>{selected.node_type}</dd>
                </div>
                {selected.template_name && (
                  <div className="flex justify-between gap-3 py-2 border-b" style={{ borderColor: theme.panelBorder }}>
                    <dt className="font-medium" style={{ color: theme.textSubtle }}>Template</dt>
                    <dd className="font-mono truncate text-right" style={{ color: theme.textMuted }}>{selected.template_name}</dd>
                  </div>
                )}
                {selected.properties?._hardware_summary && (
                  <div className="py-2 border-b" style={{ borderColor: theme.panelBorder }}>
                    <dt className="font-medium mb-1" style={{ color: theme.textSubtle }}>Hardware</dt>
                    <dd className="text-xs" style={{ color: theme.textMuted }}>{selected.properties._hardware_summary}</dd>
                  </div>
                )}
                {selected.properties?._link_count !== undefined && (
                  <div className="flex justify-between gap-3 py-2 border-b" style={{ borderColor: theme.panelBorder }}>
                    <dt className="font-medium" style={{ color: theme.textSubtle }}>Links</dt>
                    <dd style={{ color: theme.textMuted }}>{selected.properties._link_count}</dd>
                  </div>
                )}
                {selected.properties?._image_required !== undefined && (
                  <div className="flex justify-between gap-3 py-2 border-b" style={{ borderColor: theme.panelBorder }}>
                    <dt className="font-medium" style={{ color: theme.textSubtle }}>Image Required</dt>
                    <dd style={{ color: selected.properties._image_required ? '#f59e0b' : '#10b981' }}>
                      {selected.properties._image_required ? 'Yes' : 'No (builtin)'}
                    </dd>
                  </div>
                )}
                {selected.properties?.startup_config_content && (
                  <div className="py-2">
                    <dt className="font-medium mb-2" style={{ color: theme.textSubtle }}>Startup Config</dt>
                    <dd>
                      <pre className="border rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-48"
                        style={{
                          background: lightMode ? '#f8fafc' : '#09090b',
                          borderColor: theme.panelBorder,
                          color: '#10b981',
                        }}>
                        {selected.properties.startup_config_content.slice(0, 500)}
                        {selected.properties.startup_config_content.length > 500 && '\n...'}
                      </pre>
                    </dd>
                  </div>
                )}
                {selected.properties?._interfaces && (
                  <div className="py-2">
                    <dt className="font-medium mb-2" style={{ color: theme.textSubtle }}>Interfaces ({selected.properties._interfaces.length})</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {selected.properties._interfaces.slice(0, 12).map((iface, i) => (
                        <span key={i} className="inline-flex items-center rounded-md font-mono text-[10px] px-2 py-1 border"
                          style={{
                            background: lightMode ? '#f1f5f9' : '#27272a',
                            color: theme.textMuted,
                            borderColor: theme.panelBorder,
                          }}>
                          {iface}
                        </span>
                      ))}
                      {selected.properties._interfaces.length > 12 && (
                        <span className="text-[10px] self-center" style={{ color: theme.textSubtle }}>+{selected.properties._interfaces.length - 12} more</span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
