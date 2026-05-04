// Bearer-token middleware. Reads `Authorization: Bearer <jwt>`, verifies
// it, and attaches `req.user` for downstream handlers.
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { verifyToken } from '../lib/jwt.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; email: string };
  }
}

export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return next(
      AppError.unauthorized('Missing or malformed Authorization header'),
    );
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    // Don't leak the inner reason (expired vs malformed vs wrong-secret) —
    // the client should treat all of them the same.
    next(AppError.unauthorized('Invalid or expired token'));
  }
};
