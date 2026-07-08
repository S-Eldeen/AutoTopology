/**
 * Centralized configuration with validation.
 * Reads from .env, validates required vars, exposes typed config object.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ── Required vars check ────────────────────────────────────
const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'MONGO'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
  console.error('   Copy .env.example to .env and fill in values.');
  process.exit(1);
}

// ── Config object ──────────────────────────────────────────
export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  mongo: {
    uri: process.env.MONGO,
    serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || '15000', 10),
    dnsServers: (process.env.MONGO_DNS_SERVERS || '')
      .split(',')
      .map(server => server.trim())
      .filter(Boolean),
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  llm: {
    apiKey: process.env.ROUTER_API_KEY,
    baseUrl: process.env.ROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.AI_MODEL || 'openrouter/owl-alpha',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '16384', 10),
  },

  speech: {
    apiKey: process.env.SPEECH_API_KEY
      || (process.env.SPEECH_BASE_URL?.includes('openrouter.ai') ? process.env.ROUTER_API_KEY : process.env.OPENAI_API_KEY)
      || process.env.ROUTER_API_KEY,
    baseUrl: process.env.SPEECH_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.SPEECH_MODEL || 'whisper-1',
  },

  aiEngine: {
    pythonBin: process.env.PYTHON_BIN || 'python',
    wrapperPath: process.env.WRAPPER_PATH || process.env.WRAPER_PATH
      ? path.resolve(__dirname, '../../', process.env.WRAPPER_PATH || process.env.WRAPER_PATH)
      : path.resolve(__dirname, '../../../ai-engine/wrapper.py'),
    outputDir: process.env.OUTPUT_DIR || './output',
    defaultTimeout: 300_000,      // 5 min for generate/edit
    exportTimeout: 600_000,       // 10 min for export
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
};

export default config;
