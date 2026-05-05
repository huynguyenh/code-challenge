# T03 — POST /actions/start endpoint

> First half of the action lifecycle. Server records the pending state and mints a single-use proof token.

| | |
|---|---|
| **Spec sections** | [§4 State machine](../README.md#state-machine), [§5 POST /actions/start](../README.md#post-apiv1actionsstart) |
| **Status** | TODO |
| **Phase** | 2 — Core endpoints |
| **Effort** | M (1–2 days) |
| **Dependencies** | [T01](./T01-database-schema.md), [T02](./T02-service-scaffold.md) |
| **Owner** | TBD |

## Context

The `/actions/start` endpoint is where the server takes ownership of the action lifecycle. Before this endpoint exists, the only way to credit a user with score is via direct DB manipulation. After this endpoint exists, the **only** legitimate path to a score increment is start → complete with a server-issued proof. This is the load-bearing inversion the spec calls out in [§4](../README.md#4-action-lifecycle--threat-model).

The endpoint is small — a body validation, a DB INSERT, a Redis SET, a JWT sign — but the **order of operations matters** because Redis and Postgres have to stay consistent across failures.

## Scope

**In scope**
- `POST /api/v1/actions/start` route handler.
- Zod schema over the body — `action_type` enum + optional `client_metadata`.
- Per-action-type `delta` lookup from a config map (`ACTION_DELTAS`); default 1.
- Generate a 32-byte cryptographic random `nonce` (Node `crypto.randomBytes(32).toString('base64url')`).
- Generate a UUID `action_id` (use `crypto.randomUUID()`).
- INSERT row into `score_events_pending` with `(user_id, action_type, delta, nonce, expires_at = now + 5 min)`.
- `SET action:nonce:<nonce> 1 EX 300 NX` in Redis. Reject `NX` failure (collision) with `500 INTERNAL_ERROR` — should never happen for a 32-byte random nonce, but the contract is "fail closed".
- Sign the proof token via `signProof()` from [T02](./T02-service-scaffold.md).
- Return `201` with `{ action_id, proof_token, expires_at, delta }`.
- Wire the user-auth middleware so unauthenticated callers get `401`.

**Out of scope**
- The complete endpoint ([T04](./T04-actions-complete.md)).
- Rate limit implementation ([T07](./T07-rate-limiting.md)) — the route is rate-limit-aware (responds with the documented headers when the future limiter caps it) but doesn't enforce yet.
- Background sweeping of expired pending rows ([T08](./T08-background-jobs.md)).
- Idempotency-Key header support (out of MVP, listed in [§12.5](../README.md#125-idempotency-keys-on-actionsstart)).

## Acceptance criteria

- [ ] **AC-T03-1** — Authenticated `POST /actions/start` with a valid body returns `201` with body shape `{ action_id, proof_token, expires_at, delta }`. `action_id` is a UUID, `proof_token` is a non-empty string, `expires_at` is an ISO-8601 timestamp ~5 minutes in the future, `delta` is a positive integer.
- [ ] **AC-T03-2** — The returned `proof_token` decodes (without verification) to a JWT whose claims match [§4 Proof token shape](../README.md#proof-token-shape): `iss=scoreboard`, `aud=scoreboard`, `typ=action_proof`, `sub=req.user.id`, `act=action_id`, `nonce=<32-byte b64url>`, `exp ≈ now + 300s`, `delta` matches the per-type config.
- [ ] **AC-T03-3** — After a successful call, `score_events_pending` has exactly one new row with the matching `(user_id, action_type, delta, nonce)`, `consumed_at IS NULL`, and `expires_at` ≈ now + 5 min.
- [ ] **AC-T03-4** — After a successful call, the Redis key `action:nonce:<nonce>` exists with TTL ≤ 300s.
- [ ] **AC-T03-5** — Body with missing or unknown `action_type` returns `400 VALIDATION_ERROR` with field-level details.
- [ ] **AC-T03-6** — Missing or invalid user-auth JWT returns `401 UNAUTHORIZED`.
- [ ] **AC-T03-7** — Redis unavailable → returns `503 LIVE_BACKEND_UNAVAILABLE`. **No orphan Postgres row**: if the Redis SET fails after the Postgres INSERT, the transaction is rolled back. (Implementation hint: do the `pending` INSERT inside a transaction that only commits if the Redis SET returns OK.)
- [ ] **AC-T03-8** — Two parallel calls for the same user produce two distinct nonces and two distinct rows. No state is shared between concurrent invocations.

## Implementation notes

- **Order of operations** that survives all failure modes:
  1. Begin Postgres transaction.
  2. INSERT into `score_events_pending`.
  3. `SET action:nonce:<nonce> 1 EX 300 NX` in Redis. If it fails or returns `nil` (collision), ROLLBACK and return `500`.
  4. COMMIT Postgres transaction.
  5. Sign proof token. (Pure function — can't fail except on bad config, which T02 catches at boot.)
  6. Respond `201`.

  If step 4 fails after step 3 succeeded, the Redis key TTLs out in 5 minutes — no permanent inconsistency.

- The per-action-type `delta` map lives in `config/actions.ts` (or equivalent). Default to `1` for unknown types. Cap the maximum at, say, `100` to bound damage from a misconfiguration ([§12.10](../README.md#1210-per-action-delta-capping)).

- Use `randomBytes(32)` for the nonce, not `randomUUID()`. UUIDs are 122 bits of entropy; 32 bytes is 256 — overkill but cheap.

## Test plan

- [ ] Integration (supertest + real Postgres + real Redis): all 8 ACs end-to-end.
- [ ] Unit: Zod schema accepts and rejects the right shapes.
- [ ] Failure injection: kill Redis between AC-T03-3's Postgres INSERT and the Redis SET — verify Postgres row is rolled back.
- [ ] Manual: `curl /actions/start` then `psql` to verify the row, `redis-cli TTL action:nonce:<nonce>` to verify the key.

## Risks

- **Risk** — A 32-byte nonce collision. **Mitigation**: probability is 2⁻²⁵⁶ over the entire history of computing; the UNIQUE constraint on `score_events_pending.nonce` and the Redis NX flag mean a collision returns 500 rather than silently sharing a nonce.
- **Risk** — The Postgres INSERT happens before the Redis SET; if the order is reversed, a Redis-only "ghost nonce" with no DB record could be issued. **Mitigation**: spec'd order is INSERT → SET → COMMIT.
- **Risk** — A user automating `start` calls without ever calling `complete` accumulates pending rows. **Mitigation**: rate limit ([T07](./T07-rate-limiting.md)) caps the rate; sweeper ([T08](./T08-background-jobs.md)) GCs old rows.
