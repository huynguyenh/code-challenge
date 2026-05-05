# Interview session log — S5Tech backend code-challenge

A faithful, lightly-summarised log of every prompt I gave Claude Code in this build, with the gist of Claude's reply or what action it took. Kept verbatim where short, summarised where long. The point is to show **how** the work got done, not to relitigate it.

---

## Session start

> **User:** same, check this for me https://s5tech.notion.site/Code-Challenge-05cdb9e0d1ce432a843f763b5d5f7497 — but different repo

**Claude:** Tried `hnh-notion` skill first (per `~/.claude/rules/global-skills.md`). The integration hadn't been shared on this Notion workspace → 404. WebFetch returned only the literal word "Notion" because the page is JS-rendered. Fell back to **Claude in Chrome** — same fallback I used on the previous interview.

> **User:** we are apply for backend for this btw

**Claude:** Acknowledged. Loaded the page in Chrome, clicked the **Backend** tab in the Problems table, opened each problem's side-panel detail one at a time (hover row → click `OPEN`) and read each via `get_page_text`. Then peeked at the skeletal template at `github.com/99techteam/code-challenge` — confirmed it's essentially empty (just `src/problem1…5/.keep`). Summarised the three backend problems back to the user:

| # | Title | Time hint¹ | What it asks for |
|---|---|---|---|
| 4 | Three ways to sum to n | ≤ 2h | TS file with three different `sum_to_n(n)` impls + complexity commentary |
| 5 | A Crude Server | ≤ 16h | Express+TS CRUD (create / list-with-filters / get / update / delete), simple DB, README |
| 6 | Architecture | ≤ 8h | Spec only — README + diagram for a live top-10 scoreboard module, must prevent unauth score writes |

¹ "Time estimation is for internship roles, if you are a software professional you should spend significantly less time."

---

## Decision round 1 — scope, layout, workflow, P5 stack

**Claude asked four `AskUserQuestion`s.** User chose:

- **Scope:** "all 3 of them, each in 1 dir … 1 github commit for 1 problem"
- **Layout:** `src/problem4`, `src/problem5`, `src/problem6` (mirror skeletal repo exactly)
- **Workflow:** persistent chat log under `docs/`, `/hnh-plan` first, `/hnh-review-pr` + `/security-review` at the end, public repo, clean commits + PR description, **no Claude/AI attribution**
- **P5 stack:** free-pick a resource + Postgres in Docker + JWT auth

The user's inline note used `main.go` as the example file name. Claude flagged two conflicts before scaffolding:
1. The brief explicitly mandates **TypeScript** for both Problem 4 and Problem 5. Going Go would risk auto-disqualification.
2. Problem 6 is documentation-only — a `main.go` doesn't fit there.

## Decision round 2 — language, P6 shape, folder names

**Claude asked three follow-up questions.** User chose:

- **Language:** Stick with TypeScript as the brief mandates *(Recommended)*
- **P6 shape:** Skip Problem 6 for now, handle later
- **Folder names:** `src/problem4`, `src/problem5`, `src/problem6` (exact mirror)

## Decision round 3 — repo + commit discipline

- **Repo:** Fresh public repo `github.com/huynguyenh/code-challenge`, do not fork *(Recommended)*
- **Commits:** Per-problem feature branches → 1 squashed PR per problem into main

---

## Final scope locked

- **Problems:** 4 and 5 (P6 deferred)
- **Stack:**
  - **P4:** TypeScript file under `src/problem4/`, three `sum_to_n` implementations, Vitest unit tests, README with complexity analysis and test report
  - **P5:** Express + TypeScript under `src/problem5/`, Postgres via Docker, JWT auth, free-pick resource, Vitest integration tests, README with config + run instructions
- **Repo layout:**
  ```
  code-challenge/
  ├── docs/
  │   ├── session-log.md   # this file
  │   └── plan.md          # /hnh-plan output, committed for the reviewer
  ├── src/
  │   ├── problem4/
  │   └── problem5/
  ├── package.json         # single TS project root
  ├── tsconfig.base.json
  └── README.md
  ```
- **Branch flow:** `main` (initial scaffolding + plan) → `feat/problem4` (PR #1, squash) → `feat/problem5` (PR #2, squash) → final review/security pass on `main`.
- **No Claude/AI attribution** anywhere — commits, PR descriptions, code comments, README. Per `~/.claude/rules/global-claude.md`.

---

## Plan, scaffolding, and Problem 4

> **User:** lets go

**Claude:** Acknowledged. Walked through the principal-engineer plan workflow: read `references/plan-workflow.md`, did the Phase-1 challenge (flagged that "basic filters" needed pinning down + that JWT was user-chosen, not brief-chosen), did the Phase-2 interview via four `AskUserQuestion`s (resource = Tasks; auth = login-only against seeded user; soft delete; Prisma + prisma-migrate). Skipped the Phase-3 deep-investigation agents on purpose — fresh repo, no existing state to gather context on.

Wrote the plan to `~/.claude/plans/INTERVIEW-S5-BE/2026-05-04-99tech-backend-challenge.md`, mirrored to `docs/plan.md`. 7 ACs for Problem 4, 17 for Problem 5, 7 use cases, full risk register, full test plan.

Then scaffolded the repo: root `package.json` + `tsconfig.json` (strict) + `vitest.config.ts` + `.yarnrc.yml` (`nodeLinker: node-modules`) + `.env.example` + `.gitignore`. `yarn install` clean (~3s, 20 packages, 61 MiB). `yarn test` correctly reports "no test files yet". `yarn typecheck` clean. Committed as `chore: scaffold repo with TypeScript, Vitest, and submission docs` on `main`. Created the public GitHub repo with `gh repo create huynguyenh/code-challenge --public --source=. --push` — repo lives at https://github.com/huynguyenh/code-challenge.

### Problem 4

Branched `feat/problem4`. Wrote `sumToN.ts` with three impls: iterative loop, **tail-recursive helper**, closed-form Gauss formula. Wrote the matrix test (7 inputs × 3 impls + 6 cross-impl consistency = 27 cases). First test run failed exactly where the JSDoc said it would: V8 stack overflow at n=10_000 in the recursive variant.

Two fixes were available — cap the recursive test at smaller n (admits the impl doesn't scale) or swap to a paradigm that handles the full input range. Picked the swap: **functional `Array.from(...).reduce(...)`** as the new variant (b). Kept the spirit of "three different paradigms" (imperative / functional / mathematical) while making all three work for the AC's full range.

Updated `docs/plan.md` to record the deviation explicitly (AC-P4-4 now reads "iterative loop / functional reduce / closed-form formula" with a note about what got swapped and why). Wrote the Problem 4 README with: complexity table, paradigm-comparison rationale, deviation note, runnable commands, full 27-line test output, and AC checklist (all checked).

Final test run: 27/27 passing in ~155ms. `tsc --noEmit` clean.

Next: commit, push, open PR #1.

---

## Problem 5 — Tasks CRUD

> **User:** Merge PR #1 (squash) now, then branch `feat/problem5` from fresh main

**Claude:** `gh pr merge 1 --squash --delete-branch` succeeded; main is now at the squashed P4 commit. Branched `feat/problem5`.

Built end-to-end in step order from the plan:

1. **Infra** — `docker-compose.yml` (Postgres 16, port 55432), root `package.json` updated with Express/Prisma/JWT/Zod/helmet/bcrypt deps + scripts (`p5:dev`, `p5:db:*`). Docker Desktop wasn't running locally; `open -a Docker` brought it up. `yarn install` clean.
2. **Prisma schema** — `User` and `Task` models with snake_case `@map`, soft-delete column on Task, indexes on `(created_by, deleted_at)`, `status`, `due_date`, `assignee_id`. `yarn p5:db:migrate:dev --name init` generated the migration SQL and applied it.
3. **Seed** — demo user + alice + bob, all sharing `demo1234` password, plus 5 sample tasks across statuses with two due-dated tasks for assignee filtering. Idempotent via `upsert` + a `deleteMany` reset for demo's tasks.
4. **Express skeleton** — `lib/env.ts` (Zod boot-validation, refuses if JWT_SECRET < 32 chars), `lib/prisma.ts` (HMR-safe singleton), `lib/jwt.ts` (HS256, 24h, strict algorithm pin on verify), `lib/errors.ts` (`AppError` factory: invalidCredentials, notFound, unauthorized, validation).
5. **Middleware** — `requireAuth` (Bearer parser → `req.user`), `errorHandler` (uniform `{ error: { code, message, details? } }` shape, never leaks stack in prod), `notFoundHandler`.
6. **Auth module** — login schema (Zod), service that runs `bcrypt.compare` against a dummy hash even when the user is missing (kills the timing oracle on top of the message oracle), POST `/auth/login` route.
7. **Tasks module** — Zod schemas (create / update / list-query with `page/pageSize` clamped 1..100), service with centralised `NOT_DELETED` predicate + serializer + atomic soft-delete `updateMany` (no TOCTOU), CRUD routes mounted under `/tasks` with `requireAuth`.
8. **Smoke test on the running server** — first `yarn p5:start` failed with a tsx 4.19.2 incompatibility on Node 25 (`node_modules/get-intrinsic/index.js:154:24` — `SyntaxError: Unexpected string`). Upgraded `tsx` to 4.21.0 (pinned, no caret). Re-ran: `/healthz` returns `{ ok: true }`, `/auth/login` returns a JWT, `/tasks` lists the seeded data. Killed the process.
9. **Integration tests** — `tests/auth.test.ts` (7 cases: login happy + wrong-pwd + unknown-email + bad-body + auth-gate × 3) and `tests/tasks.test.ts` (21 cases: POST happy/400/401, GET list with filters/pagination/invalid status/oversized pageSize, GET one happy/404/foreign-404, PATCH happy/400/foreign-404, DELETE happy/post-GET-404/post-PATCH-404/twice/foreign-404/list-excludes). Tests reset their own task rows in `beforeEach` and create a second user on the fly for cross-user isolation.

Final result: **55/55 tests pass** (P4: 27, P5: 28) in ~950ms total. `yarn typecheck` clean.

10. **README** — reviewer-first walkthrough: prerequisites → setup → API reference → curl walkthrough → tests → design notes → AC checklist (all 17 ticked).

Next: commit, push, PR #2.

---

## /hnh-review-pr self-review on PR #2

> **User:** Run /hnh-review-pr + /security-review on PR #2 now, fix findings on the same branch, then merge

**Claude:** Ran the principal-engineer review pipeline on the live PR before any merge.

### Phase 0 — context
No project-level `CLAUDE.md` (greenfield). Used `docs/plan.md` as the source of truth for "what's deliberate vs what's a bug".

### Phase 1 — metadata
`gh pr view 2 --json title,body,headRefName,…`, full diff to `/tmp/pr2.diff` (4149 lines, 28 files).

### Phase 2 — five parallel review agents
Skipped Agent A (Document Fetcher — no Jira/esa, Notion brief already in hand) and Agent D (Discussion History — fresh PR). Launched the substantive five in parallel:

| Agent | Result |
|---|---|
| **B — Build verifier** | GREEN. install/typecheck/test/smoke all clean, zero warnings. |
| **C — Architecture & correctness** | 1 CRITICAL, 3 WARNING, 6 SUGGESTION. The big ones: malformed UUID in path param crashes to 500; PATCH has a TOCTOU that DELETE got right; misleading bcrypt comment claiming "decoy" plaintext that doesn't actually verify. |
| **E — Clean code** | 0 WARNING, 5 SUGGESTION. Strongest: rename `serialise` → `toApiTask`; extract `asyncHandler` to drop 6× try/catch; mirror `updateTask` to `deleteTask`'s atomicity; flatten the `listTasks` where-builder; destructure `result.count`. |
| **F — DRY** | 3 SUGGESTION. The `asyncHandler` repetition is worth extracting; the test-file precondition probe is duplicated and should move to a helper. |
| **G — Layer compliance** | None. Route → service → prisma layering is consistent; no DB calls leak into routes, no HTTP semantics leak into services. |

### Phase 3 — verification
Ran V1 (Fact Verifier) + V2 (Logic Verifier) in parallel — re-read source independently, reproduced behavior with curl where possible.

| Finding | Original verdict | Verification |
|---|---|---|
| C1 — malformed UUID → 500 | CRITICAL | **CONFIRMED** by `curl /tasks/not-a-uuid` returning 500 with Prisma `P2023` in server log. |
| W2 — `updateTask` TOCTOU | WARNING | **CONFIRMED** by tracing SQL: two separate Prisma calls, second one filters only by id. `deleteTask` got it right; `updateTask` didn't mirror the pattern. |
| W3 — JWT trusts sub without DB lookup | WARNING | **PARTIALLY_CORRECT.** Technically true; practically unreachable — plan explicitly de-scoped register and there's no user-deletion endpoint. Downgraded to a documented design note. |
| W4 — bcrypt comment claims hash matches "decoy" | WARNING | **CONFIRMED.** `bcrypt.compare('decoy', hash)` returns `false`. Security property is unaffected (constant-time still works); only the comment is wrong. Cosmetic NIT. |
| S6 — partial indexes drift | SUGGESTION | **CONFIRMED.** Plan called for partial; Prisma DSL can't model partial; shipped unconditional. Updated plan to reflect reality. |
| S8 — empty PATCH bumps `updated_at` | SUGGESTION | **INCORRECT.** V2 ran it live: when `data` ends up `{}`, Prisma short-circuits and `updated_at` stays put. Architecture agent was wrong; finding dropped. |
| S9 — wrong-secret JWT not tested | SUGGESTION | **CONFIRMED.** AC-P5-AUTH-4 names "expired" + "different secret" — neither was tested. |
| S10 — `q` has no max length | SUGGESTION | **CONFIRMED.** No `.max()` in the schema. |
| Algorithm-confusion concern | (in checklist) | **VERIFIED SAFE.** `verifyToken` already passes `algorithms: ['HS256']`. No-op for the implementer. |

### Phase 4 — applied fixes on the same branch

| Fix | Files |
|---|---|
| **C1** UUID param validation via Zod (3 routes) | `src/problem5/src/modules/tasks/{schema,route}.ts` |
| **W1** `updateTask` mirror to `deleteTask`'s atomic `updateMany` | `src/problem5/src/modules/tasks/service.ts` |
| **S1** Cap `q` at 200 chars | `src/problem5/src/modules/tasks/schema.ts` |
| **S2** Extract `asyncHandler` helper, drop 6× try/catch from auth + tasks routes | new `src/problem5/src/lib/asyncHandler.ts`; both `route.ts` files |
| **S3** Document the no-DB-lookup tradeoff in the auth middleware | `src/problem5/src/middleware/auth.ts` |
| **S4** Add wrong-secret JWT test + expired JWT test | `src/problem5/tests/auth.test.ts` |
| **S5** Note the partial-index drift | `docs/plan.md` |
| **S6** Note the `q` `ILIKE` performance characteristic | `src/problem5/README.md` |
| **CC1** Rename `serialise` → `toApiTask` | `src/problem5/src/modules/tasks/service.ts` |
| **CC2** `const { count } = await ...` instead of `result.count` | `src/problem5/src/modules/tasks/service.ts` |
| **W4** Replace misleading "real bcrypt hash of decoy" comment | `src/problem5/src/modules/auth/service.ts` |
| **D1** Extract `tests/helpers/db.ts` (`ensureDemoUser`, `disconnect`) | new file + both test files |

Plus a new test that asserts `GET /tasks/not-a-uuid` returns 400, regression-guarding C1.

### Final result after the review-driven fixes
- **58/58 tests pass** (P4: 27, P5: 9 auth + 22 tasks). +3 cases vs pre-review.
- `yarn typecheck` clean.
- Two findings deliberately dropped: the empty-PATCH `updated_at` claim (V2 disproved it) and the JWT-no-DB-lookup item (no in-band exploit path given the plan's scope; documented instead of changed).

Next: push the fix commit, run the security agent, then merge.

---
