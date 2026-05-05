# T09 — Observability: metrics, alerts, dashboards, audit log policy

> Make the module operable. Without metrics + alerts, the team won't know if the system is healthy, abused, or drifting until users complain.

| | |
|---|---|
| **Spec sections** | [§10 Operational concerns](../README.md#10-operational-concerns), [§8 T12 + T14](../README.md#threats--mitigations) |
| **Status** | TODO |
| **Phase** | 4 — Hardening |
| **Effort** | M (1–2 days) |
| **Dependencies** | [T03](./T03-actions-start.md), [T04](./T04-actions-complete.md), [T05](./T05-scoreboard-read.md), [T06](./T06-sse-hub.md), [T07](./T07-rate-limiting.md), [T08](./T08-background-jobs.md) |
| **Owner** | TBD |

## Context

This ticket closes the gap between "the code works" and "the system is operable". Three deliverables:

1. **Instrumentation** of every metric the spec lists in [§10](../README.md#metrics).
2. **Alerts** wired to the on-call channel for the conditions in [§10 Alerts (paged)](../README.md#alerts-paged).
3. **Audit log policy** at the database layer — Postgres role grants that prevent application code from tampering with `score_events` even if the application is compromised.

Plus the Grafana dashboard a SOC analyst can leave open, and the runbooks an on-call engineer reads at 2 AM.

## Scope

**In scope**
- Instrument all 10 metrics from [§10 Metrics](../README.md#metrics) with the listed labels (Prometheus or whatever the project's standard is).
- Wire all 6 paged alerts from [§10 Alerts](../README.md#alerts-paged): `OPS_LEADERBOARD_DRIFT`, `OPS_AUTH_REPLAY_SPIKE`, `OPS_SSE_DISCONNECT_STORM`, `OPS_CLOCK_SKEW`, `OPS_PUBSUB_DEGRADED`, `OPS_REDIS_DOWN` / `OPS_POSTGRES_DOWN`.
- Build the 3-row Grafana dashboard from [§10 Dashboard sketch](../README.md#dashboard-sketch).
- Postgres role grants:
  - **Application role** (`scoreboard_app`) — `SELECT`, `INSERT` on `score_events`. **No `UPDATE`, no `DELETE`.**
  - **Admin tool role** (`scoreboard_admin_tool`) — same as application + only able to INSERT rows where `action_type = 'admin_adjust'` (enforced via row-level security or a CHECK in a wrapper view).
  - **DBA role** — full access (used for incident response only; SSO-gated).
- Structured logging on action lifecycle events with the documented sample/oversample policy from [§10 Logging](../README.md#logging).
- Runbook entries:
  - `runbooks/scoreboard-rebuild.md` — full leaderboard rebuild from `score_events`.
  - `runbooks/scoreboard-replay-spike.md` — investigation steps when `OPS_AUTH_REPLAY_SPIKE` fires.
  - `runbooks/scoreboard-drift.md` — investigation steps when `OPS_LEADERBOARD_DRIFT` fires.

**Out of scope**
- Anomaly detection / ML pipeline ([§12.2](../README.md#122-anomaly-detection-on-score-velocity), future).
- Multi-region observability federation.
- Custom downstream metrics consumers (e.g. publishing to a data warehouse).

## Acceptance criteria

### Metrics
- [ ] **AC-T09-1** — All 10 metrics from [§10 Metrics](../README.md#metrics) emit during normal operation. Verifiable via the service's `/metrics` endpoint and a Prometheus scrape that succeeds.
- [ ] **AC-T09-2** — Each metric has the labels listed in the spec table (e.g. `actions_completed_failures_total{reason}` includes the four reason values: `replay`, `expired`, `invalid_signature`, `cross_user`).
- [ ] **AC-T09-3** — Histogram metrics (`score_increment_latency_seconds`, `scoreboard_query_latency_seconds`) have buckets that span the alert thresholds (`200ms` for the former, `100ms` for the latter).

### Alerts
- [ ] **AC-T09-4** — Triggering each of the 6 alert conditions in staging causes the alert to fire (paged via the on-call channel) and clear when the condition resolves.
- [ ] **AC-T09-5** — Alert payloads include the runbook URL and a link to the relevant Grafana panel.
- [ ] **AC-T09-6** — Alerts are not flapping — a 1-minute condition that just barely breaches the threshold doesn't page repeatedly. Verified by a 30-minute soak test in staging at threshold ± 5%.

### Dashboard
- [ ] **AC-T09-7** — Grafana dashboard renders without errors and shows live data within 30 seconds of opening.
- [ ] **AC-T09-8** — All 3 rows from [§10 Dashboard sketch](../README.md#dashboard-sketch) populated: Health (rate / latency / error rate), Live (SSE connections / pub/sub success / drift), Abuse (replay rate / top-N velocity / recent alerts).

### DB grants
- [ ] **AC-T09-9** — Connecting as `scoreboard_app` and attempting `UPDATE score_events SET delta = 999 WHERE …` is denied at the DB layer with `permission denied`. Same for `DELETE`.
- [ ] **AC-T09-10** — `scoreboard_app` can `INSERT` and `SELECT` normally — proves the policy isn't over-broad.
- [ ] **AC-T09-11** — A score adjustment via the admin tool emits a `score_events` row with `action_type = 'admin_adjust'`; the row is visible in audit queries.

### Logging
- [ ] **AC-T09-12** — One structured log line per consumed action, with `(user_id, action_id, delta, source_ip, request_id)`. Verified by triggering 100 actions and inspecting log output.
- [ ] **AC-T09-13** — Failed action completions log at `warn` level with the reason code (`replay`, `expired`, `invalid_signature`, `cross_user`).
- [ ] **AC-T09-14** — **No raw JWT** appears in any log line. Verified by grepping a synthetic 1000-action run for `eyJ` (the JWT base64 prefix). Result must be 0 matches.

### Runbooks
- [ ] **AC-T09-15** — Three runbook files exist at `runbooks/scoreboard-{rebuild,replay-spike,drift}.md` with copy-pasteable commands. Each is < 200 lines, follows the project's runbook template, and links back to the spec section it relates to.

## Implementation notes

- Reuse the project's existing metrics library and Prometheus config. Don't introduce new tooling for this module.
- DB grants are sometimes re-applied by migrations. Pin them in a separate `grants.sql` that runs after every migration so a new table-creation doesn't accidentally grant `UPDATE` to the application role.
- Sampling for the action-lifecycle log: 100% for the first 90 days, then 1% with sliding-scale velocity-based oversampling. Configure this declaratively (env var or config file) so it can be changed without a deploy.
- The `OPS_AUTH_REPLAY_SPIKE` threshold ("baseline × 10") needs a baseline. Bootstrap by hand-coding a multiplier of 5 for the first month, then auto-tune from observed traffic.

## Test plan

- [ ] Integration: synthetic alert-trigger script for each of the 6 alerts. Each verifies the alert fires and clears.
- [ ] Manual: try `UPDATE score_events SET delta = 999` as the application role — fails with `permission denied`.
- [ ] Manual: review the dashboard in staging — all panels populated, no `No data` errors.
- [ ] CI: a `grep eyJ` over a synthetic-action-run log file returns 0 matches.
- [ ] Manual: read each runbook end-to-end, follow the steps in staging, verify they work.

## Risks

- **Risk** — Alert fatigue from poorly-tuned thresholds. **Mitigation**: tune in staging for 1 week before paging on-call; iterate based on signal-to-noise.
- **Risk** — A migration accidentally re-grants `UPDATE` to the application role. **Mitigation**: `grants.sql` runs after every migration in CI; a missing grant produces a CI failure.
- **Risk** — Logging too much PII (esp. `source_ip`, `user_agent`). **Mitigation**: align retention with [§13 PII boundary](../README.md#13-open-questions) before going live; have legal sign-off.
- **Risk** — Dashboard becomes stale as the system evolves. **Mitigation**: dashboard is checked into the repo as JSON (Grafana dashboards-as-code); changes to metrics require a matching dashboard update in the same PR.
