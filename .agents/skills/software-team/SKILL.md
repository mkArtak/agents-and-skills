---
name: software-team
description: >
  Shared delivery contract for the Project Lead, Team Lead, Architect, Coder,
  Frontend Engineer, and Tester agents — work-directory layout, phases,
  spawn rule, review format, and escalation. Use when those agents run a
  requirements-to-acceptance loop, or when asked to start, continue, or check
  software-team work under `.agents/work/`.
compatibility: Prompt-only. Consuming agents need a runtime that can spawn named child agents.
metadata:
  author: mkArtak
  version: "1.0"
  source-repository: mkArtak/agent-skills
  source-path: .agents/skills/software-team
---

Shared contract for the software-team agents. Role behavior lives in each agent file; this skill owns the artifacts and the loop.

## Work directory

Every piece of work uses one directory in the **consuming** project, partitioned into domain folders with a 300-line ceiling per file:

```text
.agents/work/<slug>/
  STATUS.md
  req/
    requirements.md
    req.<area>.md
  spec/
    specification.md
    spec.<area>.md
  arch/
    architecture.md
    arch.<subsystem>.md
  tasks/
    tasks.md
    tasks.<area>.md
  reviews/
    reviews.md
    review.<owner>-<id>.md
  validation/
    validation.md
    val.<area>.md
```

`<slug>` is kebab-case, short, and stable for the life of the work. Project Lead creates the work directory, `STATUS.md`, and initial `req/` and `spec/` files. Do not invent a second tree.

### Document sizing rule (300-line ceiling)

No single Markdown file may exceed 300 lines. When an area or topic grows, split it into modular files (`<folder>.<area>.md`) and keep the root file (`<folder>.md` or folder index) as a compact Table of Contents and routing index. Agents load only the specific topic files needed for their assigned task to keep context windows focused and efficient.

### `STATUS.md`

```markdown
# <slug>
- Phase: requirements
- Blocked-on:
- Summary:
```

`Phase` is exactly one of: `requirements`, `specification`, `spec-validation`, `architecture`, `implementation`, `review`, `validation`, `complete`, `blocked`.

`Blocked-on` is empty unless `Phase` is `blocked`. Then it names who must act (`user`, `project-lead`, or an owner id).

### `req/` — Requirements (Project Lead)

Project Lead writes `req/requirements.md` as the root index capturing user problem space, actors, constraints, and non-goals. Every requirement has a stable id (`R1`, `R2`, ...) so specification, tasks, and validation can map to it. Area-specific requirement details live in `req.<area>.md` (e.g. `req.auth.md`).

```markdown
# <title>
## Summary
## Actors
## Requirements
### R1: <short name>
- Statement:
- Acceptance:
## Constraints
## Out of scope
## Non-goals
```

### `spec/` — Solution Specification (Project Lead)

Project Lead translates requirements into `spec/specification.md` (and `spec.<area>.md`), defining the concrete functional solution to be built (user workflows, domain models, screen/API expectations, error behavior, edge cases). Project Lead verifies this solution spec with the user before technical hand-off to Team Lead.

```markdown
# Solution Specification: <title>
## Overview
## User Workflows & Interactions
## System Behaviors & Business Rules
## Data Models & Entity Schemas
## Interface & API Expectations
## Requirement Mapping (R1..Rn -> Spec Sections)
```

### `arch/` — Architecture (Architect)

Architect writes `arch/architecture.md` (and `arch.<subsystem>.md` when subsystem depth exceeds 300 lines). Required sections: Context, Decisions (with stack choices), Module boundaries, Data flow, Interfaces, Testing strategy, Rollout, Open questions.

### `tasks/` — Tasks (Team Lead)

Team Lead writes `tasks/tasks.md` (and `tasks.<area>.md`) after architecture is accepted.

```markdown
# Tasks
## T1: <title>
- Owner: coder | frontend-engineer | tester
- Files:
- Depends-on: none
- Done-when:
```

`Owner` is `coder`, `frontend-engineer`, or `tester`. `Depends-on` is `none` or other task ids. `Files` is the intended path list; keep parallel coder and frontend-engineer tasks' file lists disjoint.

### `reviews/` — Reviews (Team Lead)

Team Lead maintains `reviews/reviews.md` as an open/fixed issue tracker and writes review notes into `reviews/review.<owner>-<id>.md` (e.g. `review.coder-T1.md`, `review.arch.md`).

### `validation/` — Validation (Tester)

Tester writes `validation/validation.md` as the compliance matrix against `req/` requirements, with detailed test evidence and inspection notes in `val.<area>.md`.

```markdown
# Validation
## R1: pass | fail | blocked
- Evidence:
- Gaps:
```

One heading per requirement id from `req/requirements.md`. Evidence is a command and its result, or a concrete inspection note.

## Phases

Drive in this order. Do not skip ahead.

1. `requirements` — Project Lead interviews user and writes `req/requirements.md` (and `req.<area>.md`).
2. `specification` — Project Lead translates requirements into functional solution design in `spec/specification.md` (and `spec.<area>.md`), confirmed with user.
3. `spec-validation` — Team Lead checks the spec against the codebase for feasibility and gaps. Gaps → `blocked` and back to Project Lead. No architecture until the spec is confirmed.
4. `architecture` — Architect writes `arch/architecture.md` (and `arch.<subsystem>.md`). Team Lead reviews into `reviews/` until no open critical/major issues.
5. `implementation` — Team Lead writes `tasks/tasks.md`. Coders and Frontend Engineers (and Tester, when a task's Owner is `tester`) execute tasks.
6. `review` — Team Lead reviews each owner's diff into `reviews/`. Open critical/major issues return to that owner.
7. `validation` — Tester checks the result against `req/requirements.md` and `spec/`, recording evidence in `validation/`.
8. `complete` — every requirement is `pass` **and** no Team Lead review issue is open at critical/major. Team Lead sets `Phase: complete`. Project Lead tells the user.

`blocked` can replace any in-progress phase while waiting on the user. Resume the phase that was interrupted.

## Direct invocation & who spawns

All agents in the software-team catalog can be invoked:
1. **Directly by the user** as standalone agents for focused work:
   - `project-lead`: Product requirements, scope definition, and full team orchestration.
   - `team-lead`: Direct technical leadership, task breakdown, code review, and orchestrating workers without Project Lead.
   - `architect`: System design, architecture documentation, and tech stack choices directly with the user.
   - `coder`: Implementing tasks or features using TDD and SOLID directly for the user.
   - `frontend-engineer`: UI/UX implementation, component architecture, styling, and accessibility directly with the user.
   - `tester`: Acceptance testing, test execution, and validation reporting directly for the user.

2. **As an orchestrated team loop** under a session agent:
   Child agents cannot spawn children. Only the **session** agent may spawn.

| Session agent | What it spawns |
| --- | --- |
| `project-lead` | `team-lead` for judgment; `architect` / `coder` / `frontend-engineer` / `tester` as siblings from Team Lead's next assignments |
| `team-lead` | `architect` / `coder` / `frontend-engineer` / `tester` directly |
| `architect` / `coder` / `frontend-engineer` / `tester` | standalone execution directly with the user; do not spawn |
| anything else | do not run this loop |

If an agent is running as a child in team mode, it must never spawn. Return `## Next` assignments (or a gap report) and stop.


A Team Lead child ends with:

```markdown
## Next
### Assignment
- action: spawn | resume | report-gaps | complete
- agent: team-lead | architect | coder | frontend-engineer | tester
- task-id:
- isolation: none
- resume-from:
- instruction:
```

Use one `### Assignment` block per child. `task-id` matches `T1` / `R1` where it applies. `resume-from` is the prior child id for the same owner; otherwise empty.

The session agent executes those assignments, then resumes `team-lead` with the child results and artifact paths.

## Spawn mechanics (Grok)

- Tool: `spawn_subagent`. `subagent_type` is the agent `name` (`team-lead`, `architect`, `coder`, `frontend-engineer`, `tester`).
- `description`: `[<role>] <short label>` so the role shows in the task list.
- Prompt is self-contained and includes the work-dir path, the relevant artifact paths, and the task.
- Independent coder and frontend-engineer tasks with **disjoint** `Files` lists: spawn in parallel, shared workspace (`isolation` omitted / `none`), `background: true`, then wait for all before review.
- Overlapping `Files`, or a runtime that cannot isolate: run sequentially in the shared workspace.
- Optional: `isolation: worktree` when overlapping work must run in parallel. Merge each worktree into the session workspace after that owner passes review, before Tester or a dependent task runs.
- Fix cycles: `resume_from` the same owner's previous child id. Same `subagent_type`.

## Review notes

Team Lead writes one file per owner under `reviews/`.

```markdown
### Issue N — Severity: critical | major | minor
- File: path:line
- Description:
- Suggestion:
- Owner: coder-T1 | frontend-engineer-T1 | architect | tester
- Status: open | fixed | wontfix
```

Critical and major stay `open` until the owner fixes them (or `wontfix` with a technical reason Team Lead accepts). Minor may ship without blocking `complete`. Do not rewrite the owner's work; send it back.

## Escalation & user communication

- **Direct invocation**: Any agent invoked directly by the user as a session or standalone agent communicates directly with the user to clarify requirements, report findings, and iterate on work.
- **Team mode**:
  - Coder / Frontend Engineer / Tester → Team Lead for scope or priority; → Architect for design.
  - Architect open questions → Team Lead (scope), never guessed product intent.
  - Team Lead spec gaps → Project Lead (or directly to user when Team Lead is the session agent).
  - When Project Lead is the session agent in the full loop, it serves as the user-facing coordinator.

