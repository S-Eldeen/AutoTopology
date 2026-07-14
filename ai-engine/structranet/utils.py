"""
structranet/utils.py — Shared helper functions extracted from the original main.py.

Contains catalog_to_inventory() and _build_design_review() which are used by
both the API layer and the CLI orchestrator.
"""

from __future__ import annotations

from typing import Any, Dict, List

from structranet.constants.hardware import DYNAMIPS_MAX_PORTS
from structranet.constants.gns3 import APPLIANCE_NODE_TYPES
from structranet.generation.preflight import PreflightProfile


_DYNAMIPS_MAX_PORTS = DYNAMIPS_MAX_PORTS
_SINGLE_PORT_TYPES = {"vpcs", "traceng", "nat"}
_MAX_EXPANDABLE_PORTS = {
    "iou": 16, "qemu": 8, "docker": 8,
    "virtualbox": 8, "vmware": 10,
    "ethernet_switch": 128, "ethernet_hub": 128,
}


def catalog_to_inventory(catalog: dict) -> List[Dict[str, Any]]:
    inventory = []
    for name, props in catalog.items():
        ntype = props.get("node_type", "")
        entry: Dict[str, Any] = {
            "name": name,
            "gns3_type": ntype,
            "category": props.get("category", ""),
            "requires_image": ntype in APPLIANCE_NODE_TYPES,
        }
        if ntype in _SINGLE_PORT_TYPES:
            entry["port_count"] = 1
        elif ntype == "dynamips":
            platform = props.get("platform", "").lower()
            entry["port_count"] = _DYNAMIPS_MAX_PORTS.get(platform, 3)
        elif ntype == "iou":
            eth = props.get("ethernet_adapters", 0)
            ser = props.get("serial_adapters", 0)
            entry["port_count"] = eth * 4 + ser * 4
        elif ntype in _MAX_EXPANDABLE_PORTS:
            entry["port_count"] = _MAX_EXPANDABLE_PORTS[ntype]
        inventory.append(entry)
    return inventory


# ─── Design Review helper ─────────────────────────────────────────────────────

def _build_design_review(
    topology_dict: Dict[str, Any],
    profile: PreflightProfile,
    compatibility_issues: List[str],
) -> tuple[List[str], List[str]]:
    topo = topology_dict.get("topology", {})
    nodes = topo.get("nodes", [])
    links = topo.get("links", [])

    counts_by_type: Dict[str, int] = {}
    for n in nodes:
        ntype = str(n.get("node_type", "unknown"))
        counts_by_type[ntype] = counts_by_type.get(ntype, 0) + 1

    node_types = sorted(counts_by_type)
    thoughts = [
        f"Designed topology with {len(nodes)} node(s) and {len(links)} link(s).",
        "Node type mix: " + ", ".join(
            f"{k}={v}" for k, v in sorted(counts_by_type.items())
        ),
    ]

    assumptions: List[str] = []
    if "dynamips" in node_types:
        assumptions.append(
            "Dynamips images/templates on your machine match the selected catalog names."
        )
    if "iou" in node_types:
        assumptions.append("IOU is available and licensed on your environment.")
    if "qemu" in node_types:
        assumptions.append("Required QEMU images exist on your machine.")
    if "docker" in node_types:
        assumptions.append("Docker is available and integrated with GNS3.")
    if not assumptions:
        assumptions.append(
            "Built-in and selected node types are available on your machine."
        )
    if not str(profile.gns3_version).startswith("2.2"):
        assumptions.append(
            f"GNS3 version '{profile.gns3_version}' may behave differently "
            "than expected 2.2.x."
        )
    if compatibility_issues:
        assumptions.extend(compatibility_issues)

    return thoughts, assumptions
