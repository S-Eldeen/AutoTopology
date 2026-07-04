/**
 * Chat Orchestrator — Hybrid routing with prompt caching.
 *
 * Architecture:
 *  1. Heuristic intent classifier (no LLM call) routes to 'chat' or 'tool'
 *     - 'chat' = greetings, identity, meta, knowledge questions
 *     - 'tool' = build/modify/export requests (default — never miss a design)
 *  2. CHAT fast-path: tool_choice='none', NO tools sent, lean prompt
 *     → LLM streams response in ~1-2s (skips tool evaluation entirely)
 *  3. TOOL path: full tool schemas + prompt caching headers
 *     → Anthropic/OpenRouter caches the system prompt + tool defs
 *     → Subsequent calls in the same session reuse the cache (faster)
 *
 * Emoji safety net: stripEmojis() runs on every token_delta before broadcast.
 */
import OpenAI from 'openai';
import config from '../config/index.js';
import sseService from './sse.service.js';
import aiEngine from './ai-engine.bridge.js';
import { Session } from '../models/Session.js';
import { Topology } from '../models/Topology.js';
import { ExportJob } from '../models/Export.js';
import { User } from '../models/User.js';
import logger from '../utils/logger.js';
import { consumeDesign } from './plan.service.js';
import { LLMError, EngineError } from '../utils/errors.js';
import fs from 'fs/promises';
import path from 'path';

const MAX_ROUNDS = 6;

// ── LLM client ─────────────────────────────────────────────
const client = new OpenAI({
  apiKey: config.llm.apiKey,
  baseURL: config.llm.baseUrl,
});

const DEFAULT_SECURITY_PROFILE = 'none';

// ═══════════════════════════════════════════════════════════
// INTENT CLASSIFIER (heuristic, no LLM call)
// Conservative: only routes to 'chat' for OBVIOUS small talk.
// Anything ambiguous → 'tool' (safe default, never miss a design request).
// ═══════════════════════════════════════════════════════════
function classifyIntent(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return 'tool';
  const msg = userMessage.toLowerCase().trim();

  // ── Greetings (only if short) ───────────────────────────
  const greetings = ['hi', 'hello', 'hey', 'yo', 'sup', 'howdy', 'hiya', 'good morning', 'good evening', 'good afternoon', 'gm'];
  if (msg.length < 30 && greetings.some(g => msg === g || msg.startsWith(g + ' ') || msg.startsWith(g + '!') || msg.startsWith(g + '.'))) {
    return 'chat';
  }

  // ── Identity / capability questions ─────────────────────
  const identityPatterns = [
    /^(who|what) (are|r) (you|u)\b/i,
    /^what(?:'s|s| is) your name/i,
    /^are you (a |an )?(ai|bot|human|real|robot)/i,
    /^what can you do/i,
    /^help me/i,
    /^how do (i|you) (use|start)/i,
    /^what are you/i,
    /^introduce yourself/i,
    /^tell me about yourself/i,
  ];
  if (identityPatterns.some(re => re.test(msg))) return 'chat';

  // ── Meta questions about the assistant ──────────────────
  const metaPatterns = [
    /why (are|r) (you|u) (slow|late|taking)/i,
    /how (do|does) you work/i,
    /what model are you/i,
    /are you (chatgpt|gpt|claude|ai)/i,
    /thank/i,
    /^thanks/i,
    /^ok$/i, /^okay$/i, /^cool$/i, /^nice$/i, /^got it$/i, /^understood$/i,
  ];
  if (metaPatterns.some(re => re.test(msg))) return 'chat';

  // ── Networking knowledge questions (NOT build requests) ──
  const knowledgePatterns = [
    /^(what|how|why|when|where|can|could|would|should|do|does|did|is|are) .*(vlan|ospf|bgp|rip|etherchannel|spanning tree|stp|acl|nat|dhcp|dns|firewall|vpn|ipsec|gre|hsrp|vrrp|glbp|snmp|ntp|syslog|aaa|tacacs|radius|ssh|telnet|port security|dhcp snooping|arp|mac|subnet|cidr|ipv4|ipv6|mtu|qos|cos|dscp|lldp|cdp|trunk|access port)/i,
    /^explain .*(vlan|ospf|bgp|rip|stp|nat|dhcp|firewall|vpn|acl)/i,
    /^difference between/i,
    /^tell me about .*(network|cisco|router|switch)/i,
    /^what is .*(network|cisco|router|switch|vlan|ospf)/i,
  ];
  if (knowledgePatterns.some(re => re.test(msg))) return 'chat';

  // ── Default: tool path (safe — never miss a design request) ──
  return 'tool';
}

function isExistingTopologyRequest(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return false;
  const msg = userMessage.toLowerCase().trim();
  return /\b(show|see|view|display|give|get|send|open)\b.*\b(design|topology|network|diagram)\b/i.test(msg)
    || /\b(design|topology|diagram)\b.*\b(please|now|again|current|existing)\b/i.test(msg);
}

function inferSecurityProfile(userMessage) {
  const msg = (userMessage || '').toLowerCase();
  if (/\b(enterprise|zero trust|dmz|siem|ids|ips|compliance|segmentation|soc)\b/.test(msg)) {
    return 'enterprise';
  }
  if (/\b(security|secure|firewall|acl|vpn|nat|hardening|protected)\b/.test(msg)) {
    return 'basic';
  }
  return DEFAULT_SECURITY_PROFILE;
}

function getDeterministicAction(userMessage, hasTopology) {
  if (!userMessage || typeof userMessage !== 'string') return null;
  const msg = userMessage.toLowerCase().trim();

  if (/^(hi|hello|hey|yo|sup|hiya|good morning|good afternoon|good evening)[.! ]*$/.test(msg)) {
    return { type: 'message', content: 'Hi. Tell me what network you want to build or what you want to change.' };
  }
  if (/^(ok|okay|cool|nice|got it|understood|thanks|thank you)[.! ]*$/.test(msg)) {
    return { type: 'message', content: 'Ready when you are.' };
  }
  if (/^(who|what) (are|r) (you|u)\b|^what(?:'s|s| is) your name|^what can you do/i.test(msg)) {
    return { type: 'message', content: 'I am StructuraNet AI, a network design assistant that can generate, revise, and export GNS3-ready topologies.' };
  }

  const editPattern = /\b(add|remove|delete|change|modify|edit|replace|rename|connect|disconnect|move|update)\b/i;
  const buildPattern = /\b(build|create|generate|design|make|draw|plan)\b.*\b(a\s*)?(network|topology|diagram|router|switch|pc|host|firewall|site|branch|branches|vlan|company)\b/i;
  const designForPattern = /\b(give|make|create|design|build)\b.*\b(network\s*)?design\s+for\b/i;
  const inventoryPattern = /\b\d+\s*(router|routers|switch|switches|pc|pcs|host|hosts|firewall|firewalls|server|servers)\b/i;
  const questionPattern = /^(what|how|why|when|where|can|could|would|should|do|does|did|is|are)\b/i;

  if (hasTopology && editPattern.test(msg) && !questionPattern.test(msg)) {
    return {
      type: 'tool',
      tool: 'edit_topology',
      args: { feedback: userMessage, securityProfile: inferSecurityProfile(msg) },
    };
  }

  if (buildPattern.test(msg) || designForPattern.test(msg) || inventoryPattern.test(msg)) {
    return {
      type: 'tool',
      tool: 'generate_topology',
      args: { request: userMessage, securityProfile: inferSecurityProfile(msg) },
    };
  }

  if (isExistingTopologyRequest(msg)) {
    return hasTopology
      ? { type: 'show_topology' }
      : { type: 'message', content: 'No topology exists in this session yet. Tell me what network to build first.' };
  }

  if (/\b(export|download|deploy|deployment kit|gns3|configs?|configuration files?)\b/.test(msg)) {
    return hasTopology
      ? { type: 'tool', tool: 'export_project', args: { securityProfile: inferSecurityProfile(msg) } }
      : { type: 'message', content: 'No topology exists to export yet. Generate a topology first, then ask me to export it.' };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════
// EMOJI SAFETY NET
// Hard guarantee: NO emojis ever reach the frontend, regardless of LLM behavior.
// ═══════════════════════════════════════════════════════════
const EMOJI_REGEX = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{2300}-\u{23FF}\u{2190}-\u{21FF}\u{200D}\u{20E3}]/gu;

/**
 * Remove emojis from a text fragment.
 *
 * IMPORTANT: This runs on EACH streaming token delta, not the full message.
 * Therefore it must NOT trim or collapse whitespace — the space between
 * words arrives as a leading space on the NEXT token (e.g. "Hello!" then
 * " What" then " would"). Trimming per-token would strip those leading
 * spaces and concatenate into "Hello!Whatwould...". Only emoji characters
 * are removed; all whitespace is preserved verbatim.
 */
function stripEmojis(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(EMOJI_REGEX, '');
}

// ═══════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'generate_topology',
      description: 'Generate a NEW network topology from a natural-language request. Use when the user asks to BUILD, CREATE, or DESIGN a network. Returns the topology, design review, and requirements.',
      parameters: {
        type: 'object',
        properties: {
          request: { type: 'string', description: 'The user\'s natural-language request describing the network to build.' },
          securityProfile: { type: 'string', enum: ['none', 'basic', 'enterprise'], description: 'Security profile. Default: none.' },
        },
        required: ['request'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_topology',
      description: 'Modify an EXISTING topology based on user feedback. Use when the user asks to ADD, REMOVE, or CHANGE devices or links. Returns the updated topology.',
      parameters: {
        type: 'object',
        properties: {
          feedback: { type: 'string', description: 'The user\'s requested change in natural language.' },
          securityProfile: { type: 'string', enum: ['none', 'basic', 'enterprise'], description: 'Security profile for regenerated configs.' },
        },
        required: ['feedback'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'export_project',
      description: 'Export the current topology as a GNS3 portable project with full device configurations. Use when the user APPROVES the topology or asks to EXPORT, DOWNLOAD, or GENERATE CONFIGS.',
      parameters: {
        type: 'object',
        properties: {
          securityProfile: { type: 'string', enum: ['none', 'basic', 'enterprise'], description: 'Security profile to apply.' },
        },
        required: [],
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════
// SYSTEM PROMPTS (two variants — lean vs full)
// ═══════════════════════════════════════════════════════════

// CHAT fast-path: ultra-lean prompt, no tools sent
const SYSTEM_PROMPT_CHAT = `You are StructuraNet AI, an expert network architect.

Rules:
- NEVER use emojis. Plain text and clean markdown only. No exceptions.
- ANSWER THE USER'S ACTUAL QUESTION directly. Do not pivot to a capabilities pitch.
- Be concise: 1-3 sentences for casual chat, longer only for technical explanations.
- Never re-introduce yourself or listing capabilities unless this is the very first message AND the user only said "hi" or "hello".

If the user wants to BUILD, MODIFY, or EXPORT a network, tell them to rephrase their request explicitly so the system can route it to the right tool.`;

// TOOL path: full prompt with tool guidance
const SYSTEM_PROMPT_TOOL = `You are StructuraNet AI, an expert network architect.

ABSOLUTE PROHIBITION — NO EMOJIS:
You are STRICTLY FORBIDDEN from using emojis in any response. This includes smileys, objects, symbols, checkmarks, arrows, and ANY emoji character. Plain text and clean markdown ONLY. If you are about to type an emoji, use plain text instead. Examples: "Hi." not "Hi! 👋", "Done." not "Done! ✅".

BEHAVIOR:
1. NEVER use emojis.
2. If the user is just chatting, greeting, or asking general questions, respond immediately in text WITHOUT calling any tools.
3. Only call tools if a network design, modification, or export is explicitly requested.
4. ANSWER THE USER'S ACTUAL QUESTION directly. Don't pivot to a capabilities pitch.
5. Be concise. Briefly explain (1 sentence) before calling a tool, then summarize after.
6. Never re-introduce yourself or list capabilities unless this is the very first message.

TOOL USAGE:
- generate_topology: ONLY when user asks to BUILD/CREATE/DESIGN a network
- edit_topology: ONLY when user asks to MODIFY/CHANGE/ADD/REMOVE in an existing topology
- export_project: ONLY when user asks to EXPORT/DOWNLOAD/GENERATE CONFIGS for an approved topology

If the request is ambiguous, ask ONE short clarifying question.`;

// ── First-message greeting (only injected on very first turn) ──
const FIRST_MESSAGE_PROMPT = `

NOTE: This is the very first message in a new conversation. If the user just said a greeting like "hi" or "hello", respond with a SINGLE short sentence acknowledging them and asking what they'd like to build or learn. Do not list your capabilities in a bulleted format — keep it natural and brief.`;

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function buildSystemPrompt(intent, isFirstMessage, hasTopology) {
  const base = intent === 'chat' ? SYSTEM_PROMPT_CHAT : SYSTEM_PROMPT_TOOL;
  let prompt = base;
  if (isFirstMessage) prompt += FIRST_MESSAGE_PROMPT;
  if (hasTopology && intent === 'tool') {
    prompt += `\n\nA topology already exists in this session. If the user asks to modify it, use edit_topology. If they ask to export, use export_project.`;
  }
  return prompt;
}

function buildLLMMessages(session, userMessage, isFirstMessage, intent) {
  const hasTopology = !!session.currentTopologyId;
  const messages = [{ role: 'system', content: buildSystemPrompt(intent, isFirstMessage, hasTopology) }];

  const sessionMessages = session.messages || [];
  for (const m of sessionMessages) {
    if (m.role === 'system') continue;
    messages.push({ role: m.role, content: m.content });
    if (m.role === 'assistant' && m.toolSummary) {
      messages.push({ role: 'system', content: `[Tool ${m.tool} result]: ${m.toolSummary}` });
    }
  }

  // Avoid duplicate user message (appendMessage already saved it to DB)
  const lastMsg = sessionMessages[sessionMessages.length - 1];
  const lastIsCurrentUserMsg = lastMsg && lastMsg.role === 'user' && lastMsg.content === userMessage;
  if (!lastIsCurrentUserMsg) {
    messages.push({ role: 'user', content: userMessage });
  }

  return messages;
}

// ── Map Python EVENT: → SSE tool_progress ─────────────────
function forwardPythonEvent(sessionId, tool, event) {
  if (!event || !event.event) return;
  const { event: type, data } = event;
  if (type === 'thought' && data?.content) {
    sseService.broadcast(sessionId, 'tool_progress', { tool, step: data.content, thoughtType: data.type });
  } else if (type === 'phase_change' && data?.phase) {
    sseService.broadcast(sessionId, 'tool_progress', { tool, step: `Phase: ${data.phase}${data.sub_phase ? ` — ${data.sub_phase}` : ''}` });
  }
}

// ═══════════════════════════════════════════════════════════
// ATOMIC DB OPERATIONS (avoid Mongoose VersionError)
// ═══════════════════════════════════════════════════════════
async function appendMessage(sessionId, message) {
  await Session.updateOne(
    { _id: sessionId },
    { $push: { messages: message }, $set: { lastActivityAt: new Date() } }
  );
}

async function appendAssistantMessage(sessionId, message) {
  const updateResult = await Session.findByIdAndUpdate(
    sessionId,
    {
      $push: { messages: message },
      $set: { lastActivityAt: new Date() },
    },
    { new: true, select: 'messages' }
  );
  return updateResult?.messages?.[updateResult.messages.length - 1]?._id || null;
}

async function maybeAutoTitle(sessionId, firstUserContent) {
  const title = firstUserContent.slice(0, 60) + (firstUserContent.length > 60 ? '…' : '');
  await Session.updateOne({ _id: sessionId, title: 'New Chat' }, { $set: { title } });
}

async function replayCurrentTopology(sessionId, userId, topologyId) {
  const topology = await Topology.findOne({ _id: topologyId, userId }).lean();
  if (!topology) return false;

  const topologyData = {
    name: topology.name,
    node_count: topology.nodeCount,
    link_count: topology.linkCount,
  };
  const message = `Here is the current design: ${topology.name} (${topology.nodeCount} devices, ${topology.linkCount} links).`;

  await appendMessage(sessionId, {
    role: 'assistant',
    content: message,
    createdAt: new Date(),
  });

  sseService.broadcast(sessionId, 'agent_message', { message });
  sseService.broadcast(sessionId, 'topology_ready', {
    topologyId: topology._id,
    topology_dict: topology.topologyDict,
    topology_data: topologyData,
    design_review: topology.designReview,
    assumptions: topology.assumptions,
  });
  sseService.broadcast(sessionId, 'complete', { summary: 'Existing topology shown', rounds: 0 });
  return true;
}

async function sendDirectMessage(sessionId, content) {
  const message = stripEmojis(content);
  await appendAssistantMessage(sessionId, {
    role: 'assistant',
    content: message,
    createdAt: new Date(),
  });
  sseService.broadcast(sessionId, 'agent_message', { message });
  sseService.broadcast(sessionId, 'complete', { summary: message, rounds: 0 });
}

function directToolIntro(toolName) {
  if (toolName === 'generate_topology') return 'Building that topology now.';
  if (toolName === 'edit_topology') return 'Updating the current topology now.';
  if (toolName === 'export_project') return 'Preparing the deployment kit now.';
  return 'Working on that now.';
}

async function executeDirectTool(sessionId, userId, toolName, args) {
  const intro = directToolIntro(toolName);
  const assistantId = await appendAssistantMessage(sessionId, {
    role: 'assistant',
    content: intro,
    tool: toolName,
    createdAt: new Date(),
  });
  sseService.broadcast(sessionId, 'agent_message', { message: intro });

  try {
    const result = await executeTool(sessionId, userId, toolName, args);
    if (assistantId) {
      await Session.updateOne(
        { _id: sessionId, 'messages._id': assistantId },
        { $set: { 'messages.$.toolSummary': result.summary } }
      );
    }
    sseService.broadcast(sessionId, 'complete', { summary: result.summary, rounds: 0 });
    return { ok: true, rounds: 0 };
  } catch (err) {
    const friendly = friendlyToolError(err);
    if (assistantId) {
      await Session.updateOne(
        { _id: sessionId, 'messages._id': assistantId },
        { $set: { 'messages.$.toolSummary': friendly } }
      );
    }
    sseService.broadcast(sessionId, 'complete', { summary: friendly, rounds: 0 });
    return { ok: false, rounds: 0, error: friendly };
  }
}

function friendlyToolError(err) {
  const raw = [
    err?.message,
    err?.details?.details,
    err?.details?.stderr,
  ].filter(Boolean).join('\n');

  if (/402 Payment Required|more credits|can only afford/i.test(raw)) {
    return 'The model provider rejected this request because the account has too few credits for the requested token budget. Add credits, choose a cheaper model, or lower AI_MAX_TOKENS.';
  }
  if (/Expecting ',' delimiter|Unterminated string|JSONDecodeError|parse|truncat/i.test(raw)) {
    return 'The model returned incomplete or invalid JSON, usually because the response was truncated. Try a smaller topology or raise AI_MAX_TOKENS.';
  }
  if (/No topology/i.test(raw)) {
    return 'No topology exists yet. Generate a topology first, then retry this action.';
  }
  if (/ROUTER_API_KEY/i.test(raw)) {
    return 'The AI provider API key is missing or invalid. Check ROUTER_API_KEY in backend/.env.';
  }
  return err?.message || 'The requested operation failed.';
}

// ═══════════════════════════════════════════════════════════
// TOOL EXECUTION
// ═══════════════════════════════════════════════════════════
async function executeTool(sessionId, userId, toolName, args) {
  sseService.broadcast(sessionId, 'tool_start', { tool: toolName, args });
  let result;
  let summary = '';

  try {
    const onEvent = (event) => forwardPythonEvent(sessionId, toolName, event);
    const outputDir = path.resolve(process.cwd(), 'output', sessionId);
    await fs.mkdir(outputDir, { recursive: true });

    // ── Load the user's GNS3 calibration profile ──────────────────────
    // This carries the user's environment capability (which backends are
    // usable — IOU/QEMU/Docker) and their image map (templateName →
    // installed image filename). Forwarding it to Python ensures:
    //   (a) devices whose backend the user lacks are filtered out of the
    //       inventory BEFORE the LLM sees them (preflight.filter_inventory),
    //   (b) generated .gns3project files reference images the user
    //       actually has (otherwise GNS3 refuses to open the project).
    // See ai-engine/structranet/generation/preflight.py → PreflightProfile.
    const user = await User.findById(userId).lean();
    const p = user?.gns3Profile;
    const imageMapObj = p?.imageMap;
    const templateImageMap = imageMapObj && typeof imageMapObj === 'object'
      ? Object.fromEntries(imageMapObj instanceof Map ? imageMapObj : Object.entries(imageMapObj))
      : {};

    // Build the full PreflightProfile dict expected by Python. Every field
    // has a sensible default so this works even if the user skipped parts
    // of the onboarding popup.
    const profile = {
      gns3_version: p?.gns3Version || '2.2',
      supports_iou: p?.supportsIou ?? false,
      supports_qemu: p?.supportsQemu ?? true,
      supports_docker: p?.supportsDocker ?? false,
      strict_validation: p?.strictValidation ?? true,
      require_template_image_map: p?.requireTemplateImageMap ?? false,
      template_image_map: templateImageMap,
      security_profile: 'none',  // overridden by --security-profile arg
    };

    logger.debug(`[orchestrator] forwarding profile to Python: qemu=${profile.supports_qemu} iou=${profile.supports_iou} docker=${profile.supports_docker} images=${Object.keys(templateImageMap).length}`);

    if (toolName === 'generate_topology') {
      result = await aiEngine.generate({
        request: args.request,
        securityProfile: args.securityProfile || DEFAULT_SECURITY_PROFILE,
        outputDir,
        profile,
      }, onEvent);

      const topology = await Topology.create({
        sessionId, userId,
        request: args.request,
        topologyDict: result.topology_dict,
        name: result.topology_data?.name || 'Untitled',
        nodeCount: result.topology_data?.node_count || 0,
        linkCount: result.topology_data?.link_count || 0,
        designReview: result.design_review || null,
        assumptions: result.assumptions || null,
        phase1File: result.phase1_file || null,
      });

      await Session.findByIdAndUpdate(sessionId, {
        currentTopologyId: topology._id,
        originalRequest: args.request,
      });

      summary = `Generated topology "${topology.name}" with ${topology.nodeCount} devices and ${topology.linkCount} links.`;
      const usage = await consumeDesign(await User.findById(userId));

      sseService.broadcast(sessionId, 'topology_ready', {
        topologyId: topology._id,
        topology_dict: result.topology_dict,
        topology_data: result.topology_data,
        requirements: result.requirements,
        design_review: result.design_review,
        assumptions: result.assumptions,
        thinking_text: result.thinking_text,
      });
      sseService.broadcast(sessionId, 'usage_update', { usage });

    } else if (toolName === 'edit_topology') {
      const session = await Session.findById(sessionId);
      const topology = await Topology.findById(session.currentTopologyId);
      if (!topology) throw new EngineError('No existing topology to edit. Ask the user to generate one first.');

      result = await aiEngine.edit({
        feedback: args.feedback,
        topologyPath: topology.phase1File || path.resolve(outputDir, '_topology.json'),
        originalRequest: session.originalRequest || topology.request,
        securityProfile: args.securityProfile || DEFAULT_SECURITY_PROFILE,
        outputDir,
        profile,
      }, onEvent);

      const updated = await Topology.create({
        sessionId, userId,
        request: `${topology.request} (edited: ${args.feedback})`,
        topologyDict: result.topology_dict,
        name: result.topology_data?.name || topology.name,
        nodeCount: result.topology_data?.node_count || 0,
        linkCount: result.topology_data?.link_count || 0,
        designReview: result.design_review || null,
        assumptions: result.assumptions || null,
        phase1File: result.phase1_file || null,
      });

      await Session.findByIdAndUpdate(sessionId, { currentTopologyId: updated._id });
      summary = `Updated topology: ${updated.name} (${updated.nodeCount} devices, ${updated.linkCount} links).`;
      const usage = await consumeDesign(await User.findById(userId));

      sseService.broadcast(sessionId, 'topology_ready', {
        topologyId: updated._id,
        topology_dict: result.topology_dict,
        topology_data: result.topology_data,
        requirements: result.requirements,
        thinking_text: result.thinking_text,
      });
      sseService.broadcast(sessionId, 'usage_update', { usage });

    } else if (toolName === 'export_project') {
      const session = await Session.findById(sessionId);
      const topology = await Topology.findById(session.currentTopologyId);
      if (!topology) throw new EngineError('No topology to export. Generate one first.');

      const exportJob = await ExportJob.create({
        sessionId, userId,
        topologyId: topology._id,
        securityProfile: args.securityProfile || DEFAULT_SECURITY_PROFILE,
        status: 'running',
      });
      await Session.findByIdAndUpdate(sessionId, { currentExportId: exportJob._id });

      result = await aiEngine.exportProject({
        topologyPath: topology.phase1File || path.resolve(outputDir, '_topology.json'),
        securityProfile: args.securityProfile || DEFAULT_SECURITY_PROFILE,
        outputDir,
        profile,
      }, onEvent);

      const files = {
        gns3Project: result.gns3project_path || null,
        configsZip: result.config_review_dir || null,
        manifest: result.manifest_file || null,
      };

      exportJob.status = 'complete';
      exportJob.files = files;
      exportJob.finalDict = result.final_dict;
      exportJob.validation = result.validation;
      await exportJob.save();

      summary = `Deployment kit ready: GNS3 project + ${Object.keys(result.config_texts || {}).length} device configs.`;

      sseService.broadcast(sessionId, 'deployment_ready', {
        exportId: exportJob._id,
        files: [
          { name: path.basename(result.gns3project_path || 'project.gns3project'), type: 'gns3project', size: null },
          { name: 'configs.zip', type: 'configs', size: null },
          { name: 'manifest.txt', type: 'manifest', size: null },
        ].filter(f => f.name),
        securityProfile: args.securityProfile || DEFAULT_SECURITY_PROFILE,
        validation: result.validation,
        deviceConfigs: Object.keys(result.config_texts || {}),
      });

    } else {
      throw new EngineError(`Unknown tool: ${toolName}`);
    }

    sseService.broadcast(sessionId, 'tool_result', { tool: toolName, success: true, summary });
    return { success: true, summary, raw: result };

  } catch (err) {
    const friendly = friendlyToolError(err);
    logger.error(`Tool ${toolName} failed:`, err);
    sseService.broadcast(sessionId, 'tool_result', { tool: toolName, success: false, error: friendly });
    sseService.broadcast(sessionId, 'error', { message: friendly, tool: toolName });
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN DISPATCH LOOP (hybrid routing)
// ═══════════════════════════════════════════════════════════
export async function dispatch(sessionId, userId, userMessage) {
  const session = await Session.findById(sessionId).lean();
  if (!session) throw new EngineError('Session not found');

  // ── Save user message ATOMICALLY ────────────────────────
  await appendMessage(sessionId, {
    role: 'user',
    content: userMessage,
    createdAt: new Date(),
  });

  const isFirstUser = !session.messages?.some(m => m.role === 'user');
  if (isFirstUser) {
    await maybeAutoTitle(sessionId, userMessage);
  }

  // ── HYBRID ROUTING: classify intent ─────────────────────
  const hasTopology = !!session.currentTopologyId;
  const intent = classifyIntent(userMessage);
  logger.info(`[orchestrator] Session ${sessionId} intent="${intent}" msg="${userMessage.slice(0, 50)}"`);

  const freshSession = await Session.findById(sessionId).lean();
  const deterministicAction = getDeterministicAction(userMessage, hasTopology);
  if (deterministicAction?.type === 'message') {
    logger.info(`[orchestrator] Direct message for session ${sessionId}`);
    await sendDirectMessage(sessionId, deterministicAction.content);
    return { ok: true, rounds: 0 };
  }
  if (deterministicAction?.type === 'show_topology') {
    const replayed = await replayCurrentTopology(sessionId, userId, session.currentTopologyId);
    if (replayed) {
      logger.info(`[orchestrator] Replayed existing topology for session ${sessionId}`);
      return { ok: true, rounds: 0 };
    }
  }
  if (deterministicAction?.type === 'tool') {
    logger.info(`[orchestrator] Direct tool ${deterministicAction.tool} for session ${sessionId}`);
    return executeDirectTool(sessionId, userId, deterministicAction.tool, deterministicAction.args);
  }

  let messages = buildLLMMessages(freshSession, userMessage, isFirstUser, intent);
  let round = 0;

  while (round < MAX_ROUNDS) {
    round++;
    logger.info(`[orchestrator] Session ${sessionId} round ${round}/${MAX_ROUNDS} (intent=${intent})`);

    // ── Build LLM call params based on intent ──────────────
    const llmParams = {
      model: config.llm.model,
      messages,
      stream: true,
    };

    if (intent === 'tool' || round > 1) {
      // TOOL path: full tool schemas + prompt caching headers
      llmParams.tools = TOOL_DEFINITIONS;
      llmParams.tool_choice = 'auto';
      llmParams.max_tokens = config.llm.maxTokens;

      // ── Prompt caching (Anthropic-family models only) ────
      // The cache_control array format is Anthropic-specific. Non-Anthropic
      // providers (e.g. Poolside, GPT-4o) reject the array system message
      // with "data did not match any variant of untagged enum
      // ChatCompletionRequestSystemMessageContent". Only apply it when the
      // model is Anthropic-family; otherwise keep the system message as a
      // plain string.
      const model = (config.llm.model || '').toLowerCase();
      const isAnthropicFamily = model.includes('claude') || model.includes('anthropic');

      if (isAnthropicFamily) {
        llmParams.extra_headers = {
          'anthropic-beta': 'prompt-caching-2024-07-31',
          'HTTP-Referer': 'https://structuranet.ai',
          'X-Title': 'StructuraNet AI',
        };
        // Anthropic-style cache_control on the system message
        // (OpenRouter translates this for Anthropic-family models)
        if (messages[0]?.role === 'system' && typeof messages[0].content === 'string') {
          messages[0] = {
            ...messages[0],
            content: [
              { type: 'text', text: messages[0].content, cache_control: { type: 'ephemeral' } },
            ],
          };
        }
      }
    } else {
      // CHAT fast-path: NO tools, lean prompt, smaller token budget
      llmParams.tool_choice = 'none';
      llmParams.max_tokens = 800;
    }

    // ── Call LLM with streaming ────────────────────────────
    let textContent = '';
    let toolCalls = [];
    let stream;
    try {
      stream = await client.chat.completions.create(llmParams);
    } catch (err) {
      logger.error('LLM stream init failed:', err);
      sseService.broadcast(sessionId, 'error', { message: `LLM call failed: ${err.message}` });
      throw new LLMError(`LLM call failed: ${err.message}`);
    }

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // ── Text delta → broadcast token_delta (with emoji stripping) ──
        if (delta.content) {
          const cleanDelta = stripEmojis(delta.content);
          if (cleanDelta) {
            textContent += cleanDelta;
            sseService.broadcast(sessionId, 'token_delta', { token: cleanDelta });
          }
        }

        // ── Tool call delta → accumulate silently ───────────
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCalls[idx]) {
              toolCalls[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
            }
            if (tc.id) toolCalls[idx].id = tc.id;
            if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
          }
        }
      }
    } catch (err) {
      logger.error('LLM stream read failed:', err);
      sseService.broadcast(sessionId, 'error', { message: `LLM stream failed: ${err.message}` });
      throw new LLMError(`LLM stream failed: ${err.message}`);
    }

    toolCalls = toolCalls.filter(tc => tc && tc.function?.name);

    // ── Save assistant message ATOMICALLY ──────────────────
    let savedAssistantId = null;
    if (textContent) {
      const assistantMsg = {
        role: 'assistant',
        content: textContent,
        tool: toolCalls[0]?.function.name || null,
        createdAt: new Date(),
      };
      const updateResult = await Session.findByIdAndUpdate(
        sessionId,
        { $push: { messages: assistantMsg } },
        { new: true, select: 'messages' }
      );
      savedAssistantId = updateResult?.messages?.[updateResult.messages.length - 1]?._id || null;
      sseService.broadcast(sessionId, 'agent_message', { message: textContent });
    }

    // ── No tool calls → done ───────────────────────────────
    if (toolCalls.length === 0) {
      logger.info(`[orchestrator] Round ${round}: no tool calls, exiting loop`);
      break;
    }

    // ── Append assistant message with tool_calls to LLM history ──
    // CRITICAL: Strict OpenAI-compatible providers (Stealth, etc.) reject
    // `content: null` on assistant messages that have tool_calls.
    // Use empty string "" instead of null when there's no text content.
    // Also: only include the `content` field if it's a non-empty string;
    // omitting it entirely is also acceptable per OpenAI spec.
    const assistantMsg = {
      role: 'assistant',
      tool_calls: toolCalls.map(tc => ({
        id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments || '{}',
        },
      })),
    };
    // Only include content if it's a non-empty string (avoid null which causes 400)
    if (textContent && typeof textContent === 'string' && textContent.trim()) {
      assistantMsg.content = textContent;
    } else {
      assistantMsg.content = ''; // empty string is accepted; null is NOT
    }
    messages.push(assistantMsg);

    // ── Execute each tool ──────────────────────────────────
    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }

      // Ensure tool_call_id is a non-empty string (some providers reject null/empty)
      const toolCallId = tc.id || assistantMsg.tool_calls[0]?.id || `call_${Date.now()}`;

      try {
        const result = await executeTool(sessionId, userId, tc.function.name, args);

        // Update the assistant message's toolSummary ATOMICALLY
        if (savedAssistantId) {
          await Session.updateOne(
            { _id: sessionId, 'messages._id': savedAssistantId },
            { $set: { 'messages.$.toolSummary': result.summary } }
          );
        }

        // Tool result message — strict format required by OpenAI/Stealth:
        //   { role: 'tool', tool_call_id: <string>, content: <string> }
        // content MUST be a string. JSON.stringify guarantees this.
        messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify({ success: true, summary: result.summary }),
        });
      } catch (err) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify({ success: false, error: err.message || 'Unknown error' }),
        });
      }
    }
  }

  if (round >= MAX_ROUNDS) {
    logger.warn(`[orchestrator] Session ${sessionId} hit max rounds (${MAX_ROUNDS})`);
  }

  sseService.broadcast(sessionId, 'complete', { summary: 'Orchestration complete', rounds: round });
  return { ok: true, rounds: round };
}

export default { dispatch };
