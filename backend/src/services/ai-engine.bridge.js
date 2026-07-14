/**
 * AI Engine Bridge — persistent Python worker via stdin/stdout JSONL.
 *
 * ARCHITECTURE
 * ────────────
 * Previously this bridge spawned a fresh `python wrapper.py <cmd>` process for
 * every AI request. Each spawn paid a 2-4 second cold-start penalty (Python
 * interpreter init + OpenAI SDK import + catalog load + hardware tables).
 *
 * Now the bridge spawns ONE long-running `python worker.py` process at first
 * use, and keeps it alive for the lifetime of the Node process. Every command
 * (generate, edit, export, qa, validate, catalog) is sent to the same worker
 * as a JSONL message over stdin, and the response is read from stdout.
 *
 * LATENCY CHARACTERISTICS
 * ───────────────────────
 * The persistent worker eliminates the Python interpreter startup + module
 * import overhead (2-4s per call → paid once per server session). However,
 * the overall latency of each command is still dominated by the OpenAI API
 * round-trip:
 *   - generate: 10-60s (LLM topology generation)
 *   - export:   30-120s (Phase 2 LLM config generation + GNS3 export)
 *   - qa:       5-30s (LLM knowledge-base Q&A)
 *   - validate: <1s (pure Python, no LLM)
 *   - catalog:  <50ms (pure Python, no LLM)
 * The worker reuse means the SECOND generate call in a session skips the
 * 2-4s import cost, not the 10-60s LLM cost.
 *
 * CONCURRENCY MODEL
 * ─────────────────
 * The worker processes requests SEQUENTIALLY (one at a time). This is a
 * deliberate architectural decision, not a technical limitation — it keeps
 * the worker simple (events on stdout always belong to the active request,
 * no shared-state synchronization needed) and avoids subtle bugs like
 * concurrent mutations of the OpenAI client's timeout attribute.
 *
 * If two requests arrive at the bridge concurrently, both are written to
 * the worker's stdin, but the worker only processes the first — the second
 * waits in stdin's buffer until the first completes. The bridge's request-ID
 * matching ensures each response is routed to the correct caller, so no
 * request is lost, but a long-running generate call WILL delay a subsequent
 * export call.
 *
 * This is acceptable for the current use case (single-user chat sessions
 * where requests are naturally sequential). If higher throughput is needed
 * in the future, introduce a small pool of 2-3 worker processes and
 * round-robin requests across them — the request-ID protocol already
 * supports this, only the spawn/queue logic would need to change.
 *
 * PROTOCOL
 * ────────
 * Request  (Node → Worker, on stdin):   {"id":"<reqId>","command":"<cmd>","args":{...}}\n
 * Event    (Worker → Node, on stdout):  {"id":"<reqId>","event":"<name>","data":{...}}\n
 * Response (Worker → Node, on stdout):  {"id":"<reqId>","ok":true,"result":{...}}\n
 *                                        or
 *                                        {"id":"<reqId>","ok":false,"error":{"message":"...","details":"..."}}\n
 *
 * Each request is tagged with a unique ID (crypto.randomUUID). The worker
 * includes the same ID in every event and the final response, so multiple
 * in-flight requests can be matched to their responses — even if they
 * interleave on stdout.
 *
 * PUBLIC API (UNCHANGED)
 * ──────────────────────
 * The orchestrator and routes do NOT change. The same methods are exposed
 * with the same signatures:
 *   - generate(params, onEvent)
 *   - edit(params, onEvent)
 *   - exportProject(params, onEvent)
 *   - qa(topic, onEvent)
 *   - validate(topologyPath, onEvent)
 *   - catalog()
 *   - verifyWrapper()
 *   - ensureOutputDir(outputDir)
 *
 * The onEvent callback receives the same {event, data} objects as before.
 *
 * ERROR RECOVERY
 * ──────────────
 * - Command error: the worker catches it, sends back an {ok:false} response,
 *   and stays alive. The bridge rejects the matching pending promise.
 * - Worker crash (process exit): the bridge's exit handler rejects ALL
 *   pending requests IMMEDIATELY with a structured EngineError — no waiting
 *   for timeout. The next request spawns a fresh worker.
 * - Spawn failure: if the worker can't start (e.g. Python not found), the
 *   spawn promise rejects and the next request retries.
 * - Timeout: if a request exceeds its timeout, the bridge rejects that one
 *   request (the worker stays alive and may still be processing).
 *
 * CLEAN SHUTDOWN
 * ──────────────
 * The bridge listens for Node 'exit' and 'SIGTERM'/'SIGINT' events and sends
 * a "shutdown" command to the worker so it can exit cleanly. If the worker
 * doesn't exit within 3s, it's killed with SIGKILL.
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { EngineError } from '../utils/errors.js';

class AIEngineBridge {
  constructor() {
    this.pythonBin = config.aiEngine.pythonBin;
    this.wrapperPath = config.aiEngine.wrapperPath;
    this.workerPath = path.resolve(path.dirname(this.wrapperPath), 'worker.py');
    this.defaultTimeout = config.aiEngine.defaultTimeout;
    this.exportTimeout = config.aiEngine.exportTimeout;

    // The persistent worker process — null until first use or after a crash.
    this._proc = null;
    // Map<reqId, { resolve, reject, onEvent, timer, command }> — pending requests
    this._pending = new Map();
    // Line buffer for stdout (JSONL messages are newline-delimited)
    this._stdoutBuf = '';
    // Line buffer for stderr (for error diagnostics)
    this._stderrBuf = '';
    // True if we're already in the process of spawning the worker
    this._spawning = false;
    // True if the worker is shutting down (don't accept new requests)
    this._shuttingDown = false;
  }

  // ═══════════════════════════════════════════════════════════
  //  WORKER LIFECYCLE
  // ═══════════════════════════════════════════════════════════

  /**
   * Verify the worker.py file exists. Called once from server.js at boot.
   * Does NOT spawn the worker — that happens lazily on first request.
   */
  async verifyWrapper() {
    try {
      await fs.access(this.workerPath);
      logger.info(`AI Engine worker: ${this.workerPath}`);
    } catch {
      logger.error(`Worker not found at: ${this.workerPath}`);
      logger.error('   Ensure worker.py exists alongside wrapper.py in the ai-engine directory.');
    }
  }

  /**
   * Spawn the persistent worker process. Called lazily on the first request.
   * Resolves once the worker has sent its "ready" event.
   * @returns {Promise<ChildProcess>}
   */
  _spawnWorker() {
    if (this._proc && !this._proc.killed && this._proc.exitCode === null) {
      return Promise.resolve(this._proc);
    }
    if (this._spawning) {
      // Another caller is already spawning — wait for it
      return this._spawning;
    }

    this._spawning = new Promise((resolve, reject) => {
      logger.info(`Spawning persistent AI worker: ${this.pythonBin} ${this.workerPath}`);

      const proc = spawn(this.pythonBin, [this.workerPath], {
        cwd: path.dirname(this.workerPath),
        // Only pass the env vars the worker needs — NOT the full parent env
        // (closes the secret-leak vector flagged in the code review).
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          USERPROFILE: process.env.USERPROFILE,
          PYTHONUNBUFFERED: '1',
          PYTHONPATH: path.dirname(this.workerPath),
          ROUTER_API_KEY: process.env.ROUTER_API_KEY || '',
          ROUTER_BASE_URL: process.env.ROUTER_BASE_URL || '',
          AI_MODEL: process.env.AI_MODEL || '',
          AI_MAX_TOKENS: process.env.AI_MAX_TOKENS || '',
          LLM_CALL_TIMEOUT: process.env.LLM_CALL_TIMEOUT || '',
          STRUCTRANET_OUTPUT_DIR: process.env.STRUCTRANET_OUTPUT_DIR || '',
          QA_KNOWLEDGE_BASE_PATH: process.env.QA_KNOWLEDGE_BASE_PATH || '',
        },
        windowsHide: true,
      });

      this._proc = proc;
      this._stdoutBuf = '';
      this._stderrBuf = '';

      // Track whether the spawn promise has settled (resolved or rejected).
      // Prevents double-settle if the exit event fires after a readyTimer
      // timeout or an error event.
      let spawnSettled = false;
      const settleSpawn = (fn, value) => {
        if (spawnSettled) return;
        spawnSettled = true;
        clearTimeout(readyTimer);
        fn(value);
      };
      const resolveOnce = (v) => settleSpawn(resolve, v);
      const rejectOnce = (e) => settleSpawn(reject, e);

      // ── stdout: line-by-line JSONL parser ──────────────────────
      proc.stdout.on('data', (chunk) => {
        this._stdoutBuf += chunk.toString();
        const lines = this._stdoutBuf.split('\n');
        this._stdoutBuf = lines.pop(); // keep partial line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          this._handleWorkerMessage(trimmed);
        }
      });

      // ── stderr: capture for error reporting ────────────────────
      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        this._stderrBuf += text;
        if (this._stderrBuf.length > 8192) {
          this._stderrBuf = this._stderrBuf.slice(-8192); // bound the buffer
        }
        if (text.trim()) logger.debug(`[worker stderr] ${text.trim()}`);
      });

      // ── exit handler ───────────────────────────────────────────
      // Fires on clean exit, crash, or SIGKILL. Rejects all pending requests
      // IMMEDIATELY (no waiting for timeout) so callers fail fast.
      proc.on('exit', (code, signal) => {
        logger.info(`AI worker exited (code=${code}, signal=${signal})`);
        this._proc = null;
        this._spawning = false;

        // Reject all pending requests with a clear error
        for (const entry of this._pending.values()) {
          clearTimeout(entry.timer);
          entry.reject(new EngineError(
            `AI worker exited unexpectedly (code=${code}) while processing ${entry.command}`,
            { stderr: this._stderrBuf.slice(-2000) }
          ));
        }
        this._pending.clear();

        // If the worker died during spawn (before "ready"), reject the spawn
        // promise so the caller gets an immediate error instead of hanging.
        rejectOnce(new EngineError(
          `AI worker exited during startup (code=${code}, signal=${signal})`,
          { stderr: this._stderrBuf.slice(-2000) }
        ));
      });

      proc.on('error', (err) => {
        logger.error(`Failed to spawn AI worker: ${err.message}`);
        this._proc = null;
        this._spawning = false;
        rejectOnce(new EngineError(`Failed to spawn Python worker: ${err.message}`));
      });

      // Wait for the worker's "ready" event before resolving. The worker
      // sends {"id":null,"event":"ready","data":{"status":"all modules imported"}}
      // once heavy imports complete. We time out after 30s.
      const readyTimer = setTimeout(() => {
        rejectOnce(new EngineError('AI worker failed to send "ready" event within 30s'));
      }, 30_000);

      // Patch the message handler to catch the ready event
      const originalHandler = this._handleWorkerMessage.bind(this);
      this._handleWorkerMessage = (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        if (msg.id === null && msg.event === 'ready') {
          this._handleWorkerMessage = originalHandler;
          logger.info('AI worker ready — heavy modules imported, OpenAI client initialized');
          this._installShutdownHandlers();
          resolveOnce(proc);
          return;
        }
        if (msg.id === null && msg.ok === false) {
          // Warm-up failed — log but still resolve (worker may still serve some commands)
          this._handleWorkerMessage = originalHandler;
          logger.warn(`AI worker warm-up failed: ${msg.error?.message} — worker may not function correctly`);
          this._installShutdownHandlers();
          resolveOnce(proc);
          return;
        }
        // Pass other messages (warming_up events) to the normal handler
        originalHandler(raw);
      };
    });

    return this._spawning;
  }

  /**
   * Install Node process exit handlers so we cleanly shut down the worker.
   */
  _installShutdownHandlers() {
    if (this._shutdownHandlersInstalled) return;
    this._shutdownHandlersInstalled = true;

    const shutdown = async (signal) => {
      if (this._shuttingDown) return;
      this._shuttingDown = true;
      logger.info(`${signal} received — shutting down AI worker`);

      if (this._proc && !this._proc.killed) {
        // Send the shutdown command
        try {
          this._proc.stdin.write(JSON.stringify({
            id: 'shutdown',
            command: 'shutdown',
            args: {},
          }) + '\n');
        } catch {
          // stdin may already be closed during shutdown.
        }

        // Force-kill after 3s if still alive
        setTimeout(() => {
          if (this._proc && !this._proc.killed) {
            try { this._proc.kill('SIGKILL'); } catch {
              // Process may have exited between the liveness check and kill.
            }
          }
        }, 3000);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('exit', () => {
      if (this._proc && !this._proc.killed) {
        try { this._proc.kill('SIGKILL'); } catch {
          // Process may already be gone on Node exit.
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  MESSAGE HANDLING
  // ═══════════════════════════════════════════════════════════

  /**
   * Handle one JSONL message from the worker.
   * Routes events and responses to the matching pending request.
   */
  _handleWorkerMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      logger.warn('Failed to parse worker JSONL message:', raw.slice(0, 200));
      return;
    }

    const reqId = msg.id;

    // Worker-level events (id === null): warming_up, ready, warm-up errors
    if (reqId === null) {
      if (msg.event) {
        logger.debug(`[worker event] ${msg.event}`, msg.data || '');
      } else if (msg.ok === false) {
        logger.error(`[worker error] ${msg.error?.message}`);
      }
      return;
    }

    const entry = this._pending.get(reqId);
    if (!entry) {
      logger.warn(`Received worker message for unknown request id: ${reqId}`);
      return;
    }

    // ── Event (streamed during processing) ─────────────────────
    if (msg.event) {
      if (entry.onEvent) {
        try {
          entry.onEvent({ event: msg.event, data: msg.data });
        } catch (err) {
          logger.error(`onEvent callback threw for ${entry.command}:`, err);
        }
      }
      return;
    }

    // ── Final response ─────────────────────────────────────────
    clearTimeout(entry.timer);
    this._pending.delete(reqId);

    if (msg.ok) {
      entry.resolve(msg.result);
    } else {
      const errMsg = msg.error?.message || 'AI worker returned an error';
      entry.reject(new EngineError(errMsg, {
        details: msg.error?.details,
        stderr: this._stderrBuf.slice(-2000),
      }));
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  REQUEST SENDING
  // ═══════════════════════════════════════════════════════════

  /**
   * Send a command to the worker and return a Promise that resolves with the
   * result. Events streamed by the worker are forwarded to onEvent.
   *
   * @param {string} command — generate | edit | export | qa | validate | manifest | brief | catalog
   * @param {object} args — command-specific arguments (matches wrapper.py argparse)
   * @param {number} timeout — ms before the request is rejected
   * @param {(event) => void} onEvent — callback for streamed events
   * @returns {Promise<object>} — the worker's result object
   */
  async _request(command, args = {}, timeout = this.defaultTimeout, onEvent = null) {
    // Ensure the worker is alive (spawns on first call, respawns after crash)
    await this._spawnWorker();

    const reqId = randomUUID();
    const payload = JSON.stringify({ id: reqId, command, args }) + '\n';

    return new Promise((resolve, reject) => {
      // Set up the timeout — fires if the worker doesn't respond in time
      const timer = setTimeout(() => {
        this._pending.delete(reqId);
        // This worker is sequential. If the timed-out command is left alive,
        // later export requests queue behind a result Node has discarded.
        // Stop it so the next command starts against a clean worker.
        const proc = this._proc;
        if (proc && !proc.killed && proc.exitCode === null) {
          try { proc.kill(); } catch {
            // It may have exited between the liveness check and kill.
          }
        }
        reject(new EngineError(`AI worker request "${command}" timed out after ${timeout / 1000}s`));
      }, timeout);

      // Register the pending request
      this._pending.set(reqId, { resolve, reject, onEvent, timer, command });

      // Write the request to the worker's stdin
      try {
        if (!this._proc || this._proc.killed) {
          clearTimeout(timer);
          this._pending.delete(reqId);
          return reject(new EngineError('AI worker is not running'));
        }
        this._proc.stdin.write(payload);
        logger.debug(`[bridge→worker] ${command} (id=${reqId.slice(0, 8)})`);
      } catch (err) {
        clearTimeout(timer);
        this._pending.delete(reqId);
        reject(new EngineError(`Failed to write to worker stdin: ${err.message}`));
      }
    });
  }

  /**
   * Ensure output directory exists; returns absolute path.
   * (Preserved from the old bridge — used by the orchestrator.)
   */
  async ensureOutputDir(outputDir) {
    const dir = outputDir || path.resolve(process.cwd(), config.aiEngine.outputDir);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  // ═══════════════════════════════════════════════════════════
  //  COMMAND WRAPPERS — public API (signatures UNCHANGED)
  // ═══════════════════════════════════════════════════════════

  /**
   * generate — Phase 1: build topology from natural language.
   * The optional `profile` object carries the user's GNS3 calibration
   * (template_image_map, gns3_version, feature flags) so Python can
   * emit image filenames that match the user's installed images.
   */
  async generate(params, onEvent = null) {
    const args = {
      request: params.request,
      security_profile: params.securityProfile,
      output_dir: params.outputDir,
      chat_history: params.chatHistory ? JSON.stringify(params.chatHistory) : '[]',
      profile: params.profile ? JSON.stringify(params.profile) : '{}',
    };
    return this._request('generate', args, this.defaultTimeout, onEvent);
  }

  /**
   * edit — Phase 1 (edit): modify existing topology with feedback.
   */
  async edit(params, onEvent = null) {
    const args = {
      feedback: params.feedback,
      topology: params.topologyPath,
      security_profile: params.securityProfile,
      original_request: params.originalRequest,
      output_dir: params.outputDir,
      chat_history: params.chatHistory ? JSON.stringify(params.chatHistory) : '[]',
      profile: params.profile ? JSON.stringify(params.profile) : '{}',
    };
    return this._request('edit', args, this.defaultTimeout, onEvent);
  }

  /**
   * export — Phase 2: generate configs + .gns3project file.
   */
  async exportProject(params, onEvent = null) {
    const args = {
      topology: params.topologyPath,
      security_profile: params.securityProfile,
      output_dir: params.outputDir,
      profile: params.profile ? JSON.stringify(params.profile) : '{}',
      no_validate: params.noValidate || false,
    };
    return this._request('export', args, this.exportTimeout, onEvent);
  }

  /**
   * qa — answer a Cisco/networking question.
   */
  async qa(topic, onEvent = null) {
    return this._request('qa', { topic }, this.defaultTimeout, onEvent);
  }

  /**
   * validate — validate a topology JSON file.
   */
  async validate(topologyPath, onEvent = null) {
    return this._request('validate', { topology: topologyPath }, 60_000, onEvent);
  }

  /**
   * catalog — export the appliance catalog as JSON.
   * Returns the full APPLIANCE_CATALOG from Python (the single source of
   * truth) so the frontend can render a searchable device dropdown in the
   * GNS3 profile onboarding popup.
   */
  async catalog() {
    return this._request('catalog', {}, 30_000, null);
  }
}

// Singleton
const aiEngine = new AIEngineBridge();
export default aiEngine;
