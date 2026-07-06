import { useState } from 'react';
import { Network, ShieldCheck, Server, BookOpen, Download, Pencil } from 'lucide-react';

/**
 * ActionChipsBar — 4 chips below the empty-state input.
 *
 * Context-aware:
 *   - No topology:  Design, Secure, Modernize, Learn
 *   - Topology exists: Export, Secure, Modify, Learn
 *
 * Dark theme: glass-style chips matching the chat page design.
 */

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
    setExpandedId(null);
  };

  return (
    <div>
      {/* Chip row */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {chips.map((chip) => {
          const Icon = chip.icon;
          const isExpanded = expandedId === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => handleToggle(chip.id)}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all"
              style={
                isExpanded
                  ? { background: 'linear-gradient(180deg, #10b981, #0d9668)', color: '#fff', border: '1px solid rgba(16,185,129,0.4)' }
                  : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.08)' }
              }
              onMouseEnter={(e) => {
                if (!isExpanded) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.color = '#fff';
                }
              }}
              onMouseLeave={(e) => {
                if (!isExpanded) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }
              }}
            >
              <Icon size={14} />
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* Expanded prompts */}
      {expandedId && (
        <div className="mt-4 max-w-xl mx-auto animate-fade-in-up">
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {chips
              .find((c) => c.id === expandedId)
              .prompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handlePromptClick(prompt)}
                  className="w-full text-left px-4 py-3 text-sm transition-colors flex items-start gap-3 group"
                  style={{ borderBottom: i < chips.find((c) => c.id === expandedId).prompts.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', color: 'rgba(255,255,255,0.6)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.3)' }} className="mt-0.5">
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
