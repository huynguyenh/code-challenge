import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

beforeAll(async () => {
  // Demo user is the seed's responsibility — tests run against the same
  // seeded DB the dev server uses.
  const exists = await prisma.user.findUnique({
    where: { email: 'demo@example.com' },
  });
  if (!exists) {
    throw new Error(
      'Demo user not found. Run `yarn p5:db:migrate && yarn p5:db:seed` first.',
    );
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials and returns a JWT', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'demo@example.com', password: 'demo1234' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe('demo@example.com');
    expect(res.body.user.name).toBe('Demo User');
  });

  it('rejects wrong password with a generic 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'demo@example.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.message).toMatch(/invalid email or password/i);
  });

  it('rejects unknown email with the SAME generic 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'demo1234' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    // Same shape as the wrong-password case — no email-existence oracle.
    expect(res.body.error.message).toMatch(/invalid email or password/i);
  });

  it('rejects malformed body with 400', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Auth middleware (gate on /tasks)', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with malformed Authorization header', async () => {
    const res = await request(app)
      .get('/tasks')
      .set('Authorization', 'NotBearer xxx');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a structurally invalid token', async () => {
    const res = await request(app)
      .get('/tasks')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
