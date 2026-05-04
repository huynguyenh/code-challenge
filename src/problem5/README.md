# Problem 5 — A Crude Server (Tasks CRUD)

> Develop a backend server with ExpressJS. Build a CRUD interface — create, list-with-filters, get, update, delete — that connects to a simple database. Use TypeScript. Provide a README for configuration and how to run.

## What this is

A small REST API for a **Tasks** resource (`title`, `description`, `status`, `due_date`, `assignee_id`) built on:

- **Express 4** + **TypeScript** (per the brief — TS is mandatory)
- **Prisma 5** + **PostgreSQL 16** (Postgres in Docker)
- **JWT** bearer auth (login-only against a seeded demo user)
- **Zod** for request validation
- **helmet** + boot-time env validation for the basics
- **Vitest** + **supertest** for the test suite (28 cases)

Every CRUD endpoint is gated behind `/auth/login`. Tasks **soft-delete** (set `deleted_at`) so the audit trail stays intact and a deleted id always returns `404` from every read path.

## Prerequisites

- **Node 20+**
- **Yarn 4** (`corepack enable` if needed)
- **Docker** (for Postgres only — the API itself runs in Node)

## Setup

From the repo root:

```bash
# 1. Install deps (root project, used by both Problem 4 and Problem 5)
yarn install

# 2. Copy env file and edit JWT_SECRET if you like
cp .env.example .env

# 3. Start Postgres (port 55432, non-default to avoid local clashes)
docker compose up -d db

# 4. Apply the migration and seed the demo user + sample tasks
yarn p5:db:migrate
yarn p5:db:seed

# 5. Start the API in dev (hot reload via tsx watch)
yarn p5:dev
# → [problem5] listening on http://localhost:4000
```

The seed creates:

| Email | Password | Purpose |
|---|---|---|
| `demo@example.com` | `demo1234` | Reviewer login. Owns 5 sample tasks. |
| `alice@example.com` | `demo1234` | Assignee for one of demo's tasks. |
| `bob@example.com` | `demo1234` | Assignee for another. |

## Walking the API

```bash
# Health
curl http://localhost:4000/healthz
# → { "ok": true }

# Login (grab the token)
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"demo1234"}' \
  | jq -r .token)

# List with default pagination
curl -s http://localhost:4000/tasks \
  -H "Authorization: Bearer $TOKEN" | jq '.data[0:2], .meta'

# Filter by status + substring
curl -s "http://localhost:4000/tasks?status=todo&q=README" \
  -H "Authorization: Bearer $TOKEN" | jq

# Create
TASK=$(curl -s -X POST http://localhost:4000/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"title":"Demo task","description":"made via curl","status":"todo"}' \
  | jq -r .id)

# Patch
curl -s -X PATCH http://localhost:4000/tasks/$TASK \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"status":"done"}' | jq

# Soft-delete; subsequent GET returns 404
curl -i -X DELETE http://localhost:4000/tasks/$TASK \
  -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:4000/tasks/$TASK \
  -H "Authorization: Bearer $TOKEN" | jq
```

## API reference

All `/tasks/*` endpoints require `Authorization: Bearer <jwt>`. All errors share the shape `{ error: { code, message, details? } }`.

### `POST /auth/login`

| | |
|---|---|
| Auth | none |
| Body | `{ "email": "demo@example.com", "password": "demo1234" }` |
| 200 | `{ "token": "<jwt>", "user": { "id", "email", "name" } }` |
| 400 | `VALIDATION_ERROR` (malformed email, missing password) |
| 401 | `INVALID_CREDENTIALS` — **same response** for wrong password and unknown email (no email-existence oracle). |

### `GET /tasks`

| | |
|---|---|
| Auth | bearer |
| Query | `status`, `q`, `dueBefore`, `dueAfter`, `assigneeId`, `page` (≥ 1, default 1), `pageSize` (1–100, default 20) |
| 200 | `{ data: Task[], meta: { page, pageSize, total } }` |
| 400 | invalid filter or out-of-range pageSize |

`q` is case-insensitive substring search across `title` + `description`. Date filters accept anything `Date.parse` understands (ISO 8601 with or without time).

### `POST /tasks`

| | |
|---|---|
| Auth | bearer |
| Body | `{ "title": string (req), "description"?: string, "status"?: "todo" \| "in_progress" \| "done", "due_date"?: ISO date \| null, "assignee_id"?: uuid \| null }` |
| 201 | the created Task |
| 400 | `VALIDATION_ERROR` |

### `GET /tasks/:id`

`200` if you own it (and it's not soft-deleted) — otherwise `404`. Foreign-owned and unknown ids return identical 404 responses on purpose: a 403 for "exists but not yours" would let an attacker probe ID space.

### `PATCH /tasks/:id`

Partial update. Same Zod schema as create, but every field is optional. `200` on success, `400` on invalid body, `404` for unknown / soft-deleted / foreign-owned (same collapse as GET).

### `DELETE /tasks/:id`

Sets `deleted_at = now()` atomically (one `UPDATE WHERE id = ? AND created_by = ? AND deleted_at IS NULL` — no read-then-write race). `204` on success. Already-deleted or foreign-owned ids return `404`.

### `GET /healthz`

Liveness probe. Always `200 { ok: true }`.

## Running tests

```bash
# Tests share the dev DB — run migrate + seed first
yarn p5:db:migrate
yarn p5:db:seed

# All Problem 5 integration tests (Vitest + supertest)
yarn test:p5

# Or every problem at once
yarn test
```

The integration tests hit a real Postgres via the seeded demo user and a second user that's created on the fly for cross-user-isolation checks. Tests reset their own task rows in `beforeEach` so they don't leak across describe blocks.

### Test report

```
 ✓ src/problem5/tests/tasks.test.ts  (21 tests)  ~200ms
 ✓ src/problem5/tests/auth.test.ts   (7 tests)   ~170ms

 Test Files  2 passed (2)
      Tests  28 passed (28)
   Duration  ~940ms
```

Highlights:
- **Auth**: login happy/wrong-password/unknown-email all share the generic `INVALID_CREDENTIALS` 401. Validation 400 for malformed body. Bearer middleware rejects missing / malformed / invalid tokens.
- **CRUD happy path**: create/list/get/patch/delete all work end-to-end against Postgres.
- **CRUD filters**: status, case-insensitive substring (q), pagination, invalid status / pageSize.
- **Cross-user isolation**: foreign-owned task returns 404 (not 403) on every read/write path.
- **Soft delete**: subsequent GET / PATCH / DELETE all return 404. List excludes deleted rows.

## Design notes worth flagging for the reviewer

1. **403 → 404 collapse** on cross-user access. Every read goes through `loadOwned(id, userId)` which uses `findFirst({ where: { id, createdById, deletedAt: null }})`. Foreign and unknown look identical to the client — no ID-existence oracle.

2. **Soft delete is centralised**. There's exactly one place — `NOT_DELETED` in [`service.ts`](./src/modules/tasks/service.ts) — that defines "active task". Every CRUD method composes that predicate into its `where`. New endpoints that forget the filter would stand out immediately in review.

3. **Atomic delete**. `deleteTask` issues a single `UPDATE WHERE id = ? AND created_by = ? AND deleted_at IS NULL` instead of a check-then-act sequence. Two concurrent deletes can't both succeed; the second sees `count = 0` and returns 404.

4. **Auth response timing**. `login()` runs `bcrypt.compare` even when the user doesn't exist, against a dummy hash. Equal-time responses for "wrong password" vs "unknown email" — no timing oracle on top of the no-message oracle.

5. **Boot-time env validation**. `lib/env.ts` parses `process.env` with Zod and `process.exit(1)`s if anything's missing or weak. `JWT_SECRET` must be ≥ 32 chars. The server simply will not boot on a misconfigured env.

6. **Wire shape vs JS shape**. The DB and API both use snake_case (`due_date`, `assignee_id`, `created_by`); the Prisma model uses camelCase mapped via `@map`. The serializer in `service.ts` is the only place that bridges the two.

7. **Index design**. The covering index on `(created_by, deleted_at)` is the one every list query hits. `(status)`, `(due_date)`, and `(assignee_id)` cover the secondary filters. See [`schema.prisma`](./prisma/schema.prisma).

## What's intentionally out of scope

| | Why |
|---|---|
| Register endpoint | The brief asks for "CRUD" — auth wasn't mandated. JWT login-only against the seed is enough to demonstrate ownership. Adding `/auth/register` was explicitly de-scoped during planning. |
| Refresh tokens, password reset, email verification | Out of scope per plan. |
| Rate limiting on `/auth/login` | Not asked; would add for prod (`express-rate-limit`). |
| API Dockerfile / docker-compose for the API | Reviewer runs `yarn p5:dev` locally. Postgres is the only thing in Docker. |
| WebSocket / live updates | That's Problem 6. |
| Audit log / soft-delete recovery endpoint | Soft-delete column is there; surfacing it is product work, not part of the brief. |

## Acceptance criteria status

All 17 ACs from the [plan](../../docs/plan.md#problem-5--a-crude-server-tasks-crud) are met:

#### Auth
- [x] **AC-P5-AUTH-1** — `POST /auth/login` happy path returns 200 + JWT (`sub`, `email`, `iat`, `exp` 24h).
- [x] **AC-P5-AUTH-2** — Wrong password → 401 `INVALID_CREDENTIALS`.
- [x] **AC-P5-AUTH-3** — Unknown email → identical 401 `INVALID_CREDENTIALS`. Same shape, same timing.
- [x] **AC-P5-AUTH-4** — Protected routes return 401 for missing / malformed / invalid token.

#### Tasks CRUD
- [x] **AC-P5-CRUD-1** — `POST /tasks` returns 201 + task.
- [x] **AC-P5-CRUD-2** — Missing title or invalid field → 400 `VALIDATION_ERROR`.
- [x] **AC-P5-CRUD-3** — `GET /tasks` filters by `status / q / dueBefore / dueAfter / assigneeId`, paginates with `page / pageSize`, returns `{ data, meta }`.
- [x] **AC-P5-CRUD-4** — `GET /tasks/:id` 200 / 404 (foreign collapsed to 404).
- [x] **AC-P5-CRUD-5** — `PATCH /tasks/:id` partial update, 400 on bad body, 404 on foreign / deleted / unknown.
- [x] **AC-P5-CRUD-6** — `DELETE /tasks/:id` returns 204 and sets `deleted_at`. Subsequent GET / PATCH return 404.
- [x] **AC-P5-CRUD-7** — Already-deleted id → 404.
- [x] **AC-P5-CRUD-8** — `deleted_at` rows never appear in any list / get response.

#### Infra & DX
- [x] **AC-P5-INFRA-1** — `docker compose up -d db` starts Postgres 16 on `localhost:55432` with healthcheck.
- [x] **AC-P5-INFRA-2** — `yarn p5:db:migrate` runs `prisma migrate deploy` (the AC originally referenced a workspace command; the layout consolidated to root scripts during scaffolding).
- [x] **AC-P5-INFRA-3** — `yarn p5:db:seed` creates demo user + 2 assignee users + 5 sample tasks.
- [x] **AC-P5-INFRA-4** — `yarn p5:dev` starts on `PORT=4000`. Refuses to boot if `JWT_SECRET` is missing or < 32 chars.
- [x] **AC-P5-INFRA-5** — All errors flow through the central handler. No raw stack traces leak in prod (`NODE_ENV=production` silences them).

#### Documentation
- [x] **AC-P5-DOC-1** — This README covers prerequisites, setup, run, full API reference, filter examples, test instructions, and the seed credentials.
