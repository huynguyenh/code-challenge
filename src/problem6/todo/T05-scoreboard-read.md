# T05 — GET /scoreboard endpoint

> The HTTP read path. Returns the current top-10; cacheable at the CDN.

| | |
|---|---|
| **Spec sections** | [§5 GET /scoreboard](../README.md#get-apiv1scoreboard), [§6 Redis ZSET](../README.md#redis-keys) |
| **Status** | TODO |
| **Phase** | 2 — Core endpoints |
| **Effort** | S (½ day) |
| **Dependencies** | [T01](./T01-database-schema.md), [T02](./T02-service-scaffold.md) |
| **Owner** | TBD |

## Context

A read-only endpoint that returns the current top-10 leaderboard plus, optionally, the caller's own rank/score. This is the **fallback** path for clients that don't use SSE; it's also a perfectly fine primary path for servers that don't need sub-second freshness.

The endpoint is small but has two interesting behaviours: (a) **Redis-fallback** — if Redis is down, fall back to Postgres directly so the leaderboard never returns 503; (b) **CDN-cacheable** — 1 second of staleness is invisible to humans and saves the Redis instance a non-trivial fraction of read traffic.

## Scope

**In scope**
- `GET /api/v1/scoreboard` route handler.
- Optional auth — if a user-auth JWT is present and valid, attach `req.user`. If absent or invalid, treat as unauthenticated (don't 401).
- Read top-10 via `ZREVRANGE leaderboard:global 0 9 WITHSCORES`.
- Resolve `user_id → username` via a single `SELECT id, username FROM users WHERE id = ANY($1)`. **No N+1**.
- If authenticated:
  - Caller's rank: `ZREVRANK leaderboard:global <user_id>` (1-based — add 1).
  - Caller's score: from the same `users` JOIN or a separate `SELECT score FROM scores WHERE user_id = $1`.
- Add `Cache-Control: public, max-age=1` header.
- Fallback: if any Redis call fails, fall back to `SELECT u.id, u.username, s.score FROM scores s JOIN users u ON s.user_id = u.id ORDER BY s.score DESC LIMIT 10`. Slower but identical response shape.

**Out of scope**
- Live updates ([T06](./T06-sse-hub.md)).
- Per-leaderboard variants — friends-only, regional, time-windowed (out of MVP, [§12.3](../README.md#123-multi-leaderboard-support)).
- Tie-breaking (an open question in [§13](../README.md#13-open-questions); use Redis's natural ordering for now).

## Acceptance criteria

- [ ] **AC-T05-1** — `GET /scoreboard` returns `200` with body `{ leaderboard: [...up to 10 entries...], fetched_at: ISO_8601 }`. Each entry has `{ rank, user_id, username, score }`.
- [ ] **AC-T05-2** — When called with a valid user-auth JWT, the response also includes `your_rank` (number ≥ 1) and `your_score` (number ≥ 0).
- [ ] **AC-T05-3** — When called without a JWT, `your_rank` and `your_score` are **absent** from the response (not `null`).
- [ ] **AC-T05-4** — When Redis is unavailable, the endpoint falls back to Postgres-direct read. Response shape is identical; latency is higher (≤ 50 ms vs ≤ 5 ms typically). The endpoint **still returns 200**, not 503.
- [ ] **AC-T05-5** — Response includes header `Cache-Control: public, max-age=1`.
- [ ] **AC-T05-6** — When the leaderboard is empty (fresh DB, no scores), response is `{ leaderboard: [], fetched_at }`. For an authenticated caller with no `scores` row yet, `your_rank` is omitted (not `null`) and `your_score` is `0`.
- [ ] **AC-T05-7** — Response **never** contains a user's `email`, `password_hash`, or any other auth-table column. Only `id`, `username`, `score`.

## Implementation notes

- One Redis round-trip; one Postgres round-trip. Don't call `SELECT … WHERE id = $1` ten times — use `WHERE id = ANY($1)` with the array of 10 IDs.
- The 1-second cache header is cheap and reduces fan-out for popular leaderboards. Don't cache for longer — staleness should be invisible, not noticeable.
- For the "your_rank when not in top-10" case, `ZREVRANK` is `O(log N)` — fine at any scale.
- Tie-breaking: Redis sorts by score ascending then by member lexicographically; reverse-range gives top by score. Equal-score users are ordered by user_id lexically. That's good enough for v1.

## Test plan

- [ ] Integration: all 7 ACs covered with seeded data.
- [ ] Manual: kill Redis, hit `/scoreboard`, verify 200 + slightly slower.
- [ ] Manual: hit `/scoreboard` without auth, then with auth — diff the two response shapes.
- [ ] Performance: baseline latency on warm cache (target p99 ≤ 5 ms).

## Risks

- **Risk** — Username resolution races with a rename. **Mitigation**: snapshot at read time; staleness < 1 second is invisible. If the product wants stronger guarantees, denormalise username into the `scores` table.
- **Risk** — Falling back to Postgres under sustained Redis outage could overload Postgres. **Mitigation**: the fallback path is rate-limit-aware via [T07](./T07-rate-limiting.md); operationally, the `OPS_REDIS_DOWN` alert should already be firing.
