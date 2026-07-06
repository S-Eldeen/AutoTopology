import { useState } from 'react';
import { Network, ShieldCheck, Server, BookOpen, Download, Pencil } from 'lucide-react';

/**
 * ActionChipsBar — 4 chips below the empty-state input.
 *
 * Context-aware:
 *   - No topology:  Design, Secure, Modernize, Learn
 *   - Topology exists: Export, Secure, Modify, Learn
 *
 * Behavior:
 *   - Only one chip can be expanded at a time
 *   - Click a chip → expands inline below (prompt examples appear)
 *   - Click again → collapses
 *   - Click another chip → first collapses, second expands
 *   - Click a prompt → calls onPromptSelect(prompt) which fills the input
 */

// ── Chip definitions ────────────────────────────────────────
const DEFAULT_CHIPS = [
  {
    id: 'design',
    label: 'Design',
    icon: Network,
    prompts: [
      'Create a campus network with 3 VLANs and internet access',
      'Build a small office network with a firewall and VPN',
      'Design a multi-branch enterprise with WAN links',
      'Create a home lab with pfSense, NAT, and 2 VLANs',
    ],
  },
  {
    id: 'secure',
    label: 'Secure',
    icon: ShieldCheck,
    prompts: [
      'Design a campus with ZBF, DAI, and Port Security',
      'Build a perimeter network with TCP Intercept and uRPF',
      'Create a DMZ with Zone-Based Firewall between inside and outside',
      'Design a multi-VLAN network with SNMPv3 and NTP authentication',
    ],
  },
  {
    id: 'modernize',
    label: 'Modernize',
    icon: Server,
    prompts: [
      'Design a spine-leaf data center with 4 spines and 8 leaves',
      'Build a BGP fabric with Arista vEOS and VXLAN',
      'Create a Cisco Nexus 9000v EVPN topology',
      'Design a Cumulus VX L3 fabric with BGP unnumbered',
    ],
  },
  {
    id: 'learn',
    label: 'Learn',
    icon: BookOpen,
    prompts: [
      'How do I configure OSPF MD5 authentication?',
      'Explain VLAN trunking and native VLAN best practices',
      'What is the difference between ZBF and CBAC?',
      'Show me DHCP Snooping and DAI configuration',
    ],
  },
];

// ── Swaps when topology exists ───────────────────────────────
const TOPOLOGY_CHIPS = [
  {
    id: 'export',
    label: 'Export',
    icon: Download,
    prompts: [
      'This looks good. Generate the configurations and export the GNS3 project.',
      'Export the current topology with enterprise security profile.',
      'Generate the deployment kit with full Cisco IOS configs.',
      'Create the .gns3project file and image manifest.',
    ],
  },
  DEFAULT_CHIPS[1], // Secure (keep)
  {
    id: 'modify',
    label: 'Modify',
    icon: Pencil,
    prompts: [
      'Add a firewall between the core switch and the edge router',
      'Remove PC3 and rebalance the VLAN assignments',
      'Add a redundant link between the core switches',
      'Replace the access switches with Nexus 9000v',
    ],
  },
  DEFAULT_CHIPS[3], // Learn (keep)
];

export default function ActionChipsBar({ hasTopology, onPromptSelect }) {
  const [expandedId, setExpandedId] = useState(null);
  const chips = hasTopology ? TOPOLOGY_CHIPS : DEFAULT_CHIPS;

  const handleToggle = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handlePromptClick = (prompt) => {
    onPromptSelect(prompt);
    setExpandedId(null); // collapse after selecting
  };

  return (
    <div>
      {/* ── Chip row ────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {chips.map((chip) => {
          const Icon = chip.icon;
          const isExpanded = expandedId === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => handleToggle(chip.id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all shadow-sm ${
                isExpanded
                  ? 'bg-emerald-600 text-white border border-emerald-500'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <Icon size={14} />
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Expanded prompts (inline below chips) ───────── */}
      {expandedId && (
        <div className="mt-4 max-w-xl mx-auto animate-fade-in-up">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {chips
              .find((c) => c.id === expandedId)
              .prompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handlePromptClick(prompt)}
                  className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition-colors flex items-start gap-3 group"
                >
                  <span className="text-slate-400 group-hover:text-emerald-600 transition-colors mt-0.5">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="flex-1">{prompt}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
