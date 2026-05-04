import bcrypt from 'bcrypt';
import { AppError } from '../../lib/errors.js';
import { signToken } from '../../lib/jwt.js';
import { prisma } from '../../lib/prisma.js';
import type { LoginInput } from './schema.js';

export interface LoginResult {
  token: string;
  user: { id: string; email: string; name: string };
}

export async function login({
  email,
  password,
}: LoginInput): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Always run bcrypt.compare even when the user is missing, so the
  // response time doesn't leak which case we're in. The dummy hash below
  // is a real bcrypt hash of the string "decoy" with cost 10.
  const dummyHash =
    '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.GcXbvg1aF0u9b1J3hH4OX9o2KTZG';
  const ok = await bcrypt.compare(
    password,
    user?.passwordHash ?? dummyHash,
  );

  if (!user || !ok) {
    throw AppError.invalidCredentials();
  }

  const token = signToken({ sub: user.id, email: user.email });
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name },
  };
}
