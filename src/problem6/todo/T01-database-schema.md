# T01 — Database schema and migrations

> Foundational ticket. Creates every Postgres table this module will touch.

| | |
|---|---|
| **Spec sections** | [§6 Data model](../README.md#6-data-model) |
| **Status** | TODO |
| **Phase** | 1 — Foundation |
| **Effort** | M (1–2 days) |
| **Dependencies** | none |
| **Owner** | TBD |

## Context

Every other ticket in this module touches `scores`, `score_events_pending`, or `score_events`. This ticket lands the schema before anything else and verifies the index plan against the queries the spec promises will be fast.

The `users` table is assumed to exist already (it's part of the broader product's auth module); this ticket only adds the FK references to it.

## Scope

**In scope**
- Migration creating `scores` table per the spec's DDL.
- Migration creating `score_events_pending` with indexes on `(user_id, created_at DESC)` and `(expires_at) WHERE consumed_at IS NULL`.
- Migration creating `score_events` with `UNIQUE (pending_id)` and indexes on `(user_id, created_at DESC)` and `(action_type, created_at DESC)`.
- All FKs and CHECK constraints exactly as specified.
- A reversible `down` migration that returns the database to its pre-migration state.
- A `psql` smoke test verifying index usage with `EXPLAIN ANALYZE` for the three hot queries.

**Out of scope**
- Modifying the existing `users` table.
- Application code that consumes these tables (T02+).
- Seed data.
- Background sweeping of expired pending rows (handled by [T08](./T08-background-jobs.md)).

## Acceptance criteria

- [ ] **AC-T01-1** — `migrate up` creates `scores`, `score_events_pending`, `score_events` matching the DDL in [§6](../README.md#postgres-schema) (column names, types, defaults, constraints).
- [ ] **AC-T01-2** — All indexes from §6 exist; verifiable with `\di` or `pg_indexes`.
- [ ] **AC-T01-3** — FK on `score_events.user_id` is `ON DELETE RESTRICT`; FK on `scores.user_id` is `ON DELETE CASCADE`. Verified by deleting a user and observing the expected behaviour.
- [ ] **AC-T01-4** — CHECK constraints are present: `scores.score >= 0`, `score_events.delta > 0`, `score_events_pending.delta > 0`. Each is verifiable by an `INSERT … VALUES (-1)` that gets rejected.
- [ ] **AC-T01-5** — `migrate down` cleanly reverses; running `up`, `down`, `up` leaves the schema identical.
- [ ] **AC-T01-6** — `EXPLAIN ANALYZE` shows index usage (not Seq Scan) for: top-10 read (`SELECT … FROM scores ORDER BY score DESC LIMIT 10`), pending sweep (`… WHERE expires_at < now() AND consumed_at IS NULL`), per-user audit (`… WHERE user_id = $1 ORDER BY created_at DESC`).

## Implementation notes

- Use whatever migration tool the broader project standardises on (Prisma, golang-migrate, alembic, etc.). Match conventions; don't introduce a new tool.
- File names should sort lexically with existing migrations: `NNNN_create_scoreboard_module.up.sql` / `.down.sql`.
- After landing, run `pg_dump --schema-only` and check the output into the repo so future readers can see the final shape without running migrations.

## Test plan

- [ ] CI: migration applies cleanly to a fresh Postgres instance.
- [ ] CI: round-trip — `up`, `down`, `up` produces the same schema both times.
- [ ] Manual: `\d scores`, `\d score_events_pending`, `\d score_events` show the expected columns and indexes.
- [ ] Manual: `EXPLAIN ANALYZE` plans for the three hot queries are reviewed and pasted into the ticket comment.

## Risks

- **Risk** — Choosing the wrong UNIQUE shape on `score_events`. **Mitigation**: spec is explicit — `(pending_id)` is unique; add the matching unit test on the application side in T04.
- **Risk** — Index bloat in `score_events_pending` if the sweeper job is delayed. **Mitigation**: T08 implements the sweep; partial-index `WHERE consumed_at IS NULL` keeps the active set small regardless.
