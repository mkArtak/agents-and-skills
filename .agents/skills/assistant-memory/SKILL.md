---
name: assistant-memory
description: Search, write, and compact the Assistant agent's local Markdown memory stores. Use when recalling prior topics, saving a notable fact, forgetting a memory, or maintaining Assistant topic files as the memory set grows.
compatibility: Requires Node.js 18+. Reads and writes local files under .agents/assistant/memory and ~/.agents/assistant/memory.
metadata:
  author: mkArtak
  version: "1.1"
  source-repository: mkArtak/agent-skills
  source-path: .agents/skills/assistant-memory
---

Manage Assistant's local topic memories so recall stays cheap as the number of topics grows.

## Stores

- **Workspace:** `<git-root>/.agents/assistant/memory/` (skip if not in a git repo)
- **User:** `~/.agents/assistant/memory/` (Windows: `%USERPROFILE%\.agents\assistant\memory`)

```text
memory/
  INDEX.md
  topics/<slug>.md
  archive/<YYYY>/<slug>.md
```

`INDEX.md` is a routing table, not a document to load in full. Active details live in `topics/`. Cold topics move to `archive/`.

Do not commit memory files. Do not store secrets, passwords, API keys, or tokens.

## Scaling rules

- Retrieve by search. Do not read `INDEX.md` or every topic file into context.
- Load at most **4** topic files per turn.
- Prefer the bundled script for ranking. Fall back to `grep` only if the script is unavailable.
- Create a directory only when first writing to it.
- Before creating a topic, search. Merge into an existing slug when the subject already exists.
- When an active store exceeds **80** topics, archive topics not updated in **180** days.

## Search

Prefer:

```bash
node scripts/memory.js search "<query>" --json --limit 4
```

If there are no useful hits, retry once with `--archive`.

Resolve the script from the first path that exists:

- this skill's `scripts/memory.js`
- `<git-root>/.agents/skills/assistant-memory/scripts/memory.js`
- `~/.agents/skills/assistant-memory/scripts/memory.js`

Read only the `path` values from `hits`. If `total_matches` is larger than `hits`, treat unread matches as names only; do not open them unless the user asks for more.

Without the script, `grep` the query terms against `INDEX.md` and `topics/` in both stores, rank slug/title/alias hits above body hits, then open at most 4 files. Grep `archive/` only on a miss.

Do not ingest `INDEX.md` whole when it has more than 25 data rows. Grep it instead.

## Write

Write or update a topic when:

- the user asks to remember, save, note, or not forget something
- a decision, preference, or correction is stated
- a person, project, or recurring topic is introduced with facts that will matter later
- ongoing work has status or next steps that would be costly to rediscover

Do not write memories for throwaway questions, trivia, or content the user asked to forget.

1. Search first. Reuse the existing topic when one matches.
2. Project facts go to workspace; personal and cross-project facts go to user.
3. Keep `INDEX.md` in sync: topic, file, aliases, updated date (`YYYY-MM-DD`), one-line summary.
4. Put aliases in both the topic file and the index row so later searches can hit without opening the file.
5. On an explicit remember request, confirm what was stored and where. On a quiet write, do not narrate the file update unless asked.

### Topic file

```markdown
# <Topic>

- Updated: YYYY-MM-DD
- Aliases: comma-separated search terms

## Summary
One short paragraph.

## Facts
- Durable statements.

## Decisions
- What was chosen and why, if known.

## Open
- Unresolved items worth recalling.
```

If a topic file grows past about 150 lines, keep Summary/Facts/Decisions/Open current and move stale narrative out or drop it. The live file stays short.

### Index row

```markdown
# Assistant memory index

| Topic | File | Aliases | Updated | Summary |
| --- | --- | --- | --- | --- |
| Example | topics/example.md | sample, demo | 2026-08-30 | One-line summary |
```

Archived topics leave the index.

## Archive and forget

Archive by moving `topics/<slug>.md` to `archive/<YYYY>/<slug>.md` and removing its index row. Use the year from the topic's updated date.

Forget by deleting or editing the matching facts. If the topic is empty afterward, delete the file and its index row. Confirm what was removed.

## Other script commands

```bash
node scripts/memory.js list --json
node scripts/memory.js stats --json
```
