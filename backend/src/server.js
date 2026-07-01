/**
 * Server entry point — connects to MongoDB, starts Express.
 */
import dns from 'node:dns';
import mongoose from 'mongoose';
import config from './config/index.js';
import app from './app.js';
import logger from './utils/logger.js';
import aiEngine from './services/ai-engine.bridge.js';

async function start() {
  // ── Connect to MongoDB ────────────────────────────────────
  try {
    if (config.mongo.dnsServers.length) {
      dns.setServers(config.mongo.dnsServers);
      logger.info(`MongoDB DNS resolvers: ${config.mongo.dnsServers.join(', ')}`);
    }

    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongo.uri, {
      serverSelectionTimeoutMS: 5000,
    });
    logger.info('✅ MongoDB connected');
  } catch (err) {
    logger.error('❌ MongoDB connection failed:', err.message);
    logger.error('   Make sure MongoDB is running at:', config.mongo.uri);
    process.exit(1);
  }

  // ── Verify AI engine wrapper exists ───────────────────────
  await aiEngine.verifyWrapper();

  // ── Start HTTP server ─────────────────────────────────────
  const server = app.listen(config.port, () => {
    logger.info(`🚀 StructuraNet backend on http://localhost:${config.port} (${config.env})`);
    logger.info(`   CORS: ${config.clientUrl}`);
  });

  // ── Graceful shutdown ─────────────────────────────────────
  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down...`);
    server.close(async () => {
      await mongoose.disconnect();
      logger.info('✅ Server closed');
      process.exit(0);
    });
    // Force after 10s
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Unhandled rejection handler
  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection:', err);
  });
}

start();
