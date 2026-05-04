// Boot-time env validation. Refuses to start if any required value is
// missing or weak — surfaces config bugs immediately instead of letting
// them turn into 500s in production.
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[env] validation failed:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
