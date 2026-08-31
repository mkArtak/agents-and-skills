# agent-skills

Repository for storing and sharing reusable custom agents and skills I use periodically.

This repo uses the open [Agent Skills](https://agentskills.io/) format so the skills here stay **AI toolchain agnostic**. The canonical location for skills is `.agents/skills/`. Custom agents live under `.agents/agents/` as markdown files with YAML frontmatter.

## Repository intent

- Keep reusable skills in a portable, shareable format.
- Prefer the standard `SKILL.md`-based Agent Skills structure over tool-specific skill formats.
- Keep custom agents next to skills so this repository is the source of truth for both.
- Use this repository as the source of truth for skills and agents that can be consumed by compatible clients.

## Skill layout

Each skill should live under `.agents/skills/<skill-name>/` and follow the standard structure:

```text
.agents/
└── skills/
    └── <skill-name>/
        ├── SKILL.md
        ├── scripts/
        ├── references/
        └── assets/
```

Notes:

- `SKILL.md` is required.
- `scripts/`, `references/`, and `assets/` are optional.
- Keep instructions portable and avoid coupling a skill to one AI product unless that dependency is explicit and necessary.

## Agent layout

Each agent is a single markdown file:

```text
.agents/
└── agents/
    └── <agent-name>.md
```

Notes:

- YAML frontmatter must include `name` and `description`.
- The markdown body is the agent's system prompt.
- Keep the prompt focused on behavior the default agent does not already have.

Grok discovers project agents from `.grok/agents/` and user agents from `~/.grok/agents/`. This repository mirrors catalog agents into `.grok/agents/` so they load in this workspace. To use an agent in other projects, copy it to `~/.grok/agents/`, or start a session with `--agent-profile .agents/agents/<agent-name>.md`.

## Adding agents

When adding a new agent:

1. Create `.agents/agents/<agent-name>.md` with valid frontmatter and a focused prompt body.
2. Mirror the same file to `.grok/agents/<agent-name>.md` so Grok can load it in this workspace.
3. Add a row to the Agents index below.
4. Keep personal runtime data (memories, logs) out of git.

## Agents index

| Agent | Purpose | Notes |
| --- | --- | --- |
| `assistant` | Persistent personal assistant that stores local memories of notable topics and recalls them first. | Uses the `assistant-memory` skill. Memories live under `~/.agents/assistant/memory/` (user) and `<repo>/.agents/assistant/memory/` (workspace). Recall searches and loads at most 4 topic files; cold topics move to `archive/`. Those paths are gitignored. |

## Adding skills

When adding a new skill:

1. Create a new directory under `.agents/skills/`.
2. Add a `SKILL.md` file with valid Agent Skills frontmatter.
3. Add optional scripts, references, or assets only when the skill needs them.
4. Keep the skill focused, reusable, and vendor-neutral by default.

## Skills index

This section is the running catalog of skills in this repository.

| Skill | Purpose | Notes |
| --- | --- | --- |
| `commit-and-push` | Stages intended changes, creates a commit, and pushes the current branch. | Portable git workflow skill for publishing repository work. |
| `repo-skill-manager` | Lists, installs, and updates skills published from this repository. | Manages project-scoped and global installs under the standard `.agents/skills` layout. |
| `assistant-memory` | Searches, writes, and compacts Assistant's local topic memories. | Ranked search over Markdown topic files so recall stays bounded as the topic count grows. |
