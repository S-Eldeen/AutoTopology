/**
 * Chat store — sessions, messages, streaming, topology, tools.
 * The single source of truth for the chat UI.
 */
import { create } from 'zustand';
import { sessionApi } from '../services/endpoints.js';
import { sseManager } from '../services/sse.js';
import { useAuthStore } from './authStore.js';

function isDesignPrompt(content = '') {
  const msg = String(content).toLowerCase();
  return /\b(build|create|generate|design|make|draw|plan)\b.*\b(network|topology|diagram|router|switch|pc|host|firewall|site|branch|branches|vlan|company)\b/i.test(msg)
    || /\b(give|make|create|design|build)\b.*\b(network\s*)?design\s+for\b/i.test(msg);
}

function resetMessage(resetAt) {
  const resetDate = resetAt ? new Date(resetAt) : null;
  const time = resetDate && !Number.isNaN(resetDate.getTime())
    ? resetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'the same time';
  return `Daily design limit reached. Your limit resets at ${time} tomorrow.`;
}

function toolLabel(tool) {
  return {
    generate_topology: 'Generate topology',
    edit_topology: 'Edit topology',
    export_project: 'Export project',
    search_kb: 'Search knowledge base',
  }[tool] || 'Run tool';
}

function stepFromProgress(step, index, data = {}) {
  const text = String(step || '').trim();
  const isPhase = text.toLowerCase().startsWith('phase:');
  const isScriptLike = /command|script|python|node|export|generate|config|file|read|write|build/i.test(text);
  return {
    id: `${Date.now()}-${index}`,
    label: isPhase ? text.replace(/^phase:\s*/i, '') : text,
    detail: data.detail || text,
    kind: isPhase ? 'phase' : isScriptLike ? 'script' : 'step',
    status: 'complete',
    createdAt: new Date().toISOString(),
  };
}

function startToolTrace(tool, args) {
  const detail = args ? JSON.stringify(args, null, 2) : '';
  return {
    tool,
    args,
    status: 'running',
    steps: [{
      id: `${Date.now()}-start`,
      label: toolLabel(tool),
      detail,
      kind: detail ? 'script' : 'step',
      status: 'running',
      createdAt: new Date().toISOString(),
    }],
  };
}

function finishToolTrace(trace, result) {
  if (!trace) return null;
  const steps = trace.steps.map((step) => (
    step.status === 'running' ? { ...step, status: result.success ? 'complete' : 'error' } : step
  ));
  steps.push({
    id: `${Date.now()}-done`,
    label: result.success ? 'Done' : 'Failed',
    detail: result.summary || result.error || '',
    kind: 'done',
    status: result.success ? 'complete' : 'error',
    createdAt: new Date().toISOString(),
  });
  return {
    ...trace,
    status: result.success ? 'complete' : 'error',
    summary: result.summary || result.error || '',
    steps,
  };
}

function attachTraceToLastAssistant(messages, sessionId, trace, toolSummary) {
  const msgs = messages[sessionId] ? [...messages[sessionId]] : [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant') {
      msgs[i] = {
        ...msgs[i],
        tool: trace?.tool || msgs[i].tool,
        toolSummary: toolSummary || msgs[i].toolSummary,
        toolTrace: trace,
      };
      return { ...messages, [sessionId]: msgs };
    }
  }
  return messages;
}

export const useChatStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────
  sessions: [],
  activeSessionId: null,
  messages: {},          // sessionId → Message[]
  streamingText: '',     // Live LLM token stream
  isStreaming: false,
  streamingSessionId: null,
  activeTool: null,      // { tool, args, status, steps: [] }
  topology: null,        // { topologyId, topology_dict, ... }
  exportKit: null,       // { exportId, files, ... }
  error: null,
  loadingSession: false,

  // ── Actions ────────────────────────────────────────────

  loadSessions: async () => {
    try {
      const { sessions } = await sessionApi.list();
      set({ sessions });
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  },

  createSession: async () => {
    const { sessionId } = await sessionApi.create();
    set((s) => ({
      sessions: [{ _id: sessionId, title: 'New Chat', starred: false, createdAt: new Date().toISOString() }, ...s.sessions],
      activeSessionId: sessionId,
      messages: { ...s.messages, [sessionId]: [] },
      streamingText: '',
      isStreaming: false,
      streamingSessionId: null,
      activeTool: null,
      topology: null,
      exportKit: null,
      error: null,
    }));
    sseManager.connect(sessionId, get().handleSSEEvent);
    return sessionId;
  },

  selectSession: async (sessionId) => {
    set({
      activeSessionId: sessionId,
      loadingSession: true,
      streamingText: '',
      isStreaming: false,
      streamingSessionId: null,
      activeTool: null,
      error: null,
    });
    try {
      const { session, topology, exportJob } = await sessionApi.get(sessionId);
      // Attach the loaded topology to the last assistant message that
      // produced it (generate/edit_topology), so it renders inline in the
      // correct chronological position — not floating at the bottom.
      const loadedMessages = session.messages || [];
      if (topology) {
        const topoData = {
          topologyId: topology._id,
          topology_dict: topology.topologyDict,
          topology_data: { name: topology.name, node_count: topology.nodeCount, link_count: topology.linkCount },
          name: topology.name,
          nodeCount: topology.nodeCount,
          linkCount: topology.linkCount,
        };
        for (let i = loadedMessages.length - 1; i >= 0; i--) {
          if (loadedMessages[i].role === 'assistant' &&
              (loadedMessages[i].tool === 'generate_topology' || loadedMessages[i].tool === 'edit_topology')) {
            loadedMessages[i] = { ...loadedMessages[i], topology: topoData };
            break;
          }
        }
      }
      // Reconstruct the exportKit from the loaded export job and attach it
      // to the last assistant message — so the download buttons persist
      // across session switches and page reloads. The export job from the
      // server has a different shape than the deployment_ready SSE event,
      // so we rebuild the files array + deviceConfigs here.
      if (exportJob && exportJob.status === 'complete') {
        const gns3Name = exportJob.files?.gns3Project
          ? exportJob.files.gns3Project.split(/[\\/]/).pop()
          : 'project.gns3project';
        // Derive device count from finalDict if available
        const deviceNames = exportJob.finalDict?.topology?.nodes
          ?.filter(n => n.node_type === 'dynamips' || n.node_type === 'iou' || n.node_type === 'qemu')
          .map(n => n.name) || [];
        const exportKitData = {
          exportId: exportJob._id,
          files: [
            { name: gns3Name, type: 'gns3project', size: null },
            { name: 'configs.zip', type: 'configs', size: null },
            { name: 'requirements.txt', type: 'manifest', size: null },
          ],
          securityProfile: exportJob.securityProfile,
          validation: exportJob.validation,
          deviceConfigs: deviceNames,
        };
        for (let i = loadedMessages.length - 1; i >= 0; i--) {
          if (loadedMessages[i].role === 'assistant') {
            loadedMessages[i] = { ...loadedMessages[i], exportKit: exportKitData };
            break;
          }
        }
      }
      set((s) => ({
        messages: { ...s.messages, [sessionId]: loadedMessages },
        topology: null,  // floating state stays null — topology is on the message
        exportKit: null, // floating state stays null — exportKit is on the message
        loadingSession: false,
      }));
      sseManager.connect(sessionId, get().handleSSEEvent);
    } catch (err) {
      set({ loadingSession: false, error: 'Failed to load session' });
    }
  },

  renameSession: async (sessionId, title) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) throw new Error('Chat name cannot be empty');
    const previous = get().sessions;
    set((s) => ({
      sessions: s.sessions.map((session) => (
        session._id === sessionId ? { ...session, title: cleanTitle } : session
      )),
    }));
    try {
      const result = await sessionApi.updateTitle(sessionId, cleanTitle);
      if (result.session) {
        set((s) => ({
          sessions: s.sessions.map((session) => (
            session._id === sessionId ? { ...session, ...result.session } : session
          )),
        }));
      }
    } catch (err) {
      set({ sessions: previous });
      throw err;
    }
  },

  toggleStarSession: async (sessionId) => {
    const session = get().sessions.find((item) => item._id === sessionId);
    if (!session) return;
    const nextStarred = !session.starred;
    const previous = get().sessions;
    set((s) => ({
      sessions: s.sessions.map((item) => (
        item._id === sessionId ? { ...item, starred: nextStarred } : item
      )),
    }));
    try {
      const result = await sessionApi.updateStarred(sessionId, nextStarred);
      if (result.session) {
        set((s) => ({
          sessions: s.sessions.map((item) => (
            item._id === sessionId ? { ...item, ...result.session } : item
          )),
        }));
      }
    } catch (err) {
      set({ sessions: previous });
      throw err;
    }
  },

  deleteSession: async (sessionId) => {
    await sessionApi.delete(sessionId);
    let shouldCreateReplacement = false;
    set((s) => {
      const newMessages = { ...s.messages };
      delete newMessages[sessionId];
      const newSessions = s.sessions.filter(x => x._id !== sessionId);
      shouldCreateReplacement = s.activeSessionId === sessionId;
      return {
        sessions: newSessions,
        messages: newMessages,
        activeSessionId: shouldCreateReplacement ? null : s.activeSessionId,
        streamingText: shouldCreateReplacement ? '' : s.streamingText,
        isStreaming: shouldCreateReplacement ? false : s.isStreaming,
        streamingSessionId: shouldCreateReplacement ? null : s.streamingSessionId,
        activeTool: shouldCreateReplacement ? null : s.activeTool,
        topology: shouldCreateReplacement ? null : s.topology,
        exportKit: shouldCreateReplacement ? null : s.exportKit,
      };
    });
    if (shouldCreateReplacement) {
      await get().createSession();
    }
  },

  sendMessage: async (content) => {
    const sessionId = get().activeSessionId;
    if (!sessionId || !content.trim()) return;
    const usage = useAuthStore.getState().user?.usage;
    if (isDesignPrompt(content) && usage && usage.remaining <= 0) {
      set({ error: resetMessage(usage.resetAt) });
      return;
    }

    // Append user message locally
    set((s) => ({
      messages: {
        ...s.messages,
        [sessionId]: [...(s.messages[sessionId] || []), { role: 'user', content, createdAt: new Date().toISOString() }],
      },
      streamingText: '',
      isStreaming: true,
      streamingSessionId: sessionId,
      activeTool: null,
      error: null,
    }));

    try {
      await sessionApi.sendMessage(sessionId, content);
    } catch (err) {
      const apiError = err?.response?.data?.error;
      if (apiError?.usage) useAuthStore.getState().setUsage(apiError.usage);
      set({
        isStreaming: false,
        streamingSessionId: null,
        error: apiError?.message || 'Failed to send message',
      });
    }
  },

  // ── Stop streaming ───────────────────────────────────────
  // Called when the user clicks the stop button while the AI is responding.
  // Saves any accumulated streaming text as a partial assistant message
  // (so the user doesn't lose what was already generated), clears the
  // streaming/tool UI state, but keeps the SSE connection alive so any
  // final events (topology_ready, deployment_ready, complete) still get
  // processed and attached to the message.
  stopStreaming: () => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;

    // If there's accumulated streaming text, save it as a partial message
    if (get().streamingText) {
      const text = get().streamingText;
      set((s) => ({
        streamingText: '',
        messages: {
          ...s.messages,
          [sessionId]: [...(s.messages[sessionId] || []), {
            role: 'assistant',
            content: text + '\n\n_(stopped by user)_',
            createdAt: new Date().toISOString(),
          }],
        },
      }));
    }
    set({ isStreaming: false, streamingSessionId: null, activeTool: null });
  },

  // ── SSE event handler — THE single entry point ────────
  handleSSEEvent: (event, data) => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;

    switch (event) {
      case 'token_delta':
        set((s) => ({
          streamingText: s.streamingText + (data.token || ''),
          isStreaming: true,
          streamingSessionId: sessionId,
        }));
        break;

      case 'tool_start':
        set({ activeTool: startToolTrace(data.tool, data.args) });
        break;

      case 'tool_progress':
        set((s) => {
          if (!s.activeTool) return {};
          const steps = s.activeTool.steps.map((step) => (
            step.status === 'running' ? { ...step, status: 'complete' } : step
          ));
          return {
            activeTool: {
              ...s.activeTool,
              steps: [...steps, stepFromProgress(data.step, steps.length, data)],
            },
          };
        });
        break;

      case 'tool_result':
        const finishedTrace = finishToolTrace(get().activeTool, data);
        set({ activeTool: null });
        // Attach the pending topology to a message so it renders inline.
        //
        // Two cases:
        //  (a) streamingText is non-empty: the LLM's pre-tool text hasn't been
        //      saved yet (agent_message hasn't fired). Save it as a new message
        //      with the topology attached.
        //  (b) streamingText is empty: agent_message already fired and saved the
        //      pre-tool text as a message. Attach the topology to THAT last
        //      assistant message instead — otherwise the topology never gets
        //      attached and never renders.
        const pendingTopo = (data.tool === 'generate_topology' || data.tool === 'edit_topology')
          ? get().topology : null;

        if (get().streamingText) {
          // Case (a): save the streaming text as a new message with topology
          const text = get().streamingText;
          set((s) => ({
            streamingText: '',
            messages: {
              ...s.messages,
              [sessionId]: [...(s.messages[sessionId] || []), {
                role: 'assistant',
                content: text,
                tool: data.tool,
                toolSummary: data.summary,
                toolTrace: finishedTrace,
                topology: pendingTopo,
                createdAt: new Date().toISOString(),
              }],
            },
            topology: pendingTopo ? null : s.topology,
          }));
        } else if (pendingTopo) {
          // Case (b): agent_message already saved the text — attach topology
          // to the last assistant message in the array.
          set((s) => {
            const msgs = s.messages[sessionId] ? [...s.messages[sessionId]] : [];
            for (let i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].role === 'assistant') {
                msgs[i] = {
                  ...msgs[i],
                  tool: data.tool,
                  toolSummary: data.summary,
                  toolTrace: finishedTrace,
                  topology: pendingTopo,
                };
                break;
              }
            }
            return {
              messages: { ...s.messages, [sessionId]: msgs },
              topology: null,
            };
          });
        } else if (finishedTrace) {
          set((s) => ({
            messages: attachTraceToLastAssistant(s.messages, sessionId, finishedTrace, data.summary),
          }));
        }
        break;

      case 'topology_ready':
        set({ topology: {
          topologyId: data.topologyId,
          topology_dict: data.topology_dict,
          topology_data: data.topology_data,
          requirements: data.requirements,
          design_review: data.design_review,
          assumptions: data.assumptions,
          thinking_text: data.thinking_text,
        }});
        break;

      case 'deployment_ready':
        // Attach the export kit to the LAST assistant message in the active
        // session, so it renders inline with that message (in the correct
        // chronological position) instead of floating at the bottom of the
        // conversation. This keeps the download buttons anchored to the
        // assistant message that produced them, even when the user sends
        // more messages afterward.
        set((s) => {
          const msgs = s.messages[sessionId] ? [...s.messages[sessionId]] : [];
          // Find the last assistant message (the one that triggered the export)
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'assistant') {
              msgs[i] = { ...msgs[i], exportKit: data };
              break;
            }
          }
          return {
            messages: { ...s.messages, [sessionId]: msgs },
            exportKit: null,  // clear floating state — it's now on the message
          };
        });
        break;

      case 'usage_update':
        useAuthStore.getState().setUsage(data.usage);
        break;

      case 'agent_message':
        // Final message replaces streaming text
        set((s) => ({
          messages: {
            ...s.messages,
            [sessionId]: [...(s.messages[sessionId] || []), {
              role: 'assistant',
              content: data.message,
              createdAt: new Date().toISOString(),
            }],
          },
          streamingText: '',
        }));
        // Reload sessions to pick up auto-title
        get().loadSessions();
        break;

      case 'complete':
        set({ isStreaming: false, streamingSessionId: null, activeTool: null });
        // If there's leftover streaming text that wasn't followed by tool_result or agent_message, save it
        if (get().streamingText) {
          const text = get().streamingText;
          set((s) => ({
            streamingText: '',
            messages: {
              ...s.messages,
              [sessionId]: [...(s.messages[sessionId] || []), {
                role: 'assistant',
                content: text,
                createdAt: new Date().toISOString(),
              }],
            },
          }));
        }
        break;

      case 'error':
        set({ isStreaming: false, streamingSessionId: null, activeTool: null, error: data.message });
        break;

      case 'keepalive':
        // No-op, just keeps connection alive
        break;

      default:
        // Unknown event — log for debugging
        console.debug('[SSE] Unknown event:', event, data);
    }
  },

  reset: () => {
    sseManager.disconnect();
    set({
      streamingText: '',
      isStreaming: false,
      streamingSessionId: null,
      activeTool: null,
      topology: null,
      exportKit: null,
      error: null,
    });
  },
}));
