// Last-resort error handler. Every error that bubbles up to Express
// lands here and is serialised to a uniform { error: { code, message } }
// shape. Stack traces never leak in production.
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body or query',
        details: err.flatten(),
      },
    });
    return;
  }

  // Unexpected.
  if (env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error('[unhandled]', err);
  }
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
};
