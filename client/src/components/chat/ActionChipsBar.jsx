import { useState } from 'react';
import { Network, ShieldCheck, Server, BookOpen } from 'lucide-react';

const CHIPS = [
  {
    id: 'design', label: 'Design', icon: Network,
    prompts: [
      'Create a campus network with 3 VLANs and internet access',
      'Build a small office network with a firewall and VPN',
      'Design a multi-branch enterprise with WAN links',
      'Create a home lab with pfSense, NAT, and 2 VLANs',
    ],
  },
  {
    id: 'secure', label: 'Secure', icon: ShieldCheck,
    prompts: [
      'Design a campus with ZBF, DAI, and Port Security',
      'Build a perimeter network with TCP Intercept and uRPF',
      'Create a DMZ with Zone-Based Firewall between inside and outside',
      'Design a multi-VLAN network with SNMPv3 and NTP authentication',
    ],
  },
  {
    id: 'modernize', label: 'Modernize', icon: Server,
    prompts: [
      'Design a spine-leaf data center with 4 spines and 8 leaves',
      'Build a BGP fabric with Arista vEOS and VXLAN',
      'Create a Cisco Nexus 9000v EVPN topology',
      'Design a Cumulus VX L3 fabric with BGP unnumbered',
    ],
  },
  {
    id: 'learn', label: 'Learn', icon: BookOpen,
    prompts: [
      'How do I configure OSPF MD5 authentication?',
      'Explain VLAN trunking and native VLAN best practices',
      'What is the difference between ZBF and CBAC?',
      'Show me DHCP Snooping and DAI configuration',
    ],
  },
];

export default function ActionChipsBar({ onPromptSelect }) {
  const [expandedId, setExpandedId] = useState(null);

  const handleToggle = (id) => setExpandedId((prev) => (prev === id ? null : id));
  const handlePromptClick = (prompt) => { onPromptSelect(prompt); setExpandedId(null); };

  return (
    <div>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {CHIPS.map((chip) => {
          const Icon = chip.icon;
          const isExpanded = expandedId === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => handleToggle(chip.id)}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-all"
              style={isExpanded
                ? { background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' }
                : { background: 'rgba(255,255,255,0.03)', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <Icon size={13} />
              {chip.label}
            </button>
          );
        })}
      </div>

      {expandedId && (
        <div className="mt-3 max-w-lg mx-auto animate-fade-in-up">
          <div className="rounded-2xl overflow-hidden border border-white/[0.07]" style={{ background: 'rgba(255,255,255,0.02)' }}>
            {CHIPS.find((c) => c.id === expandedId).prompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handlePromptClick(prompt)}
                className="w-full text-left px-4 py-3 text-[13.5px] text-zinc-400 hover:text-white hover:bg-white/[0.04] border-b border-white/[0.05] last:border-b-0 transition-colors flex items-start gap-3"
              >
                <span className="text-zinc-600 mt-0.5 font-mono text-[11px]">{String(i + 1).padStart(2, '0')}</span>
                <span className="flex-1">{prompt}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}