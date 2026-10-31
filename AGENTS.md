# AGENTS.md — Repository Instructions for AI Agents

Guidelines and architectural rules for AI assistants working in the `agents-and-skills` repository.

## 1. Core Rule: Universal Cross-Harness Capability

**All new capabilities, skills, tools, and agent workflows in this repository MUST be implemented and documented for all supported AI harnesses, never coupled to a single runtime.**

Supported harnesses:
1. **Antigravity (`agy`)** — uses `.agents/agents/` (or `~/.agents/agents/`, `~/.gemini/config/agents/`)
2. **Grok (`grok-build`)** — uses `.grok/agents/` (or `~/.grok/agents/`)
3. **Claude (Claude Code)** — uses `.claude/agents/` (or `~/.claude/agents/`)
4. **GitHub Copilot** — uses `.github/agents/`

### Requirements
- **No Single-Platform Lock-in**: Never write prompt instructions or skill workflows that assume a single runner's proprietary tools or naming (e.g., referencing Grok's `spawn_subagent` without defining Antigravity's `invoke_subagent` and Claude's `Task` tool).
- **Explicit Tool Mappings**: Any capability requiring agent invocation, background execution, or message passing must explicitly document the tool name, parameter schema, and lifecycle semantics for every supported platform.
- **Strict Mirroring**: Agent definition files across `.agents/agents/`, `.grok/agents/`, `.claude/agents/`, and `.github/agents/` must remain identical at all times. When modifying an agent in one folder, immediately mirror the changes across the other three folders.
- **Subagent Lifecycle Integrity**:
  - In Antigravity, subagents are spawned with `invoke_subagent(Subagents: [{ TypeName, Role, Prompt }])`. `send_message` requires a returned `conversationId` and MUST NEVER be used to initialize or spawn a subagent.
  - In Grok, subagents are spawned with `spawn_subagent(subagent_type, description, prompt)`.
  - In Claude Code, subagents are spawned via `Task(subagent_type, prompt)` or runtime agent tools.
- **Universal Frontmatter Schema**:
  To ensure compatibility across all harnesses without single-runtime lock-in, agent frontmatters must combine declarations for each runtime:
  - **Antigravity (`agy`)**: requires `mainAgent: true` (to be invoked directly as a session agent), `subagent: true` (to be discoverable as a child subagent), and an explicit `tools:` list declaring allowed tools (e.g. `view_file`, `write_to_file`, `replace_file_content`, `run_command`, `invoke_subagent`, `send_message`, `manage_task`, `schedule`, `search_web`, `read_url_content`). Without explicit `tools:`, Antigravity defaults to safe read-only tools.
  - **Grok (`grok-build`)**: uses `capability_mode: all` (or specific permission modes), `permission_mode: default`, and `prompt_mode: extend`.
  - **Claude Code**: uses standard frontmatter fields `name`, `description`, and `tools:`.

---

## 2. Document Sizing & Modularity (300-Line Ceiling)

- No single Markdown file may exceed 300 lines.
- When an area or topic expands, split it into modular files (`<folder>.<area>.md`) and maintain a compact Table of Contents in the root file.
- Agents must surgically load only the topic files relevant to their active assignment to preserve context window capacity.

---

## 3. Storage & Work Directory Conventions

- Software team deliverables belong under `.agents/work/<slug>/` in consuming projects:
  - `STATUS.md`: tracks Phase (`requirements`, `specification`, `spec-validation`, `architecture`, `implementation`, `review`, `validation`, `complete`, `blocked`).
  - `req/`: requirements authored by Project Lead.
  - `spec/`: functional solution specifications authored by Project Lead.
  - `arch/`: architecture documents authored by Architect.
  - `tasks/`: implementation tasks authored by Team Lead.
  - `reviews/`: code and architecture reviews authored by Team Lead.
  - `validation/`: acceptance reports authored by Tester.
- Dynamic custom agents: created on-demand by Project Lead when specialized skills are needed, strictly mirrored across all four harnesses, and managed by Team Lead in `tasks/` and `reviews/`.
- Persistent agent memory lives under `.memory/<agent-name>/` (workspace) and `~/.memory/<agent-name>/` (user).
- Portfolio registry: maintained by `assistant` under `~/.memory/assistant/projects.json` for multi-project routing and on-demand repository bootstrapping.
