import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { loginSchema } from './schema.js';
import { login } from './service.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await login(input);
    res.status(200).json(result);
  }),
);
