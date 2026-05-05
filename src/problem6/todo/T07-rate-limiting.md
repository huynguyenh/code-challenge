# T07 — Rate limiting and basic abuse caps

> Per-user and per-IP caps on the action endpoints. Without these, the protocol is amplifiable into a DoS surface.

| | |
|---|---|
| **Spec sections** | [§5 Rate-limit columns](../README.md#5-api-contract), [§8 T6 + T8](../README.md#threats--mitigations) |
| **Status** | TODO |
| **Phase** | 4 — Hardening |
| **Effort** | S (½ day) |
| **Dependencies** | [T03](./T03-actions-start.md), [T04](./T04-actions-complete.md), [T05](./T05-scoreboard-read.md), [T06](./T06-sse-hub.md) |
| **Owner** | TBD |

## Context

The cryptographic protocol in [T03](./T03-actions-start.md)/[T04](./T04-actions-complete.md) defeats forgery and replay, but it doesn't prevent a legitimately-authenticated user from completing actions at machine speed. Without rate limits, even a "perfectly secure" protocol is a DoS amplifier.

This ticket adds the per-user / per-IP / per-connection caps the spec promises in the rate-limit columns of [§5](../README.md#5-api-contract), with sliding-window counters backed by Redis.

## Scope

**In scope**
- Redis-backed sliding-window counter middleware (e.g. `rate-limiter-flexible` for Node).
- Limits per the spec:
  - `/actions/start` — 60/min per user, 600/min per IP.
  - `/scoreboard` — 600/min per IP (no per-user cap; reads are cheap).
  - `/scoreboard/stream` — 5 concurrent per IP, 10 concurrent per user (concurrency, not rate).
- Standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on every response (success and failure).
- `429 RATE_LIMITED` response with the documented error shape on cap-exceed.
- Limits live in env config (not hardcoded), so staging can tune lower for load tests.
- The /stream concurrency cap is enforced at handshake — reject the 6th IP-level connection (or 11th user-level) immediately.

**Out of scope**
- ML-based anomaly detection ([§12.2](../README.md#122-anomaly-detection-on-score-velocity), future).
- WAF integration (handled at deployment tier, not application).
- Adaptive limits that tighten under load.

## Acceptance criteria

- [ ] **AC-T07-1** — A single user makes 60 calls to `/actions/start` in 60 seconds — all succeed; the 61st returns `429 RATE_LIMITED` with the documented error shape.
- [ ] **AC-T07-2** — Counter is sliding, not fixed-window. After 60 seconds elapse, the user can call again. Verified by waiting and retrying.
- [ ] **AC-T07-3** — Per-IP and per-user counters are independent. 60 distinct authenticated users behind the same IP can each hit their per-user limit, but the per-IP cap (600/min) still kicks in at the IP level.
- [ ] **AC-T07-4** — `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers are present on **every** response (200, 429, errors). Values are correct and decrement / reset on schedule.
- [ ] **AC-T07-5** — `429` response body matches the documented `{ error: { code: 'RATE_LIMITED', message, details } }` schema.
- [ ] **AC-T07-6** — `/scoreboard/stream` 6th concurrent connection from the same IP returns `429` from the handshake (no body streamed, connection closed cleanly).
- [ ] **AC-T07-7** — `/scoreboard/stream` 11th concurrent connection from the same authenticated user returns `429`.
- [ ] **AC-T07-8** — Limit values are read from env at boot; restarting the service with a different value takes effect immediately.

## Implementation notes

- Use a Redis-backed sliding-window library — implementing a correct sliding window from scratch is a footgun (token bucket vs. fixed window are simpler but worse).
- Concurrency cap on `/stream` is a different beast — track active connections in a Redis `INCR` / `DECR` pair with a TTL safety net so a crashed Hub doesn't leak permanent counters. Pattern:
  - On handshake: `INCR sse:concurrent:ip:<ip>`, set 5-minute TTL on first INCR.
  - On disconnect (`req.on('close')`): `DECR`.
  - Background sanity job (or [T08](./T08-background-jobs.md)) sweeps abandoned counters.
- Limits live in env config. Document the defaults in `.env.example`. Staging tunes lower for chaos tests.

## Test plan

- [ ] Integration: 60-then-1 burst test on `/actions/start`.
- [ ] Integration: 65-call burst from one IP across 65 users (per-IP cap kicks in before per-user).
- [ ] Integration: open 6 concurrent `EventSource` connections, verify 6th is 429.
- [ ] Manual: kill a Hub mid-connection, observe the leaked counter, wait for TTL expiry.
- [ ] Soak: run the suite under load for 30 minutes; verify counters never go negative or get stuck.

## Risks

- **Risk** — A misconfigured limit (e.g. `60/sec` instead of `60/min`) breaks legitimate clients silently. **Mitigation**: limits live in env config; staging has alarm thresholds well below production caps so misconfigurations get noticed.
- **Risk** — Redis cluster failover causes counter drift. **Mitigation**: limits are advisory + per-shard; brief drift on failover is acceptable.
- **Risk** — The /stream concurrency counter leaks on Hub crash. **Mitigation**: TTL safety net + background sweep ([T08](./T08-background-jobs.md)).
