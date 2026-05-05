# 99Tech Code Challenge — backend submission

This repo contains my answers to the **backend** track of the [99Tech Code Challenge](https://s5tech.notion.site/Code-Challenge-05cdb9e0d1ce432a843f763b5d5f7497).

| # | Problem | Status | Folder |
|---|---|---|---|
| 4 | Three ways to sum to n | ✅ done | [`src/problem4`](./src/problem4) |
| 5 | A Crude Server | ✅ done | [`src/problem5`](./src/problem5) |
| 6 | Architecture | ✅ done | [`src/problem6`](./src/problem6) |

> Each problem is implemented on its own feature branch and merged via a squashed PR — see the [Pull Requests tab](../../pulls?q=is%3Apr) for the per-problem story.

## Submission materials

All artefacts that demonstrate **how** I built this live in [`docs/`](./docs):

- [`docs/plan.md`](./docs/plan.md) — principal-engineer plan with ACs, use cases, risk table, testing strategy. Generated up-front, before any code.
- [`docs/session-log.md`](./docs/session-log.md) — the persistent chat log between me and Claude Code for this session. Every prompt I gave, every decision the model made.
- README files inside each problem folder cover that problem's specific design, complexity analysis, and how to run its tests.

## Tech stack

- **Language:** TypeScript (Node 20)
- **Test runner:** Vitest
- **Problem 4:** pure TS, no runtime deps
- **Problem 5:** Express + Prisma + Postgres (Docker), JWT auth, Zod validation
- **Problem 6:** specification only — Markdown + embedded Mermaid diagrams (no code)

## Local prerequisites

- Node 20+
- Yarn 4 (`corepack enable`)
- Docker (for Problem 5's Postgres)

## Running tests

```bash
yarn install
yarn test            # all problems
yarn test problem4   # just Problem 4
yarn test problem5   # just Problem 5
```

Problem 5 has additional setup steps in [its own README](./src/problem5/README.md).
