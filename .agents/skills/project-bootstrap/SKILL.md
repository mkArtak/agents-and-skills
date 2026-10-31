---
name: project-bootstrap
description: >
  Manage user-level portfolio registry of active projects and bootstrap new
  project repositories with full multi-harness agent scaffolding. Use when
  querying active projects, registering repositories, bootstrapping new
  projects, or delegating project-scoped initiatives.
compatibility: Node.js >= 18, git CLI optional for repository initialization.
metadata:
  author: mkArtak
  version: "1.0"
  source-repository: mkArtak/agent-skills
  source-path: .agents/skills/project-bootstrap
---

# project-bootstrap

Skill for maintaining a user-level portfolio registry across projects and bootstrapping new project repositories with the standard cross-harness agent team layout.

## Portfolio Registry

The registry is stored at `~/.memory/assistant/projects.json` (user home directory), persisting active projects across sessions:

```json
{
  "version": "1.0",
  "projects": [
    {
      "name": "payment-service",
      "path": "C:/Users/artak/src/payment-service",
      "description": "Stripe & PayPal billing service",
      "stack": "Node.js / Express / TypeScript",
      "status": "active",
      "createdAt": "2026-10-30T12:00:00.000Z",
      "lastActive": "2026-10-30T17:00:00.000Z"
    }
  ]
}
```

### CLI Commands

Run commands via `node scripts/portfolio.js`:

- **List registered projects**:
  ```bash
  node scripts/portfolio.js list [--json]
  ```
- **Get project details**:
  ```bash
  node scripts/portfolio.js get <project-name> [--json]
  ```
- **Register / update an existing project**:
  ```bash
  node scripts/portfolio.js add --name <name> --path <target-path> --description "<desc>" --stack "<stack>"
  node scripts/portfolio.js update <name> --status active|paused|archived
  ```
- **Remove a project from the registry**:
  ```bash
  node scripts/portfolio.js remove <name>
  ```

## Bootstrapping New Projects

When bootstrapping a new project on-demand:

```bash
node scripts/portfolio.js bootstrap --name <name> --target <target-directory> --description "<desc>" --stack "<stack>"
```

### What Bootstrap Performs:
1. Creates target directory if it does not exist.
2. Initializes git repository (`git init`).
3. Installs multi-harness agent definitions mirrored across:
   - `.agents/agents/` (Antigravity)
   - `.claude/agents/` (Claude Code)
   - `.grok/agents/` (Grok)
   - `.github/agents/` (GitHub Copilot)
   (Includes `project-lead`, `team-lead`, `architect`, `coder`, `frontend-engineer`, `tester`).
4. Copies essential skills: `software-team`, `assistant-memory`, `commit-and-push`.
5. Generates root files:
   - `AGENTS.md` (cross-harness rules & 300-line limit).
   - `.gitignore` (ignoring `.memory/`, `.agents/work/`, OS artifacts).
   - `README.md` (project overview & agent team instructions).
6. Registers the new repository directly into `~/.memory/assistant/projects.json`.

## Delegation Protocol

When a user asks `assistant` a question or task targeting a specific project:
1. Lookup the target project using `node scripts/portfolio.js get <name> --json` (or `list`).
2. If the project is registered, invoke that repository's `project-lead` agent using the active runtime harness:
   - **Antigravity**: `invoke_subagent` specifying the project directory context and passing the user's objective.
   - **Grok**: `spawn_subagent` pointing to the target repository.
   - **Claude Code**: `Task` with repository scope.
3. If the project does not exist, ask the user if they would like to bootstrap it.
