import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { loginSchema } from './schema.js';
import { login } from './service.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = loginSchema.parse(req.body);
      const result = await login(input);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);
