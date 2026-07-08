/**
 * Server entry point: connects to MongoDB, starts Express.
 */
import dns from 'node:dns';
import mongoose from 'mongoose';
import config from './config/index.js';
import app from './app.js';
import logger from './utils/logger.js';
import aiEngine from './services/ai-engine.bridge.js';

function redactMongoUri(uri = '') {
  return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:/@]+:)[^@]+@/i, '$1***@');
}

async function start() {
  try {
    if (config.mongo.dnsServers.length) {
      dns.setServers(config.mongo.dnsServers);
      logger.info(`MongoDB DNS resolvers: ${config.mongo.dnsServers.join(', ')}`);
    }

    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongo.uri, {
      serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMS,
    });
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message || err}`);
    if (err.code) logger.error(`MongoDB error code: ${err.code}`);
    logger.error(`MongoDB URI: ${redactMongoUri(config.mongo.uri)}`);
    process.exit(1);
  }

  await aiEngine.verifyWrapper();

  const server = app.listen(config.port, () => {
    logger.info(`StructuraNet backend on http://localhost:${config.port} (${config.env})`);
    logger.info(`CORS: ${config.clientUrl}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${config.port} is already in use. Stop the existing process or set PORT to another value.`);
      process.exit(1);
    }
    logger.error('HTTP server failed:', err);
    process.exit(1);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down...`);
    server.close(async () => {
      await mongoose.disconnect();
      logger.info('Server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection:', err);
  });
}

start();
