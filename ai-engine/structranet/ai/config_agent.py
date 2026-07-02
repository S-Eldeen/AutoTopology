"""
config_agent.py — Phase 2 Software Configuration Agent for Structranet AI

Takes the finalized Phase 1 JSON (hardware-injected topology) and generates
software configurations (IP addressing, routing, startup scripts) using the LLM.

Pipeline:
  1. Build Configuration Brief via context_builder
  2. Send brief + strict prompt to LLM
  3. LLM returns {node_id: {config_key: config_value}} flat map
  4. Three-Gate Safe Merge into Phase 1 JSON
  5. Save final integrated topology

Safety guarantee: The whitelist merge makes it IMPOSSIBLE for the LLM to
overwrite hardware properties (slots, adapters, ports_mapping) OR the
underscore-prefixed metadata keys added by ai_agent._enrich_nodes(),
regardless of what the LLM returns.

V4.0 notes (no API changes vs V3.3):
  - The Phase 2 prompt now explicitly instructs the LLM to skip any key
    that starts with "_" — these are internal metadata keys.
  - run_phase2() signature is unchanged; callers (main.py) pass
    security_profile as before.
  - generate_software_configs() and safe_merge_configs() are unchanged.
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

from structranet.constants.gns3 import VLAN_PATCHED_KEY
from structranet.constants.phase2 import ALLOWED_VALUE_TYPES, SOFTWARE_CONFIG_KEYS
from structranet.ai.context_builder import build_configuration_brief, resolve_port_name
from structranet.ai.llm_utils import _call_with_retry, _env_int, _extract_json, _get_client
from structranet.constants.schema import GNS3Project
from structranet.ai.security_prompts import get_config_security_prompt
from structranet.generation.topology_finalizer import apply_switch_port_patches

load_dotenv()
logger = logging.getLogger("structranet.config_agent")

DEFAULT_MODEL = os.getenv("AI_MODEL", "openrouter/owl-alpha")
BASE_MAX_TOKENS = _env_int("AI_MAX_TOKENS", 16384)


def _link_endpoints(topology: Dict[str, Any]) -> Dict[str, List[dict]]:
    links_by_node: Dict[str, List[dict]] = {}
    for link in topology.get("links", []):
        for ep in link.get("nodes", []):
            nid = ep.get("node_id")
            if nid:
                links_by_node.setdefault(nid, []).append(link)
    return links_by_node


def _other_endpoint(link: dict, node_id: str) -> Optional[dict]:
    for ep in link.get("nodes", []):
        if ep.get("node_id") != node_id:
            return ep
    return None


def _endpoint_for(link: dict, node_id: str) -> Optional[dict]:
    for ep in link.get("nodes", []):
        if ep.get("node_id") == node_id:
            return ep
    return None


def _interface_for_link(link: dict, node_id: str, node_map: Dict[str, dict]) -> str:
    ep = _endpoint_for(link, node_id) or {}
    node = node_map.get(node_id, {})
    return resolve_port_name(
        node,
        int(ep.get("adapter_number", 0)),
        int(ep.get("port_number", 0)),
        link_type=link.get("link_type", "ethernet"),
    )


def _switch_access_vlan(node: dict) -> Optional[int]:
    for port in node.get("properties", {}).get("ports_mapping", []) or []:
        if port.get("type") == "access":
            vlan = int(port.get("vlan", 1) or 1)
            if vlan > 1:
                return vlan
    return None


def _branch_number(node_id: str) -> Optional[int]:
    match = re.match(r"B(\d+)-", node_id or "")
    return int(match.group(1)) if match else None


def _try_deterministic_branch_room_configs(
    phase1_dict: Dict[str, Any],
    security_profile: str = "none",
) -> Optional[Dict[str, Dict[str, Any]]]:
    """Generate fast startup configs for deterministic branch-room topologies."""
    topology = phase1_dict.get("topology", phase1_dict)
    nodes = topology.get("nodes", [])
    links = topology.get("links", [])
    node_map = {node.get("node_id"): node for node in nodes if node.get("node_id")}

    routers = [
        node for node in nodes
        if re.fullmatch(r"B\d+-R1", node.get("node_id", ""))
        and node.get("node_type") in ("dynamips", "iou", "qemu")
    ]
    access_switches = [
        node for node in nodes
        if re.fullmatch(r"B\d+-ROOM\d+-SW\d+", node.get("node_id", ""))
        and node.get("node_type") == "ethernet_switch"
    ]
    pcs = [
        node for node in nodes
        if re.fullmatch(r"B\d+-ROOM\d+-(?:MAIN-PC|PC\d+)", node.get("node_id", ""))
        and node.get("node_type") == "vpcs"
    ]
    if not routers or not access_switches or not pcs:
        return None

    links_by_node = _link_endpoints(topology)
    configs: Dict[str, Dict[str, Any]] = {}

    vlan_by_switch: Dict[str, int] = {}
    for switch in sorted(access_switches, key=lambda n: n.get("node_id", "")):
        vlan = _switch_access_vlan(switch)
        if vlan is None:
            continue
        vlan_by_switch[switch["node_id"]] = vlan

    for router in sorted(routers, key=lambda n: n.get("node_id", "")):
        router_id = router["node_id"]
        branch = _branch_number(router_id) or 1
        core_id = f"B{branch}-CORE-SW"
        core_link = None
        wan_link = None
        for link in links_by_node.get(router_id, []):
            other = _other_endpoint(link, router_id) or {}
            other_id = other.get("node_id", "")
            if other_id == core_id:
                core_link = link
            elif other_id == "ISP-SW":
                wan_link = link

        core_iface = _interface_for_link(core_link, router_id, node_map) if core_link else "FastEthernet0/0"
        wan_iface = _interface_for_link(wan_link, router_id, node_map) if wan_link else "FastEthernet0/1"

        branch_vlans = [
            vlan for sid, vlan in vlan_by_switch.items()
            if sid.startswith(f"B{branch}-")
        ]
        lines = [
            f"hostname {router_id}",
            "no ip domain-lookup",
            "!",
            f"interface {wan_iface}",
            f" ip address 10.255.0.{branch} 255.255.255.0",
            " no shutdown",
            "!",
            f"interface {core_iface}",
            " no ip address",
            " no shutdown",
            "!",
        ]
        for vlan in sorted(branch_vlans):
            lines.extend([
                f"interface {core_iface}.{vlan}",
                f" encapsulation dot1Q {vlan}",
                f" ip address 10.{branch}.{vlan}.1 255.255.255.0",
                " no shutdown",
                "!",
            ])
        lines.extend([
            "router ospf 1",
            f" network 10.{branch}.0.0 0.0.255.255 area 0",
            " network 10.255.0.0 0.0.0.255 area 0",
            "!",
        ])
        if security_profile in ("basic", "enterprise"):
            lines.extend([
                "service password-encryption",
                "enable secret structuranet",
                "line vty 0 4",
                " login local",
                " transport input ssh",
                "!",
            ])
        lines.append("end")
        configs[router_id] = {"startup_config_content": "\n".join(lines) + "\n"}

    host_counters: Dict[Tuple[int, int], int] = {}
    for pc in sorted(pcs, key=lambda n: n.get("node_id", "")):
        pc_id = pc["node_id"]
        branch = _branch_number(pc_id) or 1
        vlan = None
        for link in links_by_node.get(pc_id, []):
            other = _other_endpoint(link, pc_id) or {}
            other_id = other.get("node_id", "")
            if other_id in vlan_by_switch:
                vlan = vlan_by_switch[other_id]
                break
        if vlan is None:
            continue
        key = (branch, vlan)
        host_counters[key] = host_counters.get(key, 9) + 1
        host_octet = min(host_counters[key], 254)
        configs[pc_id] = {
            "startup_script": (
                f"ip 10.{branch}.{vlan}.{host_octet}/24 10.{branch}.{vlan}.1\n"
                "save\n"
            )
        }

    logger.info(
        "Deterministic Phase 2 configs generated for branch-room topology: %d node(s)",
        len(configs),
    )
    return configs or None


# ══════════════════════════════════════════════════════════════════════════════
#  Prompt builder
# ══════════════════════════════════════════════════════════════════════════════

def _compute_phase2_max_tokens(brief: str, security_profile: str) -> int:
    """Return the provider token cap for configuration generation."""
    return BASE_MAX_TOKENS


def _build_phase2_prompt(
    brief: str,
    security_profile: str = "none",
) -> str:
    security_block = get_config_security_prompt(security_profile)

    return f"""{security_block}
You are the Software Configuration Agent for Structuranet AI.
You are a Senior Network Engineer who generates perfect Cisco IOS and VPCS
configurations on the first attempt — no errors, no omissions.

Your job is to generate IP addressing, routing, and startup configurations
for the network topology described in the brief below.

{brief}

══════════════════════════════════════════════════════════════
  OUTPUT FORMAT
══════════════════════════════════════════════════════════════

Return a JSON object where:
  - Keys are node_id values from the brief (e.g., "R1", "PC1", "FW1")
  - Values are objects containing ONLY software config properties
  - Do NOT include nodes that need no config (ethernet_switch, ethernet_hub,
    NAT, cloud, frame_relay_switch, atm_switch)
  - Do NOT include any key that starts with "_" — those are internal metadata keys

Example output (Router-on-a-Stick with 3 VLANs):
{{
  "R1": {{
    "startup_config_content": "hostname R1\\n!\\ninterface FastEthernet0/0\\n no shutdown\\n!\\ninterface FastEthernet0/0.10\\n encapsulation dot1Q 10\\n ip address 10.0.10.1 255.255.255.0\\n!\\ninterface FastEthernet0/0.20\\n encapsulation dot1Q 20\\n ip address 10.0.20.1 255.255.255.0\\n!\\nrouter ospf 1\\n network 10.0.0.0 0.255.255.255 area 0\\n!"
  }},
  "PC1": {{
    "startup_script": "ip 10.0.10.10/24 10.0.10.1\\nsave\\n"
  }}
}}

CONFIG KEY RULES (use EXACTLY these property names):
  - dynamips / iou / qemu routers → "startup_config_content" (Cisco IOS string)
  - vpcs hosts                    → "startup_script" (NOT startup_script_content!)
  - docker containers             → "start_command" + "environment"

══════════════════════════════════════════════════════════════
  GENERALIZED L3 ARCHITECTURE RULES
══════════════════════════════════════════════════════════════

Rule A — ONE SUBNET PER BROADCAST DOMAIN / ACCESS SWITCH
  Every distinct access switch MUST be assigned its own unique VLAN
  and its own unique /24 subnet. NEVER place two access switches or
  their end-devices in the same subnet.

Rule B — ROUTER-ON-A-STICK (802.1Q SUB-INTERFACES)
  When a single router connects to multiple access switches through a
  core switch, configure 802.1Q sub-interfaces:
    interface FastEthernet0/0.10
      encapsulation dot1Q 10
      ip address 10.0.10.1 255.255.255.0
  Sub-interface number MUST match VLAN ID.
  The PHYSICAL interface (e.g. FastEthernet0/0) MUST have "no shutdown".

Rule C — VPCS GATEWAYS MUST MATCH THEIR VLAN SUB-INTERFACE
  Every VPCS host must use the router sub-interface IP for its VLAN
  as the default gateway. NEVER use the same gateway for hosts on
  different VLANs.

Rule D — SUBNET ALLOCATION
  Use structured allocation: VLAN ID maps to third octet.
    VLAN 10 → 10.0.10.0/24   Router sub-iface IP: .1   Hosts from .10
    VLAN 20 → 10.0.20.0/24
    VLAN 30 → 10.0.30.0/24
  (Override with security profile address space if profile != "none".)
  For multi-branch: each branch uses its own second octet:
    Branch 1: 10.1.<VLAN>.0/24   Branch 2: 10.2.<VLAN>.0/24
  WAN P2P links: 10.255.<N>.0/30

Rule E — SIMPLE NETWORK EXCEPTION
  If the brief states this is a "simple single-department network" or
  there is only ONE access switch, a flat subnet is acceptable and
  Router-on-a-Stick is NOT required.

Rule F — WAN / INTER-BRANCH INTERFACES
  For multi-branch topologies, the WAN link between perimeter routers
  gets a /30 subnet. Example:
    FW1 serial: 10.255.1.1/30   FW2 serial: 10.255.1.2/30
  Configure OSPF across WAN links. Do NOT apply NAT on WAN interfaces.

Rule G — NO SHUTDOWN ON ALL INTERFACES
  Every interface that has an IP address MUST also have "no shutdown".
  This is the #1 reason configs fail in GNS3 — interfaces are
  administratively down by default on Cisco IOS.

══════════════════════════════════════════════════════════════

STRICT RULES:
1. ONLY use the config keys listed above. Any other key will be REJECTED.
2. Do NOT include "slot1", "adapters", "ports_mapping", "platform", "ram",
   or any hardware property.
3. Do NOT include keys starting with "_" (these are internal metadata).
4. Do NOT include "name", "node_type", "template_name", "compute_id".
5. Use the EXACT interface names from the brief.
6. Each segment gets one unique subnet.
6a. ALL devices on the same multi-access segment MUST share the SAME
    subnet and SAME mask.
7. Include routing protocols (OSPF or static routes) for multi-segment
   routers.
8. Do NOT include markdown code fences. Return ONLY raw JSON.
9. The JSON must start with '{{' and end with '}}'.
10. Skip switches, hubs, NAT, and cloud nodes — no IP config needed.
11. Add "no shutdown" on EVERY physical interface and sub-interface."""


# ══════════════════════════════════════════════════════════════════════════════
#  LLM call
# ══════════════════════════════════════════════════════════════════════════════

def generate_software_configs(
    brief: str,
    security_profile: str = "none",
) -> Optional[Dict[str, Dict[str, Any]]]:
    client = _get_client()
    prompt = _build_phase2_prompt(brief, security_profile=security_profile)
    max_tokens = _compute_phase2_max_tokens(brief, security_profile)
    logger.info(
        "Calling Phase 2 LLM (model=%s, security_profile=%s, max_tokens=%d) ...",
        DEFAULT_MODEL,
        security_profile,
        max_tokens,
    )

    # Strategy 1: JSON mode
    try:
        def _json_call():
            return client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": "Generate the software configurations now."},
                ],
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )

        response = _call_with_retry(_json_call)
        if response and response.choices:
            raw_text = response.choices[0].message.content or ""
            clean_text = _extract_json(raw_text)
            configs = json.loads(clean_text)

            if not isinstance(configs, dict):
                logger.error(
                    "LLM returned non-dict top-level: %s", type(configs).__name__
                )
                return None

            for nid, cfg in configs.items():
                if not isinstance(cfg, dict):
                    logger.error(
                        "LLM returned non-dict for node '%s': %s",
                        nid,
                        type(cfg).__name__,
                    )
                    return None

            logger.info(
                "Phase 2 LLM succeeded — configs for %d node(s)", len(configs)
            )
            return configs

    except Exception as e:
        logger.warning("Phase 2 JSON mode failed: %s", e)

    # Strategy 2: plain text fallback
    logger.info("Retrying Phase 2 without response_format...")
    raw_text = ""
    try:
        def _plain_call():
            return client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": prompt},
                    {
                        "role": "user",
                        "content": "Generate the software configurations now. Return ONLY raw JSON.",
                    },
                ],
                max_tokens=max_tokens,
            )

        response = _call_with_retry(_plain_call)
        if response and response.choices:
            raw_text = response.choices[0].message.content or ""
            clean_text = _extract_json(raw_text)
            configs = json.loads(clean_text)

            if isinstance(configs, dict):
                logger.info(
                    "Phase 2 plain fallback succeeded — configs for %d node(s)",
                    len(configs),
                )
                return configs

    except Exception as e:
        logger.error("Phase 2 plain fallback also failed: %s", e)
        logger.error(
            "\n%s\nRAW AI OUTPUT:\n%s\n%s", "=" * 40, raw_text, "=" * 40
        )

    return None


# ══════════════════════════════════════════════════════════════════════════════
#  Three-Gate Safe Merge
# ══════════════════════════════════════════════════════════════════════════════

def safe_merge_configs(
    phase1_dict: Dict[str, Any],
    llm_configs: Dict[str, Dict[str, Any]],
) -> Tuple[Dict[str, Any], Dict[str, List[str]]]:
    """Merge LLM-generated software configs into the Phase 1 topology dict.

    Gate 1 — Whitelist: only keys in SOFTWARE_CONFIG_KEYS are accepted.
             Any key starting with "_" is also silently dropped here even
             if it somehow appeared in the LLM output.
    Gate 2 — No-overwrite: existing non-empty values are never replaced.
    Gate 3 — Type check: value must match the expected Python type.
    """
    topology = phase1_dict.get("topology", phase1_dict)
    nodes = topology.get("nodes", [])
    node_index: Dict[str, dict] = {
        n.get("node_id"): n for n in nodes if n.get("node_id")
    }
    rejection_log: Dict[str, List[str]] = {}
    merged_count = 0

    for node_id, config in llm_configs.items():
        node = node_index.get(node_id)
        if node is None:
            rejection_log.setdefault(node_id, []).append(
                f"Node '{node_id}' not found in topology — entire config skipped"
            )
            continue

        properties = node.setdefault("properties", {})

        for key, value in config.items():
            # Silently drop internal metadata keys regardless of source
            if key.startswith("_"):
                logger.debug(
                    "MERGE SKIP: %s.%s — internal metadata key ignored", node_id, key
                )
                continue

            # Gate 1: whitelist
            if key not in SOFTWARE_CONFIG_KEYS:
                reason = f"Key '{key}' rejected — not in whitelist"
                rejection_log.setdefault(node_id, []).append(reason)
                logger.warning(
                    "MERGE REJECT [Gate 1]: %s.%s — %s", node_id, key, reason
                )
                continue

            # Gate 2: no-overwrite (with empty-placeholder exception)
            if key in properties:
                existing_val = properties[key]
                if existing_val not in ("", {}, [], None):
                    reason = (
                        f"Key '{key}' rejected — already exists with non-empty value: "
                        f"{repr(existing_val)[:80]}"
                    )
                    rejection_log.setdefault(node_id, []).append(reason)
                    logger.warning(
                        "MERGE REJECT [Gate 2]: %s.%s — %s", node_id, key, reason
                    )
                    continue
                logger.info(
                    "MERGE ALLOW [Gate 2 relaxed]: %s.%s — empty placeholder, allowing overwrite",
                    node_id,
                    key,
                )

            # Gate 3: type check
            allowed_types = ALLOWED_VALUE_TYPES.get(key, (str,))
            if not isinstance(value, allowed_types):
                reason = (
                    f"Key '{key}' rejected — value type {type(value).__name__} "
                    f"not in {tuple(t.__name__ for t in allowed_types)}"
                )
                rejection_log.setdefault(node_id, []).append(reason)
                logger.warning(
                    "MERGE REJECT [Gate 3]: %s.%s — %s", node_id, key, reason
                )
                continue

            properties[key] = value
            merged_count += 1
            logger.debug(
                "MERGE OK: %s.%s (%d chars)", node_id, key, len(str(value))
            )

    logger.info(
        "Safe merge complete: %d key(s) merged, %d node(s) with rejections",
        merged_count,
        len(rejection_log),
    )
    return phase1_dict, rejection_log


# ══════════════════════════════════════════════════════════════════════════════
#  Public API — Full Phase 2 Pipeline
# ══════════════════════════════════════════════════════════════════════════════

def run_phase2(
    phase1_json_path: str,
    output_path: str = "output/final_topology.json",
    security_profile: str = "none",
) -> Optional[Dict[str, Any]]:
    """Execute the complete Phase 2 pipeline.

    Parameters
    ----------
    phase1_json_path : str
        Path to the Phase 1 output JSON (hardware-injected topology).
    output_path : str
        Path to save the final integrated topology JSON.
    security_profile : str
        "none" | "basic" | "enterprise" — forwarded to the config LLM.
    """
    p1_path = Path(phase1_json_path)
    if not p1_path.exists():
        logger.error("Phase 1 JSON not found: %s", phase1_json_path)
        return None

    with open(p1_path, encoding="utf-8") as f:
        phase1_dict = json.load(f)

    # VLAN patch guard
    if not phase1_dict.get(VLAN_PATCHED_KEY):
        apply_switch_port_patches(phase1_dict)
        logger.info("Switch port patches applied")
    else:
        logger.info("Switch port patches already applied — skipping")

    llm_configs = _try_deterministic_branch_room_configs(
        phase1_dict,
        security_profile=security_profile,
    )
    if llm_configs is None:
        brief = build_configuration_brief(phase1_dict)
        logger.info("Configuration brief: %d chars", len(brief))
        llm_configs = generate_software_configs(brief, security_profile=security_profile)
    if llm_configs is None:
        logger.error(
            "LLM failed to generate software configs — aborting Phase 2"
        )
        return None

    merged_dict, rejection_log = safe_merge_configs(phase1_dict, llm_configs)

    if rejection_log:
        logger.warning("Some LLM configs were rejected:")
        for nid, reasons in rejection_log.items():
            for reason in reasons:
                logger.warning("  %s: %s", nid, reason)

    try:
        validated = GNS3Project.model_validate(merged_dict)
        logger.info("Pydantic re-validation passed")
    except Exception as e:
        logger.error("Pydantic re-validation FAILED after merge: %s", e)
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(merged_dict, indent=2), encoding="utf-8")
        return None

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(validated.model_dump_json(indent=2), encoding="utf-8")
    logger.info("Final topology saved to %s", output_path)
    return validated.model_dump()


# ══════════════════════════════════════════════════════════════════════════════
#  CLI entry point
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys

    logging.basicConfig(
        level=logging.INFO, format="%(name)s [%(levelname)s] %(message)s"
    )

    phase1_path = sys.argv[1] if len(sys.argv) > 1 else "output/_topology.json"
    output_file = (
        sys.argv[2] if len(sys.argv) > 2 else "output/final_topology.json"
    )
    sec_profile = sys.argv[3] if len(sys.argv) > 3 else "none"

    result = run_phase2(phase1_path, output_file, security_profile=sec_profile)
    if result:
        print("\n=== Phase 2 Complete ===\n")
        print(json.dumps(result, indent=2))
    else:
        print("\nPhase 2 failed. Check logs for details.")
