// Bearer-token middleware. Reads `Authorization: Bearer <jwt>`, verifies
// it, and attaches `req.user` for downstream handlers.
//
// Deliberate scope choice: we do NOT look the user up in the DB here. A
// JWT for a non-existent user could in principle pass through, but the
// plan explicitly de-scoped both /auth/register and any user-deletion
// endpoint — there is no in-band way to make req.user.id reference a
// non-existent user in this codebase. If a future change adds either,
// add a `prisma.user.findUnique({ where: { id: payload.sub } })` here
// AND a token-revocation strategy (token version, jti blocklist, etc.).
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
