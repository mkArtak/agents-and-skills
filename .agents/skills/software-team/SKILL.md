---
name: software-team
description: >
  Shared delivery contract for the Project Lead, Team Lead, Architect, Coder,
  and Tester agents — work-directory layout, phases, spawn rule, review format,
  and escalation. Use when those agents run a requirements-to-acceptance loop,
  or when asked to start, continue, or check software-team work under
  `.agents/work/`.
compatibility: Prompt-only. Consuming agents need a runtime that can spawn named child agents.
metadata:
  author: mkArtak
  version: "1.0"
  source-repository: mkArtak/agent-skills
  source-path: .agents/skills/software-team
---

Shared contract for the software-team agents. Role behavior lives in each agent file; this skill owns the artifacts and the loop.

## Work directory

Every piece of work uses one directory in the **consuming** project:

```text
.agents/work/<slug>/
  STATUS.md
  requirements.md
  architecture.md
  tasks.md
  validation.md
  reviews/
    architect.md
    coder-<task-id>.md
    tester.md
```

`<slug>` is kebab-case, short, and stable for the life of the work. Project Lead creates the directory and `STATUS.md`. Do not invent a second tree.

### `STATUS.md`

```markdown
# <slug>
- Phase: requirements
- Blocked-on:
- Summary:
```

`Phase` is exactly one of: `requirements`, `spec-validation`, `architecture`, `implementation`, `review`, `validation`, `complete`, `blocked`.

`Blocked-on` is empty unless `Phase` is `blocked`. Then it names who must act (`user`, `project-lead`, or an owner id).

### `requirements.md`

Project Lead writes this. Every requirement has a stable id so Tester can map results.

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

### `architecture.md`

Architect writes this. Required sections: Context, Decisions (with stack choices), Module boundaries, Data flow, Interfaces, Testing strategy, Rollout, Open questions.

### `tasks.md`

Team Lead writes this after architecture is accepted.

```markdown
# Tasks
## T1: <title>
- Owner: coder
- Files:
- Depends-on: none
- Done-when:
```

`Owner` is `coder` or `tester`. `Depends-on` is `none` or other task ids. `Files` is the intended path list; keep parallel coder tasks' file lists disjoint.

### `validation.md`

Tester writes this.

```markdown
# Validation
## R1: pass | fail | blocked
- Evidence:
- Gaps:
```

One heading per requirement id from `requirements.md`. Evidence is a command and its result, or a concrete inspection note.

## Phases

Drive in this order. Do not skip ahead.

1. `requirements` — Project Lead writes `requirements.md`.
2. `spec-validation` — Team Lead checks the spec against the codebase. Gaps → `blocked` and back to Project Lead. No architecture until the spec is confirmed.
3. `architecture` — Architect writes `architecture.md`. Team Lead reviews into `reviews/architect.md` until no open critical/major issues.
4. `implementation` — Coders (and Tester, when a task's Owner is `tester`) execute `tasks.md`.
5. `review` — Team Lead reviews each owner's diff into `reviews/<owner>.md`. Open critical/major issues return to that owner.
6. `validation` — Tester checks the result against `requirements.md`, not against the architecture story.
7. `complete` — every requirement is `pass` **and** no Team Lead review issue is open at critical/major. Team Lead sets `Phase: complete`. Project Lead tells the user.

`blocked` can replace any in-progress phase while waiting on the user. Resume the phase that was interrupted.

## Direct invocation & who spawns

All agents in the software-team catalog can be invoked:
1. **Directly by the user** as standalone agents for focused work:
   - `project-lead`: Product requirements, scope definition, and full team orchestration.
   - `team-lead`: Direct technical leadership, task breakdown, code review, and orchestrating workers without Project Lead.
   - `architect`: System design, architecture documentation, and tech stack choices directly with the user.
   - `coder`: Implementing tasks or features using TDD and SOLID directly for the user.
   - `tester`: Acceptance testing, test execution, and validation reporting directly for the user.

2. **As an orchestrated team loop** under a session agent:
   Child agents cannot spawn children. Only the **session** agent may spawn.

| Session agent | What it spawns |
| --- | --- |
| `project-lead` | `team-lead` for judgment; `architect` / `coder` / `tester` as siblings from Team Lead's next assignments |
| `team-lead` | `architect` / `coder` / `tester` directly |
| `architect` / `coder` / `tester` | standalone execution directly with the user; do not spawn |
| anything else | do not run this loop |

If an agent is running as a child in team mode, it must never spawn. Return `## Next` assignments (or a gap report) and stop.


A Team Lead child ends with:

```markdown
## Next
### Assignment
- action: spawn | resume | report-gaps | complete
- agent: team-lead | architect | coder | tester
- task-id:
- isolation: none
- resume-from:
- instruction:
```

Use one `### Assignment` block per child. `task-id` matches `T1` / `R1` where it applies. `resume-from` is the prior child id for the same owner; otherwise empty.

The session agent executes those assignments, then resumes `team-lead` with the child results and artifact paths.

## Spawn mechanics (Grok)

- Tool: `spawn_subagent`. `subagent_type` is the agent `name` (`team-lead`, `architect`, `coder`, `tester`).
- `description`: `[<role>] <short label>` so the role shows in the task list.
- Prompt is self-contained and includes the work-dir path, the relevant artifact paths, and the task.
- Independent coder tasks with **disjoint** `Files` lists: spawn in parallel, shared workspace (`isolation` omitted / `none`), `background: true`, then wait for all before review.
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
- Owner: coder-T1 | architect | tester
- Status: open | fixed | wontfix
```

Critical and major stay `open` until the owner fixes them (or `wontfix` with a technical reason Team Lead accepts). Minor may ship without blocking `complete`. Do not rewrite the owner's work; send it back.

## Escalation & user communication

- **Direct invocation**: Any agent invoked directly by the user as a session or standalone agent communicates directly with the user to clarify requirements, report findings, and iterate on work.
- **Team mode**:
  - Coder / Tester → Team Lead for scope or priority; → Architect for design.
  - Architect open questions → Team Lead (scope), never guessed product intent.
  - Team Lead spec gaps → Project Lead (or directly to user when Team Lead is the session agent).
  - When Project Lead is the session agent in the full loop, it serves as the user-facing coordinator.

