# T02 — Service scaffold: config, env validation, JWT util, error handling

> Lays the rails the rest of the service rides on.

| | |
|---|---|
| **Spec sections** | [§4 Proof token shape](../README.md#proof-token-shape), [§8 T1 + T15](../README.md#threats--mitigations), [§5 Error shape](../README.md#5-api-contract) |
| **Status** | TODO |
| **Phase** | 1 — Foundation |
| **Effort** | M (1 day) |
| **Dependencies** | [T01](./T01-database-schema.md) (Prisma client expects schema to exist) |
| **Owner** | TBD |

## Context

Before any endpoint can be implemented, the service needs four primitives:

1. **Boot-time env validation** — refuses to start on a weak `JWT_SECRET` or missing `DATABASE_URL` / `REDIS_URL`. Surfaces config bugs immediately.
2. **JWT proof utility** — `signProof(claims)` and `verifyProof(token)` with `algorithms: ['HS256']` allowlist, issuer / audience / typ checks, 5-minute expiry.
3. **Uniform error shape** — `AppError` class + central error handler so every endpoint returns the documented `{ error: { code, message, details? } }`.
4. **Prisma client singleton** — HMR-safe in dev so hot reloads don't exhaust the connection pool.

These are the `lib/*` files in the spec's recommended tech stack, plus the `createApp()` factory and middleware.

## Scope

**In scope**
- `lib/env.ts` — Zod schema over `process.env`. Refuses to boot if `JWT_SECRET` < 32 chars, `DATABASE_URL` is missing, or `REDIS_URL` is missing.
- `lib/jwt.ts` — `signProof()` returns a JWT with `iss=scoreboard`, `aud=scoreboard`, `typ=action_proof`, `alg=HS256`, `exp = now + 5 minutes`. `verifyProof()` enforces the allowlist + iss/aud/typ.
- `lib/errors.ts` — `AppError` class with codes `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `VALIDATION_ERROR`, `NOT_FOUND`, `REPLAY_DETECTED`, `PROOF_EXPIRED`, `RATE_LIMITED`, `LIVE_BACKEND_UNAVAILABLE`, `LIVE_UPDATES_UNAVAILABLE`, `INTERNAL_ERROR`.
- `lib/prisma.ts` — Prisma client singleton.
- `lib/redis.ts` — ioredis (or equivalent) singleton with health check.
- `app.ts` — `createApp()` factory wiring helmet, body parser, error handler, 404 handler.
- `middleware/errorHandler.ts` — serialises `AppError` and Zod errors; collapses unknown errors to `500 INTERNAL_ERROR` without leaking the stack in production.
- `middleware/requireUserAuth.ts` — Bearer-JWT middleware against the **user-auth** secret (separate concern from proof tokens — this gates the action endpoints behind logged-in users).
- Unit tests for the four library modules.

**Out of scope**
- Action endpoints (T03 / T04).
- Rate limiting (T07).
- Metrics / logging plumbing (T09).

## Acceptance criteria

- [ ] **AC-T02-1** — Service refuses to boot when any of `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` is missing, or when `JWT_SECRET` < 32 chars. Exit code is non-zero. Error message points at the offending env var.
- [ ] **AC-T02-2** — `signProof({ sub, act, nonce, delta })` returns a JWT decoding (without verification) to claims: `iss=scoreboard`, `aud=scoreboard`, `typ=action_proof`, `alg=HS256`, `exp − iat = 300`.
- [ ] **AC-T02-3** — `verifyProof(token)` accepts a valid token and returns the parsed claims; throws `AppError(401, UNAUTHORIZED)` on invalid signature, wrong algorithm, expired, wrong issuer, wrong audience, or wrong typ.
- [ ] **AC-T02-4** — `verifyProof` rejects a token with `alg=none` even though the signature is empty. Rejects a token signed with HS256 but with `algorithms: ['HS256']` swapped to `['RS256']` to prove the allowlist is enforced.
- [ ] **AC-T02-5** — `errorHandler` serialises `AppError` to `{ error: { code, message, details? } }` with the right HTTP status; serialises `ZodError` to `400 VALIDATION_ERROR` with field-level details; collapses other errors to `500 INTERNAL_ERROR`. No stack trace leaks in `NODE_ENV=production`.
- [ ] **AC-T02-6** — Unit tests cover the signProof+verifyProof roundtrip, the 5 verifyProof failure paths, the 3 errorHandler serialisation paths, and the 4 env-validation refusal cases.

## Implementation notes

- Reuse the existing user-auth `JWT_SECRET` for proof tokens. The different `iss`/`aud`/`typ` keep the two token populations semantically separate so a user-auth JWT can't be replayed as a proof.
- The Zod schema for env should produce a typed `Env` object so callers don't `process.env.X!`-cast.
- `AppError` should be a single class, not a hierarchy. Codes are values, not types.

## Test plan

- [ ] Unit: `signProof` / `verifyProof` roundtrip — issue, parse, verify.
- [ ] Unit: each of the 5 verify-failure paths produces the expected `AppError`.
- [ ] Unit: env validation produces refusals for each missing/weak case.
- [ ] Manual: `JWT_SECRET=short node dist/server.js` exits 1 with a clear message.

## Risks

- **Risk** — Misconfiguring `algorithms: 'HS256'` (a string) instead of `['HS256']` (an array) silently allows alg-confusion. **Mitigation**: explicit unit test that an `alg=none` token is rejected.
- **Risk** — Reusing the user-auth secret for proof tokens means rotating the secret invalidates both populations simultaneously. **Mitigation**: documented as intentional; a `kid`-based migration path is planned in [§12.9](../README.md#129-token-rotation-drill).
