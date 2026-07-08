#!/usr/bin/env python3
"""
worker.py — Persistent Python worker for the StructuraNet AI engine.

ARCHITECTURE
────────────
Unlike wrapper.py (which starts a fresh Python interpreter per command and
exits), this worker stays alive as a long-running process. Node.js starts it
ONCE at server boot and keeps it alive for the lifetime of the Node process.

Communication uses newline-delimited JSON (JSONL) over stdin/stdout:

    Node.js                        Worker
    ───────                        ──────
    {"id":"1","command":"generate","args":{...}}\n   ──▶
                                   (processes)
                                   ◀──  {"id":"1","event":"thought","data":{...}}\n
                                   ◀──  {"id":"1","event":"phase_change","data":{...}}\n
                                   ◀──  {"id":"1","ok":true,"result":{...}}\n

PROTOCOL
────────
Request envelope (Node → Worker, on stdin):
    {"id": "<request-id>", "command": "<cmd>", "args": {<command-specific>}}

Response envelope (Worker → Node, on stdout) — one of:
    {"id": "<request-id>", "ok": true,  "result": {<command result>}}
    {"id": "<request-id>", "ok": false, "error": {"message": "...", "details": "..."}}

Event envelope (Worker → Node, on stdout) — streamed during processing:
    {"id": "<request-id>", "event": "<event-name>", "data": {<event payload>}}

Each message is exactly ONE line (no embedded newlines in JSON — we rely on
json.dumps with default separators, which produces compact single-line output).

COMMANDS
────────
All commands supported by wrapper.py are supported here:
    generate, edit, export, qa, validate, manifest, brief, catalog, ping

The worker reuses the SAME command handlers (cmd_generate, cmd_edit, ...)
defined in wrapper.py — so behavior is identical. Only the I/O transport
differs: instead of printing RESULT:/EVENT: lines and exiting, the worker
writes JSONL and keeps running.

RESOURCE REUSE
──────────────
On startup, the worker eagerly imports the heavy modules:
  - structranet.ai.*          (OpenAI client init, agent, config_agent, qa)
  - structranet.catalog.*     (appliance catalog, hardware tables)
  - structranet.export.*      (GNS3 exporter, validator)
  - structranet.generation.*  (preflight, topology_finalizer)
  - structranet.constants.*   (schema, appliances, hardware, gns3)

This means the OpenAI client singleton, the appliance catalog, and all
hardware tables are loaded ONCE and reused across every request — eliminating
the 2-4 second cold-start that wrapper.py paid on every invocation.

ERROR RECOVERY
──────────────
If a command raises an unhandled exception, the worker catches it, sends back
an error response with the traceback, and STAYS ALIVE to serve the next
request. The worker only exits when:
  - stdin is closed (Node.js ended the process)
  - a fatal protocol error occurs (malformed JSON request)
  - it receives the "shutdown" command

SHUTDOWN
────────
Send {"id":"x","command":"shutdown"} to gracefully terminate, or simply close
the worker's stdin — the worker will exit with code 0.
"""

from __future__ import annotations

import io
import json
import logging
import os
import sys
import traceback
import contextlib
from argparse import Namespace
from typing import Any, Dict, Optional

# ─── Ensure ai-engine root is on sys.path so `structranet` is importable ─────
# (Same trick wrapper.py uses — Node may spawn from any CWD.)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

# Import wrapper.py as a module so we can reuse its cmd_* handlers and helpers
import wrapper as _wrapper  # noqa: E402

logger = logging.getLogger("worker")

# ═══════════════════════════════════════════════════════════════════════════════
#  PER-REQUEST CONTEXT
# ═══════════════════════════════════════════════════════════════════════════════
# The wrapper's cmd_* functions call module-level _emit_event / _ok / _fail.
# To route their output to the correct request ID, we monkey-patch those
# functions per request using a context variable.

_current_request_id: Optional[str] = None


def _set_current_request_id(req_id: Optional[str]) -> None:
    """Set the request ID that all _emit_event / _ok / _fail calls will tag."""
    global _current_request_id
    _current_request_id = req_id


# ═══════════════════════════════════════════════════════════════════════════════
#  JSONL OUTPUT — the only thing that should ever go to stdout
# ═══════════════════════════════════════════════════════════════════════════════

# Capture the REAL stdout at module load time. During command execution we
# redirect sys.stdout to a StringIO to swallow stray print() calls from
# library code (e.g. the GNS3 exporter prints progress). _send_jsonl always
# writes to _REAL_STDOUT, so JSONL output is never corrupted.
import threading  # noqa: E402
_REAL_STDOUT = sys.stdout
_stdout_lock = threading.Lock()


def _send_jsonl(payload: Dict[str, Any]) -> None:
    """Write one JSON object as a single line to stdout, followed by a newline.

    Always writes to _REAL_STDOUT (captured at module load) — never to the
    redirected sys.stdout, so stray print() calls during command execution
    don't corrupt the JSONL stream.
    """
    line = json.dumps(payload, default=str, separators=(",", ":"))
    with _stdout_lock:
        _REAL_STDOUT.write(line + "\n")
        _REAL_STDOUT.flush()


# ═══════════════════════════════════════════════════════════════════════════════
#  MONKEY-PATCH wrapper.py's output helpers to route via JSONL
# ═══════════════════════════════════════════════════════════════════════════════
# wrapper.py defines _emit_event, _ok, _fail as module-level functions that
# print RESULT:/EVENT: lines and call sys.exit(). We replace them with JSONL
# versions that tag every message with the current request ID and never exit.

def _worker_emit_event(event_type: str, data: Any = None) -> None:
    """Replacement for wrapper._emit_event — sends a JSONL event line."""
    if _current_request_id is None:
        return  # No active request — shouldn't happen, but be safe
    _send_jsonl({
        "id": _current_request_id,
        "event": event_type,
        "data": data,
    })


def _worker_ok(data: Any) -> None:
    """Replacement for wrapper._ok — sends the final JSONL result line."""
    if _current_request_id is None:
        return
    _send_jsonl({
        "id": _current_request_id,
        "ok": True,
        "result": data,
    })


def _worker_fail(message: str, details: str = "") -> None:
    """Replacement for wrapper._fail — sends a JSONL error line.

    Unlike wrapper._fail, this does NOT call sys.exit() — the worker stays
    alive to serve the next request.
    """
    if _current_request_id is None:
        return
    _send_jsonl({
        "id": _current_request_id,
        "ok": False,
        "error": {
            "message": message,
            "details": details,
        },
    })
    # Raise a custom exception to unwind out of the cmd_* handler without
    # killing the process. The dispatcher catches it and continues.
    raise _WorkerCommandError(message, details)


class _WorkerCommandError(Exception):
    """Internal: raised by _worker_fail to unwind out of a command handler."""

    def __init__(self, message: str, details: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.details = details


# Apply the monkey-patches
_wrapper._emit_event = _worker_emit_event
_wrapper._ok = _worker_ok
_wrapper._fail = _worker_fail


# ═══════════════════════════════════════════════════════════════════════════════
#  COMMAND DISPATCHER
# ═══════════════════════════════════════════════════════════════════════════════

def _args_to_namespace(args: Dict[str, Any]) -> Namespace:
    """Convert a JSON args dict into an argparse.Namespace.

    wrapper.py's cmd_* functions read attributes via getattr(args, "...").
    We synthesize a Namespace so they work unchanged. Missing keys default
    to None (matching argparse's behavior for optional args).
    """
    return Namespace(**args)


def _handle_ping(args: Namespace) -> None:
    """Built-in health-check command. Returns worker status + loaded modules."""
    _wrapper._ok({
        "success": True,
        "pong": True,
        "pid": os.getpid(),
        "python_version": sys.version.split()[0],
        "loaded_modules": [
            "structranet.ai.agent",
            "structranet.ai.config_agent",
            "structranet.ai.qa_handler",
            "structranet.catalog.appliance_catalog",
            "structranet.export.gns3_exporter",
            "structranet.export.validator",
        ],
    })


def _handle_shutdown(args: Namespace) -> None:
    """Graceful shutdown — acknowledge then exit."""
    _wrapper._ok({"success": True, "shutting_down": True})
    raise _WorkerShutdown()


class _WorkerShutdown(Exception):
    """Signal to exit the main loop."""


# Map command names to handler functions.
# generate/edit/export/qa/validate/manifest/brief/catalog are reused from
# wrapper.py; ping and shutdown are worker-native.
COMMAND_MAP: Dict[str, Any] = {
    "generate":  _wrapper.cmd_generate,
    "edit":      _wrapper.cmd_edit,
    "export":    _wrapper.cmd_export,
    "qa":        _wrapper.cmd_qa,
    "validate":  _wrapper.cmd_validate,
    "manifest":  _wrapper.cmd_manifest,
    "brief":     _wrapper.cmd_brief,
    "catalog":   _wrapper.cmd_catalog,
    "ping":      _handle_ping,
    "shutdown":  _handle_shutdown,
}

# ═══════════════════════════════════════════════════════════════════════════════
#  CONCURRENCY MODEL — IMPORTANT
# ═══════════════════════════════════════════════════════════════════════════════
# The worker processes requests SEQUENTIALLY in its main loop (one _dispatch_request
# call per stdin line, blocking until complete). This is a deliberate architectural
# decision, not a technical limitation:
#
#   - Sequential processing keeps the worker simple: one request in flight at a
#     time means events on stdout always belong to the active request, and we
#     don't need complex interleaving or shared-state synchronization.
#   - It avoids subtle state-leak bugs that could arise if two LLM calls ran
#     concurrently and both mutated the shared OpenAI client's timeout attribute
#     (see llm_utils._call_with_retry).
#   - The OpenAI API calls (which dominate latency) are I/O-bound, so true
#     parallelism is feasible — but it would require either an async rewrite of
#     the agent/config_agent pipeline or a multi-process worker pool. Neither
#     is justified for the current single-user chat use case where requests
#     are naturally sequential.
#
# IMPLICATION FOR CALLERS (Node.js bridge):
#   If two requests arrive at the bridge concurrently, the bridge sends both
#   to the worker's stdin, but the worker only processes the first — the
#   second waits in stdin's buffer until the first completes. The Node bridge
#   correctly tags each request with a unique ID, so when the worker
#   eventually processes the second request, its events/responses are routed
#   to the correct pending promise. No request is lost, but a long-running
#   generate call WILL delay a subsequent export call.
#
# If higher throughput is needed in the future, introduce a small pool of
# 2-3 worker processes and round-robin requests across them. The bridge's
# request-ID protocol already supports this — only the spawn/queue logic
# would need to change.


def _dispatch_request(req: Dict[str, Any]) -> None:
    """Process one request: look up the command, call it, handle errors.

    This function NEVER raises — all errors are caught and sent back as JSONL
    error responses so the worker stays alive.
    """
    req_id = req.get("id")
    if req_id is None:
        # Fatal protocol error — can't route the response, so just log.
        logger.error("Request missing 'id' field: %s", req)
        _send_jsonl({"id": None, "ok": False, "error": {"message": "Missing 'id' field"}})
        return

    command = req.get("command")
    args_dict = req.get("args", {}) or {}

    if command not in COMMAND_MAP:
        _send_jsonl({
            "id": req_id,
            "ok": False,
            "error": {
                "message": f"Unknown command: {command!r}",
                "details": f"Supported: {sorted(COMMAND_MAP.keys())}",
            },
        })
        return

    # Set the per-request context so _emit_event / _ok / _fail tag output
    # with this request's ID.
    _set_current_request_id(req_id)
    handler = COMMAND_MAP[command]

    # Track whether the handler called _ok() itself. If not, we send a generic
    # success response so Node always gets exactly one result message per request.
    result_sent = {"value": False}

    def _ok_watch(data: Any) -> None:
        result_sent["value"] = True
        _worker_ok(data)

    # Temporarily patch _ok to track whether it was called
    original_ok = _wrapper._ok
    _wrapper._ok = _ok_watch
    try:
        args_ns = _args_to_namespace(args_dict)
        # Redirect stdout to swallow stray print() calls from library code
        # (e.g. the GNS3 exporter prints progress messages). _send_jsonl
        # writes to _REAL_STDOUT, so JSONL output is unaffected.
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            handler(args_ns)

        # If the handler produced stray stdout output, log it to stderr for
        # debugging (it would otherwise be lost).
        stray = buf.getvalue().strip()
        if stray:
            logger.debug("Command %r stray stdout: %s", command, stray[:500])

        # If the handler returned without calling _ok (some cmd_* functions
        # might fall through), send a generic success.
        if not result_sent["value"]:
            _send_jsonl({
                "id": req_id,
                "ok": True,
                "result": {"success": True, "note": "Command completed without explicit _ok()"},
            })

    except _WorkerShutdown:
        raise  # Re-raise to exit the main loop

    except _WorkerCommandError:
        # Already sent via _worker_fail — nothing more to do.
        pass

    except Exception as exc:
        # Unhandled exception in the command handler — send structured error
        # and stay alive.
        tb = traceback.format_exc()
        logger.error("Command %r failed: %s\n%s", command, exc, tb)
        _send_jsonl({
            "id": req_id,
            "ok": False,
            "error": {
                "message": f"{type(exc).__name__}: {exc}",
                "details": tb,
            },
        })

    finally:
        _wrapper._ok = original_ok
        _set_current_request_id(None)


# ═══════════════════════════════════════════════════════════════════════════════
#  EAGER IMPORTS — load heavy modules ONCE at startup
# ═══════════════════════════════════════════════════════════════════════════════

def _warm_up() -> None:
    """Eagerly import heavy modules so the OpenAI client + catalog are ready.

    This is what eliminates the per-request cold start. After this runs, the
    first generate/export call skips all the import work and goes straight
    to computation.

    STATE LEAK AUDIT (verified safe for long-lived worker):
      - OpenAI client singleton (llm_utils._client): stateless, just holds
        API key + base URL. Safe to share. The _call_with_retry helper
        mutates client.timeout per-call — safe ONLY because the worker is
        single-threaded. If concurrency is added, this must be refactored
        to pass timeout per-call instead of mutating the shared client.
      - APPLIANCE_CATALOG, hardware constants, gns3 constants: all frozen
        frozensets / immutable dicts. Never mutated by any code path.
      - Pydantic models (GNS3Project, TopologyRequest): class definitions,
        not instances. No mutable class-level state.
      - SessionState dataclass: instantiated fresh per generate_network_topology
        call — never shared across requests.
      - generate_network_topology / run_phase2 / convert: all use only local
        variables. No module-level mutable state is written.
    """
    # These imports trigger OpenAI client init (via llm_utils) and catalog load
    _send_jsonl({"id": None, "event": "warming_up", "data": {"status": "importing modules"}})

    try:
        import structranet.ai.agent  # noqa: F401  — triggers llm_utils init
        import structranet.ai.config_agent  # noqa: F401
        import structranet.ai.qa_handler  # noqa: F401
        import structranet.ai.context_builder  # noqa: F401
        import structranet.catalog.appliance_catalog  # noqa: F401
        import structranet.catalog.hw_config  # noqa: F401
        import structranet.catalog.port_assigner  # noqa: F401
        import structranet.export.gns3_exporter  # noqa: F401
        import structranet.export.validator  # noqa: F401
        import structranet.generation.preflight  # noqa: F401
        import structranet.generation.topology_finalizer  # noqa: F401
        import structranet.constants.schema  # noqa: F401
        import structranet.constants.appliances  # noqa: F401
        import structranet.constants.hardware  # noqa: F401
        import structranet.constants.gns3  # noqa: F401
        _send_jsonl({"id": None, "event": "ready", "data": {"status": "all modules imported"}})
    except Exception as exc:
        tb = traceback.format_exc()
        _send_jsonl({
            "id": None,
            "ok": False,
            "error": {
                "message": f"Worker warm-up failed: {exc}",
                "details": tb,
            },
        })
        # Don't exit — let Node.js decide whether to restart. Some commands
        # (catalog, ping) may still work even if a heavy module is broken.


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN LOOP — read JSONL from stdin, dispatch, write JSONL to stdout
# ═══════════════════════════════════════════════════════════════════════════════

def main() -> int:
    """Entry point. Returns exit code."""
    # Configure logging to stderr only — stdout is reserved for JSONL.
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format="%(asctime)s [worker] %(levelname)s %(name)s: %(message)s",
    )
    logger.info("Worker starting (pid=%d)", os.getpid())

    # Warm up heavy imports so the first request is fast.
    _warm_up()

    # Main request loop
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        # Parse the JSON request
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            _send_jsonl({
                "id": None,
                "ok": False,
                "error": {
                    "message": f"Malformed JSON request: {exc}",
                    "details": f"Line: {line[:200]}",
                },
            })
            continue

        # Dispatch (handles its own errors and never raises)
        try:
            _dispatch_request(req)
        except _WorkerShutdown:
            logger.info("Shutdown requested — exiting")
            break

    logger.info("Worker exiting (pid=%d)", os.getpid())
    return 0


if __name__ == "__main__":
    sys.exit(main())
