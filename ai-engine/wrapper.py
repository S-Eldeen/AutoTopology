"""
wrapper.py — Complete CLI entry point for Node.js -> Python bridge.

Architecture:
  Node.js (chat_orchestrator.js) spawns this script via child_process:
    python wrapper.py generate --request "campus network with 3 routers"
    python wrapper.py edit --feedback "add a firewall" --topology /path/to/_topology.json
    python wrapper.py export --topology /path/to/_topology.json
    python wrapper.py qa --topic "OSPF configuration"
    python wrapper.py validate --topology /path/to/_topology.json
    python wrapper.py manifest --topology /path/to/_topology.json
    python wrapper.py brief --topology /path/to/_topology.json

  All output is JSON printed to stdout. Node.js parses it and handles
  sessions, SSE streaming, auth, DB, etc.

  Errors are printed to stderr as JSON so Node.js can distinguish them
  from normal output.

  IMPORTANT: This wrapper ONLY imports from surviving Python modules:
    - structranet.ai.*          (agent, config_agent, qa_handler, context_builder)
    - structranet.catalog.*     (appliance_catalog, hw_config, port_assigner)
    - structranet.export.*      (gns3_exporter, validator)
    - structranet.generation.*  (preflight, topology_finalizer)
    - structranet.constants.*   (schema, appliances, hardware, etc.)
    - structranet.utils         (catalog_to_inventory, _build_design_review)

  It does NOT import from deleted modules:
    - structranet.api.*        (DELETED — Node.js handles REST/SSE/models)
    - structranet.core.*       (DELETED — Node.js handles sessions/pipeline/thoughts)
    - structranet.ai.chat_orchestrator (DELETED — Node.js handles LLM tool-calling)
    - structuranet.orchestrator (DELETED — was CLI-only pipeline)

Commands:
  generate    — Phase 1: Generate topology from natural language
  edit        — Phase 1 (edit): Re-generate topology with feedback
  export      — Phase 2 + GNS3 export
  qa          — Cisco knowledge base search
  validate    — Validate a topology JSON file
  manifest    — Generate image requirements checklist
  brief       — Build configuration brief (debugging / inspection)

Usage examples:
  python wrapper.py generate --request "campus network"
  python wrapper.py generate --request "campus network" --profile '{"gns3_version": "2.2"}'
  python wrapper.py edit --feedback "add a firewall" --topology /path/to/_topology.json
  python wrapper.py export --topology /path/to/_topology.json --security-profile basic
  python wrapper.py qa --topic "OSPF configuration"
  python wrapper.py validate --topology /path/to/_topology.json
  python wrapper.py manifest --topology /path/to/_topology.json
  python wrapper.py brief --topology /path/to/_topology.json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
from typing import Any, Dict, List, Optional

# ─── Ensure ai-engine root is on sys.path so `structranet` is importable ─────
# This allows the wrapper to resolve the structranet package regardless of
# where Node.js spawns the process from (CWD may be the backend/ dir).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()


# ═══════════════════════════════════════════════════════════════════════════════
#  OUTPUT HELPERS — The contract with Node.js
# ═══════════════════════════════════════════════════════════════════════════════
#
# The contract is simple:
#   - SUCCESS: Print exactly one JSON object to stdout, then exit 0.
#   - FAILURE: Print a JSON error object to stderr, then exit 1.
#
# This separation lets Node.js:
#   1. Read stdout cleanly (no interleaved log noise).
#   2. Detect errors by checking the exit code OR by reading stderr.
#   3. Route logs to its own logging infrastructure.

def _ok(data: Any) -> None:
    """
    Print a JSON result to stdout for Node.js to parse.

    Uses the RESULT: prefix protocol so Node.js can distinguish
    the final result from intermediate EVENT lines.

    Each result is printed as:  RESULT:<json>
    This allows Node.js to parse stdout line-by-line and handle
    intermediate progress events (via _emit_event) separately.
    """
    print(f"RESULT:{json.dumps(data, default=str)}", flush=True)


def _emit_event(event_type: str, data: Any = None) -> None:
    """
    Print an intermediate progress event to stdout for Node.js to parse.

    Each event is printed as:  EVENT:<json>
    Node.js reads these in real-time via the stdout 'data' event
    and forwards them to the frontend via SSE.

    The event dict has two keys:
      - "event": the SSE event name (e.g. "thought", "phase_change")
      - "data": the SSE event payload

    flush=True is CRITICAL — without it, Python may buffer output
    and Node.js won't see the event until the buffer fills or the
    process exits.
    """
    payload = {"event": event_type, "data": data}
    print(f"EVENT:{json.dumps(payload, default=str)}", flush=True)


def _fail(message: str, details: str = "") -> None:
    """
    Print an error JSON to stderr and exit with code 1.

    Node.js reads stderr when the exit code is non-zero.
    The JSON structure is intentionally simple:
      { "error": "<human-readable message>", "details": "<optional stack/trace>" }

    This function calls sys.exit(1) immediately — it never returns.
    """
    err: Dict[str, str] = {"error": message}
    if details:
        err["details"] = details
    print(json.dumps(err), file=sys.stderr)
    sys.exit(1)


# Keep backward-compatible aliases for the existing generate command
_output_json = _ok
_output_error = _fail


# ═══════════════════════════════════════════════════════════════════════════════
#  LAZY IMPORTS — Only load heavy modules when the command needs them
# ═══════════════════════════════════════════════════════════════════════════════
#
# WHY LAZY?
#   1. Speed: If the user runs `wrapper.py --help`, we don't want to
#      load Pydantic, the LLM client, and the entire catalog just to
#      print a help message.
#   2. Isolation: If one module has an import error, it only fails
#      when that specific command is invoked — not on every invocation.
#   3. Memory: Python's AI modules (openai, pydantic) are heavy.
#      Lazy loading keeps the baseline footprint small.

def _import_agent():
    """
    Import the core AI agent module (structranet.ai.agent).

    Returns (SessionState, generate_network_topology,
             generate_image_manifest, process_and_save_topology).
    """
    from structranet.ai.agent import (
        SessionState,
        generate_network_topology,
        generate_image_manifest,
        process_and_save_topology,
    )
    return SessionState, generate_network_topology, generate_image_manifest, process_and_save_topology


def _import_catalog():
    """
    Import the appliance catalog and inventory builder.

    Returns (load_catalog, catalog_to_inventory).
    """
    from structranet.catalog.appliance_catalog import load_catalog
    from structranet.utils import catalog_to_inventory
    return load_catalog, catalog_to_inventory


def _import_preflight():
    """
    Import preflight profile utilities.

    Returns (PreflightProfile, filter_inventory_by_profile, profile_from_dict).
    """
    from structranet.generation.preflight import (
        PreflightProfile,
        filter_inventory_by_profile,
        profile_from_dict,
    )
    return PreflightProfile, filter_inventory_by_profile, profile_from_dict


def _import_design_review():
    """
    Import design review and compatibility check utilities.

    Returns (_build_design_review, check_topology_compatibility).
    """
    from structranet.utils import _build_design_review
    from structranet.generation.preflight import check_topology_compatibility
    return _build_design_review, check_topology_compatibility


def _import_appliance_types():
    """
    Import appliance/builtin type sets from agent.py.

    Returns (_APPLIANCE_NODE_TYPES, _BUILTIN_NODE_TYPES).
    """
    from structranet.ai.agent import _APPLIANCE_NODE_TYPES, _BUILTIN_NODE_TYPES
    return _APPLIANCE_NODE_TYPES, _BUILTIN_NODE_TYPES


def _import_config_agent():
    """
    Import the Phase 2 config agent.

    Returns (run_phase2, safe_merge_configs, generate_software_configs).
    """
    from structranet.ai.config_agent import (
        run_phase2,
        safe_merge_configs,
        generate_software_configs,
    )
    return run_phase2, safe_merge_configs, generate_software_configs


def _import_context_builder():
    """
    Import the Phase 2 context builder.

    Returns (build_configuration_brief,).
    """
    from structranet.ai.context_builder import build_configuration_brief
    return (build_configuration_brief,)


def _import_qa_handler():
    """
    Import the Cisco QA handler.

    Returns (answer_qa,).
    """
    from structranet.ai.qa_handler import answer_qa
    return (answer_qa,)


def _import_gns3_exporter():
    """
    Import the GNS3 project exporter.

    Returns (convert, export_configs_for_review, ExportError).
    """
    from structranet.export.gns3_exporter import convert, export_configs_for_review, ExportError
    return convert, export_configs_for_review, ExportError


def _import_validator():
    """
    Import the GNS3 project validator.

    Returns (GNS3ProjectValidator,).
    """
    from structranet.export.validator import GNS3ProjectValidator
    return (GNS3ProjectValidator,)


def _import_schema():
    """
    Import the Pydantic topology schema models.

    Returns (GNS3Project, Topology, TopologyRequest).
    """
    from structranet.constants.schema import GNS3Project, Topology, TopologyRequest
    return GNS3Project, Topology, TopologyRequest


def _import_topo_finalizer():
    """
    Import the topology finalizer (VLAN patcher).

    Returns (apply_switch_port_patches,).
    """
    from structranet.generation.topology_finalizer import apply_switch_port_patches
    return (apply_switch_port_patches,)


# ═══════════════════════════════════════════════════════════════════════════════
#  SHARED HELPERS — Used across multiple commands
# ═══════════════════════════════════════════════════════════════════════════════

def _load_json_arg(value: str) -> Any:
    """
    Parse a JSON string passed as a CLI argument.

    Returns None on failure (instead of crashing) so callers can
    apply default values. This is intentional — CLI args from Node.js
    may be empty strings or malformed JSON in edge cases.
    """
    if not value or value.strip() == "":
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def _load_json_file(path: str) -> Dict[str, Any]:
    """Load a JSON file from disk and return the parsed dict."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _load_topology_arg(topology_arg: str) -> Dict[str, Any]:
    """
    Resolve a --topology argument which may be:
      - A file path (detected by existence on disk)
      - A raw JSON string (parsed inline)

    Returns the parsed topology dict.
    """
    # Try as file path first
    if os.path.isfile(topology_arg):
        return _load_json_file(topology_arg)
    # Try as inline JSON string
    parsed = _load_json_arg(topology_arg)
    if parsed is not None and isinstance(parsed, dict):
        return parsed
    _fail(
        f"Cannot resolve --topology argument: not a valid file path or JSON string",
        details=f"Argument: {topology_arg[:200]}",
    )


def _setup_logging(verbose: bool = False):
    """
    Configure Python's logging system.

    CRITICAL: All logs go to stderr. stdout is reserved exclusively
    for the JSON response payload. Mixing logs into stdout would
    corrupt the JSON and cause Node.js parsing failures.
    """
    level = logging.DEBUG if verbose else logging.WARNING
    logging.basicConfig(
        level=level,
        format="%(name)s [%(levelname)s] %(message)s",
        stream=sys.stderr,  # <- NEVER stdout
    )


def _resolve_profile_and_inventory(args):
    """
    Build a PreflightProfile and filtered inventory from CLI args.

    This is the "environment context" — what the user's GNS3 setup
    actually supports. The profile controls:
      - Which emulator types are allowed (QEMU, IOU, Docker, etc.)
      - Which security hardening profile to apply
      - Custom image-to-template mappings
      - Validation strictness

    The inventory is filtered against the profile so the AI agent
    only generates topologies the user's environment can actually run.

    Returns (catalog, inventory, filtered_inventory, blocked_types, profile).
    """
    _, filter_inventory_by_profile, profile_from_dict = _import_preflight()
    load_catalog, catalog_to_inventory = _import_catalog()

    # Load the built-in appliance catalog (or a custom one if provided)
    catalog_path = getattr(args, "catalog_path", None)
    catalog = load_catalog(catalog_path)
    inventory = catalog_to_inventory(catalog)

    # Build the preflight profile from the user's JSON config
    profile_json = _load_json_arg(getattr(args, "profile", "{}") or "{}")
    if profile_json is None:
        profile_json = {}

    profile = profile_from_dict({
        "gns3_version": profile_json.get("gns3_version", "2.2"),
        "supports_iou": profile_json.get("supports_iou", False),
        "supports_qemu": profile_json.get("supports_qemu", True),
        "supports_docker": profile_json.get("supports_docker", False),
        "strict_validation": profile_json.get("strict_validation", True),
        "require_template_image_map": profile_json.get("require_template_image_map", False),
        "template_image_map": profile_json.get("template_image_map"),
        "security_profile": profile_json.get("security_profile", "none"),
    })

    # Filter out device types the profile doesn't support
    filtered_inventory, blocked_types = filter_inventory_by_profile(inventory, profile)

    return catalog, inventory, filtered_inventory, blocked_types, profile


# ═══════════════════════════════════════════════════════════════════════════════
#  TOPOLOGY SUMMARY BUILDER — Enriches raw topology with metadata
# ═══════════════════════════════════════════════════════════════════════════════

def _build_topology_summary(topology_dict: Dict[str, Any], profile: Any) -> Dict[str, Any]:
    """
    Build topology data, requirements, and summary from a topology dict.

    This function takes the raw LLM output (a GNS3Project-compatible dict)
    and produces three enriched data structures that the Node.js layer needs:

    1. topology_data: A simplified view with node/link counts for the
       frontend's topology viewer and review cards.

    2. requirements: An image requirements manifest showing which devices
       need which disk images, and whether those images are available.

    3. design_review + assumptions: Human-readable analysis of the
       topology's design decisions, produced by the AI agent.

    All outputs are plain dicts (not Pydantic models) because Node.js
    doesn't need Python type objects — it just needs JSON.
    """
    _build_design_review, check_topology_compatibility = _import_design_review()
    _APPLIANCE_NODE_TYPES, _BUILTIN_NODE_TYPES = _import_appliance_types()

    from structranet.constants.appliances import APPLIANCE_CATALOG

    topo = topology_dict.get("topology", {})
    nodes_raw = topo.get("nodes", [])
    links_raw = topo.get("links", [])

    # ── Count links per node (for the topology viewer badges) ────────────
    link_counts: Dict[str, int] = {}
    for link in links_raw:
        for ep in link.get("nodes", []):
            nid = ep.get("node_id", "")
            link_counts[nid] = link_counts.get(nid, 0) + 1

    # ── Build simplified TopologyData (for frontend viewer) ──────────────
    topo_nodes = []
    for n in nodes_raw:
        topo_nodes.append({
            "node_id": n.get("node_id", ""),
            "name": n.get("name", ""),
            "node_type": n.get("node_type", ""),
            "template_name": n.get("template_name", ""),
            "link_count": link_counts.get(n.get("node_id", ""), 0),
        })

    topo_links = []
    for link in links_raw:
        eps = link.get("nodes", [])
        if len(eps) >= 2:
            topo_links.append({
                "from_node": eps[0].get("node_id", ""),
                "to_node": eps[1].get("node_id", ""),
                "link_type": link.get("link_type", "ethernet"),
            })

    topology_data = {
        "name": topology_dict.get("name", "Untitled"),
        "nodes": topo_nodes,
        "links": topo_links,
        "node_count": len(topo_nodes),
        "link_count": len(topo_links),
    }

    # ── Build image requirements manifest ────────────────────────────────
    _EMULATOR_CATEGORY = {
        "dynamips": "dynamips", "iou": "iou", "qemu": "qemu",
        "docker": "docker", "virtualbox": "qemu", "vmware": "qemu",
    }
    template_image_map = getattr(profile, "normalized_template_image_map", {}) or {}

    def _resolve_image(template: str, node_type: str) -> Optional[str]:
        user_image = template_image_map.get(template)
        if user_image:
            return user_image
        catalog_entry = APPLIANCE_CATALOG.get(template, {})
        if not catalog_entry:
            return None
        if node_type == "dynamips":
            return catalog_entry.get("image")
        elif node_type == "iou":
            return catalog_entry.get("path")
        elif node_type == "qemu":
            return catalog_entry.get("hda_disk_image")
        elif node_type == "docker":
            return catalog_entry.get("image")
        else:
            return catalog_entry.get("image") or catalog_entry.get("hda_disk_image") or catalog_entry.get("path")

    requirements = []
    for node in nodes_raw:
        nid = node.get("node_id", "?")
        name = node.get("name", "?")
        ntype = node.get("node_type", "")
        template = node.get("template_name", "")

        if ntype in _BUILTIN_NODE_TYPES:
            requirements.append({
                "node_id": nid,
                "name": name,
                "node_type": ntype,
                "template_name": template,
                "category": "builtin",
                "image_required": False,
                "image_file": None,
                "status": "builtin",
            })
        elif ntype in _APPLIANCE_NODE_TYPES:
            image_file = _resolve_image(template, ntype)
            cat = _EMULATOR_CATEGORY.get(ntype, "qemu")
            requirements.append({
                "node_id": nid,
                "name": name,
                "node_type": ntype,
                "template_name": template,
                "category": cat,
                "image_required": True,
                "image_file": image_file,
                "status": "ok" if image_file else "missing",
            })
        else:
            requirements.append({
                "node_id": nid,
                "name": name,
                "node_type": ntype,
                "template_name": template,
                "category": "builtin",
                "image_required": False,
                "image_file": None,
                "status": "builtin",
            })

    # ── Design review + compatibility checks ─────────────────────────────
    compatibility_issues = check_topology_compatibility(topology_dict, profile)
    design_review, assumptions = _build_design_review(topology_dict, profile, compatibility_issues)

    return {
        "topology_data": topology_data,
        "requirements": requirements,
        "design_review": design_review,
        "assumptions": assumptions,
        "compatibility_issues": compatibility_issues,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  COMMAND: generate — Phase 1: NL to topology
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_generate(args: argparse.Namespace) -> None:
    """
    Phase 1: Generate a topology from natural language.

    Input:  request text, inventory, profile
    Output: JSON with topology_dict, topology_data, requirements, thinking_text, etc.
    """
    SessionState, generate_network_topology, generate_image_manifest, process_and_save_topology = _import_agent()

    # ── Validate required argument ────────────────────────────────────────
    user_request = args.request
    if not user_request:
        _fail("--request is required for generate command")

    # ── Resolve environment context (profile + inventory) ────────────────
    catalog, inventory, filtered_inventory, blocked_types, profile = _resolve_profile_and_inventory(args)

    if not filtered_inventory:
        _fail("Profile blocks all available node types in inventory")

    # ── Parse optional arguments ──────────────────────────────────────────
    chat_history = _load_json_arg(getattr(args, "chat_history", "[]") or "[]") or []
    security_profile = getattr(args, "security_profile", "none") or "none"
    output_dir = getattr(args, "output_dir", None) or tempfile.mkdtemp(prefix="structuranet_")

    os.makedirs(output_dir, exist_ok=True)

    # ── Phase 1 LLM call ──────────────────────────────────────────────────
    _emit_event("thought", {"type": "understanding", "content": f"Analyzing network requirements: {user_request[:80]}..."})
    _emit_event("phase_change", {"phase": "generating", "sub_phase": "thinking"})

    result, thinking_text, updated_history = generate_network_topology(
        user_request,
        filtered_inventory,
        disallowed_node_types=blocked_types,
        security_profile=security_profile,
        chat_history=chat_history,
    )

    if result is None:
        _fail("AI generation failed after all retries. Check API key and model config.")

    # ── Hardware injection + VLAN patching ─────────────────────────────────
    _emit_event("thought", {"type": "decision", "content": "Topology generated. Injecting hardware configurations..."})
    _emit_event("phase_change", {"phase": "generating", "sub_phase": "building"})

    phase1_file = os.path.join(output_dir, "_topology.json")
    enriched = process_and_save_topology(result, phase1_file)

    if enriched is None:
        _fail("Hardware injection failed. Check logs for details.")

    topology_dict = enriched.model_dump()

    # ── Image manifest ────────────────────────────────────────────────────
    _emit_event("thought", {"type": "info", "content": "Generating image requirements manifest..."})

    manifest_file = os.path.join(output_dir, "image_manifest.txt")
    template_image_map = getattr(profile, "normalized_template_image_map", {}) or {}
    generate_image_manifest(
        topology_dict,
        template_image_map,
        manifest_file,
        catalog,
    )

    # ── Build response data ───────────────────────────────────────────────
    summary = _build_topology_summary(topology_dict, profile)

    _ok({
        "success": True,
        "phase": "review",
        "thinking_text": thinking_text,
        "chat_history": updated_history,
        "topology_dict": topology_dict,
        "phase1_file": phase1_file,
        "manifest_file": manifest_file,
        **summary,
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  COMMAND: edit — Phase 1 (edit): Re-generate topology with feedback
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_edit(args: argparse.Namespace) -> None:
    """
    Phase 1 (edit): Re-generate topology with user feedback.

    Takes the current topology state and edit feedback, then calls the
    LLM again to produce an updated topology. The existing topology
    provides context so the LLM understands what to modify rather than
    generating from scratch.

    Input:  feedback, current topology, chat history, profile
    Output: Same format as generate — updated topology_dict + summary.
    """
    SessionState, generate_network_topology, generate_image_manifest, process_and_save_topology = _import_agent()

    # ── Validate required arguments ───────────────────────────────────────
    feedback = getattr(args, "feedback", None)
    if not feedback:
        _fail("--feedback is required for edit command")

    topology_arg = getattr(args, "topology", None)
    if not topology_arg:
        _fail("--topology is required for edit command")

    # ── Load current topology ─────────────────────────────────────────────
    current_topology = _load_topology_arg(topology_arg)

    # ── Resolve environment context ───────────────────────────────────────
    catalog, inventory, filtered_inventory, blocked_types, profile = _resolve_profile_and_inventory(args)

    if not filtered_inventory:
        _fail("Profile blocks all available node types in inventory")

    # ── Parse optional arguments ──────────────────────────────────────────
    chat_history = _load_json_arg(getattr(args, "chat_history", "[]") or "[]") or []
    security_profile = getattr(args, "security_profile", "none") or "none"
    original_request = getattr(args, "original_request", "") or ""
    output_dir = getattr(args, "output_dir", None) or tempfile.mkdtemp(prefix="structuranet_")

    os.makedirs(output_dir, exist_ok=True)

    # ── Build the edit prompt ─────────────────────────────────────────────
    # We prepend context about the current topology so the LLM knows what
    # it's modifying. The chat_history carries the conversation from
    # the original generate call so the LLM has full context.
    topo_summary_lines = []
    topo = current_topology.get("topology", current_topology)
    nodes = topo.get("nodes", [])
    links = topo.get("links", [])

    topo_summary_lines.append(f"Current topology has {len(nodes)} node(s) and {len(links)} link(s).")
    for n in nodes:
        topo_summary_lines.append(
            f"  - {n.get('node_id', '?')} ({n.get('name', '?')}, {n.get('node_type', '?')}, "
            f"template={n.get('template_name', '?')})"
        )
    for link in links:
        eps = link.get("nodes", [])
        if len(eps) >= 2:
            topo_summary_lines.append(
                f"  - Link: {eps[0].get('node_id', '?')} <-> {eps[1].get('node_id', '?')} "
                f"({link.get('link_type', 'ethernet')})"
            )

    topo_context = "\n".join(topo_summary_lines)

    # Build the full edit request by combining original + feedback + context
    edit_request_parts = []
    if original_request:
        edit_request_parts.append(f"ORIGINAL REQUEST: {original_request}")
    edit_request_parts.append(f"CURRENT TOPOLOGY:\n{topo_context}")
    edit_request_parts.append(f"USER EDIT FEEDBACK: {feedback}")
    edit_request_parts.append(
        "Apply the requested changes to the current topology. "
        "Keep the existing structure that works and only modify what the user asked for."
    )

    edit_request = "\n\n".join(edit_request_parts)

    # ── Inject current topology context into chat history ─────────────────
    # If the chat history is empty or doesn't already contain topology
    # context, inject it so the LLM has full awareness.
    context_message = {
        "role": "system",
        "content": (
            f"The user wants to edit their existing topology. Here is the current state:\n"
            f"{json.dumps(current_topology, indent=2, default=str)}"
        ),
    }

    # Prepend the topology context to the chat history
    augmented_history = [context_message] + list(chat_history)

    # ── Phase 1 LLM call ──────────────────────────────────────────────────
    result, thinking_text, updated_history = generate_network_topology(
        edit_request,
        filtered_inventory,
        disallowed_node_types=blocked_types,
        security_profile=security_profile,
        chat_history=augmented_history,
    )

    if result is None:
        _fail("AI edit generation failed after all retries. Check API key and model config.")

    # ── Hardware injection + VLAN patching ─────────────────────────────────
    phase1_file = os.path.join(output_dir, "_topology.json")
    enriched = process_and_save_topology(result, phase1_file)

    if enriched is None:
        _fail("Hardware injection failed during edit. Check logs for details.")

    topology_dict = enriched.model_dump()

    # ── Image manifest ────────────────────────────────────────────────────
    manifest_file = os.path.join(output_dir, "image_manifest.txt")
    template_image_map = getattr(profile, "normalized_template_image_map", {}) or {}
    generate_image_manifest(
        topology_dict,
        template_image_map,
        manifest_file,
        catalog,
    )

    # ── Build response data ───────────────────────────────────────────────
    summary = _build_topology_summary(topology_dict, profile)

    _ok({
        "success": True,
        "phase": "review",
        "thinking_text": thinking_text,
        "chat_history": updated_history,
        "topology_dict": topology_dict,
        "phase1_file": phase1_file,
        "manifest_file": manifest_file,
        "edit_feedback": feedback,
        **summary,
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  COMMAND: export — Phase 2 + GNS3 export
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_export(args: argparse.Namespace) -> None:
    """
    Phase 2 + GNS3 export: Generate configs and export .gns3project file.

    Pipeline:
      1. Load Phase 1 topology from file
      2. Run Phase 2 (config generation via config_agent)
      3. Export to .gns3project ZIP (via gns3_exporter)
      4. Optionally validate the .gns3project (via validator)
      5. Return paths and config texts

    Input:  topology file path, security profile, profile settings
    Output: JSON with final_dict, gns3project_path, config_texts, validation results
    """
    topology_arg = getattr(args, "topology", None)
    if not topology_arg:
        _fail("--topology is required for export command")

    # ── Load topology ─────────────────────────────────────────────────────
    topology_dict = _load_topology_arg(topology_arg)

    # ── Parse arguments ───────────────────────────────────────────────────
    security_profile = getattr(args, "security_profile", "none") or "none"
    output_dir = getattr(args, "output_dir", None) or tempfile.mkdtemp(prefix="structuranet_export_")
    no_validate = getattr(args, "no_validate", False)

    os.makedirs(output_dir, exist_ok=True)

    # ── Resolve profile for image mapping ─────────────────────────────────
    profile_json = _load_json_arg(getattr(args, "profile", "{}") or "{}") or {}
    _, _, profile_from_dict = _import_preflight()
    profile = profile_from_dict({
        "gns3_version": profile_json.get("gns3_version", "2.2"),
        "supports_iou": profile_json.get("supports_iou", False),
        "supports_qemu": profile_json.get("supports_qemu", True),
        "supports_docker": profile_json.get("supports_docker", False),
        "security_profile": profile_json.get("security_profile", security_profile),
        "template_image_map": profile_json.get("template_image_map"),
    })
    template_image_map = getattr(profile, "normalized_template_image_map", {}) or {}

    # ── Phase 2: Config generation ────────────────────────────────────────
    _emit_event("thought", {"type": "info", "content": f"Generating device configurations with '{security_profile}' security profile..."})
    _emit_event("phase_change", {"phase": "exporting", "sub_phase": "finalizing"})

    run_phase2, _, _ = _import_config_agent()
    (apply_switch_port_patches,) = _import_topo_finalizer()

    # Ensure VLAN patches are applied before Phase 2
    from structranet.constants.gns3 import VLAN_PATCHED_KEY
    if not topology_dict.get(VLAN_PATCHED_KEY):
        apply_switch_port_patches(topology_dict)

    # Save Phase 1 topology to a temp file for Phase 2
    phase1_file = os.path.join(output_dir, "_topology_phase1.json")
    with open(phase1_file, "w", encoding="utf-8") as f:
        json.dump(topology_dict, f, indent=2, default=str)

    final_file = os.path.join(output_dir, "final_topology.json")
    final_dict = run_phase2(
        phase1_file,
        output_path=final_file,
        security_profile=security_profile,
    )

    if final_dict is None:
        # Phase 2 failed — still attempt export with Phase 1 data
        # so the user gets a .gns3project file even without configs
        logging.getLogger("wrapper").warning(
            "Phase 2 config generation failed — exporting Phase 1 topology without software configs"
        )
        final_dict = topology_dict
        # Write Phase 1 topology as the "final" for the exporter
        with open(final_file, "w", encoding="utf-8") as f:
            json.dump(final_dict, f, indent=2, default=str)

    # ── GNS3 export ───────────────────────────────────────────────────────
    _emit_event("thought", {"type": "info", "content": "Exporting GNS3 portable project..."})
    _emit_event("phase_change", {"phase": "exporting", "sub_phase": "exporting"})

    convert, export_configs_for_review, ExportError = _import_gns3_exporter()

    project_name = final_dict.get("name", "StructuraNet_Project")
    gns3project_path = os.path.join(output_dir, f"{project_name}.gns3project")
    config_review_dir = os.path.join(output_dir, "configs_review")

    try:
        convert(
            final_dict,
            output_path=gns3project_path,
            name_override=project_name,
            image_map=template_image_map,
            config_review_dir=config_review_dir,
        )
    except ExportError as exc:
        _fail(f"GNS3 export failed: {exc}", details=str(exc.__class__.__name__))
    except Exception as exc:
        _fail(f"GNS3 export failed with unexpected error: {exc}", details=str(exc.__class__.__name__))

    # ── Validation (optional) ─────────────────────────────────────────────
    validation_result = None
    if not no_validate and os.path.isfile(gns3project_path):
        (GNS3ProjectValidator,) = _import_validator()
        try:
            validator = GNS3ProjectValidator(gns3project_path)
            # Redirect validator's print output to stderr so it doesn't
            # corrupt our stdout JSON contract
            import io
            import contextlib

            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                is_valid = validator.validate()

            validation_result = {
                "valid": is_valid,
                "stats": validator.stats,
                "issues": validator.issues,
            }
        except Exception as exc:
            logging.getLogger("wrapper").warning(
                "GNS3 project validation failed: %s", exc
            )
            validation_result = {
                "valid": None,
                "error": str(exc),
            }

    # ── Extract config texts for Node.js ──────────────────────────────────
    config_texts: Dict[str, str] = {}
    topo = final_dict.get("topology", final_dict)
    for node in topo.get("nodes", []):
        nid = node.get("node_id", "?")
        ntype = node.get("node_type", "")
        props = node.get("properties", {})
        name = node.get("name", nid)

        if ntype in ("dynamips", "iou", "qemu"):
            content = props.get("startup_config_content", "")
            if content:
                config_texts[name] = content
        elif ntype == "vpcs":
            content = props.get("startup_script", "")
            if content:
                config_texts[name] = content

    # ── Generate image manifest ───────────────────────────────────────────
    # Writes a user-friendly "Shopping List" checklist of required images,
    # so the user knows what to install in GNS3 before importing the project.
    # Uses the same generate_image_manifest() helper that cmd_generate uses.
    _emit_event("thought", {"type": "info", "content": "Generating image requirements checklist..."})
    manifest_file = os.path.join(output_dir, "image_manifest.txt")
    try:
        from structranet.ai.agent import generate_image_manifest  # noqa: PLC0415
        generate_image_manifest(
            final_dict,
            template_image_map,
            manifest_file,
        )
    except Exception as exc:
        logging.getLogger("wrapper").warning(
            "Image manifest generation failed: %s", exc
        )
        manifest_file = None  # Don't include in response if it failed

    # ── Build response ────────────────────────────────────────────────────
    response = {
        "success": True,
        "phase": "complete",
        "final_dict": final_dict,
        "final_file": final_file,
        "gns3project_path": gns3project_path,
        "config_review_dir": config_review_dir,
        "config_texts": config_texts,
        "manifest_file": manifest_file,
    }

    if validation_result is not None:
        response["validation"] = validation_result

    _ok(response)


# ═══════════════════════════════════════════════════════════════════════════════
#  COMMAND: qa — Cisco knowledge base search
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_qa(args: argparse.Namespace) -> None:
    """
    Answer a Cisco configuration / protocol question.

    Uses the local Cisco IOS knowledge base + LLM to answer questions
    about network protocols, commands, and configurations.

    Input:  topic (question text)
    Output: JSON with topic, answer (Markdown-formatted)
    """
    topic = getattr(args, "topic", None) or getattr(args, "question", None)
    if not topic:
        _fail("--topic is required for qa command")

    (answer_qa,) = _import_qa_handler()

    answer = answer_qa(topic)

    _ok({
        "success": True,
        "topic": topic,
        "answer": answer,
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  COMMAND: validate — Validate a topology JSON file
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_validate(args: argparse.Namespace) -> None:
    """
    Validate a topology JSON file against the GNS3Project Pydantic schema.

    Performs two layers of validation:
      1. Pydantic schema validation (structure, types, constraints)
      2. Structural integrity checks (connected graph, port limits, etc.)

    Input:  topology file path or JSON string
    Output: JSON with valid (bool), node_count, link_count, and any errors
    """
    topology_arg = getattr(args, "topology", None)
    if not topology_arg:
        _fail("--topology is required for validate command")

    # ── Load topology ─────────────────────────────────────────────────────
    topology_dict = _load_topology_arg(topology_arg)

    # ── Pydantic validation ───────────────────────────────────────────────
    GNS3Project, Topology, TopologyRequest = _import_schema()

    errors: List[str] = []
    warnings: List[str] = []

    # Try GNS3Project (full topology) validation
    try:
        validated = GNS3Project.model_validate(topology_dict)
        topo = validated.topology
        node_count = len(topo.nodes)
        link_count = len(topo.links)

        # ── Additional structural checks ──────────────────────────────────
        # Check connected graph
        node_ids = {n.node_id for n in topo.nodes}
        if node_ids:
            # Union-Find for connectivity check
            parent = {nid: nid for nid in node_ids}

            def find(x: str) -> str:
                while parent[x] != x:
                    parent[x] = parent[parent[x]]
                    x = parent[x]
                return x

            def union(a: str, b: str) -> None:
                ra, rb = find(a), find(b)
                if ra != rb:
                    parent[ra] = rb

            for link in topo.links:
                eps = link.nodes
                if len(eps) >= 2:
                    union(eps[0].node_id, eps[1].node_id)

            groups = set(find(nid) for nid in node_ids)
            if len(groups) > 1:
                warnings.append(
                    f"Topology is not fully connected — {len(groups)} isolated group(s) detected"
                )

        _ok({
            "success": True,
            "valid": True,
            "node_count": node_count,
            "link_count": link_count,
            "errors": errors,
            "warnings": warnings,
        })

    except Exception as exc:
        errors.append(f"Pydantic validation failed: {str(exc)}")

        # Still try to count nodes/links for the response
        topo = topology_dict.get("topology", topology_dict)
        node_count = len(topo.get("nodes", []))
        link_count = len(topo.get("links", []))

        _ok({
            "success": True,
            "valid": False,
            "node_count": node_count,
            "link_count": link_count,
            "errors": errors,
            "warnings": warnings,
        })


# ═══════════════════════════════════════════════════════════════════════════════
#  COMMAND: manifest — Generate image requirements checklist
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_manifest(args: argparse.Namespace) -> None:
    """
    Generate an image requirements checklist for the topology.

    Scans the topology for all appliance nodes and determines which
    disk images are required, which are available in the user's
    template_image_map, and which are missing.

    Input:  topology file path, optional template_image_map
    Output: JSON with manifest_path, manifest_content, requirements list
    """
    topology_arg = getattr(args, "topology", None)
    if not topology_arg:
        _fail("--topology is required for manifest command")

    # ── Load topology ─────────────────────────────────────────────────────
    topology_dict = _load_topology_arg(topology_arg)

    # ── Parse template_image_map ──────────────────────────────────────────
    template_image_map_arg = _load_json_arg(
        getattr(args, "template_image_map", "{}") or "{}"
    ) or {}
    if not isinstance(template_image_map_arg, dict):
        template_image_map_arg = {}

    # ── Parse output path ─────────────────────────────────────────────────
    output_path = getattr(args, "output", None)

    # ── Generate manifest ─────────────────────────────────────────────────
    _, _, generate_image_manifest, _ = _import_agent()
    load_catalog, _ = _import_catalog()
    catalog = load_catalog()

    if output_path:
        manifest_path = output_path
        os.makedirs(os.path.dirname(manifest_path) or ".", exist_ok=True)
    else:
        output_dir = tempfile.mkdtemp(prefix="structuranet_manifest_")
        manifest_path = os.path.join(output_dir, "image_manifest.txt")

    generate_image_manifest(
        topology_dict,
        template_image_map_arg,
        manifest_path,
        catalog,
    )

    # ── Read manifest content ─────────────────────────────────────────────
    manifest_content = ""
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest_content = f.read()

    # ── Also build structured requirements ────────────────────────────────
    _, _, profile_from_dict = _import_preflight()
    profile = profile_from_dict({
        "template_image_map": template_image_map_arg,
    })
    summary = _build_topology_summary(topology_dict, profile)

    _ok({
        "success": True,
        "manifest_path": manifest_path,
        "manifest_content": manifest_content,
        "requirements": summary.get("requirements", []),
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  COMMAND: brief — Build configuration brief
# ═══════════════════════════════════════════════════════════════════════════════

def cmd_brief(args: argparse.Namespace) -> None:
    """
    Build a configuration brief from a topology (debugging / inspection).

    Generates a human-readable Configuration Brief that describes all
    the topology's nodes, links, segments, VLAN assignments, and
    architectural advice. This is the same brief used as input to
    Phase 2 config generation.

    Input:  topology file path
    Output: JSON with brief text and brief_length
    """
    topology_arg = getattr(args, "topology", None)
    if not topology_arg:
        _fail("--topology is required for brief command")

    # ── Load topology ─────────────────────────────────────────────────────
    topology_dict = _load_topology_arg(topology_arg)

    # ── Ensure VLAN patches are applied ───────────────────────────────────
    (apply_switch_port_patches,) = _import_topo_finalizer()
    from structranet.constants.gns3 import VLAN_PATCHED_KEY
    if not topology_dict.get(VLAN_PATCHED_KEY):
        apply_switch_port_patches(topology_dict)

    # ── Build brief ───────────────────────────────────────────────────────
    (build_configuration_brief,) = _import_context_builder()
    brief = build_configuration_brief(topology_dict)

    _ok({
        "success": True,
        "brief": brief,
        "brief_length": len(brief),
    })


def cmd_catalog(args: argparse.Namespace) -> None:
    """
    Export the appliance catalog as a flat JSON list.

    This command exposes the built-in APPLIANCE_CATALOG (the single source
    of truth for device definitions) to the Node.js backend, which forwards
    it to the frontend for the GNS3 profile onboarding popup.

    The frontend uses this list to render a searchable dropdown of all
    supported devices, so the user can map each device template to the
    image filename installed on their GNS3 server.

    Output: JSON object with a "devices" array. Each device entry has:
      - template:    str   — the catalog key (e.g. "Cisco 7200")
      - node_type:   str   — GNS3 node type (dynamips, iou, qemu, docker, ...)
      - platform:    str|None — platform identifier (e.g. "c7200") if applicable
      - category:    str   — human-readable category for grouping in the UI
      - default_image: str|None — primary image filename from the catalog
      - additional_images: list[str] — extra disk images (hdb, hdc, hdd)
      - requires_image: bool — whether this device needs a user-supplied image
    """
    from structranet.constants.appliances import APPLIANCE_CATALOG  # noqa: PLC0415
    from structranet.constants.gns3 import APPLIANCE_NODE_TYPES  # noqa: PLC0415

    # ── Category mapping by node_type ─────────────────────────────────────
    # Built-in nodes (switches, hubs, VPCS, cloud, NAT) don't need images.
    # Appliance nodes (dynamips, iou, qemu, docker) do.
    _CATEGORY_BY_NODE_TYPE = {
        "dynamips":         "Cisco Routers (Dynamips)",
        "iou":              "Cisco IOU (L2/L3)",
        "qemu":             "QEMU Appliances",
        "docker":           "Docker Containers",
        "vpcs":             "Virtual PCs (built-in)",
        "ethernet_switch":  "Built-in Switches",
        "ethernet_hub":     "Built-in Hubs",
        "cloud":            "Built-in Network Nodes",
        "nat":              "Built-in Network Nodes",
        "frame_relay_switch": "Built-in Switches",
        "atm_switch":       "Built-in Switches",
        "traceng":          "Built-in Network Nodes",
    }

    # ── Image field names in priority order ───────────────────────────────
    # hda is always the primary; hdb/hdc/hdd are additional disks.
    _PRIMARY_IMAGE_KEYS = ("image", "hda_disk_image")
    _EXTRA_IMAGE_KEYS = ("hdb_disk_image", "hdc_disk_image", "hdd_disk_image")

    devices: List[Dict[str, Any]] = []

    for template_name, props in APPLIANCE_CATALOG.items():
        node_type = props.get("node_type", "")
        platform = props.get("platform")  # may be None for non-Dynamips
        category = _CATEGORY_BY_NODE_TYPE.get(node_type, "Other")
        requires_image = node_type in APPLIANCE_NODE_TYPES

        # ── Extract default image(s) ──────────────────────────────────────
        default_image = None
        for key in _PRIMARY_IMAGE_KEYS:
            val = props.get(key)
            if val:
                default_image = val
                break

        additional_images = [
            props[key] for key in _EXTRA_IMAGE_KEYS if props.get(key)
        ]

        devices.append({
            "template":          template_name,
            "node_type":         node_type,
            "platform":          platform,
            "category":          category,
            "default_image":     default_image,
            "additional_images": additional_images,
            "requires_image":    requires_image,
        })

    # ── Sort: appliances first (by category then name), then built-ins ────
    devices.sort(key=lambda d: (
        d["requires_image"],        # True (1) sorts after False (0) — but we
        d["category"],              # want appliances first, so we negate below.
        d["template"],
    ))
    # Reverse so requires_image=True (1) comes first
    devices.sort(key=lambda d: not d["requires_image"])

    _ok({
        "success": True,
        "count": len(devices),
        "devices": devices,
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  CLI ARGUMENT PARSER — Defines the command-line interface
# ═══════════════════════════════════════════════════════════════════════════════

def build_parser() -> argparse.ArgumentParser:
    """
    Build and return the argparse parser for wrapper.py.

    All 7 commands are implemented: generate, edit, export, qa,
    validate, manifest, brief.
    """
    parser = argparse.ArgumentParser(
        description="StructuraNet AI — Python wrapper for Node.js",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable debug logging to stderr (useful during development)",
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # ── generate ──────────────────────────────────────────────────────────
    p_gen = subparsers.add_parser(
        "generate",
        help="Phase 1: Generate topology from natural language",
    )
    p_gen.add_argument(
        "--request", "-r",
        required=True,
        help="Network description in natural language (e.g., 'campus network with 3 routers')",
    )
    p_gen.add_argument(
        "--inventory",
        type=str,
        default=None,
        help="JSON array of inventory items (or omit to use built-in catalog)",
    )
    p_gen.add_argument(
        "--profile",
        type=str,
        default="{}",
        help="JSON object with GNS3 profile settings (version, features, image map)",
    )
    p_gen.add_argument(
        "--chat-history",
        type=str,
        default="[]",
        help="JSON array of previous chat messages (for multi-turn conversations)",
    )
    p_gen.add_argument(
        "--security-profile",
        type=str,
        default="none",
        choices=["none", "basic", "enterprise"],
        help="Security hardening profile: none (default), basic, or enterprise",
    )
    p_gen.add_argument(
        "--catalog-path",
        type=str,
        default=None,
        help="Path to custom appliance catalog JSON (defaults to built-in catalog)",
    )
    p_gen.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory for generated files (defaults to temp directory)",
    )

    # ── edit ──────────────────────────────────────────────────────────────
    p_edit = subparsers.add_parser(
        "edit",
        help="Phase 1 (edit): Re-generate topology with feedback",
    )
    p_edit.add_argument(
        "--feedback",
        type=str,
        required=True,
        help="Edit feedback from user (e.g., 'add a firewall between R1 and SW1')",
    )
    p_edit.add_argument(
        "--topology",
        type=str,
        required=True,
        help="Path to current topology JSON file (or inline JSON string)",
    )
    p_edit.add_argument(
        "--chat-history",
        type=str,
        default="[]",
        help="JSON array of previous chat messages",
    )
    p_edit.add_argument(
        "--security-profile",
        type=str,
        default="none",
        choices=["none", "basic", "enterprise"],
        help="Security hardening profile",
    )
    p_edit.add_argument(
        "--original-request",
        type=str,
        default=None,
        help="Original user request string (for context continuity)",
    )
    p_edit.add_argument(
        "--profile",
        type=str,
        default="{}",
        help="JSON object with GNS3 profile settings",
    )
    p_edit.add_argument(
        "--catalog-path",
        type=str,
        default=None,
        help="Path to custom appliance catalog JSON",
    )
    p_edit.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory for generated files",
    )

    # ── export ────────────────────────────────────────────────────────────
    p_export = subparsers.add_parser(
        "export",
        help="Phase 2 + GNS3 export: Generate configs and export .gns3project",
    )
    p_export.add_argument(
        "--topology",
        type=str,
        required=True,
        help="Path to Phase 1 topology JSON file (or inline JSON string)",
    )
    p_export.add_argument(
        "--security-profile",
        type=str,
        default="none",
        choices=["none", "basic", "enterprise"],
        help="Security hardening profile",
    )
    p_export.add_argument(
        "--profile",
        type=str,
        default="{}",
        help="JSON object with GNS3 profile settings",
    )
    p_export.add_argument(
        "--catalog-path",
        type=str,
        default=None,
        help="Path to custom appliance catalog JSON",
    )
    p_export.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory for generated files",
    )
    p_export.add_argument(
        "--no-validate",
        action="store_true",
        default=False,
        help="Skip GNS3 project validation after export",
    )

    # ── qa ────────────────────────────────────────────────────────────────
    p_qa = subparsers.add_parser(
        "qa",
        help="Cisco knowledge base search",
    )
    p_qa.add_argument(
        "--topic",
        type=str,
        required=True,
        help="Topic to search (e.g., 'OSPF configuration')",
    )

    # ── validate ──────────────────────────────────────────────────────────
    p_validate = subparsers.add_parser(
        "validate",
        help="Validate a topology JSON file against the GNS3Project schema",
    )
    p_validate.add_argument(
        "--topology",
        type=str,
        required=True,
        help="Path to topology JSON file (or inline JSON string)",
    )

    # ── manifest ──────────────────────────────────────────────────────────
    p_manifest = subparsers.add_parser(
        "manifest",
        help="Generate image requirements checklist",
    )
    p_manifest.add_argument(
        "--topology",
        type=str,
        required=True,
        help="Path to topology JSON file (or inline JSON string)",
    )
    p_manifest.add_argument(
        "--template-image-map",
        type=str,
        default="{}",
        help="JSON object mapping template_name -> image_filename",
    )
    p_manifest.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output path for manifest .txt file",
    )

    # ── brief ─────────────────────────────────────────────────────────────
    p_brief = subparsers.add_parser(
        "brief",
        help="Build configuration brief (debugging / inspection)",
    )
    p_brief.add_argument(
        "--topology",
        type=str,
        required=True,
        help="Path to topology JSON file (or inline JSON string)",
    )

    # ── catalog ───────────────────────────────────────────────────────────
    p_catalog = subparsers.add_parser(
        "catalog",
        help="Export the appliance catalog as JSON (for the GNS3 profile onboarding UI)",
    )

    return parser


# ═══════════════════════════════════════════════════════════════════════════════
#  COMMAND MAP — Maps command names to handler functions
# ═══════════════════════════════════════════════════════════════════════════════

COMMAND_MAP = {
    "generate": cmd_generate,
    "edit": cmd_edit,
    "export": cmd_export,
    "qa": cmd_qa,
    "validate": cmd_validate,
    "manifest": cmd_manifest,
    "brief": cmd_brief,
    "catalog": cmd_catalog,
}


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN — Entry point
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    """
    Parse CLI arguments and dispatch to the appropriate command handler.

    This function is the single entry point for all Python execution.
    Node.js always invokes: python wrapper.py <command> [options]

    Error handling strategy:
      - If the command is missing or unknown -> print help + exit 1.
      - If the command handler raises an exception -> catch it, print
        a JSON error to stderr, and exit 1.
      - This ensures Node.js ALWAYS gets a structured error response,
        never a raw Python traceback on stdout.
    """
    parser = build_parser()
    args = parser.parse_args()

    _setup_logging(getattr(args, "verbose", False))

    command = getattr(args, "command", None)
    if not command or command not in COMMAND_MAP:
        parser.print_help()
        sys.exit(1)

    try:
        COMMAND_MAP[command](args)
    except Exception as exc:
        # Catch-all: ensure any unhandled exception becomes a structured
        # JSON error on stderr, not a raw traceback on stdout.
        _fail(f"Unhandled exception in {command}: {exc}", details=str(exc.__class__.__name__))


if __name__ == "__main__":
    main()
