// HS256 JWTs for the bearer-auth middleware. 24-hour expiry per the plan.
import jwt from 'jsonwebtoken';
import { env } from './env.js';

export interface JwtPayload {
  sub: string;
  email: string;
}

export const signToken = (payload: JwtPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '24h',
  });

export const verifyToken = (token: string): JwtPayload => {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
  }) as jwt.JwtPayload;
  if (typeof decoded.sub !== 'string' || typeof decoded.email !== 'string') {
    throw new Error('Invalid token payload');
  }
  return { sub: decoded.sub, email: decoded.email };
};
