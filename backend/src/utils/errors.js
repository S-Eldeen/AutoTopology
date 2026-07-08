/**
 * Custom error classes + centralized error handler middleware.
 */
import config from '../config/index.js';
import logger from './logger.js';

// ── Base AppError ───────────────────────────────────────────
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── Specific error types ────────────────────────────────────
export class AuthError extends AppError {
  constructor(message = 'Authentication failed', details = null) {
    super(message, 401, 'AUTH_ERROR', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden', details = null) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details = null) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class EngineError extends AppError {
  constructor(message = 'AI engine error', details = null) {
    super(message, 502, 'ENGINE_ERROR', details);
  }
}

export class LLMError extends AppError {
  constructor(message = 'LLM call failed', details = null) {
    super(message, 502, 'LLM_ERROR', details);
  }
}

// ── Centralized error handler ───────────────────────────────

// Convert known Mongoose errors to AppErrors
function wrapMongooseError(err) {
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map(e => e.message);
    return new ValidationError('Mongoose validation failed', details);
  }
  if (err.name === 'CastError') {
    return new ValidationError(`Invalid ${err.path}: ${err.value}`);
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return new ConflictError(`Duplicate ${field}: ${err.keyValue?.[field]}`);
  }
  return err;
}

// 404 handler for unmatched routes
export function notFoundHandler(req, res, _next) {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND',
    },
  });
}

// Final error handler
export function errorHandler(err, req, res, _next) {
  err = wrapMongooseError(err);

  if (err instanceof AppError) {
    logger.warn(`[${err.code}] ${err.message}`, { path: req.path, details: err.details });
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Unknown errors
  logger.error('Unhandled error', { message: err.message, stack: err.stack, path: req.path });

  // Special case: MongoDB connection issues
  if (err.name === 'MongooseError' || err.name === 'MongoServerError' || err.name === 'MongoNetworkError') {
    return res.status(503).json({
      error: {
        message: 'Database temporarily unavailable. Is MongoDB running?',
        code: 'DB_ERROR',
        hint: 'Start MongoDB: run "mongod" or "docker run -d -p 27017:27017 mongo:7"',
      },
    });
  }

  return res.status(500).json({
    error: {
      message: config.env === 'production' ? 'Internal server error' : err.message,
      code: 'INTERNAL',
    },
  });
}
