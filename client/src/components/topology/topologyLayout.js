/**
 * topologyLayout.js — Hierarchical layered layout for network topologies.
 *
 * 6-TIER HIERARCHY (top → bottom):
 *   Layer 0: Internet / NAT / Cloud
 *   Layer 1: Firewalls (ASAv, vSRX, FortiGate, Palo Alto, pfSense)
 *   Layer 2: Routers (Dynamips, IOU L3, IOSv, CSR1000v, vMX)
 *   Layer 3: Switches (Ethernet Switch, IOU L2, IOSv-L2, vEOS, Cumulus, OVS)
 *   Layer 4: Servers (Alpine, Ubuntu, Kali, Windows, DHCP/Web/SIEM hosts)
 *   Layer 5: Endpoints (VPCS, hosts, phones)
 *
 * Classification uses node_type + template_name first (Python sets these
 * reliably), with name patterns as a fallback. Switches are detected by
 * "-sw", "_sw", starts-with-"sw", or contains-"switch" in the name so
 * names like "Core-SW1", "Access-SW2", "ISP-SW" are correctly classified.
 */

// ── Node classification ────────────────────────────────────
export function getNodeTier(node, linkCount = 0) {
  const t = (node.node_type || '').toLowerCase();
  const tmpl = (node.template_name || '').toLowerCase();
  const n = (node.name || '').toLowerCase();

  // ── Layer 0: Internet / NAT / Cloud ─────────────────────
  if (t === 'nat') return 0;
  if (t === 'cloud') return 0;
  if (tmpl === 'nat') return 0;
  if (n.startsWith('nat') && !n.startsWith('nat-sw')) return 0;

  // ── Layer 1: Firewalls ──────────────────────────────────
  if (t.includes('firewall')) return 1;
  if (tmpl.includes('asav') || tmpl.includes('vsrx') || tmpl.includes('fortigate')
      || tmpl.includes('palo') || tmpl.includes('checkpoint') || tmpl.includes('pfsense')) return 1;
  if (n.includes('fw') || n.includes('firewall') || n.includes('asav')) return 1;

  // ── Layer 3: Switches (check BEFORE routers — QEMU/IOU can be switches) ──
  if (t === 'ethernet_switch') return 3;
  if (tmpl.includes('iou l2') || tmpl.includes('iou-l2')) return 3;
  if (tmpl.includes('iosv-l2') || tmpl.includes('iosv_l2')) return 3;
  if (tmpl.includes('veos') || tmpl.includes('arista')) return 3;
  if (tmpl.includes('cumulus')) return 3;
  if (tmpl.includes('os10') || tmpl.includes('dell')) return 3;
  if (tmpl.includes('ovs') && !tmpl.includes('docker')) return 3;
  if (n.includes('-sw') || n.includes('_sw') || n.startsWith('sw') || n.includes('switch')) return 3;

  // ── Layer 2: Routers (L3) ───────────────────────────────
  if (t === 'dynamips') return 2;
  if (t === 'iou') return 2;
  if (t === 'qemu') return 2;
  if (t.includes('router') || n.match(/^r\d/)) return 2;

  // ── Layer 4: Servers (VMs that aren't routers/switches/firewalls) ──
  // Alpine, Ubuntu, Kali, Windows — and name patterns like "SRV", "Server", "DHCP", "Web", "SIEM"
  if (tmpl.includes('alpine') || tmpl.includes('ubuntu') || tmpl.includes('kali') || tmpl.includes('windows')) return 4;
  if (n.includes('srv') || n.includes('server') || n.includes('dhcp') || n.includes('web') || n.includes('siem')) return 4;

  // ── Layer 5: Endpoints (PCs / VPCS / phones) ────────────
  if (t === 'vpcs') return 5;
  if (t === 'ethernet_hub') return 5;
  if (t.includes('pc') || n.startsWith('pc') || n.startsWith('host') || n.includes('phone')) return 5;
  if (tmpl.includes('vpcs')) return 5;

  // ── Docker: check name ──────────────────────────────────
  if (t === 'docker') {
    if (n.includes('-sw') || n.startsWith('sw') || n.includes('switch')) return 3;
    if (n.includes('fw') || n.includes('firewall')) return 1;
    if (n.includes('srv') || n.includes('server')) return 4;
    if (n.startsWith('pc') || n.startsWith('host')) return 5;
    return 2;
  }

  // ── Fallback: place by link count ───────────────────────
  if (linkCount >= 4) return 2;
  if (linkCount >= 2) return 3;
  return 5;
}

// ── Node color by tier (matches reference design) ──────────
export function getNodeColor(node) {
  const tier = getNodeTier(node);
  // 0=NAT(orange), 1=Firewall(red), 2=Router(blue), 3=Switch(teal), 4=Server(gray-blue), 5=Endpoint(gray)
  const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#22d3ee', '#8b5cf6', '#94a3b8'];
  return colors[tier] || '#64748b';
}

// ── Node role label ────────────────────────────────────────
export function getNodeRole(node) {
  const tier = getNodeTier(node);
  return ['Internet / NAT', 'Firewall', 'Router', 'Switch', 'Server', 'Endpoint'][tier] || 'Other';
}

// ── Main layout function ───────────────────────────────────
/**
 * Compute a hierarchical layered layout for a topology.
 *
 * @param {Array} nodes  — topology_dict.topology.nodes
 * @param {Array} links  — topology_dict.topology.links (each has .nodes[2] with .node_id)
 * @param {Object} opts  — { width, height, nodeWidth, nodeHeight, layerGap }
 * @returns {{ positionedNodes: Array, edges: Array, layers: Array }}
 *   - positionedNodes: nodes with { x, y } added
 *   - edges: links with { x1, y1, x2, y2, source_id, target_id } added
 *   - layers: array of { tier, layerIdx, label } for rendering layer labels
 */
export function computeHierarchicalLayout(nodes = [], links = [], opts = {}) {
  if (!nodes.length) return { positionedNodes: [], edges: [], layers: [] };

  const {
    width = 1000,
    height = 700,
  } = opts;

  // ── Count links per node (for tier fallback + ordering) ──
  const linkCountByNode = new Map();
  for (const l of links) {
    const a = l.nodes?.[0]?.node_id;
    const b = l.nodes?.[1]?.node_id;
    if (a) linkCountByNode.set(a, (linkCountByNode.get(a) || 0) + 1);
    if (b) linkCountByNode.set(b, (linkCountByNode.get(b) || 0) + 1);
  }

  // ── Assign each node to a tier ───────────────────────────
  const nodesWithTier = nodes.map(n => ({
    ...n,
    tier: getNodeTier(n, linkCountByNode.get(n.node_id) || 0),
    _linkCount: linkCountByNode.get(n.node_id) || 0,
  }));

  // ── Group nodes by tier ──────────────────────────────────
  const tierGroups = {};
  for (const n of nodesWithTier) {
    if (!tierGroups[n.tier]) tierGroups[n.tier] = [];
    tierGroups[n.tier].push(n);
  }

  // Sort within each tier: by link count descending (most-connected first,
  // tends to center hub devices), then alphabetically.
  for (const tier of Object.keys(tierGroups)) {
    tierGroups[tier].sort((a, b) => {
      if (b._linkCount !== a._linkCount) return b._linkCount - a._linkCount;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  // ── Compress tier numbers (skip empty tiers) ─────────────
  const usedTiers = Object.keys(tierGroups).map(Number).sort((a, b) => a - b);
  const tierRemap = {};
  usedTiers.forEach((t, i) => { tierRemap[t] = i; });

  const numLayers = usedTiers.length;
  const topPad = 70;
  const bottomPad = 60;
  const usableHeight = height - topPad - bottomPad;
  const vGap = numLayers > 1 ? usableHeight / (numLayers - 1) : 0;

  // ── Position nodes: spread each tier horizontally ────────
  const positionedNodes = [];
  for (const originalTier of usedTiers) {
    const layerIdx = tierRemap[originalTier];
    const y = topPad + layerIdx * vGap;
    const group = tierGroups[originalTier];
    const count = group.length;

    const sidePad = 80;
    const usableWidth = width - 2 * sidePad;
    const hGap = count > 1 ? usableWidth / (count - 1) : 0;
    const startX = count > 1 ? sidePad : width / 2;

    group.forEach((n, i) => {
      positionedNodes.push({
        ...n,
        tier: originalTier,
        layerIdx,
        x: count > 1 ? startX + i * hGap : width / 2,
        y,
      });
    });
  }

  // ── Build edges with straight-line coordinates ───────────
  // Each link has .nodes[0].node_id and .nodes[1].node_id — match to positions.
  const nodeById = new Map(positionedNodes.map(n => [n.node_id, n]));
  const edges = links.map((l, i) => {
    const a = l.nodes?.[0]?.node_id;
    const b = l.nodes?.[1]?.node_id;
    const na = nodeById.get(a);
    const nb = nodeById.get(b);
    if (!na || !nb) return null;  // skip links to unknown nodes
    return {
      id: i,
      source_id: a,
      target_id: b,
      x1: na.x,
      y1: na.y,
      x2: nb.x,
      y2: nb.y,
    };
  }).filter(Boolean);

  return {
    positionedNodes,
    edges,
    layers: usedTiers.map(t => ({ tier: t, layerIdx: tierRemap[t], label: tierLabel(t) })),
  };
}

// ── Tier → human label ─────────────────────────────────────
function tierLabel(tier) {
  const labels = {
    0: 'Internet / NAT',
    1: 'Security',
    2: 'Routers',
    3: 'Switches',
    4: 'Servers',
    5: 'Endpoints',
  };
  return labels[tier] || `Layer ${tier}`;
}

// ── Legend data ────────────────────────────────────────────
export const TOPOLOGY_LEGEND = [
  { label: 'Internet / NAT', color: '#f59e0b' },
  { label: 'Firewall',       color: '#ef4444' },
  { label: 'Router',         color: '#3b82f6' },
  { label: 'Switch',         color: '#22d3ee' },
  { label: 'Server',         color: '#8b5cf6' },
  { label: 'PC / Host',      color: '#94a3b8' },
];
