# T06 — SSE Hub: GET /scoreboard/stream

> The live-update path. Long-lived Server-Sent Events that fan leaderboard changes out to every connected client.

| | |
|---|---|
| **Spec sections** | [§7 Live-update mechanism](../README.md#7-live-update-mechanism), [§5 GET /scoreboard/stream](../README.md#get-apiv1scoreboardstream) |
| **Status** | TODO |
| **Phase** | 3 — Live updates |
| **Effort** | L (2–3 days; SSE has subtle edge cases) |
| **Dependencies** | [T05](./T05-scoreboard-read.md) (uses `ZREVRANGE` for snapshot), [T04](./T04-actions-complete.md) (provides pub/sub messages to fan out) |
| **Owner** | TBD |

## Context

The non-trivial parts of SSE aren't the protocol itself — it's a one-line content-type header — but everything around it: heartbeats to keep proxies from killing idle connections, multiplexing one Redis subscription across N client TCP connections, graceful shutdown that doesn't strand clients, and the snapshot-then-deltas pattern that makes the system self-healing on lost messages.

This ticket also defines the operational behaviour when Redis goes away: SSE returns `503` from the handshake; clients fall back to polling [T05](./T05-scoreboard-read.md).

## Scope

**In scope**
- `GET /api/v1/scoreboard/stream` route handler with HTTP/1.1 streaming response.
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-store`, `X-Accel-Buffering: no`, `Connection: keep-alive`. Disable compression on this route only.
- On connect:
  1. Read top-10 via `ZREVRANGE` (same as [T05](./T05-scoreboard-read.md)).
  2. Emit initial `event: leaderboard:snapshot` with that data.
  3. Subscribe (once per Hub instance) to Redis pub/sub `leaderboard.updates`.
  4. Multiplex pub/sub messages to every connected client on the instance.
- For each pub/sub message: emit `event: leaderboard:update` with `id: <ts.ms>`.
- Heartbeat comment line `: heartbeat <unix_ts>` every 25 seconds.
- Reconnect: respect `Last-Event-ID` header. Use the `leaderboard.events` Redis Stream to replay missed events (best-effort); if the ID is older than the Stream's window, send a fresh snapshot.
- Connection limits: 5 per IP, 10 per user (concurrency, enforced via Redis counter).
- Graceful shutdown on `SIGTERM`: close all client connections cleanly within 30 seconds.
- Per-connection cleanup: remove from subscribers list on `req.on('close')`.

**Out of scope**
- WebSocket transport ([§12.7](../README.md#127-websocket-upgrade-path), future).
- Durable pub/sub via Redis Streams ([§12.6](../README.md#126-durable-pubsub-via-redis-streams), future).

## Acceptance criteria

### Connect
- [ ] **AC-T06-1** — `GET /scoreboard/stream` with `Accept: text/event-stream` returns `200` with `Content-Type: text/event-stream`. Response is streaming (chunked, no `Content-Length`).
- [ ] **AC-T06-2** — First event emitted on connect is `leaderboard:snapshot` with the current top-10. Verifiable by reading the first event from the stream.

### Live updates
- [ ] **AC-T06-3** — When [T04](./T04-actions-complete.md) publishes a `leaderboard.updates` message, every connected client receives a `leaderboard:update` event within 1 second under normal load.
- [ ] **AC-T06-4** — Two clients connected to **different** Hub replicas both receive the update for the same publish. (Confirms pub/sub fanout works across the Hub fleet.)

### Liveness
- [ ] **AC-T06-5** — After 25 seconds of no activity, the server emits a heartbeat comment line. Client receives `: heartbeat …`.
- [ ] **AC-T06-6** — A connection idle for 5 minutes (12 heartbeats) stays open through a typical corporate proxy. Verified by running the test through a default-config nginx with `proxy_read_timeout` at the default 60 s.

### Reconnect
- [ ] **AC-T06-7** — Reconnecting with `Last-Event-ID` of an event still in `leaderboard.events` Stream (within 60 s) replays the missed events in order, then continues with live deltas.
- [ ] **AC-T06-8** — Reconnecting with a stale `Last-Event-ID` (or none) sends a fresh `leaderboard:snapshot` and continues with live deltas. No client-visible error.

### Limits
- [ ] **AC-T06-9** — 6th concurrent connection from the same IP returns `429 RATE_LIMITED` from the handshake (the connection is rejected immediately, not opened then closed).
- [ ] **AC-T06-10** — 11th concurrent connection from the same authenticated user returns `429`.

### Failure
- [ ] **AC-T06-11** — When Redis is unavailable, `/scoreboard/stream` returns `503 LIVE_UPDATES_UNAVAILABLE` from the handshake (clients fall back to polling [T05](./T05-scoreboard-read.md)).
- [ ] **AC-T06-12** — `SIGTERM` causes all SSE connections to close cleanly within 30 seconds. Clients reconnect and route to other Hub replicas via the load balancer.

## Implementation notes

- **Multiplex one Redis subscription per Hub instance.** Don't open one subscription per client — that's `O(N)` connections to Redis for `N` clients and will exhaust Redis's connection pool. One subscriber per instance, fanned out in-process.
- **Backpressure-aware writes.** If a client's TCP write buffer is full, drop the connection rather than buffer indefinitely. Most SSE libraries (e.g. Node's `res.write`) return `false` when buffered — track that and call `res.destroy()` if the buffer can't drain in 5 seconds.
- **Express has a known SSE buffering quirk**: even with `flushHeaders()`, some proxies/CDNs buffer the response. Set `X-Accel-Buffering: no` (nginx) and disable compression for this route only (`compression()` middleware should `filter` SSE out).
- **Cleanup is the bug-prone part.** Every `req.on('close')` must remove the client from the subscriber map; otherwise you have a memory leak that takes weeks to manifest. Add a metric `sse_subscriber_map_size` to make leaks visible.
- **The `leaderboard.events` Stream** uses `XADD MAXLEN ~ 600` (approximate trim, fast). 600 events at the expected publish rate of ≤ 10/sec gives ~60 seconds of replay window — plenty for typical reconnect scenarios.

## Test plan

- [ ] Integration: open `EventSource`, trigger an action, verify update arrives within 1 s.
- [ ] Integration: kill Redis, verify 503 + the polling fallback works in lockstep.
- [ ] Load test: 1000 concurrent SSE connections per Hub instance; trigger a publish; verify all 1000 receive the update.
- [ ] Manual: leave a connection open for 5 minutes; observe heartbeats and zero proxy reaping.
- [ ] Manual: SIGTERM the Hub mid-flow; verify clients reconnect to a sibling instance and resume.
- [ ] Memory leak check: open + close 10,000 connections sequentially; verify `sse_subscriber_map_size` returns to 0.

## Risks

- **Risk** — Memory leak from un-cleaned subscribers. **Mitigation**: explicit `req.on('close')` cleanup + the leak-check test.
- **Risk** — Redis pub/sub is at-most-once. A Hub mid-restart misses every message published in that window. **Mitigation**: every reconnect starts with a snapshot (AC-T06-8); for stronger guarantees, [§12.6](../README.md#126-durable-pubsub-via-redis-streams) suggests Streams.
- **Risk** — A misbehaving CDN buffers the SSE response. **Mitigation**: `X-Accel-Buffering: no` is documented; spec the deployment guide to disable buffering on this path.
- **Risk** — Slow client (mobile on a poor network) gets behind on writes; the Hub buffers indefinitely. **Mitigation**: backpressure-aware drop after 5 seconds of unflushed buffer.
