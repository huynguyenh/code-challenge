// Tiny wrapper that bridges async route handlers into Express 4's
// callback-style error pipeline. Without this, an `async (req, res) => {}`
// that throws produces an unhandled rejection — Express 4's
// Layer.handle_request doesn't await the return value. Express 5 would
// auto-forward, but we're on 4.
import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';

export const asyncHandler =
  (
    fn: (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
