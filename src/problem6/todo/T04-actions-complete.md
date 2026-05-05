# T04 — POST /actions/complete endpoint (security-critical)

> The security-critical core of the entire module. Every defence in the threat model converges in this handler.

| | |
|---|---|
| **Spec sections** | [§4 Verification rules](../README.md#proof-token-shape), [§5 POST /actions/complete](../README.md#post-apiv1actionscomplete), [§8 T1–T5](../README.md#threats--mitigations) |
| **Status** | TODO |
| **Phase** | 2 — Core endpoints |
| **Effort** | L (2–3 days) |
| **Dependencies** | [T01](./T01-database-schema.md), [T02](./T02-service-scaffold.md), [T03](./T03-actions-start.md) |
| **Owner** | TBD — assign your most security-aware engineer |

## Context

This is the endpoint a malicious user will try to break. Forged tokens, replays, cross-user proofs, races — every attack class in [§8](../README.md#8-security-model) routes through this handler.

The acceptance criteria below cover **every** attack the spec promises to defeat. If a future security review finds a gap that should have been caught here, this ticket's tests are where the regression test goes.

## Scope

**In scope**
- `POST /api/v1/actions/complete` route handler.
- Zod schema over the body — `proof_token` (non-empty string).
- 5-step verification per [§4](../README.md#proof-token-shape):
  1. `verifyProof(token)` (signature + algorithms allowlist + iss + aud + typ + exp).
  2. `claim.typ === 'action_proof'` (cross-purpose token rejection).
  3. `claim.sub === req.user.id` (cross-user rejection).
  4. `Redis DEL action:nonce:<nonce>` returns `1` (replay rejection).
  5. Apply `claim.delta` server-side. **Never read delta from the request body.**
- Postgres transaction (`SERIALIZABLE` or `REPEATABLE READ`):
  - `INSERT INTO score_events (user_id, pending_id, action_type, delta, source_ip, user_agent)`.
  - `UPDATE score_events_pending SET consumed_at = now() WHERE id = pending_id`.
  - `UPDATE scores SET score = score + delta, updated_at = now() WHERE user_id = ?`.
  - On constraint violation (e.g. UNIQUE on `pending_id`), translate to `409 REPLAY_DETECTED`.
- `Redis ZINCRBY leaderboard:global delta user_id`.
- One `ZREVRANGE leaderboard:global 0 9 WITHSCORES` to compute the new top-10.
- `PUBLISH leaderboard.updates` with `{ v: 1, ts, user_id, delta_applied, new_score, top_10 }`.
- `XADD leaderboard.events MAXLEN ~ 600 * id <event payload>` (best-effort; for SSE Last-Event-ID resume in [T06](./T06-sse-hub.md)).
- Return `200 { score, rank, delta_applied }`.

**Out of scope**
- SSE fanout ([T06](./T06-sse-hub.md)) — this ticket only publishes; T06 subscribes.
- Rate limiting ([T07](./T07-rate-limiting.md)).
- Anomaly detection ([§12.2](../README.md#122-anomaly-detection-on-score-velocity), future).

## Acceptance criteria

### Happy path
- [ ] **AC-T04-1** — Valid proof from a fresh `/actions/start` returns `200` with `{ score, rank, delta_applied }`. `score` matches the user's new total; `rank` is `ZREVRANK + 1`; `delta_applied` matches `claim.delta`.
- [ ] **AC-T04-2** — After a successful complete, `score_events` has exactly one new row referencing the consumed `pending_id`. The matching `score_events_pending` row's `consumed_at` is set. The Redis nonce key is gone. The Redis ZSET reflects the increment.

### Replay
- [ ] **AC-T04-3** — Submitting the same proof twice — the second call returns `409 REPLAY_DETECTED`. The user's score is incremented exactly once.
- [ ] **AC-T04-4** — On `REPLAY_DETECTED`, no DB write happens (no second `score_events` row, no second `scores` UPDATE). The ZSET is unchanged.

### Forgery
- [ ] **AC-T04-5** — A token with `alg=none` (no signature) → `401 UNAUTHORIZED`. No DB write, no Redis change.
- [ ] **AC-T04-6** — A token with valid HS256 structure but signed with a different secret → `401 UNAUTHORIZED`.
- [ ] **AC-T04-7** — A token with `iss != 'scoreboard'`, `aud != 'scoreboard'`, or `typ != 'action_proof'` → `401 UNAUTHORIZED`. (Catches a user-auth JWT replayed as a proof.)
- [ ] **AC-T04-8** — A token with `claim.sub !== req.user.id` → `401 UNAUTHORIZED`. (Catches a stolen proof submitted by a different user.)

### Expiry
- [ ] **AC-T04-9** — A proof past its `exp` (≥ 5 minutes after `/actions/start`) → `410 PROOF_EXPIRED`. No DB write, no Redis change. Distinct from `REPLAY_DETECTED` so the client knows to retry-with-fresh-start vs give up.

### Concurrency
- [ ] **AC-T04-10** — 10 concurrent submissions of the same valid proof: exactly 1 returns `200`, 9 return `409 REPLAY_DETECTED`. Verified by a parallel-test harness; no double-credit.

### Failure modes
- [ ] **AC-T04-11** — Postgres transaction failure (e.g. UNIQUE violation, deadlock) rolls back fully. The Redis nonce is restored via a compensating `SET action:nonce:<nonce> 1 EX <remaining_ttl>` so the legitimate user can retry. Endpoint returns `503` or appropriate code.
- [ ] **AC-T04-12** — `Redis ZINCRBY` failure does **not** fail the request. Score is durable in Postgres; reconciliation ([T08](./T08-background-jobs.md)) catches up the cache. Endpoint logs a warning and emits a metric.
- [ ] **AC-T04-13** — `PUBLISH leaderboard.updates` failure does not fail the request. SSE clients see the update on next connection's snapshot or via the next successful publish.

### Data exposure
- [ ] **AC-T04-14** — The response body never contains `passwordHash`, the proof token, the JWT, the nonce, or any other secret-shaped value.

## Implementation notes

- **Order of operations** is the entire ticket:
  1. Validate body (Zod).
  2. `verifyProof(token)` — fails closed on alg / signature / exp / iss / aud / typ.
  3. Check `claim.sub === req.user.id` — fails closed.
  4. `Redis DEL action:nonce:<nonce>` — must return `1` (else 409).
  5. Begin Postgres transaction.
  6. INSERT `score_events`. (UNIQUE on `pending_id` catches an application-layer replay-bypass.)
  7. UPDATE `score_events_pending` SET `consumed_at = now()`.
  8. UPDATE `scores` SET `score = score + delta`.
  9. COMMIT.
  10. ZINCRBY (best-effort).
  11. Compute top-10 + PUBLISH (best-effort).
  12. Compute caller's rank, return 200.

  On step 4 failure → 409. On step 5–9 failure → ROLLBACK + restore nonce + return 503. On step 10–11 failure → log + metric, still return 200 (score is durable).

- The transaction isolation level should be `SERIALIZABLE` or at minimum `REPEATABLE READ`. The application must retry on `40001` (serialization failure) up to 3 times.

- `delta` always comes from `claim.delta`. Even if a malicious client sends `{ proof_token, delta: 999 }` in the body, the body's `delta` is never read.

- Don't pre-fetch the user's row in `scores` — go straight to the UPDATE. If the user has no row yet, INSERT one with `score = delta` via `INSERT … ON CONFLICT (user_id) DO UPDATE SET score = scores.score + EXCLUDED.score, updated_at = now()`.

## Test plan

- [ ] Integration (supertest + real Postgres + real Redis): every AC end-to-end.
- [ ] Concurrency test: 10 parallel submitters of the same proof; assert 1×200 + 9×409.
- [ ] Failure injection: drop the connection between Redis DEL and Postgres COMMIT — verify the compensating SET runs, score is unchanged, the nonce is back.
- [ ] Manual: trace `pg_stat_activity` during a complete call to confirm the whole sequence is one transaction.
- [ ] Property test (optional but high-value): for any valid proof, exactly one of `{200, 409, 410, 401}` is returned, and the score table is consistent in all four cases.

## Risks

- **Risk** — Race between Redis DEL and Postgres COMMIT: if DEL succeeds but the DB tx fails, the nonce is gone but no score was credited. Without a compensating SET, the user is stuck. **Mitigation**: AC-T04-11 explicitly tests the compensating SET path.
- **Risk** — UPDATE-on-empty-row: a brand-new user has no `scores` row. **Mitigation**: use `INSERT … ON CONFLICT … DO UPDATE` (UPSERT) instead of bare UPDATE.
- **Risk** — Hot-spotting on a single user (e.g. an event-driven action that fires many times). **Mitigation**: not relevant at expected scale; future improvement is shard-by-user ([§12.4](../README.md#124-sharded-leaderboards)).
- **Risk** — A `claim.delta` value larger than the per-action-type maximum slips through. **Mitigation**: T04 enforces `claim.delta ≤ ACTION_DELTAS[claim.action_type]`. If they don't match, return `401 UNAUTHORIZED` (token tampered).
