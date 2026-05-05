import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../src/app.js';
import { signToken } from '../src/lib/jwt.js';
import { prisma } from '../src/lib/prisma.js';
import { disconnect, ensureDemoUser } from './helpers/db.js';

const app = createApp();

let demoId = '';
let demoToken = '';
let otherId = '';
let otherToken = '';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const demo = await ensureDemoUser();
  demoId = demo.id;
  demoToken = signToken({ sub: demo.id, email: demo.email });

  // Second user for cross-user isolation tests. Created on the fly so
  // running tests doesn't permanently pollute the seed user list.
  const other = await prisma.user.upsert({
    where: { email: 'other-test@example.com' },
    update: {},
    create: {
      email: 'other-test@example.com',
      name: 'Other Test',
      passwordHash: await bcrypt.hash('test1234', 10),
    },
  });
  otherId = other.id;
  otherToken = signToken({ sub: other.id, email: other.email });
});

beforeEach(async () => {
  // Reset both users' tasks at the start of every test so seed data
  // doesn't leak across describe blocks.
  await prisma.task.deleteMany({
    where: { OR: [{ createdById: demoId }, { createdById: otherId }] },
  });
});

afterAll(async () => {
  await prisma.task.deleteMany({
    where: { OR: [{ createdById: demoId }, { createdById: otherId }] },
  });
  await prisma.user.delete({ where: { id: otherId } }).catch(() => {});
  await disconnect();
});

describe('POST /tasks', () => {
  it('creates a task with valid body', async () => {
    const res = await request(app)
      .post('/tasks')
      .set(auth(demoToken))
      .send({
        title: 'Test task',
        description: 'A description',
        status: 'todo',
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Test task');
    expect(res.body.status).toBe('todo');
    expect(res.body.created_by).toBe(demoId);
  });

  it('rejects missing title with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/tasks')
      .set(auth(demoToken))
      .send({ description: 'No title' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('GET /tasks', () => {
  beforeEach(async () => {
    await prisma.task.createMany({
      data: [
        {
          title: 'Buy milk',
          description: 'two litres',
          status: 'todo',
          createdById: demoId,
        },
        {
          title: 'Write code',
          description: 'demo task',
          status: 'in_progress',
          createdById: demoId,
        },
        {
          title: 'Done thing',
          description: null,
          status: 'done',
          createdById: demoId,
        },
        {
          title: 'Other user task',
          description: null,
          status: 'todo',
          createdById: otherId,
        },
      ],
    });
  });

  it('lists only my tasks', async () => {
    const res = await request(app).get('/tasks').set(auth(demoToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    expect(res.body.meta.total).toBe(3);
    expect(
      res.body.data.every(
        (t: { created_by: string }) => t.created_by === demoId,
      ),
    ).toBe(true);
  });

  it('filters by status', async () => {
    const res = await request(app)
      .get('/tasks?status=todo')
      .set(auth(demoToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('todo');
  });

  it('filters by case-insensitive substring on title and description', async () => {
    const res = await request(app)
      .get('/tasks?q=DEMO')
      .set(auth(demoToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].description).toMatch(/demo/i);
  });

  it('paginates with page and pageSize', async () => {
    const res = await request(app)
      .get('/tasks?page=1&pageSize=2')
      .set(auth(demoToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.meta.pageSize).toBe(2);
  });

  it('rejects invalid status with 400', async () => {
    const res = await request(app)
      .get('/tasks?status=bogus')
      .set(auth(demoToken));
    expect(res.status).toBe(400);
  });

  it('rejects pageSize > 100 with 400', async () => {
    const res = await request(app)
      .get('/tasks?pageSize=999')
      .set(auth(demoToken));
    expect(res.status).toBe(400);
  });
});

describe('GET /tasks/:id', () => {
  let taskId = '';

  beforeEach(async () => {
    const t = await prisma.task.create({
      data: { title: 'find me', createdById: demoId },
    });
    taskId = t.id;
  });

  it('returns the task when owned', async () => {
    const res = await request(app)
      .get(`/tasks/${taskId}`)
      .set(auth(demoToken));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(taskId);
    expect(res.body.title).toBe('find me');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/tasks/00000000-0000-0000-0000-000000000000')
      .set(auth(demoToken));
    expect(res.status).toBe(404);
  });

  it('returns 404 for a task owned by another user (no 403 leak)', async () => {
    const res = await request(app)
      .get(`/tasks/${taskId}`)
      .set(auth(otherToken));
    expect(res.status).toBe(404);
  });

  it('returns 400 (not 500) for a malformed UUID in the path', async () => {
    // Regression guard: Prisma rejects non-UUID input on @db.Uuid columns
    // (P2023). Without route-layer Zod validation that error fell through
    // to a 500. The taskIdParamSchema catches it as a 400 VALIDATION_ERROR.
    const res = await request(app)
      .get('/tasks/not-a-uuid')
      .set(auth(demoToken));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /tasks/:id', () => {
  let taskId = '';

  beforeEach(async () => {
    const t = await prisma.task.create({
      data: { title: 'patch me', createdById: demoId },
    });
    taskId = t.id;
  });

  it('updates partial fields', async () => {
    const res = await request(app)
      .patch(`/tasks/${taskId}`)
      .set(auth(demoToken))
      .send({ status: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.title).toBe('patch me');
  });

  it('rejects invalid status with 400', async () => {
    const res = await request(app)
      .patch(`/tasks/${taskId}`)
      .set(auth(demoToken))
      .send({ status: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when patching a foreign-owned task', async () => {
    const res = await request(app)
      .patch(`/tasks/${taskId}`)
      .set(auth(otherToken))
      .send({ title: 'hacked' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /tasks/:id (soft delete)', () => {
  let taskId = '';

  beforeEach(async () => {
    const t = await prisma.task.create({
      data: { title: 'delete me', createdById: demoId },
    });
    taskId = t.id;
  });

  it('returns 204 and sets deleted_at', async () => {
    const res = await request(app)
      .delete(`/tasks/${taskId}`)
      .set(auth(demoToken));
    expect(res.status).toBe(204);

    const row = await prisma.task.findUnique({ where: { id: taskId } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it('subsequent GET returns 404 (deleted task is invisible)', async () => {
    await request(app).delete(`/tasks/${taskId}`).set(auth(demoToken));
    const res = await request(app)
      .get(`/tasks/${taskId}`)
      .set(auth(demoToken));
    expect(res.status).toBe(404);
  });

  it('subsequent PATCH returns 404 (no resurrection through update)', async () => {
    await request(app).delete(`/tasks/${taskId}`).set(auth(demoToken));
    const res = await request(app)
      .patch(`/tasks/${taskId}`)
      .set(auth(demoToken))
      .send({ status: 'done' });
    expect(res.status).toBe(404);
  });

  it('deleting twice returns 404 the second time', async () => {
    await request(app).delete(`/tasks/${taskId}`).set(auth(demoToken));
    const res = await request(app)
      .delete(`/tasks/${taskId}`)
      .set(auth(demoToken));
    expect(res.status).toBe(404);
  });

  it('does not allow a foreign user to delete', async () => {
    const res = await request(app)
      .delete(`/tasks/${taskId}`)
      .set(auth(otherToken));
    expect(res.status).toBe(404);
  });

  it('list does not include soft-deleted tasks', async () => {
    await request(app).delete(`/tasks/${taskId}`).set(auth(demoToken));
    const res = await request(app).get('/tasks').set(auth(demoToken));
    expect(res.status).toBe(200);
    expect(
      res.body.data.find((t: { id: string }) => t.id === taskId),
    ).toBeUndefined();
  });
});
