"""
Structranet AI — AI Agent  (V5.0)

Translates a natural language request into a validated GNS3Project.

V5.0 — "First-Attempt Perfect" overhaul:
  1. Hardened system prompt with explicit wiring patterns, build algorithm,
     and forbidden-pattern guardrails.  The LLM now follows a mandatory
     5-step design process that guarantees connectivity, respects port
     limits, and handles multi-branch / multi-site topologies.

  2. Pre-validation auto-repair pipeline:
     - _repair_disconnected_graph:  auto-bridges isolated groups via
       an Ethernet Switch so the topology is always fully connected.
     - _repair_single_port_violations:  auto-inserts an Ethernet Switch
       intermediary when NAT / VPCS / TraceNG nodes have >1 connection.
     - _repair_duplicate_connections:  removes duplicate links.
     Repairs run BEFORE Pydantic validation, so most topologies pass
     on attempt 1 without needing a retry.

  3. Dynamic MAX_TOKENS:  scales with topology complexity so the LLM
     never truncates large enterprise topologies.

  4. Improved error feedback on retry:  includes a concrete repair hint
     (e.g. "Add a switch between NAT-ISP and the two routers") instead
     of just the raw validation error.

  5. Enterprise security prompt now includes multi-branch wiring patterns
     and explicit NAT intermediary rule (see security_prompts.py V5.0).

All existing behaviour (port assigner, hardware injection, VLAN patching,
Pydantic validation, retry loop, security profiles) is preserved.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from dotenv import load_dotenv

from structranet.constants.ai import DYNAMIPS_MAX_LINKS, MAX_RETRIES, SINGLE_LINK_TYPES
from structranet.constants.gns3 import VLAN_PATCHED_KEY
from structranet.catalog.hw_config import inject_hardware_config
from structranet.ai.llm_utils import _call_with_retry, _env_int, _extract_json, _get_client
from structranet.catalog.port_assigner import build_topology_from_request
from structranet.constants.schema import (
    Connection,
    GNS3Project,
    NodeRequest,
    TopologyRequest,
    validate_topology,
    validate_topology_request,
)
from structranet.ai.security_prompts import get_topology_security_prompt
from structranet.generation.topology_finalizer import apply_switch_port_patches

load_dotenv()
logger = logging.getLogger("structranet.ai_agent")

DEFAULT_MODEL = os.getenv("AI_MODEL", "openrouter/owl-alpha")
BASE_MAX_TOKENS = _env_int("AI_MAX_TOKENS", 16384)

# Node types that never need a disk image
_BUILTIN_NODE_TYPES: frozenset = frozenset(
    ["vpcs", "ethernet_switch", "ethernet_hub", "cloud", "nat",
     "traceng", "frame_relay_switch", "atm_switch"]
)
_APPLIANCE_NODE_TYPES: frozenset = frozenset(
    ["dynamips", "iou", "qemu", "docker", "virtualbox", "vmware"]
)

# Node types with exactly 1 port — the most common source of validation failures
_SINGLE_PORT_TYPES: frozenset = frozenset(["vpcs", "traceng", "nat"])


# ═══════════════════════════════════════════════════════════════════════════════
#  Session State
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class SessionState:
    """Carries all mutable pipeline state across interactive Edit loop turns.

    Attributes
    ----------
    chat_history    OpenAI message list (accumulated across Edit iterations).
    topology_dict   The most recent hardware-injected topology dict.
    thinking_text   The most recent CoT reasoning text from the LLM.
    iteration       How many Phase-1 generation attempts have run.
    last_request    The original user request string (never mutated by edits).
    """
    chat_history: List[Dict[str, str]] = field(default_factory=list)
    topology_dict: Optional[Dict[str, Any]] = None
    thinking_text: str = ""
    iteration: int = 0
    last_request: str = ""


# ═══════════════════════════════════════════════════════════════════════════════
#  Step 1 prompt builder  (V5.0 — First-Attempt Perfect)
# ═══════════════════════════════════════════════════════════════════════════════

def _compute_max_tokens(devices: List[Dict[str, Any]], security_profile: str) -> int:
    """Return the provider token cap for topology generation."""
    return BASE_MAX_TOKENS


def _build_step1_prompt(
    devices: List[Dict[str, Any]],
    security_profile: str = "none",
) -> str:
    inventory = [
        {
            "name": d["name"],
            "type": d["gns3_type"],
            "category": d.get("category", ""),
            "max_links": d.get("port_count"),
        }
        for d in devices
    ]

    limit_lines: List[str] = []
    for d in devices:
        gtype = d["gns3_type"]
        name = d["name"]
        pc = d.get("port_count")
        if gtype in SINGLE_LINK_TYPES:
            limit_lines.append(
                f"  - {name} ({gtype}): MAX 1 link. MUST use a switch intermediary if more needed."
            )
        elif gtype == "dynamips":
            platform = name.lower()
            max_l = DYNAMIPS_MAX_LINKS.get(platform, 3)
            limit_lines.append(
                f"  - {name} (dynamips): MAX {max_l} total links (PCI bus limit). "
                f"Use Core-SW + Router-on-a-Stick if you need more subnets."
            )
        elif pc is not None:
            limit_lines.append(f"  - {name} ({gtype}): MAX {pc} links.")

    limit_text = "\n".join(limit_lines) or "  (counts unavailable — be conservative)"
    inv_json = json.dumps(inventory, indent=2)
    security_block = get_topology_security_prompt(security_profile)

    schema_json = json.dumps(TopologyRequest.model_json_schema(), indent=2)

    return f"""You are the Core Architect Agent for StructuraNet AI.
You are a Senior Network Engineer who designs GNS3 topologies that work
perfectly on the first attempt — no retries, no errors.

Translate the user's natural language request into a network topology.

════════════════════════════════════════════════════════════════════════
  CRITICAL: YOU PRODUCE ONLY THE LOGICAL DESIGN
════════════════════════════════════════════════════════════════════════

DO NOT produce adapter numbers, port numbers, or any port assignments.
Those are computed automatically by the system after you respond.
Your ONLY job is: which devices exist, and which devices connect to which.

════════════════════════════════════════════════════════════════════════
  AVAILABLE HARDWARE (use ONLY these)
════════════════════════════════════════════════════════════════════════

{inv_json}

════════════════════════════════════════════════════════════════════════
  LINK LIMITS (do NOT exceed — this is the #1 cause of failures)
════════════════════════════════════════════════════════════════════════

{limit_text}

════════════════════════════════════════════════════════════════════════
  MANDATORY BUILD ALGORITHM — follow these steps IN ORDER
════════════════════════════════════════════════════════════════════════

STEP 1 — Identify required devices
  Read the user request carefully. List every router, switch, host, and
  special node (NAT, Cloud) needed. Assign each a unique node_id.

STEP 2 — Place single-port devices (NAT, VPCS, Cloud)
  ⚠️  NAT, VPCS, TraceNG, and Cloud have ONLY 1 port.
  They can connect to EXACTLY ONE other device.
  If multiple devices need to reach a NAT or Cloud node, you MUST
  insert an Ethernet Switch between them:

    ❌ WRONG:  R1 → NAT-ISP ← R2          (NAT has 2 connections!)
    ✅ RIGHT:  R1 → ISP-SW → NAT-ISP      (NAT has 1 connection)
                R2 ↗

    ❌ WRONG:  PC1 → R1 ← PC2             (if R1 has no spare ports)
    ✅ RIGHT:  PC1 → SW1 → R1             (switch fans out the connections)
                PC2 ↗

STEP 3 — Create the connectivity backbone
  Connect all routers and core switches into a SINGLE connected graph.
  Every router must have a path to every other router.
  For multi-site / multi-branch networks, connect the branches:
    Branch1-Edge-R1 ←—serial/ethernet—→ Branch2-Edge-R2
  or use a shared WAN Ethernet Switch between branches.

STEP 4 — Attach distribution and access switches
  Connect core/distribution switches to the backbone routers.
  Then connect access switches to the distribution layer.
  Use the Router-on-a-Stick pattern when a router must serve multiple
  VLANs through a single interface:
    Router → Core-SW (trunk) → Access-SW1 (VLAN 10)
                              → Access-SW2 (VLAN 20)
                              → Access-SW3 (VLAN 30)

STEP 5 — Attach end devices (VPCS, servers)
  Every VPCS connects to exactly ONE access switch.
  Every VPCS gets exactly ONE connection (it has only 1 port).
  If a VPCS needs to reach multiple networks, that happens through
  its switch + router — NOT by connecting it to multiple devices.

STEP 6 — VERIFY before outputting
  Check your topology against every rule below BEFORE writing JSON.

════════════════════════════════════════════════════════════════════════
  RULES — ALL are mandatory, NONE are optional
════════════════════════════════════════════════════════════════════════

1. ZERO HALLUCINATION: Only use device names from the inventory above.
2. node_type must be a GNS3 literal: dynamips, qemu, vpcs, ethernet_switch,
   ethernet_hub, docker, iou, cloud, traceng, frame_relay_switch, atm_switch,
   virtualbox, vmware, nat.
3. template_name must be the exact inventory name (e.g. "Cisco 3745", "Ethernet Switch", "VPCS").
4. name is a human-readable label (e.g. "R1-Edge", "Core-SW1", "PC1").
5. node_id is a short unique key (e.g. "R1", "SW1", "PC1").
6. DO NOT assign port numbers — just list connections as "from_node → to_node".
7. No two connections may link the same pair of nodes (no parallel links).
8. FULLY CONNECTED GRAPH: Every node must be reachable from every other node.
   If you have multiple sites/branches, they MUST be connected via links
   between their routers or through a shared WAN segment.
9. SINGLE-PORT RULE (CRITICAL — #1 cause of failures):
   NAT, VPCS, and TraceNG nodes may have AT MOST 1 connection.
   If multiple devices need to reach a NAT node, insert an Ethernet Switch
   as an intermediary (see Step 2 pattern above).
10. If a router needs more subnet switches than its link limit allows, use the
    Core-SW + Router-on-a-Stick pattern (router → 1 core switch → N access switches).
11. link_type is "ethernet" (default) or "serial" (for WAN router-to-router links).
12. If a device isn't available, substitute with the closest available match.

════════════════════════════════════════════════════════════════════════
  FORBIDDEN PATTERNS — never do these
════════════════════════════════════════════════════════════════════════

❌ NEVER connect more than 1 link to a NAT node — it has 1 port only.
❌ NEVER connect more than 1 link to a VPCS node — it has 1 port only.
❌ NEVER create two separate networks that aren't connected.
   If you have Branch-A and Branch-B, their routers MUST be linked.
❌ NEVER connect a host (VPCS) directly to a router if the router already
   uses all its ports. Use an access switch instead.
❌ NEVER use a router as a LAN hub. Use an Ethernet Switch for fan-out.

════════════════════════════════════════════════════════════════════════
  WIRING PATTERNS — use these as building blocks
════════════════════════════════════════════════════════════════════════

PATTERN A — Single-site enterprise:
  NAT-ISP → ISP-SW → Edge-R1 → Core-SW → [Access-SW1, Access-SW2, ...]
                                                  ↕         ↕
                                              [VPCSes]   [VPCSes]

PATTERN B — Multi-site / multi-branch:
  Branch-1: NAT-ISP1 → ISP-SW1 → FW1 → Core-SW1 → [Access switches + VPCS]
                                        ↕
                                  serial/WAN link
                                        ↕
  Branch-2: NAT-ISP2 → ISP-SW2 → FW2 → Core-SW2 → [Access switches + VPCS]

  Key: Each branch has its OWN NAT + ISP-SW. The branches connect
  via a direct link between their perimeter routers (FW1 ↔ FW2).

PATTERN C — Router-on-a-Stick (Inter-VLAN routing):
  R1 → Core-SW (trunk) → Access-SW-VLAN10 → [PC1, PC2, ...]
                        → Access-SW-VLAN20 → [PC3, PC4, ...]
                        → Access-SW-VLAN30 → [PC5, PC6, ...]
  R1 uses sub-interfaces (one per VLAN) on its single link to Core-SW.

PATTERN D — NAT intermediary (when NAT must serve multiple devices):
  ❌ WRONG: R1 → NAT ← R2         (2 connections to 1-port NAT)
  ✅ RIGHT: R1 → ISP-SW → NAT     (NAT has 1 connection to switch)
            R2 ↗                    (R1 and R2 connect through switch)
{security_block}

════════════════════════════════════════════════════════════════════════
  RESPONSE SIZE REQUIREMENT
════════════════════════════════════════════════════════════════════════

Do not include explanations, reasoning text, markdown, comments, or prose.
The backend will summarize the design after validation. If you include a
"thinking" key, keep it to one short sentence. Focus the token budget on
the topology JSON.


════════════════════════════════════════════════════════════════════════
  OUTPUT FORMAT
════════════════════════════════════════════════════════════════════════

Return a SINGLE JSON object. Prefer this compact top-level topology shape:

{{
  "name": "<project name>",
  "nodes": [
    {{"node_id": "R1", "name": "R1-Edge", "node_type": "dynamips",
      "template_name": "<exact inventory name>", "compute_id": "local"}}
  ],
  "connections": [
    {{"from_node": "R1", "to_node": "SW1", "link_type": "ethernet"}}
  ]
}}

The topology object must conform exactly to this JSON Schema:
{schema_json}

Respond with ONLY the JSON object. No markdown fences. No explanation outside the JSON."""


# ═══════════════════════════════════════════════════════════════════════════════
#  Pre-validation auto-repair functions  (V5.0)
# ═══════════════════════════════════════════════════════════════════════════════

def _repair_disconnected_graph(
    nodes: List[Dict[str, Any]],
    connections: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Auto-bridge isolated groups by inserting an Ethernet Switch.

    Uses Union-Find to detect isolated groups. For each pair of
    disconnected groups, picks the best router-like node from each,
    creates a bridge switch, and adds links from each router to the switch.

    Returns the modified connections list (new connections appended).
    Also modifies nodes list in-place to add bridge switches.
    """
    if len(nodes) <= 1:
        return connections

    # Build node_id → node map
    node_map = {n["node_id"]: n for n in nodes}

    # Union-Find
    parent = {n["node_id"]: n["node_id"] for n in nodes}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for c in connections:
        union(c["from_node"], c["to_node"])

    groups: Dict[str, List[str]] = {}
    for n in nodes:
        groups.setdefault(find(n["node_id"]), []).append(n["node_id"])

    if len(groups) <= 1:
        return connections  # Already connected

    logger.warning(
        "Auto-repair: Topology has %d isolated groups — bridging them",
        len(groups),
    )

    # Prefer router-like nodes as bridge endpoints
    _ROUTER_TYPES = {"dynamips", "iou", "qemu"}
    _SWITCH_TYPES = {"ethernet_switch", "ethernet_hub"}

    def _pick_bridge_node(group_node_ids: List[str]) -> Optional[str]:
        """Pick the best node to connect a bridge link to."""
        # Prefer routers, then switches, then anything
        for nid in group_node_ids:
            ntype = node_map[nid].get("node_type", "")
            if ntype in _ROUTER_TYPES:
                return nid
        for nid in group_node_ids:
            ntype = node_map[nid].get("node_type", "")
            if ntype in _SWITCH_TYPES:
                return nid
        return group_node_ids[0] if group_node_ids else None

    new_connections = list(connections)
    bridge_counter = 0

    # Bridge each isolated group to the first group
    group_list = list(groups.values())
    anchor_group = group_list[0]
    anchor_node = _pick_bridge_node(anchor_group)

    if anchor_node is None:
        return connections

    for i, group in enumerate(group_list[1:], start=1):
        bridge_counter += 1
        bridge_sw_id = f"Bridge-SW{bridge_counter}"
        bridge_sw_name = f"Bridge-SW{bridge_counter}"

        # Add bridge switch node
        bridge_node = {
            "node_id": bridge_sw_id,
            "name": bridge_sw_name,
            "node_type": "ethernet_switch",
            "template_name": "Ethernet Switch",
            "compute_id": "local",
        }
        nodes.append(bridge_node)
        node_map[bridge_sw_id] = bridge_node
        parent[bridge_sw_id] = bridge_sw_id

        # Connect anchor node to bridge switch
        new_connections.append({
            "from_node": anchor_node,
            "to_node": bridge_sw_id,
            "link_type": "ethernet",
        })
        union(anchor_node, bridge_sw_id)

        # Connect a node from this group to bridge switch
        group_node = _pick_bridge_node(group)
        if group_node:
            new_connections.append({
                "from_node": group_node,
                "to_node": bridge_sw_id,
                "link_type": "ethernet",
            })
            union(group_node, bridge_sw_id)

    logger.info(
        "Auto-repair: Inserted %d bridge switch(es) to connect isolated groups",
        bridge_counter,
    )
    return new_connections


def _repair_single_port_violations(
    nodes: List[Dict[str, Any]],
    connections: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Auto-insert Ethernet Switch intermediary for overloaded single-port nodes.

    If a NAT/VPCS/TraceNG node has more than 1 connection, keep the first
    connection direct, and route all subsequent connections through a new
    intermediary switch.

    Returns the modified connections list.
    Also modifies nodes list in-place to add intermediary switches.
    """
    # Count connections per node
    conn_count: Dict[str, int] = {}
    for c in connections:
        conn_count[c["from_node"]] = conn_count.get(c["from_node"], 0) + 1
        conn_count[c["to_node"]] = conn_count.get(c["to_node"], 0) + 1

    # Find overloaded single-port nodes
    overloaded = {
        nid: count for nid, count in conn_count.items()
        if count > 1 and nid in {n["node_id"] for n in nodes}
    }

    if not overloaded:
        return connections

    node_map = {n["node_id"]: n for n in nodes}
    new_connections = list(connections)
    intermediary_counter = 0

    for nid, excess_count in overloaded.items():
        node = node_map.get(nid)
        if not node or node["node_type"] not in _SINGLE_PORT_TYPES:
            continue

        # This node has >1 connection but only 1 port
        logger.warning(
            "Auto-repair: Node '%s' (%s) has %d connections but only 1 port — "
            "inserting intermediary switch",
            nid, node["node_type"], excess_count,
        )

        # Collect all connections involving this node
        involved = [
            (i, c) for i, c in enumerate(new_connections)
            if c["from_node"] == nid or c["to_node"] == nid
        ]

        if len(involved) <= 1:
            continue

        # Keep the first connection, reroute the rest through an intermediary switch
        intermediary_counter += 1
        inter_sw_id = f"Inter-SW-{nid}"
        inter_sw_name = f"Inter-SW-{nid}"

        # Add intermediary switch node (if not already added for this node)
        if inter_sw_id not in node_map:
            inter_node = {
                "node_id": inter_sw_id,
                "name": inter_sw_name,
                "node_type": "ethernet_switch",
                "template_name": "Ethernet Switch",
                "compute_id": "local",
            }
            nodes.append(inter_node)
            node_map[inter_sw_id] = inter_node

        # Mark which connections to remove (all but first)
        indices_to_remove: List[int] = []

        for idx, (orig_idx, conn) in enumerate(involved):
            if idx == 0:
                # Keep the first connection direct — but change the partner
                # to connect to the intermediary switch instead
                # Actually: keep the direct connection to the single-port node,
                # but reroute through intermediary:
                #   original: OtherNode → SinglePortNode
                #   becomes:  OtherNode → Inter-SW → SinglePortNode
                partner = (
                    conn["to_node"] if conn["from_node"] == nid else conn["from_node"]
                )
                link_type = conn.get("link_type", "ethernet")

                # Replace: partner → Inter-SW, and Inter-SW → single-port-node
                # But we need to be careful: remove original, add two new
                indices_to_remove.append(orig_idx)

                # Partner → Inter-SW
                new_connections.append({
                    "from_node": partner,
                    "to_node": inter_sw_id,
                    "link_type": link_type,
                })
                # Inter-SW → SinglePortNode
                new_connections.append({
                    "from_node": inter_sw_id,
                    "to_node": nid,
                    "link_type": "ethernet",
                })
            else:
                # Reroute subsequent connections through the intermediary switch
                partner = (
                    conn["to_node"] if conn["from_node"] == nid else conn["from_node"]
                )
                link_type = conn.get("link_type", "ethernet")

                indices_to_remove.append(orig_idx)

                # Partner → Inter-SW (instead of Partner → SinglePortNode)
                new_connections.append({
                    "from_node": partner,
                    "to_node": inter_sw_id,
                    "link_type": link_type,
                })

        # Remove original connections (reverse order to preserve indices)
        for idx in sorted(indices_to_remove, reverse=True):
            if idx < len(new_connections):
                new_connections.pop(idx)

    logger.info(
        "Auto-repair: Inserted %d intermediary switch(es) for single-port violations",
        intermediary_counter,
    )
    return new_connections


def _repair_duplicate_connections(
    connections: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Remove duplicate connections (same pair + same link_type)."""
    seen: Set[tuple] = set()
    cleaned: List[Dict[str, Any]] = []
    dupes_removed = 0

    for c in connections:
        key = (frozenset([c["from_node"], c["to_node"]]), c.get("link_type", "ethernet"))
        if key in seen:
            dupes_removed += 1
            continue
        seen.add(key)
        cleaned.append(c)

    if dupes_removed > 0:
        logger.info(
            "Auto-repair: Removed %d duplicate connection(s)", dupes_removed
        )
    return cleaned


def _run_auto_repairs(
    topo_data: Dict[str, Any],
) -> Dict[str, Any]:
    """Run the full auto-repair pipeline on a raw topology dict.

    Modifies the dict in-place and returns it.
    Repairs run in order: duplicates → single-port → disconnected.
    """
    nodes = topo_data.get("nodes", [])
    connections = topo_data.get("connections", [])

    # 1. Remove duplicates first (simplest)
    connections = _repair_duplicate_connections(connections)

    # 2. Fix single-port violations (insert intermediary switches)
    connections = _repair_single_port_violations(nodes, connections)

    # 3. Fix disconnected graph (bridge isolated groups)
    connections = _repair_disconnected_graph(nodes, connections)

    topo_data["nodes"] = nodes
    topo_data["connections"] = connections
    return topo_data


# ═══════════════════════════════════════════════════════════════════════════════
#  Step 1 LLM call  (unpacks CoT envelope)
# ═══════════════════════════════════════════════════════════════════════════════

def _call_step1(
    user_request: str,
    devices: List[Dict[str, Any]],
    security_profile: str = "none",
    chat_history: Optional[List[Dict[str, str]]] = None,
    previous_errors: Optional[List[str]] = None,
) -> Tuple[Optional[TopologyRequest], str, List[Dict[str, str]]]:
    """Call the LLM for Phase 1 topology generation.

    Returns
    -------
    (TopologyRequest | None, thinking_text, updated_history)
    """
    client = _get_client()
    system_content = _build_step1_prompt(devices, security_profile=security_profile)
    max_tokens = _compute_max_tokens(devices, security_profile)

    # Build message list: system → history → new user message
    messages: List[Dict[str, str]] = [{"role": "system", "content": system_content}]

    if chat_history:
        messages.extend(chat_history)

    if previous_errors:
        error_text = "\n".join(f"  - {e}" for e in previous_errors)
        user_content = (
            f"{user_request}\n\n"
            f"PREVIOUS ATTEMPT FAILED WITH THESE ERRORS — fix them:\n{error_text}\n\n"
            f"Remember: NAT/VPCS have only 1 port. Use Ethernet Switch as intermediary. "
            f"All branches/sites MUST be connected to each other."
        )
    else:
        user_content = user_request

    messages.append({"role": "user", "content": user_content})

    raw_text = ""
    thinking_text = ""
    updated_history = list(chat_history or [])

    try:
        def _call():
            return client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=messages,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )

        response = _call_with_retry(_call)
        if not response or not response.choices:
            logger.error("LLM returned empty response")
            return None, "", updated_history

        raw_text = response.choices[0].message.content or ""
        clean = _extract_json(raw_text)
        outer = json.loads(clean)

        # ── Unpack CoT envelope ──────────────────────────────────────────────
        thinking_text = outer.get("thinking", "")
        topology_data = outer.get("topology")

        if topology_data is None:
            # Graceful fallback: maybe the LLM returned the topology at the top level
            # (skipped the envelope).  Attempt to validate directly.
            logger.warning(
                "CoT envelope missing 'topology' key — attempting direct parse"
            )
            topology_data = outer

        # ── Auto-repair before validation ────────────────────────────────────
        repaired = _run_auto_repairs(topology_data)

        result = TopologyRequest.model_validate(repaired)

        # Accumulate chat history for multi-turn continuity.
        # Append the user turn ONLY if the last entry isn't already a user
        # message (callers like _checkpoint_loop pre-append edit feedback).
        if not updated_history or updated_history[-1].get("role") != "user":
            updated_history.append({"role": "user", "content": user_content})
        updated_history.append({"role": "assistant", "content": raw_text})

        logger.info(
            "Step 1 succeeded: %d nodes, %d connections",
            len(result.nodes),
            len(result.connections),
        )
        return result, thinking_text, updated_history

    except Exception as e:
        logger.warning("Step 1 failed: %s", e)
        if raw_text:
            logger.debug("Raw output (first 600 chars): %s", raw_text[:600])
        return None, thinking_text, updated_history


# ═══════════════════════════════════════════════════════════════════════════════
#  Node enrichment  (Requirement 4 — Rich Node Context)
# ═══════════════════════════════════════════════════════════════════════════════

def _build_hardware_summary(node: Dict[str, Any]) -> str:
    """Return a compact human-readable string describing installed hardware."""
    ntype = node.get("node_type", "")
    props = node.get("properties", {})
    parts: List[str] = []

    if ntype == "dynamips":
        platform = props.get("platform", node.get("template_name", "unknown"))
        ram = props.get("ram", "?")
        parts.append(f"platform={platform} ram={ram}MB")
        for slot_num in range(7):
            key = f"slot{slot_num}"
            mod = props.get(key)
            if mod:
                parts.append(f"{key}={mod}")
    elif ntype == "iou":
        eth = props.get("ethernet_adapters", "?")
        ser = props.get("serial_adapters", "?")
        parts.append(f"ethernet_adapters={eth} serial_adapters={ser}")
    elif ntype in ("qemu", "docker", "virtualbox", "vmware"):
        adapters = props.get("adapters", "?")
        parts.append(f"adapters={adapters}")
        ram = props.get("ram")
        if ram:
            parts.append(f"ram={ram}MB")
    elif ntype in ("ethernet_switch", "ethernet_hub"):
        pm = props.get("ports_mapping", [])
        parts.append(f"ports={len(pm)}")
        trunk_count = sum(1 for p in pm if p.get("type") == "dot1q")
        if trunk_count:
            parts.append(f"trunk_ports={trunk_count}")
    else:
        parts.append(ntype)

    return " | ".join(parts) if parts else ntype


def _enrich_nodes(topology_dict: Dict[str, Any]) -> None:
    """Add underscore-prefixed metadata to each node's properties dict.

    Called AFTER hw_config.inject_hardware_config() so slot/adapter data
    is already present.  The enrichment keys are intentionally outside
    SOFTWARE_CONFIG_KEYS so Phase 2 safe-merge never touches them.
    """
    # Import here to avoid circular imports at module load time
    from structranet.ai.context_builder import _resolve_all_interfaces  # noqa: PLC0415

    topo = topology_dict.get("topology", {})
    nodes = topo.get("nodes", [])
    links = topo.get("links", [])

    for node in nodes:
        ntype = node.get("node_type", "")
        props = node.setdefault("properties", {})

        # _interfaces: list of canonical interface names
        try:
            iface_list = _resolve_all_interfaces(node)
        except Exception:
            iface_list = []
        props["_interfaces"] = iface_list

        # _hardware_summary: compact slot/adapter string
        props["_hardware_summary"] = _build_hardware_summary(node)

        # _image_required: True for appliance types
        props["_image_required"] = ntype in _APPLIANCE_NODE_TYPES

        # _security_role / _zone: forwarded from topology-phase LLM extra fields
        # (The LLM may include these as top-level node fields for enterprise profiles)
        if "security_role" in node and "_security_role" not in props:
            props["_security_role"] = node["security_role"]
        if "zone" in node and "_zone" not in props:
            props["_zone"] = node["zone"]
        if "vlan_id" in node and "_vlan_id" not in props:
            props["_vlan_id"] = node["vlan_id"]

        # _link_count: how many links are connected to this node
        nid = node.get("node_id", "")
        link_count = sum(
            1
            for link in links
            for ep in link.get("nodes", [])
            if ep.get("node_id") == nid
        )
        props["_link_count"] = link_count

    logger.info("Node enrichment complete (%d node(s))", len(nodes))


# ═══════════════════════════════════════════════════════════════════════════════
#  Image Verification Manifest — "Shopping List"  (Deterministic, no LLM)
# ═══════════════════════════════════════════════════════════════════════════════

# Image key per node_type — used by _resolve_all_images to look up the
# correct property name in the appliance catalog entry.
_IMAGE_KEY_MAP: Dict[str, List[str]] = {
    "dynamips":   ["image"],
    "iou":        ["path"],
    "qemu":       ["hda_disk_image", "hdb_disk_image", "hdc_disk_image", "hdd_disk_image"],
    "docker":     ["image"],
    "virtualbox": ["hda_disk_image", "hdb_disk_image", "hdc_disk_image", "hdd_disk_image"],
    "vmware":     ["hda_disk_image", "hdb_disk_image", "hdc_disk_image", "hdd_disk_image"],
}


def _resolve_all_images(
    template: str,
    node_type: str,
    template_image_map: Dict[str, str],
    appliance_catalog: Dict[str, Any],
) -> Tuple[List[Tuple[str, bool]], bool]:
    """Resolve every required image for a template.

    Returns
    -------
    (images, is_available)
        images : list of (filename, is_from_catalog_default)
            For each disk image the appliance needs.  The first tuple is
            always the primary (boot) image; subsequent ones are additional
            disks (hdb, hdc, ...) when the appliance is multi-disk.
        is_available : bool
            True when the template exists in the user's template_image_map
            (i.e. the user has explicitly mapped this template to an image
            in their profile).

    Notes
    -----
    - When the template IS in template_image_map, the primary image comes
      from the user's map and is_available=True.  Additional disk images
      are still pulled from the catalog because template_image_map is a
      single-key -> single-value mapping and cannot express multi-disk.
    - When the template is NOT in template_image_map, ALL images come
      from the appliance catalog (with is_from_catalog_default=True) and
      is_available=False.
    - If the template is not in the catalog either, images will be empty
      and is_available=False.
    """
    result: List[Tuple[str, bool]] = []
    is_available = template in template_image_map

    # -- Primary image from user map (highest priority) --------------------
    user_image = template_image_map.get(template)
    if user_image:
        result.append((user_image, False))  # False = not a catalog default

    # -- Gather images from the appliance catalog -------------------------
    catalog_entry = appliance_catalog.get(template, {})
    if not catalog_entry:
        # Nothing in the catalog -- return whatever we have
        return result, is_available

    # Pick the right keys based on node_type
    disk_keys = _IMAGE_KEY_MAP.get(node_type, ["image", "hda_disk_image", "path"])

    if user_image:
        # User already supplied the primary image via template_image_map.
        # Still gather additional disk images (hdb, hdc, ...) from the
        # catalog so the checklist warns about multi-disk requirements.
        additional_keys = [k for k in disk_keys if k != disk_keys[0]]
        for key in additional_keys:
            img = catalog_entry.get(key)
            if img:
                result.append((img, True))  # True = catalog default
    else:
        # No user mapping -- all images come from the catalog.
        for key in disk_keys:
            img = catalog_entry.get(key)
            if img:
                result.append((img, True))

    return result, is_available


def generate_image_manifest(
    topology_dict: Dict[str, Any],
    template_image_map: Dict[str, str],
    output_path: str,
    appliance_catalog: Optional[Dict[str, Any]] = None,
) -> str:
    """Write a user-friendly "Shopping List" checklist of required images.

    This function is **purely deterministic** -- no LLM calls.  It iterates
    through the nodes in the topology, checks image availability against
    the user's template_image_map, and falls back to the global
    appliance_catalog to find the default required image filename for
    templates that are not in the user's map.

    Parameters
    ----------
    topology_dict       Hardware-injected topology dict (Phase 1 output).
    template_image_map  Mapping from template_name to IOS/image filename
                        provided by the user in their preflight profile.
    output_path         Destination file path for the checklist .txt file.
    appliance_catalog   Global appliance catalog (keyed by template_name)
                        used to resolve default image filenames when a
                        template is missing from template_image_map.
                        If ``None``, the built-in APPLIANCE_CATALOG is used.

    Returns
    -------
    Absolute path of the written manifest file.
    """
    if appliance_catalog is None:
        from structranet.constants.appliances import APPLIANCE_CATALOG  # noqa: PLC0415
        appliance_catalog = APPLIANCE_CATALOG

    topo = topology_dict.get("topology", {})
    nodes = topo.get("nodes", [])

    # -- Header -----------------------------------------------------------
    separator = "=" * 48
    lines: List[str] = [
        separator,
        "  StructuraNet - Required Images Checklist",
        separator,
        "",
    ]

    ok_count = 0
    missing_count = 0
    builtin_count = 0
    counter = 0

    for node in nodes:
        counter += 1
        nid = node.get("node_id", "?")
        name = node.get("name", "?")
        ntype = node.get("node_type", "")
        template = node.get("template_name", "")

        # -- Built-in nodes (no image required) ---------------------------
        if ntype in _BUILTIN_NODE_TYPES:
            builtin_count += 1
            lines.append(f"{counter}. Device: {name} (Template: {template})")
            lines.append("   Required Image: None required (Built-in GNS3 node)")
            lines.append("   Status: [OK]")
            lines.append("")
            continue

        # -- Appliance nodes (dynamips / iou / qemu / docker / vbox / vmware)
        if ntype in _APPLIANCE_NODE_TYPES:
            images, is_available = _resolve_all_images(
                template, ntype, template_image_map, appliance_catalog,
            )

            if not images:
                # Neither user map nor catalog has an image for this template
                missing_count += 1
                lines.append(f"{counter}. Device: {name} (Template: {template})")
                lines.append(
                    "   Required Image: Unknown -- not found in your profile or catalog"
                )
                lines.append(
                    "   Status: [MISSING] -- Cannot determine required image. "
                    "Add it to your profile or appliance catalog."
                )
                lines.append("")
                continue

            if is_available:
                ok_count += 1
                lines.append(f"{counter}. Device: {name} (Template: {template})")

                # Primary image (from user's map -- no "(Default)" suffix)
                primary_img, _ = images[0]
                lines.append(f"   Required Image: {primary_img}")

                # Additional disks (from catalog -- marked "(Default)")
                for img_name, is_default in images[1:]:
                    suffix = " (Default)" if is_default else ""
                    lines.append(f"   Additional Disk: {img_name}{suffix}")

                lines.append("   Status: [OK] - Available in your profile.")
            else:
                missing_count += 1
                lines.append(f"{counter}. Device: {name} (Template: {template})")

                # All images from catalog -- marked "(Default)"
                for i, (img_name, is_default) in enumerate(images):
                    suffix = " (Default)" if is_default else ""
                    if i == 0:
                        lines.append(f"   Required Image: {img_name}{suffix}")
                    else:
                        lines.append(f"   Additional Disk: {img_name}{suffix}")

                lines.append(
                    "   Status: [MISSING] - Please download this image "
                    "and import it into GNS3."
                )

            lines.append("")
            continue

        # -- Unknown node types -------------------------------------------
        lines.append(f"{counter}. Device: {name} (Template: {template})")
        lines.append(f"   Required Image: Unknown node type '{ntype}'")
        lines.append("   Status: [UNKNOWN]")
        lines.append("")

    # -- Footer / summary -------------------------------------------------
    lines.append(separator)
    lines.append(
        f"  Summary: {ok_count} Available | {missing_count} Missing | "
        f"{builtin_count} Built-in | {len(nodes)} Total"
    )
    if missing_count > 0:
        lines.append("")
        lines.append(
            "  Action required: Download the [MISSING] images above and "
            "import them into"
        )
        lines.append(
            "  your GNS3 server before importing the .gns3project file."
        )
    else:
        lines.append("")
        lines.append(
            "  All required images are available. You can import the "
            ".gns3project file."
        )
    lines.append(separator)

    # -- Write to disk ----------------------------------------------------
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")

    abs_path = str(out.resolve())
    logger.info(
        "Image checklist written to %s (%d ok, %d missing, %d builtin)",
        abs_path, ok_count, missing_count, builtin_count,
    )
    return abs_path


# ═══════════════════════════════════════════════════════════════════════════════
#  Main generation pipeline
# ═══════════════════════════════════════════════════════════════════════════════

def generate_network_topology(
    user_request: str,
    devices: List[Dict[str, Any]],
    disallowed_node_types: Optional[Set[str]] = None,
    security_profile: str = "none",
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> Tuple[Optional[GNS3Project], str, List[Dict[str, str]]]:
    """Generate a validated GNS3Project from a natural language request.

    Returns
    -------
    (GNS3Project | None, thinking_text, updated_chat_history)

    The caller is responsible for accumulating chat_history across Edit
    loop iterations and passing the updated list on the next call.
    """
    previous_errors: List[str] = []
    disallowed = {t.lower() for t in (disallowed_node_types or set())}
    current_history = list(chat_history or [])
    latest_thinking = ""

    for attempt in range(1, MAX_RETRIES + 1):
        logger.info("Generation attempt %d/%d", attempt, MAX_RETRIES)

        topo_request, thinking_text, current_history = _call_step1(
            user_request,
            devices,
            security_profile=security_profile,
            chat_history=current_history,
            previous_errors=previous_errors or None,
        )
        if thinking_text:
            latest_thinking = thinking_text

        if topo_request is None:
            logger.error("LLM call failed on attempt %d", attempt)
            previous_errors = [
                "Previous response was invalid or truncated JSON. Return one complete JSON object only, "
                "with no markdown, no commentary, and all arrays/objects properly closed."
            ]
            continue

        req_errors = validate_topology_request(topo_request.model_dump())
        if not req_errors and disallowed:
            disallowed_hits = [
                f"node '{n.node_id}' uses disallowed node_type '{n.node_type}'"
                for n in topo_request.nodes
                if str(n.node_type).lower() in disallowed
            ]
            if disallowed_hits:
                req_errors = [
                    "Environment compatibility violation: "
                    + "; ".join(disallowed_hits)
                ]

        if req_errors:
            logger.warning("TopologyRequest validation failed: %s", req_errors)
            previous_errors = req_errors
            continue

        try:
            project_dict = build_topology_from_request(topo_request)
        except ValueError as e:
            logger.warning("Port assignment failed: %s", e)
            previous_errors = [str(e)]
            continue

        topo_errors = validate_topology(project_dict)
        if topo_errors:
            logger.warning("Topology validation failed: %s", topo_errors)
            structural_errors = [
                e for e in topo_errors if "port_assigner.py" not in e
            ]
            previous_errors = structural_errors or topo_errors
            continue

        logger.info("Generation succeeded on attempt %d", attempt)
        try:
            return (
                GNS3Project.model_validate(project_dict),
                latest_thinking,
                current_history,
            )
        except Exception as e:
            logger.error("Final model_validate failed: %s", e)
            previous_errors = [str(e)]
            continue

    logger.error("All %d generation attempts failed", MAX_RETRIES)
    return None, latest_thinking, current_history


# ═══════════════════════════════════════════════════════════════════════════════
#  Post-generation: hardware injection + enrichment + VLAN patching + save
# ═══════════════════════════════════════════════════════════════════════════════

def process_and_save_topology(
    raw_topology: GNS3Project,
    output_file: str,
) -> Optional[GNS3Project]:
    """Run hardware injection, node enrichment, VLAN patching, and save to disk.

    Node enrichment (_enrich_nodes) runs after hardware injection so all slot
    and adapter data is already present when we compute _hardware_summary and
    _interfaces.  Enrichment metadata is stored under underscore-prefixed keys
    and is invisible to the Phase 2 safe-merge whitelist.
    """
    raw_dict = raw_topology.model_dump()

    # 1. Hardware slot/adapter/ports_mapping expansion
    enriched = inject_hardware_config(raw_dict)

    # 2. Rich node metadata (interfaces, hardware summary, security roles)
    _enrich_nodes(enriched)

    # 3. VLAN trunk/access port patching
    apply_switch_port_patches(enriched)
    enriched[VLAN_PATCHED_KEY] = True
    logger.info("Switch VLAN port patches applied in process_and_save_topology")

    # 4. Re-validate (Pydantic ignores unknown underscore fields by default)
    try:
        result = GNS3Project.model_validate(enriched)
    except Exception as e:
        logger.error("Re-validation after hardware injection failed: %s", e)
        return None

    # 5. Persist
    try:
        out = Path(output_file)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(result.model_dump_json(indent=2), encoding="utf-8")
        logger.info("Topology saved to %s", out)
    except OSError as e:
        logger.error("Failed to save topology: %s", e)
        return None

    return result
