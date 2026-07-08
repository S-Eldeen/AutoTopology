# StructuraNet App

**AI-powered Natural Language → GNS3 Topology Generator.** Describe your network in plain English and get a fully-configured, import-ready `.gns3project` file — complete with device configs, image requirements manifest, and a visual topology diagram.

---

## Architecture

Three-service architecture with clear separation of concerns:

```
┌──────────────────────┐     HTTP/SSE      ┌──────────────────────┐   stdin/stdout     ┌──────────────────────┐
│   React + Vite       │ ←───────────────→  │   Express.js         │ ──────────────────→ │   Python AI Engine   │
│   :5173              │     /api/*         │   :3000              │   JSONL protocol    │   (persistent worker) │
│                      │                    │                      │                     │                      │
│  - Chat UI           │                    │  - JWT Auth          │                     │  - Phase 1: Topology │
│  - SSE streaming     │                    │  - Session persistence│                    │  - Phase 2: Configs  │
│  - Topology viewer   │                    │  - SSE Manager       │                     │  - GNS3 export       │
│  - Auth + Onboarding │                    │  - LLM orchestrator  │                     │  - Validation        │
│  - PDF export        │                    │  - File downloads    │                     │  - Cisco QA          │
└──────────────────────┘                    └──────┬───────────────┘                     └──────────────────────┘
                                                   │
                                            ┌──────▼───────┐
                                            │   MongoDB     │
                                            └──────────────┘
```

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Persistent Python worker** | Node.js spawns ONE long-running `python worker.py` process at first use. Heavy modules (OpenAI SDK, appliance catalog, hardware tables) are imported once and reused across all requests — eliminating the 2-4s cold-start penalty that per-request spawning paid. Communication is newline-delimited JSON (JSONL) over stdin/stdout with request IDs for matching. |
| **LLM is the orchestrator** | No Finite State Machine. The LLM receives tool definitions and autonomously decides which tools to call, handling compound intents naturally. |
| **Deterministic hardware, not LLM hardware** | The LLM outputs only node IDs and connections. Port numbers, slot modules, and hardware details are computed by Python. |
| **Three-Gate Safe Merge** | Phase 2 LLM configs are merged through whitelist/no-overwrite/type gates, making it structurally impossible for the LLM to corrupt hardware properties. |
| **SSE over WebSocket** | Simpler, HTTP-compatible, works through proxies. EventSource auto-reconnects. JWT token passed as query param (for SSE/downloads only). |
| **GNS3 image calibration** | Users map device templates to their locally-installed image filenames via a searchable onboarding popup. The map is forwarded to Python so generated `.gns3project` files reference images the user actually has. |

---

## Directory Structure

```
structuranet_app/
├── ai-engine/                          # Python AI pipeline (persistent worker)
│   ├── worker.py                       # Persistent worker — JSONL over stdin/stdout
│   ├── wrapper.py                      # CLI entry point (command handlers reused by worker)
│   ├── requirements.txt
│   ├── structranet/                    # Main Python package
│   │   ├── ai/
│   │   │   ├── agent.py                # Phase 1: LLM topology generation + auto-repair
│   │   │   ├── config_agent.py         # Phase 2: Software config generation + safe-merge
│   │   │   ├── context_builder.py      # Builds Configuration Brief from topology
│   │   │   ├── llm_utils.py            # OpenAI client singleton, retry, JSON extraction
│   │   │   ├── qa_handler.py           # Cisco IOS QA with knowledge base
│   │   │   └── security_prompts.py     # Per-profile security prompt injection
│   │   ├── catalog/
│   │   │   ├── appliance_catalog.py    # Loads 45-device catalog with user overlay
│   │   │   ├── hw_config.py            # Injects hardware (slots, adapters, ports)
│   │   │   └── port_assigner.py        # Deterministic port number assignment
│   │   ├── constants/
│   │   │   ├── hardware.py             # SSOT: all hardware constants
│   │   │   ├── gns3.py                 # Node types, symbols, port names (SSOT for type sets)
│   │   │   ├── schema.py               # Pydantic v2 models (GNS3Project, TopologyRequest)
│   │   │   ├── appliances.py           # Static catalog data (45 devices)
│   │   │   ├── ai.py                   # LLM link limits, retry config
│   │   │   └── phase2.py               # Phase 2 whitelist keys + type constraints
│   │   ├── export/
│   │   │   ├── gns3_exporter.py        # Converts topology → .gns3project ZIP
│   │   │   └── validator.py            # 11-check structural validator
│   │   ├── generation/
│   │   │   ├── preflight.py            # Environment profile + inventory filtering
│   │   │   └── topology_finalizer.py   # VLAN trunk/access port patcher
│   │   ├── knowledge/
│   │   │   └── cisco_knowledge_base.txt
│   │   └── utils.py
│   └── tests/
│       └── test_golden_export.py
│
├── backend/                            # Express.js backend
│   ├── package.json
│   ├── .env.example
│   ├── scripts/
│   │   └── test_worker_bridge.js       # Integration test for the persistent worker
│   └── src/
│       ├── app.js                      # Express app — middleware stack, route mounting
│       ├── server.js                   # HTTP server + graceful shutdown
│       ├── config/index.js             # Centralized config + env-var validation
│       ├── middleware/
│       │   ├── auth.js                 # requireAuth (header), sseAuth (query param)
│       │   ├── validate.js             # Zod validation middleware
│       │   └── schemas.js              # Zod schemas (auth, profile, session, message)
│       ├── models/
│       │   ├── User.js                 # User + gns3Profile (imageMap + capabilities)
│       │   ├── Session.js              # Sessions with embedded messages
│       │   ├── Topology.js             # Topology snapshots per session
│       │   └── Export.js               # Export jobs + file paths
│       ├── routes/
│       │   ├── auth.routes.js          # /api/auth
│       │   ├── profile.routes.js       # /api/profile
│       │   ├── session.routes.js       # /api/sessions
│       │   ├── topology.routes.js      # /api/topology
│       │   └── export.routes.js        # /api/export
│       ├── services/
│       │   ├── ai-engine.bridge.js     # Persistent worker bridge (JSONL, request IDs)
│       │   ├── chat.orchestrator.js    # LLM tool-calling orchestrator
│       │   ├── auth.service.js         # Password hashing, JWT, refresh-token rotation
│       │   └── sse.service.js          # SSE connection manager + keepalive
│       └── utils/
│           ├── errors.js               # AppError hierarchy + error handler
│           └── logger.js               # Winston logger
│
└── client/                             # React + Vite frontend
    ├── package.json
    ├── .env.example
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx                     # Auth-gated router + onboarding modal
        ├── index.css
        ├── pages/
        │   ├── ChatPage.jsx
        │   ├── LandingPage.jsx
        │   ├── LoginPage.jsx
        │   └── RegisterPage.jsx
        ├── stores/
        │   ├── authStore.js            # Zustand: user, tokens, profile
        │   └── chatStore.js            # Zustand: sessions, messages, SSE, topology, exportKit
        ├── services/
        │   ├── api.js                  # Axios + interceptors (refresh queue)
        │   ├── endpoints.js            # API wrappers (auth, profile, session, topology, export)
        │   └── sse.js                  # SSEManager — EventSource + auto-reconnect
        └── components/
            ├── auth/
            │   └── OnboardingModal.jsx     # GNS3 image calibration popup
            ├── chat/
            │   ├── ChatLayout.jsx          # Root chat container
            │   ├── Sidebar.jsx             # Session list + profile popover
            │   ├── ConversationView.jsx    # Messages + streaming + code blocks + copy buttons
            │   ├── DownloadKit.jsx         # 3 download buttons (gns3project, configs, manifest)
            │   ├── TopologyPreviewCard.jsx # Inline topology preview + "View full" button
            │   ├── EmptyState.jsx
            │   └── ActionChipsBar.jsx
            ├── topology/
            │   ├── TopologyFullCanvas.jsx  # Full-screen: hierarchical layout, draggable, PDF export
            │   └── topologyLayout.js       # Shared 6-tier hierarchical layout + colors
            └── landing/                    # Marketing page components (10 files)
```

---

## Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+ (uses `match` syntax, `type X = Y` annotations)
- **MongoDB** (required)
- An **OpenAI-compatible API key** (OpenRouter, OpenAI, etc.)

### 1. Python AI Engine

```bash
cd ai-engine
python -m venv venv
 venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env` in `ai-engine/`:
```env
ROUTER_API_KEY=your-openrouter-or-openai-key
ROUTER_BASE_URL=https://openrouter.ai/api/v1   # optional
AI_MODEL=openrouter/owl-alpha                   # optional, any OpenAI-compatible model
AI_MAX_TOKENS=16384                             # optional
LLM_CALL_TIMEOUT=120                            # optional, per-call timeout in seconds
```

> The Python AI engine does **not** run a server. It is invoked by the Node.js backend via a persistent worker process (`worker.py`) communicating over stdin/stdout JSONL.

### 2. Express.js Backend

```bash
cd backend
npm install
```

Create `.env` in `backend/` (see `.env.example`):
```env
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

MONGO=mongodb://localhost:27017/structuranet

JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

ROUTER_API_KEY=your-openrouter-or-openai-key
ROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openrouter/owl-alpha
AI_MAX_TOKENS=16384

WRAPPER_PATH=../ai-engine/wrapper.py
PYTHON_BIN=python
OUTPUT_DIR=./output
```

> `JWT_SECRET` and `JWT_REFRESH_SECRET` are **required**.

Start the server:
```bash
npm start          # production
npm run dev        # development (auto-restart on file changes)
```

### 3. React + Vite Client

```bash
cd client
npm install
npm run dev
```

Runs on `http://localhost:5173`, proxies `/api/*` to Express on port 3000.

---

## API Reference

### Authentication (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account `{ email, password, name }` |
| POST | `/api/auth/login` | Login `{ email, password }` |
| POST | `/api/auth/refresh` | Refresh access token `{ refreshToken }` |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Revoke refresh token |

### Profile (`/api/profile`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/profile` | Get GNS3 calibration profile |
| PUT | `/api/profile` | Update profile (version, capabilities, imageMap) |
| GET | `/api/profile/catalog` | Fetch 45-device appliance catalog (for onboarding dropdown) |

### Sessions (`/api/sessions`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | List user's sessions |
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions/:id` | Get session with messages + topology + export job |
| PATCH | `/api/sessions/:id/title` | Update session title |
| DELETE | `/api/sessions/:id` | Delete session |
| GET | `/api/sessions/:id/stream` | SSE stream (`?token=<JWT>`) |
| POST | `/api/sessions/:id/messages` | Send message `{ content }` → 202, orchestrator runs in background |

### Export (`/api/export`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/export/:id/status` | Get export job status |
| GET | `/api/export/:id/download/:file` | Download file (`gns3project` \| `configs` \| `manifest`) — `?token=<JWT>` |

---

## Node.js ↔ Python Bridge (Persistent Worker)

```
Express (chat.orchestrator.js)
  │
  │  {"id":"<uuid>","command":"generate","args":{...}}\n   ──▶ stdin
  │
  ▼
worker.py (long-running): processes request, streams events
  │  {"id":"<uuid>","event":"thought","data":{...}}\n        ◀── stdout (streamed)
  │  {"id":"<uuid>","ok":true,"result":{...}}\n              ◀── stdout (final)
  │
  ▼
ai-engine.bridge.js: matches response by ID, resolves promise
```

- **Protocol:** Newline-delimited JSON (JSONL) over stdin/stdout
- **Request IDs:** Every request tagged with `crypto.randomUUID()`; worker includes the same ID in every event and response
- **Worker lifecycle:** Spawned once at first use; stays alive until Node exits; auto-respawns after crash
- **Error recovery:** Command errors return `{ok:false}` and the worker stays alive; crashes reject all pending requests immediately
- **Resource reuse:** OpenAI client, appliance catalog, hardware tables loaded once at startup
- **Concurrency:** Sequential processing (one command at a time) — deliberate architectural choice for simplicity

---

## SSE Event Types

| Event | Data | Description |
|-------|------|-------------|
| `tool_start` | `{ tool, args }` | Tool execution started |
| `tool_progress` | `{ step, thoughtType }` | Progress update / thought |
| `tool_result` | `{ tool, success, summary }` | Tool finished |
| `topology_ready` | `{ topologyId, topology_dict, ... }` | Topology available for review |
| `deployment_ready` | `{ exportId, files, securityProfile, validation }` | Export complete |
| `token_delta` | `{ token }` | Streamed LLM text token |
| `agent_message` | `{ message }` | Final LLM text response |
| `complete` | `{ ... }` | Generation complete |
| `error` | `{ message }` | Error occurred |
| `keepalive` | `{}` | Connection keepalive |

---

## LLM Tool-Calling

The orchestrator uses OpenAI function calling (no FSM). 4 tools, up to 6 rounds per message:

| Tool | When | What |
|------|------|------|
| `generate_new_topology(requirements)` | New design | Sends `generate` to Python worker |
| `modify_current_topology(feedback)` | Edit existing | Sends `edit` to Python worker |
| `apply_security_and_export(security_profile)` | Approve & export | Sends `export` to Python worker |
| `search_cisco_knowledge(topic)` | Cisco question | Sends `qa` to Python worker |

---

## GNS3 Image Calibration

A `.gns3project` file references specific image filenames. GNS3 refuses to open the project unless those images are installed. The onboarding popup (shown after sign-in, re-openable from Settings) lets users:

1. **Pick GNS3 version** — dropdown
2. **Toggle capabilities** — QEMU / IOU / Docker / Strict validation (filters which device types the LLM can use)
3. **Map devices to images** — pick devices one at a time from the 45-device catalog, type the image filename from their GNS3 install

The profile is forwarded to Python as `--profile { template_image_map, supports_iou, ... }`, so generated projects reference images the user actually has.

---

## Security Profiles

| Profile | What It Adds |
|---------|--------------|
| `none` | No hardening. Pure lab topology. |
| `basic` | SSH v2, AAA local, timestamps, login block, NTP, Syslog, MOTD banner |
| `enterprise` | Basic + ZBF, anti-spoofing ACLs, TCP intercept, NAT PAT, OSPF MD5, HSRP, SNMPv3, DHCP snooping, DAI, STP BPDU guard, port security, uRPF |

---

## Features

### Core
- **Natural Language Input** — describe your network in plain English
- **AI-Powered Generation** — LLM generates complete topology with device configs
- **Real-Time Progress** — SSE streaming shows AI thinking and tool execution
- **Interactive Topology Viewer** — 6-tier hierarchical layout (NAT → Firewall → Router → Switch → Server → Endpoint), draggable nodes, click-to-inspect, light/dark mode, PDF export
- **Edit & Iterate** — request changes before exporting
- **GNS3 Export** — download `.gns3project`, `configs.zip`, `requirements.txt`
- **Session Persistence** — sessions, topologies, export jobs survive restarts (MongoDB)
- **Security Profiles** — None / Basic / Enterprise
- **Cisco QA** — ask Cisco IOS questions

### UI/UX
- **Streaming Chat** — token-by-token streaming with tool indicators
- **Stop Button** — click send while streaming to stop generation
- **Copy Buttons** — copy any code block or entire assistant message
- **GNS3 Image Calibration** — searchable device picker, capability toggles
- **Topology PDF Export** — high-quality PDF with dynamic bounding box
- **Light/Dark Mode** — toggle in the full topology viewer

---

## Running Tests

### Backend

```bash
cd backend
JWT_SECRET=x JWT_REFRESH_SECRET=x MONGO=mongodb://localhost/dummy node scripts/test_worker_bridge.js
```

### Python AI Engine

```bash
cd ai-engine
python -m pytest tests/ -v
```

---

## License

See repository for license information.
