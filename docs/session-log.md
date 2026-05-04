# Interview session log — S5Tech backend code-challenge

A faithful, lightly-summarised log of every prompt I gave Claude Code in this build, with the gist of Claude's reply or what action it took. Kept verbatim where short, summarised where long. The point is to show **how** the work got done, not to relitigate it.

---

## Session start

> **User:** same, check this for me https://s5tech.notion.site/Code-Challenge-05cdb9e0d1ce432a843f763b5d5f7497 — but different repo

**Claude:** Tried `hnh-notion` skill first (per `~/.claude/rules/global-skills.md`). The integration hadn't been shared on this Notion workspace → 404. WebFetch returned only the literal word "Notion" because the page is JS-rendered. Fell back to **Claude in Chrome** — same fallback I used on the previous interview.

> **User:** we are apply for backend for this btw

**Claude:** Acknowledged. Loaded the page in Chrome, clicked the **Backend** tab in the Problems table, opened each problem's side-panel detail one at a time (hover row → click `OPEN`) and read each via `get_page_text`. Then peeked at the skeletal template at `github.com/99techteam/code-challenge` — confirmed it's essentially empty (just `src/problem1…5/.keep`). Summarised the three backend problems back to the user:

| # | Title | Time hint¹ | What it asks for |
|---|---|---|---|
| 4 | Three ways to sum to n | ≤ 2h | TS file with three different `sum_to_n(n)` impls + complexity commentary |
| 5 | A Crude Server | ≤ 16h | Express+TS CRUD (create / list-with-filters / get / update / delete), simple DB, README |
| 6 | Architecture | ≤ 8h | Spec only — README + diagram for a live top-10 scoreboard module, must prevent unauth score writes |

¹ "Time estimation is for internship roles, if you are a software professional you should spend significantly less time."

---

## Decision round 1 — scope, layout, workflow, P5 stack

**Claude asked four `AskUserQuestion`s.** User chose:

- **Scope:** "all 3 of them, each in 1 dir … 1 github commit for 1 problem"
- **Layout:** `src/problem4`, `src/problem5`, `src/problem6` (mirror skeletal repo exactly)
- **Workflow:** persistent chat log under `docs/`, `/hnh-plan` first, `/hnh-review-pr` + `/security-review` at the end, public repo, clean commits + PR description, **no Claude/AI attribution**
- **P5 stack:** free-pick a resource + Postgres in Docker + JWT auth

The user's inline note used `main.go` as the example file name. Claude flagged two conflicts before scaffolding:
1. The brief explicitly mandates **TypeScript** for both Problem 4 and Problem 5. Going Go would risk auto-disqualification.
2. Problem 6 is documentation-only — a `main.go` doesn't fit there.

## Decision round 2 — language, P6 shape, folder names

**Claude asked three follow-up questions.** User chose:

- **Language:** Stick with TypeScript as the brief mandates *(Recommended)*
- **P6 shape:** Skip Problem 6 for now, handle later
- **Folder names:** `src/problem4`, `src/problem5`, `src/problem6` (exact mirror)

## Decision round 3 — repo + commit discipline

- **Repo:** Fresh public repo `github.com/huynguyenh/code-challenge`, do not fork *(Recommended)*
- **Commits:** Per-problem feature branches → 1 squashed PR per problem into main

---

## Final scope locked

- **Problems:** 4 and 5 (P6 deferred)
- **Stack:**
  - **P4:** TypeScript file under `src/problem4/`, three `sum_to_n` implementations, Vitest unit tests, README with complexity analysis and test report
  - **P5:** Express + TypeScript under `src/problem5/`, Postgres via Docker, JWT auth, free-pick resource, Vitest integration tests, README with config + run instructions
- **Repo layout:**
  ```
  code-challenge/
  ├── docs/
  │   ├── session-log.md   # this file
  │   └── plan.md          # /hnh-plan output, committed for the reviewer
  ├── src/
  │   ├── problem4/
  │   └── problem5/
  ├── package.json         # single TS project root
  ├── tsconfig.base.json
  └── README.md
  ```
- **Branch flow:** `main` (initial scaffolding + plan) → `feat/problem4` (PR #1, squash) → `feat/problem5` (PR #2, squash) → final review/security pass on `main`.
- **No Claude/AI attribution** anywhere — commits, PR descriptions, code comments, README. Per `~/.claude/rules/global-claude.md`.

---

## Plan, scaffolding, and Problem 4

> **User:** lets go

**Claude:** Acknowledged. Walked through the principal-engineer plan workflow: read `references/plan-workflow.md`, did the Phase-1 challenge (flagged that "basic filters" needed pinning down + that JWT was user-chosen, not brief-chosen), did the Phase-2 interview via four `AskUserQuestion`s (resource = Tasks; auth = login-only against seeded user; soft delete; Prisma + prisma-migrate). Skipped the Phase-3 deep-investigation agents on purpose — fresh repo, no existing state to gather context on.

Wrote the plan to `~/.claude/plans/INTERVIEW-S5-BE/2026-05-04-99tech-backend-challenge.md`, mirrored to `docs/plan.md`. 7 ACs for Problem 4, 17 for Problem 5, 7 use cases, full risk register, full test plan.

Then scaffolded the repo: root `package.json` + `tsconfig.json` (strict) + `vitest.config.ts` + `.yarnrc.yml` (`nodeLinker: node-modules`) + `.env.example` + `.gitignore`. `yarn install` clean (~3s, 20 packages, 61 MiB). `yarn test` correctly reports "no test files yet". `yarn typecheck` clean. Committed as `chore: scaffold repo with TypeScript, Vitest, and submission docs` on `main`. Created the public GitHub repo with `gh repo create huynguyenh/code-challenge --public --source=. --push` — repo lives at https://github.com/huynguyenh/code-challenge.

### Problem 4

Branched `feat/problem4`. Wrote `sumToN.ts` with three impls: iterative loop, **tail-recursive helper**, closed-form Gauss formula. Wrote the matrix test (7 inputs × 3 impls + 6 cross-impl consistency = 27 cases). First test run failed exactly where the JSDoc said it would: V8 stack overflow at n=10_000 in the recursive variant.

Two fixes were available — cap the recursive test at smaller n (admits the impl doesn't scale) or swap to a paradigm that handles the full input range. Picked the swap: **functional `Array.from(...).reduce(...)`** as the new variant (b). Kept the spirit of "three different paradigms" (imperative / functional / mathematical) while making all three work for the AC's full range.

Updated `docs/plan.md` to record the deviation explicitly (AC-P4-4 now reads "iterative loop / functional reduce / closed-form formula" with a note about what got swapped and why). Wrote the Problem 4 README with: complexity table, paradigm-comparison rationale, deviation note, runnable commands, full 27-line test output, and AC checklist (all checked).

Final test run: 27/27 passing in ~155ms. `tsc --noEmit` clean.

Next: commit, push, open PR #1.

---
