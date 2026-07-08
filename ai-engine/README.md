# Structranet AI Engine

> **Natural Language → Validated GNS3 Topology → Portable `.gns3project`**

The `ai-engine` is a Python backend that takes a plain-English description of a network and produces a fully-configured, import-ready GNS3 portable project file. It handles topology design, hardware slot assignment, VLAN patching, IP addressing, Cisco IOS startup-config generation, and structural validation in a fully automated pipeline.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Pipeline Phases](#pipeline-phases)
4. [Module Reference](#module-reference)
5. [Request Workflow](#request-workflow)
6. [Setup & Dependencies](#setup--dependencies)
7. [Running the Engine](#running-the-engine)
8. [Design Decisions](#design-decisions)
9. [Security Profiles](#security-profiles)
10. [Extending the Catalog](#extending-the-catalog)

---

## Overview

Structranet AI Engine solves a hard problem: GNS3 project files require precise hardware slot assignments, port numbers, VLAN configurations, and Cisco IOS startup configs that are extremely tedious to write by hand. One wrong adapter number or missing `no shutdown` causes silent failures at simulation start.

The engine eliminates that by separating concerns into two deterministic phases:

- **Phase 1** — The LLM designs the *logical* topology (which devices exist, which connect to which). Hardware details are injected deterministically by Python, never by the LLM.
- **Phase 2** — The LLM generates *software configs* (IP addresses, routing, security). A three-gate safe-merge ensures the LLM can never corrupt hardware properties.

The result is a `.gns3project` ZIP that imports cleanly into GNS3 GUI.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        FastAPI Layer                         │
│  /sessions  /agent/chat  /sessions/{id}/events (SSE)        │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│   Node backend orchestrator      │  LLM Tool-Calling loop
│  No FSM. LLM picks which tools   │  (up to 6 rounds per turn)
│  to call based on context.       │
└──────┬──────────┬────────────────┘
       │          │
  ┌────▼───┐  ┌───▼──────────────┐
  │Phase 1 │  │  Phase 2+Export  │
  │agent.py│  │ config_agent.py  │
  └────┬───┘  └───┬──────────────┘
       │           │
       ▼           ▼
  ┌─────────────────────────────────────────────────┐
  │               Core Pipeline                     │
  │                                                 │
  │  port_assigner.py  → deterministic port numbers │
  │  hw_config.py      → slot/adapter expansion     │
  │  topology_finalizer.py → VLAN trunk/access patch│
  │  context_builder.py    → Config Brief for LLM   │
  │  gns3_exporter.py      → ZIP assembly           │
  │  validator.py          → structural checks      │
  └─────────────────────────────────────────────────┘
```

### Key Architectural Principles

| Principle | Implementation |
|---|---|
| **LLM does logic, Python does hardware** | Phase 1 LLM outputs only `nodes[]` + `connections[]`. Port numbers are computed by `port_assigner.py`. |
| **Single Source of Truth** | All hardware constants (modules, port counts, RAM) live exclusively in `constants/hardware.py`. No other file defines local copies. |
| **Safe Merge** | `config_agent.safe_merge_configs()` enforces a three-gate whitelist: only known config keys, no overwrite of existing values, type checking. |
| **Deterministic VLAN patching** | `topology_finalizer.apply_switch_port_patches()` runs after hardware injection to set trunk/access ports — not inferred by the LLM. |

---

## Pipeline Phases

### Phase 1 — Topology Generation

**Entry:** `ai/agent.py:generate_network_topology()`

1. The LLM receives the user's request + available inventory + link-limit constraints.
2. It returns a JSON envelope: `{ "thinking": "...", "topology": { "nodes": [...], "connections": [...] } }`.
   - Port numbers are **not** present in the LLM output.
3. **Auto-repair** runs before validation:
   - `_repair_duplicate_connections` — deduplicates parallel links.
   - `_repair_single_port_violations` — inserts intermediary switches for NAT/VPCS overflow.
   - `_repair_disconnected_graph` — bridges isolated node groups.
4. `port_assigner.assign_ports()` computes every `adapter_number` / `port_number` deterministically.
5. Pydantic validates the result (`GNS3Project`).
6. On approval: `hw_config.inject_hardware_config()` expands slots, `topology_finalizer.apply_switch_port_patches()` sets VLAN port types, `_enrich_nodes()` adds metadata.

### Phase 2 — Software Configuration

**Entry:** `ai/config_agent.py:run_phase2()`

1. `context_builder.build_configuration_brief()` reads the hardware-injected topology and produces a human-readable text brief describing segments, interfaces, VLAN assignments, and NAT roles.
2. The LLM receives the brief and returns `{ node_id: { config_key: value } }`.
3. `safe_merge_configs()` merges using three gates:
   - **Gate 1 — Whitelist**: only `startup_config_content`, `private_config_content`, `startup_script`, `start_command`, `environment` are accepted.
   - **Gate 2 — No-overwrite**: existing non-empty values are never replaced.
   - **Gate 3 — Type check**: value must match the expected Python type.
4. `gns3_exporter.convert()` assembles the `.gns3project` ZIP.
5. `validator.GNS3ProjectValidator` runs 11 structural checks.

---

## Module Reference

### `ai/`

| File | Responsibility |
|---|---|
| `agent.py` | Phase 1 orchestrator. Builds the topology prompt, calls the LLM, runs auto-repair, validates, calls hardware injection. |
| `config_agent.py` | Phase 2 orchestrator. Builds the config brief, calls the LLM, runs safe-merge, triggers export. |
| `context_builder.py` | Reads a hardware-injected topology and produces the Configuration Brief string for Phase 2. Also exposes `build_segments()` and `_identify_core_switches()` used by `topology_finalizer.py`. |
| `llm_utils.py` | Shared singleton OpenAI client, retry wrapper, JSON extraction. **Single source of truth** for all LLM calls. |
| `security_prompts.py` | Injects security-profile-specific prompt blocks into Phase 1 and Phase 2 prompts. |
| `qa_handler.py` | Answers Cisco IOS configuration questions using the local knowledge base + LLM fallback. |

### `catalog/`

| File | Responsibility |
|---|---|
| `appliance_catalog.py` | Loads the static catalog with optional user JSON overlay. Provides `get_appliance()` lookup (case-insensitive). |
| `hw_config.py` | Injects hardware properties into topology nodes: Dynamips slot modules, IOU adapter counts, switch `ports_mapping`, QEMU adapter counts. |
| `port_assigner.py` | Deterministic port assignment. Converts `TopologyRequest` (no port numbers) into `Link` objects with correct `adapter_number` / `port_number` per GNS3 node type rules. |

### `constants/`

| File | Responsibility |
|---|---|
| `hardware.py` | **SSOT** for all hardware data: module lists, port counts, RAM defaults, slot configs, compatibility matrix, serial modules. |
| `gns3.py` | Node-type taxonomy, scene geometry, symbol paths, port-name format strings, `FILE_CONFIG_TRIPLETS`. |
| `schema.py` | Pydantic v2 models: `TopologyRequest`, `GNS3Project`, `Node`, `Link`, `Connection`. Includes validators for connectivity, port collisions, and link limits. |
| `appliances.py` | Static appliance catalog data — 40+ devices across Dynamips, IOU, QEMU, Docker. |
| `ai.py` | Conservative AI-side link limits per platform, `MAX_RETRIES`. |
| `phase2.py` | Phase 2 whitelist keys and value-type constraints. |
| `validation.py` | Backward-compatible re-exports from `hardware.py` and `gns3.py`. |

### `core/`

| File | Responsibility |
|---|---|
| `pipeline.py` | Async wrappers for Phase 1 and Phase 2 + Export. Runs synchronous pipeline code in `asyncio.to_thread()` and broadcasts SSE events. |
| `session.py` | In-memory session registry with asyncio fan-out queues for SSE streaming. |
| `thought_parser.py` | Classifies raw LLM chain-of-thought text into typed `ThoughtChunk` objects (understanding / decision / assumption / warning). |

### `export/`

| File | Responsibility |
|---|---|
| `gns3_exporter.py` | Converts the final topology dict into a GNS3-compliant `.gns3project` ZIP. Handles UUID assignment, canvas layout, port name resolution, config file packing, and property cleaning. |
| `validator.py` | 11-check deep structural validator: ZIP structure, JSON schema, node validity, Dynamips compat, port integrity, config paths, template IDs, compute references, VLAN sanity, link integrity, UUID formats. |

### `generation/`

| File | Responsibility |
|---|---|
| `preflight.py` | Collects the user's GNS3 environment profile, filters inventory by supported node types, checks topology compatibility. |
| `topology_finalizer.py` | Rewrites `ports_mapping` on every `ethernet_switch` node after hardware injection to set trunk / access port types correctly for the VLAN plan. |

### `api/`

| File | Responsibility |
|---|---|
| `app.py` | FastAPI application. REST endpoints for session lifecycle, generation, edit, approve, SSE events, and all download endpoints. |
| `models.py` | Pydantic v2 request/response models for the API layer. |

---

## Request Workflow

The following describes a complete end-to-end request via the **conversational API** (`/agent/chat`):

```
Frontend: "Design a 3-branch enterprise network with enterprise security"
    │
    ▼
POST /agent/chat  { session_id, message }
    │
    ▼
backend chat.orchestrator.dispatch()
    │  LLM sees conversation history + topology context
    │  LLM calls: generate_new_topology(requirements="...")
    │
    ▼
_tool_generate_new_topology()
    │  1. generate_network_topology()  ← Phase 1 LLM call
    │     └─ auto-repair → port_assigner → Pydantic validation
    │  2. process_and_save_topology()
    │     └─ hw_config.inject_hardware_config()
    │     └─ _enrich_nodes()
    │     └─ topology_finalizer.apply_switch_port_patches()
    │  3. SSE broadcast: topology_ready, requirements_ready, summary_ready
    │
    ▼  (LLM sees tool result with node/link counts)
    │  LLM calls: apply_security_and_export(security_profile="enterprise")
    │
    ▼
_tool_apply_security_and_export()
    │  run_phase2_and_export()
    │  1. config_agent.run_phase2()
    │     └─ context_builder.build_configuration_brief()
    │     └─ generate_software_configs()  ← Phase 2 LLM call
    │     └─ safe_merge_configs()  (3-gate whitelist merge)
    │  2. _stream_config_texts()  → SSE config_text chunks
    │  3. gns3_exporter.convert()  → .gns3project ZIP
    │  4. GNS3ProjectValidator.validate()  → 11 structural checks
    │  5. SSE broadcast: complete { download_url, validator_passed, … }
    │
    ▼
Backend stores the assistant message and streams completion events to the client
    │
    ▼
GET /sessions/{id}/download  → .gns3project file
```

---

## Setup & Dependencies

### Requirements

- **Python 3.11+** (uses `match` syntax in validators, `type X = Y` annotations)
- **pip packages** (see `requirements.txt`):

```
requests
openai
pydantic
python-dotenv
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
sse-starlette>=2.0.0
```

### Environment Variables

Create a `.env` file in `ai-engine/`:

```env
# Required
ROUTER_API_KEY=your_openrouter_or_openai_key

# Optional overrides
ROUTER_BASE_URL=https://openrouter.ai/api/v1   # default: OpenAI
AI_MODEL=openrouter/owl-alpha                   # any OpenAI-compat model
AI_MAX_TOKENS=16384
STRUCTRANET_OUTPUT_DIR=output                   # CLI pipeline output path
QA_KNOWLEDGE_BASE_PATH=structranet/knowledge/cisco_knowledge_base.txt
```

### Installation

```bash
cd ai-engine
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

---

## Running the Engine

### API Server (recommended)

```bash
uvicorn run:app --reload --port 8000
```

The frontend connects to `http://localhost:8000`.

### CLI Pipeline (offline / batch)

```bash
# Interactive mode
python run.py

# Non-interactive with all flags
python run.py \
  --request "Design a campus network with 2 routers, a core switch, and 3 access VLANs" \
  --security-profile enterprise \
  --auto-continue \
  --output output/campus.json \
  --project-output output/campus.gns3project

# Skip Phase 2 (topology only, no IP configs)
python run.py --request "Simple lab with 2 routers" --no-phase2

# Load a saved environment profile
python run.py --profile profiles/my_lab.json
```

### Validator (standalone)

```bash
python -m structranet.export.validator my_topology.gns3project --verbose
```

### Context Builder (debug)

```bash
python -m structranet.ai.context_builder output/_topology.json
```

---

## Design Decisions

### 1. Deterministic Hardware, Not LLM Hardware

The LLM is an excellent logical designer but an unreliable hardware configurator. Asking the LLM to produce GNS3 port numbers was the single largest source of deployment failures. The engine separates these responsibilities entirely:

- The LLM outputs *node IDs* and *connections* — no numbers.
- `port_assigner.py` computes all port numbers using hard-coded per-type rules.
- `hw_config.py` injects all slot modules based on the link topology.

This makes Phase 1 output predictable and testable without LLM involvement.

### 2. Single Source of Truth for Hardware Constants

Every hardware fact — module compatibility lists, port counts, RAM defaults — lives exclusively in `constants/hardware.py`. `constants/validation.py` is a backward-compatible re-export shim. This prevents the silent drift that previously caused `schema.py` to have different port limits than `hw_config.py`.

### 3. Three-Gate Safe Merge

Phase 2 LLM output is merged into the topology through three sequential gates:

1. **Whitelist gate** — only known software config keys accepted.
2. **No-overwrite gate** — existing non-empty values are never replaced.
3. **Type gate** — value type must match the schema.

This makes it structurally impossible for a Phase 2 LLM call to corrupt hardware properties, regardless of what the model returns.

### 4. VLAN Patching After Hardware Injection

`topology_finalizer.apply_switch_port_patches()` runs *after* `hw_config.inject_hardware_config()` and *before* `context_builder.build_configuration_brief()`. The ordering ensures:
- `ports_mapping` exists on every switch before patching.
- The config brief reflects the correct trunk/access layout.
- The exporter sees the final patched state.

### 5. LLM Tool-Calling Over FSM

The backend conversational orchestrator uses OpenAI function calling instead of a hand-written finite state machine. The LLM reads the conversation history and a context-aware system prompt to decide which tools to invoke. This naturally handles:
- Compound intents ("design X and apply enterprise security" in one message).
- Context switching mid-conversation.
- Clarifying questions when information is missing.

The previous FSM-era `intent_router.py` has been removed.

### 6. Extensible Appliance Catalog

The static catalog in `constants/appliances.py` covers 40+ devices. Users can extend it without modifying source code by providing a JSON overlay file to `load_catalog(user_path)`. The merge strategy is shallow-per-entry: user keys override defaults, new entries are added as-is. This allows custom IOS image paths, non-standard platforms, and proprietary appliances.

---

## Security Profiles

Three profiles are available, selected per session:

| Profile | What it adds |
|---|---|
| `none` | No hardening. Pure lab topology. Maximum compatibility. |
| `basic` | SSH v2, AAA local, service timestamps, login block, NTP, Syslog, no SNMP community strings, MOTD banner. Applied to every router. |
| `enterprise` | Everything in `basic` plus: Zone-Based Firewall (ZBF), anti-spoofing ACLs, TCP intercept, NAT PAT overload, OSPF MD5 authentication, HSRP, SNMPv3 (auth+priv), DHCP snooping, DAI, STP BPDU guard, port security, uRPF. Applied per security role (perimeter / core-switch / access-switch / SIEM). |

Security prompts are injected at both Phase 1 (topology design) and Phase 2 (config generation) via `ai/security_prompts.py`. The project name in the exported file never contains security keywords.

---

## Directory Structure

```
ai-engine/
├── run.py                          # Entrypoint: API server or CLI pipeline
├── requirements.txt
├── structranet/
│   ├── __init__.py                 # Package version
│   ├── orchestrator.py             # CLI offline pipeline (main())
│   ├── utils.py                    # Shared helpers (catalog_to_inventory, design review)
│   │
│   ├── ai/
│   │   ├── agent.py                # Phase 1 LLM + auto-repair + hardware injection
│   │   ├── config_agent.py         # Phase 2 LLM + safe-merge + export trigger
│   │   ├── context_builder.py      # Configuration Brief generator
│   │   ├── llm_utils.py            # OpenAI client singleton, retry, JSON extraction
│   │   ├── security_prompts.py     # Per-profile prompt injection blocks
│   │   └── qa_handler.py           # Cisco IOS QA with knowledge base
│   │
│   ├── api/
│   │   ├── app.py                  # FastAPI application + all endpoints
│   │   └── models.py               # API request/response Pydantic models
│   │
│   ├── catalog/
│   │   ├── appliance_catalog.py    # Catalog loader with JSON overlay support
│   │   ├── hw_config.py            # Hardware property injector (slots, adapters, ports)
│   │   └── port_assigner.py        # Deterministic port number assignment
│   │
│   ├── constants/
│   │   ├── hardware.py             # SSOT: all hardware constants
│   │   ├── gns3.py                 # GNS3 node taxonomy, geometry, symbols
│   │   ├── schema.py               # Pydantic topology domain models
│   │   ├── appliances.py           # Static appliance catalog data
│   │   ├── ai.py                   # AI link limits, retry config
│   │   ├── phase2.py               # Phase 2 whitelist + type constraints
│   │   └── validation.py           # Backward-compat re-exports from hardware.py/gns3.py
│   │
│   ├── core/
│   │   ├── pipeline.py             # Async Phase 1/2 wrappers + SSE broadcasting
│   │   ├── session.py              # In-memory session store + SSE fan-out queues
│   │   └── thought_parser.py       # CoT text → typed ThoughtChunk objects
│   │
│   ├── export/
│   │   ├── gns3_exporter.py        # .gns3project ZIP assembler
│   │   └── validator.py            # 11-check structural validator
│   │
│   ├── generation/
│   │   ├── preflight.py            # Environment profile + inventory filtering
│   │   └── topology_finalizer.py   # VLAN trunk/access port patcher
│   │
│   └── knowledge/
│       └── cisco_knowledge_base.txt  # Cisco IOS command reference (L1–L7)
│
└── tests/
    ├── test_golden_export.py
    └── fixtures/
        └── golden_minimal_topology.json
```
