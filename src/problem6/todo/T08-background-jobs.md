# T08 — Background jobs: sweeper, reconciliation, audit retention

> Three cron-style jobs that keep the data tier healthy.

| | |
|---|---|
| **Spec sections** | [§6 Cache coherency](../README.md#cache-coherency), [§6 Forensic retention](../README.md#postgres-schema), [§12.12](../README.md#1212-score-history-retention-policy) |
| **Status** | TODO |
| **Phase** | 4 — Hardening |
| **Effort** | M (1–2 days) |
| **Dependencies** | [T01](./T01-database-schema.md) |
| **Owner** | TBD |

## Context

Three operational jobs the spec promises will run:

1. **Pending sweeper** — `score_events_pending` rows whose nonces have TTL'd in Redis without a corresponding complete. Marks them expired, deletes after 30 days for forensic retention.
2. **Reconciliation** — Detects and corrects drift between Postgres `scores` (source of truth) and Redis `leaderboard:global` (cache).
3. **Audit retention** — Rolls `score_events` rows older than 12 months into a partitioned archive table; deletes from archive at 24 months total.

All three jobs are idempotent, locked against concurrent execution, and observable via metrics.

## Scope

**In scope**
- **Job 1: pending sweeper.** Runs hourly. SQL: `UPDATE score_events_pending SET status = 'expired' WHERE expires_at < now() - interval '1 hour' AND consumed_at IS NULL` (status column is added in this ticket if not already present). After 30 days: `DELETE FROM score_events_pending WHERE expires_at < now() - interval '30 days' AND consumed_at IS NULL`.
- **Job 2: reconciliation.** Runs every 5 minutes. Walks the top 1000 by score (`SELECT user_id, score FROM scores ORDER BY score DESC LIMIT 1000`); for each, `ZADD leaderboard:global GT score user_id`. Compares the result with what was already in Redis; emits `leaderboard_drift_user_count` metric. If drift > 5 users, fires `OPS_LEADERBOARD_DRIFT`.
- **Job 3: audit archive.** Runs daily at 03:00 local. Moves `score_events` rows older than 12 months to `score_events_archive` (table with same schema, partitioned by month). Deletes from `score_events_archive` rows older than 24 months total. The "move" must preserve row count (`COUNT(*) BEFORE = COUNT(*) AFTER` across both tables).
- **Locking.** Postgres advisory locks (`SELECT pg_try_advisory_lock(<job_id_hash>)`) so multiple Hub replicas don't run the same job concurrently.
- **Observability.** Each job emits `job_run_total{name}` counter, `job_run_duration_seconds{name}` histogram, and `job_last_success_timestamp{name}` gauge.
- **Schedule.** Whatever cron mechanism the broader project uses (in-process `node-cron`, K8s CronJob, system cron). Keep it consistent.

**Out of scope**
- Initial backfill of historical data (separate ad-hoc runbook).
- Anomaly detection running as a job ([§12.2](../README.md#122-anomaly-detection-on-score-velocity), future).

## Acceptance criteria

### Pending sweeper
- [ ] **AC-T08-1** — A `score_events_pending` row with `expires_at` 2 hours in the past and `consumed_at IS NULL` gets `status = 'expired'` after the sweeper runs once.
- [ ] **AC-T08-2** — A row with `consumed_at` set is **not** modified, regardless of `expires_at`.
- [ ] **AC-T08-3** — A row 31 days old with `consumed_at IS NULL` is deleted after the sweeper runs (the 30-day forensic window).

### Reconciliation
- [ ] **AC-T08-4** — Manually introduce drift (`UPDATE scores SET score = 100 WHERE id = X` while leaving Redis at 80); reconciliation detects it and emits `leaderboard_drift_user_count >= 1`.
- [ ] **AC-T08-5** — Reconciliation corrects the drift — Redis ZSET reflects `100` for X after the job runs.
- [ ] **AC-T08-6** — Drift involving the top 10 users specifically triggers a higher-priority alert (`leaderboard_drift_top10` boolean metric).

### Audit archive
- [ ] **AC-T08-7** — A `score_events` row 13 months old is moved to `score_events_archive`. Total row count `COUNT(score_events) + COUNT(score_events_archive)` is preserved.
- [ ] **AC-T08-8** — A `score_events_archive` row 25 months old is deleted.
- [ ] **AC-T08-9** — Original `score_events` table row count drops by N when N rows are eligible for archival; archive row count rises by N.

### Locking & observability
- [ ] **AC-T08-10** — Two simultaneous invocations of any job — only one acquires the advisory lock and runs; the other exits cleanly with a `job_skipped_total{reason='already_running'}` counter increment.
- [ ] **AC-T08-11** — All three jobs emit `job_run_total`, `job_run_duration_seconds`, and `job_last_success_timestamp` metrics.
- [ ] **AC-T08-12** — A failing job (e.g. simulated by killing Postgres mid-sweep) increments `job_run_failures_total{name, error_class}` and does **not** corrupt state — the next run picks up where it left off.

## Implementation notes

- **Lock IDs** for advisory locks are 64-bit ints. Use `hashtext('scoreboard.sweeper')::bigint` and equivalent for the other two so they're stable across restarts.
- **Reconciliation pagination.** A single `LIMIT 1000` walk covers the whole top section that matters. For larger user bases (10⁶+), paginate with `WHERE score > $1 ORDER BY score DESC LIMIT 1000` and remember the last-seen score across runs.
- **Archive partitioning.** Use Postgres declarative partitioning (`PARTITION BY RANGE (created_at)`) with monthly child tables. Auto-create next-month partition in the same job to avoid a future "no partition for date X" outage.
- **Idempotency** is achieved by always making the operation conditional (`WHERE expires_at < ...`) rather than unconditional. Re-running the same job 5 minutes later is a no-op if no new data has aged in.

## Test plan

- [ ] Unit: each job's main function with seeded data covering happy + edge cases.
- [ ] Integration: end-to-end drift simulation (insert imbalance, run reconciler, verify alarm + correction).
- [ ] Integration: archive job moves correct rows, preserves count, deletes at 24-month boundary.
- [ ] Manual: kill the job mid-run; verify the advisory lock releases on connection drop and the next run completes the work.
- [ ] Manual: review job metrics in staging Grafana for 1 week; verify `job_last_success_timestamp` lags ≤ 1.5× the schedule period.

## Risks

- **Risk** — Archive job silently corrupts data on schema drift between `score_events` and `score_events_archive`. **Mitigation**: always copy → verify count → delete; never delete-then-copy. Add a CI check that the two tables have matching column lists.
- **Risk** — Reconciliation thrashes if the score-change rate exceeds the reconciliation rate. **Mitigation**: only correct discrepancies > 5 score units (debounce); a small lag is acceptable, sustained drift is not.
- **Risk** — A long-running job blocks application reads. **Mitigation**: every job is paginated; no single statement holds locks > 100ms. The reconciler's `ZADD GT` is per-user — fine-grained.
- **Risk** — Advisory lock leaks if the Postgres connection dies. **Mitigation**: advisory locks are session-scoped; a connection drop releases them automatically. Verified in the manual test.
