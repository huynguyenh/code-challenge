# INTERVIEW-S5-BE: 99Tech Backend Code Challenge — Problems 4 & 5

**Ticket**: https://s5tech.notion.site/Code-Challenge-05cdb9e0d1ce432a843f763b5d5f7497 (Backend tab)
**Date**: 2026-05-04
**Status**: Draft → ready for review
**Repo**: github.com/huynguyenh/code-challenge (fresh, public)
**Branches**: `main` (scaffold + plan + chat log) → `feat/problem4` (PR #1, squash) → `feat/problem5` (PR #2, squash) → final review on `main`.

## Context

The 99Tech Code Challenge backend track has three problems. **Problem 4** is a 2-hour TS warm-up — write three different `sum_to_n` implementations and discuss complexity. **Problem 5** is the substantive build — Express + TypeScript CRUD with auth, persistence, README. **Problem 6** is documentation only (deferred to a later session per user direction). I am applying for a backend role; the reviewer will judge code quality, design choices, test coverage, and clarity of artefacts (plan, README, commits, PR).

The brief mandates TypeScript and is otherwise open-ended ("free-pick a resource", "basic filters", "simple database"). Most decisions are mine to make and defend.

## Decision

**Chosen approach**: One TypeScript repo, layout mirrors the skeletal `99techteam/code-challenge` (`src/problem4/`, `src/problem5/`). Single root `package.json` with Vitest as the only test runner. Per-problem feature branches → 1 squashed PR per problem into `main`.

**Why this approach**: Mirrors the skeletal repo 1:1 so the reviewer's muscle memory works. Single TS project keeps tooling overhead low (one tsconfig, one Vitest config, one `yarn install`). Per-problem PRs map directly to per-problem reviewable units — much easier than reading one giant commit.

**Stack** (locked after interview):
- **Problem 4**: pure TypeScript, no runtime deps. Vitest unit tests. README documents complexity.
- **Problem 5**: Express + TypeScript + **Prisma** + Postgres (Docker) + JWT (login-only, seeded demo user) + Zod. Resource = **Tasks** (`title`, `description`, `status`, `due_date`, `assignee_id`). **Soft delete** via `deleted_at` timestamp. Vitest integration tests.

**Alternatives considered**:
- **Sequelize + raw SQL migrations** (last build's stack): Rejected. Reuse risk — reviewers may know I built almost the same thing recently. Prisma forces fresh decisions, demonstrates a different toolchain, and the schema-first DX is cleaner.
- **Plain `pg` driver**: Rejected. Hand-written CRUD queries are fine for one resource but force me to write more boilerplate that doesn't differentiate the submission.
- **API key auth instead of JWT**: Rejected. The user committed to JWT and JWT is a more realistic signal for a backend role.
- **Full register + login**: Rejected (per user). Login-only against a seeded user keeps the auth surface tighter and avoids an endpoint the brief didn't ask for.
- **Hard delete**: Rejected (per user). Soft delete is more production-realistic and gives me a meaningful "404 after delete" behaviour to test.

**Skipped Phase 3 deep investigation**: The plan workflow asks me to launch context-gatherer + architecture-analyst in parallel. Both look at *existing* state (prior attempts, system architecture, dependencies). This is a fresh repo, single-author, no prior attempts. Documenting the deliberate skip rather than running agents that have nothing to investigate.

---

## Acceptance Criteria

### Problem 4 — Three ways to sum to n

- [ ] **AC-P4-1**: `src/problem4/sumToN.ts` exports three functions named `sum_to_n_a`, `sum_to_n_b`, `sum_to_n_c`, each with signature `(n: number) => number` (matching the brief verbatim).
- [ ] **AC-P4-2**: All three return identical correct sums for `n ∈ {0, 1, 5, 10, 100, 10_000}`.
- [ ] **AC-P4-3**: All three return `0` for `n ≤ 0` (documented choice for negative/zero input).
- [ ] **AC-P4-4**: The three implementations use **genuinely different algorithms**: (a) iterative loop, (b) tail-recursive helper, (c) closed-form Gauss formula `n*(n+1)/2`. No two are syntactic variants of the same approach.
- [ ] **AC-P4-5**: Each function has a **JSDoc comment** documenting time and space complexity.
- [ ] **AC-P4-6**: `src/problem4/sumToN.test.ts` runs under Vitest and covers: happy path (matrix of n × 3 impls), boundary `0`, boundary `1`, negative `-5`, large `n=10_000`. All three impls produce the same answer for every valid n.
- [ ] **AC-P4-7**: `src/problem4/README.md` summarises each approach, gives a Big-O table, calls out the trade-offs (e.g. recursion stack depth for large n), and embeds the test-run output.

### Problem 5 — A Crude Server (Tasks CRUD)

#### Auth (3 ACs)
- [ ] **AC-P5-AUTH-1**: `POST /auth/login` with `{ email, password }` of the seeded demo user → `200 { token, user }`. JWT is HS256, contains `sub` (user id), `iat`, `exp` (24h).
- [ ] **AC-P5-AUTH-2**: `POST /auth/login` with wrong password → `401 { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } }`. **Same response shape and timing** as AUTH-3 (no oracle).
- [ ] **AC-P5-AUTH-3**: `POST /auth/login` with unknown email → identical 401 response as AUTH-2.
- [ ] **AC-P5-AUTH-4**: Any protected route → `401 { error: { code: "UNAUTHORIZED" } }` when `Authorization` header is missing, malformed, expired, or signed with a different secret.

#### Tasks CRUD (8 ACs)
- [ ] **AC-P5-CRUD-1**: `POST /tasks` with valid body and a valid bearer token → `201` + the created task with id and `created_at`.
- [ ] **AC-P5-CRUD-2**: `POST /tasks` with missing `title` or any Zod-invalid field → `400 { error: { code: "VALIDATION_ERROR", details: [...] } }`.
- [ ] **AC-P5-CRUD-3**: `GET /tasks` returns tasks owned by the authenticated user (`created_by = me`), with `deleted_at IS NULL`. Supports filters `?status=todo|in_progress|done`, `?q=substring` (case-insensitive on title+description), `?dueBefore=ISO`, `?dueAfter=ISO`, `?assigneeId=uuid`. Supports pagination `?page=1&pageSize=20` (default 20, max 100). Returns `{ data, meta: { page, pageSize, total } }`.
- [ ] **AC-P5-CRUD-4**: `GET /tasks/:id` → `200` if owned + not deleted; `404` if unknown id, deleted, or owned by another user (collapsed to 404 to prevent ID probing).
- [ ] **AC-P5-CRUD-5**: `PATCH /tasks/:id` partial update (Zod): `200` on success; `400` on invalid body; `404` for unknown/deleted/foreign-owned (same collapse).
- [ ] **AC-P5-CRUD-6**: `DELETE /tasks/:id` → `204`, sets `deleted_at = now()`. Subsequent `GET /tasks/:id` and `PATCH /tasks/:id` return `404`.
- [ ] **AC-P5-CRUD-7**: `DELETE /tasks/:id` for an already-deleted id → `404` (idempotent from the client's perspective, no resurrection).
- [ ] **AC-P5-CRUD-8**: All list/get/patch/delete responses **never include** `deleted_at` of soft-deleted records — the client never sees them.

#### Infra & DX (5 ACs)
- [ ] **AC-P5-INFRA-1**: `docker compose up -d db` starts Postgres 16 on `localhost:55432` (non-default port to avoid collisions). Healthcheck passes.
- [ ] **AC-P5-INFRA-2**: `yarn workspace problem5 db:migrate` runs `prisma migrate deploy` against the running DB. Prisma migration creates `users`, `tasks` tables + indexes (status, due_date, deleted_at, created_by).
- [ ] **AC-P5-INFRA-3**: `yarn workspace problem5 db:seed` creates 1 demo user (`demo@example.com` / `demo1234`), 2 assignee-only users, and 5 sample tasks with varied status/due_date.
- [ ] **AC-P5-INFRA-4**: `yarn workspace problem5 dev` starts the API on `PORT=4000` with hot reload (tsx watch). Refuses to boot if `JWT_SECRET` is missing or shorter than 32 chars.
- [ ] **AC-P5-INFRA-5**: All errors flow through a single Express error handler that emits `{ error: { code, message, details? } }`. No raw stack traces leak in production mode.

#### Documentation (1 AC)
- [ ] **AC-P5-DOC-1**: `src/problem5/README.md` covers: prerequisites (Node 20, Yarn 4, Docker), `.env.example`, copy-paste setup commands (`docker compose up`, migrate, seed, dev), full API reference table (method / path / auth / request / response codes), filter examples, how to run tests, where to find the seed credentials.

### Use Cases (product-oriented view, Problem 5)

| # | Actor | Goal | Happy path | Unhappy paths |
|---|---|---|---|---|
| UC-1 | Demo user | Log in | POST /auth/login → 200 + token | wrong password → 401 generic; unknown email → 401 generic |
| UC-2 | Demo user | Create a task | POST /tasks → 201 + task | missing title → 400; bad due_date format → 400; no token → 401 |
| UC-3 | Demo user | Find tasks | GET /tasks?status=todo&q=demo → 200 + filtered | invalid status enum → 400; pageSize=999 → clamped to 100 |
| UC-4 | Demo user | View one task | GET /tasks/:id → 200 + task | unknown id → 404; deleted task → 404 |
| UC-5 | Demo user | Edit a task | PATCH /tasks/:id → 200 + updated | unknown id → 404; bad body → 400 |
| UC-6 | Demo user | Remove a task | DELETE /tasks/:id → 204; subsequent GET → 404 | already deleted → 404; not owned → 404 |
| UC-7 | Anyone | Use the API without logging in | n/a | every protected endpoint → 401 |

---

## Scope

**In scope:**
- TypeScript everywhere (mandated)
- Single repo with `src/problem4/` and `src/problem5/`
- Single root `package.json` (using yarn workspaces is overkill for 2 problems — single project root with subfolders)
- Vitest for both problems
- `src/problem6/` directory exists but contains only a `.keep` and a stub README ("deferred")
- Per-problem feature branches → squashed PR per problem
- Plan + chat log + README in `docs/`
- `.env.example`, `docker-compose.yml`, Prisma schema + migration + seed for P5
- `/hnh-review-pr` + `/security-review` final pass on each PR

**Out of scope:**
- Problem 6 (Architecture spec) — deferred per user direction
- Frontend / UI of any kind
- Register endpoint (login-only against seeded user, per user choice)
- Refresh tokens, password reset, email verification
- Pagination cursor (offset pagination is enough for the brief's "basic filters")
- Rate limiting (not asked; would add for prod, not for an interview demo)
- WebSocket / live updates (Problem 6 territory)
- Production deploy / CI / Dockerfile for the API (Postgres-only Docker; the API itself runs in Node)
- Advanced filtering (full-text search, JSON-ld, etc.)
- Audit log / soft-delete recovery endpoint
- Multi-tenancy beyond the demo user

**Follow-up work** (separate sessions):
- Problem 6 (Architecture)
- Optional: API Dockerfile + docker-compose with the API service
- Optional: rate limiting on `/auth/login`

---

## System Impact

### Files Created (high level)

| Path | Purpose |
|---|---|
| `package.json` | Root: scripts, deps for both problems, vitest config |
| `tsconfig.json` | Root TS config, strict mode |
| `vitest.config.ts` | Single Vitest config; isolates each problem via folder pattern |
| `.env.example` | Documents `DATABASE_URL`, `JWT_SECRET`, `PORT` |
| `docker-compose.yml` | Postgres 16 service for P5 |
| `src/problem4/sumToN.ts` | Three implementations + JSDoc complexity |
| `src/problem4/sumToN.test.ts` | Vitest matrix test |
| `src/problem4/README.md` | Approach explanation, complexity table, test results |
| `src/problem5/prisma/schema.prisma` | User + Task models, soft-delete field |
| `src/problem5/prisma/migrations/...` | Generated migration |
| `src/problem5/prisma/seed.ts` | Demo user + assignee users + sample tasks |
| `src/problem5/src/server.ts` | App entrypoint (creates app, listens) |
| `src/problem5/src/app.ts` | Express factory (helmet, json, routes, error handler) |
| `src/problem5/src/lib/prisma.ts` | Prisma client singleton |
| `src/problem5/src/lib/jwt.ts` | sign / verify helpers, secret guard |
| `src/problem5/src/lib/errors.ts` | `AppError` class with code/status/message |
| `src/problem5/src/middleware/auth.ts` | Bearer token middleware → `req.user` |
| `src/problem5/src/middleware/errorHandler.ts` | Uniform `{ error: { code, message } }` |
| `src/problem5/src/modules/auth/route.ts` | POST /auth/login |
| `src/problem5/src/modules/auth/service.ts` | login() — bcrypt compare + jwt sign |
| `src/problem5/src/modules/auth/schema.ts` | Zod login schema |
| `src/problem5/src/modules/tasks/route.ts` | CRUD endpoints, mounted under /tasks |
| `src/problem5/src/modules/tasks/service.ts` | Prisma queries, soft-delete-aware |
| `src/problem5/src/modules/tasks/schema.ts` | Zod create/update/list-filter schemas |
| `src/problem5/tests/auth.test.ts` | Integration: login happy + unhappy |
| `src/problem5/tests/tasks.test.ts` | Integration: CRUD happy + unhappy |
| `src/problem5/README.md` | Setup, run, API reference, test instructions |
| `src/problem6/README.md` | "Deferred" stub |
| `docs/plan.md` | This plan, mirrored from `~/.claude/plans/` |
| `docs/session-log.md` | Persistent chat log |

### Database Changes

**P5 only.** Prisma migration `0001_init`:

- `users` table: `id (uuid, pk)`, `email (citext, unique)`, `name`, `password_hash`, `created_at`
- `tasks` table: `id (uuid, pk)`, `title`, `description (nullable)`, `status (enum)`, `due_date (nullable)`, `assignee_id (fk users.id, nullable)`, `created_by (fk users.id)`, `created_at`, `updated_at`, `deleted_at (nullable)`
- Indexes: `tasks(created_by, deleted_at)`, `tasks(status)`, `tasks(due_date) WHERE deleted_at IS NULL`, `tasks(assignee_id) WHERE deleted_at IS NULL`
- Downtime risk: **none** (greenfield)
- Backfill: **n/a**
- Rollback: `prisma migrate reset` for dev; not deployed to prod

### API Changes

Net-new API. No backward-compat constraints. Contract:

| Method | Path | Auth | Body / Query | Codes |
|---|---|---|---|---|
| POST | /auth/login | none | `{ email, password }` | 200 / 400 / 401 |
| GET | /tasks | bearer | `?status&q&dueBefore&dueAfter&assigneeId&page&pageSize` | 200 / 400 / 401 |
| POST | /tasks | bearer | `{ title, description?, status?, due_date?, assignee_id? }` | 201 / 400 / 401 |
| GET | /tasks/:id | bearer | — | 200 / 401 / 404 |
| PATCH | /tasks/:id | bearer | partial body | 200 / 400 / 401 / 404 |
| DELETE | /tasks/:id | bearer | — | 204 / 401 / 404 |
| GET | /healthz | none | — | 200 |

### Dependencies

- **Upstream**: Postgres 16 (via Docker)
- **Downstream**: none (no other services consume this)
- **Runtime**: express, @prisma/client, jsonwebtoken, bcrypt, zod, helmet, dotenv
- **Dev**: typescript, tsx, vitest, supertest, prisma, @types/*

---

## Implementation Steps

Order: scaffolding first (low-risk), Problem 4 (smallest, easiest to verify), Problem 5 (largest), review/security at the end. Each step is independently reviewable.

### Step 0: Scaffold + chat log + plan on `main` *(already partially done)*
**Files**: `README.md`, `.gitignore`, `docs/session-log.md`, `docs/plan.md`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `src/problem4/.keep`, `src/problem5/.keep`, `src/problem6/.keep`
**Why first**: Reviewer can read the plan and chat log before any code lands. Sets the tone.
**Done when**: `git log` on main shows one initial commit; pushed to fresh public repo `huynguyenh/code-challenge`.
**Verification**:
- [ ] Repo exists publicly
- [ ] `yarn install` succeeds (root)
- [ ] `yarn test` runs Vitest (no tests yet — should report "no test files found" without error)

### Step 1: Problem 4 implementation (branch `feat/problem4`)
**Files**:
- `src/problem4/sumToN.ts` — three functions:
  ```ts
  /** O(n) time, O(1) space — straightforward iterative accumulation. */
  export const sum_to_n_a = (n: number): number => { /* loop */ };

  /** O(n) time, O(n) space — tail-recursive helper. Stack risk for very large n. */
  export const sum_to_n_b = (n: number): number => { /* recurse */ };

  /** O(1) time, O(1) space — Gauss formula. Cleanest. */
  export const sum_to_n_c = (n: number): number => (n <= 0 ? 0 : (n * (n + 1)) / 2);
  ```
- `src/problem4/sumToN.test.ts` — Vitest matrix:
  ```ts
  describe.each([
    ['sum_to_n_a', sum_to_n_a],
    ['sum_to_n_b', sum_to_n_b],
    ['sum_to_n_c', sum_to_n_c],
  ])('%s', (name, fn) => {
    it.each([
      [0, 0], [1, 1], [5, 15], [10, 55], [100, 5050], [10000, 50005000], [-3, 0],
    ])('returns %i for n=%i', (n, expected) => {
      expect(fn(n)).toBe(expected);
    });
  });
  ```
- `src/problem4/README.md` — complexity table + test output capture.

**Verification**:
- [ ] `yarn test src/problem4` — all 21 cases pass (7 inputs × 3 impls)
- [ ] `tsc --noEmit` clean
- [ ] All three return same value for every test case (consistency check is part of the matrix)

**Commit**: `feat(problem4): three sum_to_n implementations + complexity analysis`
**PR #1**: open against `main`, body summarises approaches, paste test output.

### Step 2: Problem 5 — infra (branch `feat/problem5`)
**Files**: `docker-compose.yml`, `src/problem5/.env.example`, `src/problem5/prisma/schema.prisma`, `src/problem5/package.json` (sub-package, scripts only — root deps cover everything)
**Why next**: DB has to exist before any code can connect.
**Verification**:
- [ ] `docker compose up -d db` — Postgres healthy on `localhost:55432`
- [ ] `yarn workspace problem5 db:generate` produces Prisma client
- [ ] `yarn workspace problem5 db:migrate` creates tables; `\dt` shows `users`, `tasks`

### Step 3: Problem 5 — Express skeleton + error handler + JWT util
**Files**: `app.ts`, `server.ts`, `lib/prisma.ts`, `lib/jwt.ts`, `lib/errors.ts`, `middleware/errorHandler.ts`, `middleware/auth.ts`, `middleware/notFound.ts`
**Why next**: needed by every endpoint module.
**Verification**:
- [ ] `yarn workspace problem5 dev` — server boots, refuses to boot if `JWT_SECRET` < 32 chars
- [ ] `curl /healthz` → `200 { ok: true }`
- [ ] `curl /unknown-path` → `404 { error: { code: "NOT_FOUND" } }`

### Step 4: Problem 5 — Auth module (login)
**Files**: `modules/auth/{route,service,schema}.ts`, `prisma/seed.ts`, `tests/auth.test.ts`
**Why next**: needed for protected routes.
**Verification (integration tests)**:
- [ ] AC-P5-AUTH-1, 2, 3 all pass
- [ ] Generic 401 message for both wrong password and unknown email

### Step 5: Problem 5 — Tasks module (CRUD)
**Files**: `modules/tasks/{route,service,schema}.ts`, `tests/tasks.test.ts`
**Verification**:
- [ ] AC-P5-CRUD-1 through 8 all pass
- [ ] Filter combinations covered (status alone, q alone, status+q, dueBefore alone, paging beyond first page)
- [ ] Soft-delete semantics: `DELETE` then `GET` = 404; `DELETE` twice = 204 then 404
- [ ] Auth gate: every CRUD endpoint returns 401 without token

### Step 6: Problem 5 — README + final polish
**Files**: `src/problem5/README.md`, root `README.md` (update status table)
**Verification**:
- [ ] Reviewer can copy-paste the README's setup commands and end up with a running server in < 5 minutes
- [ ] All AC checkboxes ticked

**Commit**: `feat(problem5): Express+TS Tasks CRUD with JWT auth and soft delete`
**PR #2**: open against `main`, body summarises decisions, links AC list, paste test output.

### Step 7: `/hnh-review-pr` + `/security-review` final pass
**Trigger**: after both PRs land on `main`.
**Output**: any findings get fixed in a final docs/hardening PR; or absorbed into PR #2 before merge if found early.

---

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Soft-delete leak — deleted task returned from list | Med | High (data integrity) | Centralise the `where: { deleted_at: null }` predicate in a single Prisma query helper; integration test specifically asserts deleted task is invisible. |
| JWT secret leak (committed by mistake) | Low | High | `JWT_SECRET` only in `.env` (gitignored); refuse to boot if missing/<32 chars; `.env.example` committed with placeholder only. |
| Cross-user data exposure (probing IDs) | Med | High | Service layer always filters by `created_by = req.user.id`; collapse 403→404 to prevent existence oracle. Integration test seeds a second user and asserts foreign-owned ids return 404. |
| SQL injection via filter params | Low | High | Prisma parameterises all queries; Zod validates filter inputs at the boundary — no string interpolation. |
| `pageSize` abuse (DoS via large page) | Low | Med | Zod schema clamps `pageSize` to `[1, 100]`. Default 20. |
| Recursion stack overflow in `sum_to_n_b` for huge n | Low | Low | JSDoc + README explicitly call out the limitation. Test caps at n=10_000 (well under V8's default stack). |
| Reviewer can't run the project | Med | Critical (interview) | README is reviewer-first: copy-paste commands, prerequisites listed at top, troubleshooting section. `.env.example` is committed. |
| Prisma migration drift between dev runs | Low | Med | `prisma migrate dev` regenerates on schema change; CI-style note in README to use `migrate deploy`. |
| Test flake on integration suite | Med | Med | Each test cleans its rows in `afterEach`; describe-level seeding via `beforeAll`; tests run sequentially (Vitest default for integration files). |

### Rollback Plan
N/A — fresh repo, no production system. If an approach turns out wrong mid-implementation, the per-problem branch makes it cheap to abandon.

### Feature Flag
N/A.

---

## Testing Strategy

### Testing Pyramid

- **Problem 4**: 100% unit tests via Vitest. Pure functions, no integration surface.
- **Problem 5**: thin unit tests for pure helpers (jwt, schemas) + heavy integration tests via supertest. The integration tests are where the confidence comes from — they exercise the real Express app + real Prisma + real Postgres in Docker.

### Unit Tests

| Test file | Test case | What it verifies | Priority |
|---|---|---|---|
| `src/problem4/sumToN.test.ts` | matrix of (impl × n) | 21 cases: 7 inputs × 3 impls all match | Must |
| `src/problem5/tests/lib/jwt.test.ts` | sign+verify roundtrip | Token verifies; tampered token rejected; expired token rejected | Should |
| `src/problem5/tests/lib/schemas.test.ts` | Zod schemas | Valid bodies pass; missing/wrong types rejected with field-level error | Should |

**Edge cases (problem 4):** `n = 0`, `n = 1` (boundary of formula), `n = -3` (per AC, returns 0), large `n = 10_000`.
**Edge cases (problem 5):** empty list (no tasks); page beyond last; pageSize = 1 and 100; q with special chars; due_date at exact boundary.

### Integration Tests (P5)

| Scenario | Setup | Action | Expected |
|---|---|---|---|
| Login happy | seed demo user | POST /auth/login (correct creds) | 200, JWT, user object |
| Login wrong password | seed demo user | POST /auth/login (wrong pw) | 401 generic |
| Login unknown email | — | POST /auth/login (unknown email) | 401 generic (same shape) |
| Protected without token | — | GET /tasks | 401 |
| Protected with bad token | — | GET /tasks (Bearer xxx) | 401 |
| Create task happy | logged in | POST /tasks valid body | 201 + task |
| Create task missing title | logged in | POST /tasks { } | 400 VALIDATION_ERROR |
| List with filters | seed varied tasks | GET /tasks?status=todo&q=demo | 200 + filtered subset |
| List pagination | seed 25 tasks | GET /tasks?page=2&pageSize=10 | 200, data.length=10, meta.total=25 |
| Get unknown id | — | GET /tasks/00000000-... | 404 |
| Get foreign task | seed task owned by other user | GET /tasks/:id | 404 (not 403) |
| Patch happy | seed own task | PATCH /tasks/:id | 200 + updated |
| Patch foreign | — | PATCH /tasks/:foreignId | 404 |
| Delete happy | seed own task | DELETE /tasks/:id | 204 |
| Delete then get | — | DELETE /tasks/:id; GET /tasks/:id | 204 then 404 |
| Delete twice | — | DELETE /tasks/:id; DELETE /tasks/:id | 204 then 404 |

### E2E
N/A — no UI.

### Performance / Load
N/A — interview submission. README notes that pagination is unbounded by design at 100/page.

### Security
- Passwords hashed with bcrypt (cost 10).
- JWT signed HS256 with `JWT_SECRET` (≥32 chars enforced at boot).
- Generic 401 on auth failure (no email enumeration).
- 403→404 collapse on cross-user access.
- helmet() on all responses.
- No SQL strings — Prisma only.
- `.env` gitignored; `.env.example` only.
- Final `/security-review` skill pass before merge.

### Test Checklist
- [ ] All ACs have a corresponding test
- [ ] Edge cases listed above all covered
- [ ] `yarn test` runs both problems' suites in one shot, exits 0
- [ ] `tsc --noEmit` passes
- [ ] No console.log left in production code paths

---

## Observability

### Logging
- Pino (or plain JSON via `console.log` if Pino feels heavy). One log line per request: `method`, `path`, `status`, `duration_ms`, `user_id` (if authed). Errors include `error.code` but never the secret/PII.

### Metrics
N/A — single-instance demo.

### Alerts
N/A.

### Monitoring
The README includes a "what to look at" section listing Postgres logs (`docker compose logs -f db`) and the API's stdout.

---

## Deployment

### Pre-deployment
- [ ] All ACs ticked
- [ ] PR review (`/hnh-review-pr`) clean
- [ ] Security review (`/security-review`) clean
- [ ] README's setup walkthrough actually works

### Deployment Steps
N/A — submission is the GitHub repo + PRs. Reviewer runs locally per README.

### Post-deployment Verification
N/A — see "Manual Verification" below.

### Manual Verification (reviewer's path)

1. `git clone https://github.com/huynguyenh/code-challenge && cd code-challenge`
2. `yarn install`
3. **Problem 4**: `yarn test src/problem4` → 21 passing tests
4. **Problem 5**:
   - `cp src/problem5/.env.example src/problem5/.env`
   - `docker compose up -d db`
   - `yarn workspace problem5 db:migrate && yarn workspace problem5 db:seed`
   - `yarn workspace problem5 dev`
   - `curl localhost:4000/healthz` → 200
   - `curl -X POST localhost:4000/auth/login -d '{"email":"demo@example.com","password":"demo1234"}' -H 'content-type: application/json'` → 200 + token
   - Use token to hit `/tasks` and friends per README

### Rollback Trigger
N/A.

---

## Report

To be updated when implementation is complete.

### What We Did
_pending_

### What We Tested
_pending_

### What We Observed After Deploy
_pending_ (no deploy)

### What's Left
_pending_
