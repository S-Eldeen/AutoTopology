/**
 * SSE Manager — wraps EventSource with auth + auto-reconnect.
 */
import { useAuthStore } from '../stores/authStore.js';

const SSE_EVENTS = [
  'token_delta',
  'tool_start',
  'tool_progress',
  'tool_result',
  'topology_ready',
  'deployment_ready',
  'usage_update',
  'agent_message',
  'complete',
  'error',
  'keepalive',
];

class SSEManager {
  constructor() {
    this.eventSource = null;
    this.sessionId = null;
    this.reconnectAttempts = 0;
    this.maxReconnect = 5;
    this.reconnectDelay = 1000;
  }

  connect(sessionId, onEvent) {
    this.disconnect();
    this.sessionId = sessionId;
    this.onEvent = onEvent;
    this.reconnectAttempts = 0;
    this._open();
  }

  _open() {
    const token = useAuthStore.getState().accessToken;
    if (!token || !this.sessionId) return;
    const base = import.meta.env.VITE_API_URL || '/api';
    const url = `${base}/sessions/${this.sessionId}/stream?token=${encodeURIComponent(token)}`;

    this.eventSource = new EventSource(url);

    SSE_EVENTS.forEach((event) => {
      this.eventSource.addEventListener(event, (e) => {
        this.reconnectAttempts = 0; // reset on any successful event
        try {
          const data = JSON.parse(e.data);
          this.onEvent?.(event, data);
        } catch (err) {
          console.error('[SSE] Failed to parse event data:', err);
        }
      });
    });

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.eventSource = null;
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnect) {
        console.error('[SSE] Max reconnect attempts reached, giving up');
        this.onEvent?.('error', { message: 'Connection lost — please refresh the page' });
        return;
      }
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.warn(`[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnect})`);
      setTimeout(() => this._open(), delay);
    };
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.sessionId = null;
    this.onEvent = null;
    this.reconnectAttempts = 0;
  }
}

export const sseManager = new SSEManager();
