#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const USER_MEMORY_ROOT = path.join(os.homedir(), ".agents", "assistant", "memory");
const DEFAULT_LIMIT = 4;
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with", "from",
  "this", "that", "these", "those", "is", "are", "was", "were", "be", "been",
  "it", "its", "my", "your", "our", "me", "you", "we", "about", "into",
]);

class MemoryError extends Error {}

function findRepoRoot(startDirectory) {
  let current = path.resolve(startDirectory);
  for (;;) {
    const gitPath = path.join(current, ".git");
    if (fs.existsSync(gitPath)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function getWorkspaceMemoryRoot() {
  const repoRoot = findRepoRoot(process.cwd());
  if (!repoRoot) {
    return null;
  }
  return path.join(repoRoot, ".agents", "assistant", "memory");
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command) {
    throw new MemoryError(
      "Usage: node scripts/memory.js <search|list|stats> [query] [--limit N] [--archive] [--store workspace|user|all] [--root <path>] [--json]"
    );
  }

  const flags = new Set(rest.filter((value) => value.startsWith("--") && !value.startsWith("--limit") && !value.startsWith("--store") && !value.startsWith("--root")));
  const limitFlag = rest.find((value) => value.startsWith("--limit="));
  const limitIndex = rest.indexOf("--limit");
  const storeFlag = rest.find((value) => value.startsWith("--store="));
  const storeIndex = rest.indexOf("--store");
  const rootFlag = rest.find((value) => value.startsWith("--root="));
  const rootIndex = rest.indexOf("--root");

  let limit = DEFAULT_LIMIT;
  if (limitFlag) {
    limit = Number(limitFlag.slice("--limit=".length));
  } else if (limitIndex !== -1 && rest[limitIndex + 1]) {
    limit = Number(rest[limitIndex + 1]);
  }
  if (!Number.isFinite(limit) || limit < 1) {
    throw new MemoryError("--limit must be a positive number.");
  }

  let store = "all";
  if (storeFlag) {
    store = storeFlag.slice("--store=".length);
  } else if (storeIndex !== -1 && rest[storeIndex + 1]) {
    store = rest[storeIndex + 1];
  }
  if (!["all", "workspace", "user"].includes(store)) {
    throw new MemoryError("--store must be workspace, user, or all.");
  }

  let root = null;
  if (rootFlag) {
    root = rootFlag.slice("--root=".length);
  } else if (rootIndex !== -1 && rest[rootIndex + 1]) {
    root = rest[rootIndex + 1];
  }

  const positional = rest.filter((value, index) => {
    if (value.startsWith("--")) {
      return false;
    }
    if (index > 0 && (rest[index - 1] === "--limit" || rest[index - 1] === "--store" || rest[index - 1] === "--root")) {
      return false;
    }
    return true;
  });

  return {
    command,
    query: positional.join(" ").trim(),
    limit,
    includeArchive: flags.has("--archive"),
    store,
    root,
    json: flags.has("--json"),
  };
}

function resolveStores(store, root) {
  if (root) {
    return [{ name: "root", root: path.resolve(root) }];
  }
  const stores = [];
  if (store === "all" || store === "workspace") {
    const workspaceRoot = getWorkspaceMemoryRoot();
    if (workspaceRoot) {
      stores.push({ name: "workspace", root: workspaceRoot });
    }
  }
  if (store === "all" || store === "user") {
    stores.push({ name: "user", root: USER_MEMORY_ROOT });
  }
  return stores;
}

async function pathExists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function walkMarkdown(directory, relativePrefix = "") {
  if (!(await pathExists(directory))) {
    return [];
  }

  const entries = await fsp.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdown(fullPath, relativePath)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push({ relativePath, fullPath });
    }
  }

  return files;
}

function tokenize(query) {
  return [...new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
  )];
}

function parseUpdated(text) {
  const match = text.match(/Updated:\s*(\d{4}-\d{2}-\d{2})/i) || text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match ? match[1] : null;
}

function parseTitle(text, fallback) {
  const heading = text.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : fallback;
}

function parseAliases(text) {
  const match = text.match(/Aliases:\s*(.+)$/m);
  if (!match) {
    return [];
  }
  return match[1]
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseSummary(text) {
  const block = text.split(/##\s+Summary\s*/i)[1];
  if (!block) {
    return "";
  }
  const paragraph = block.split(/\n##\s+/)[0];
  return paragraph.replace(/\s+/g, " ").trim().slice(0, 240);
}

function parseIndexAliases(indexText) {
  const aliasesByFile = new Map();
  const lines = indexText.split(/\r?\n/);
  if (lines.length === 0) {
    return aliasesByFile;
  }

  const header = lines.find((line) => line.includes("|") && /topic/i.test(line) && /file/i.test(line));
  if (!header) {
    return aliasesByFile;
  }

  const columns = header.split("|").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const fileIndex = columns.indexOf("file");
  const aliasIndex = columns.indexOf("aliases");
  if (fileIndex === -1 || aliasIndex === -1) {
    return aliasesByFile;
  }

  for (const line of lines) {
    if (!line.includes("|") || line.includes("---") || line === header) {
      continue;
    }
    const cells = line.split("|").map((value) => value.trim()).filter((value, index, all) => !(index === 0 && value === "") && !(index === all.length - 1 && value === ""));
    const file = cells[fileIndex];
    const aliases = cells[aliasIndex];
    if (!file || !aliases) {
      continue;
    }
    aliasesByFile.set(file.replaceAll("\\", "/"), aliases.split(",").map((value) => value.trim()).filter(Boolean));
  }

  return aliasesByFile;
}

function recencyBonus(updated) {
  if (!updated) {
    return 0;
  }
  const then = Date.parse(`${updated}T00:00:00Z`);
  if (Number.isNaN(then)) {
    return 0;
  }
  const days = (Date.now() - then) / 86400000;
  if (days <= 30) {
    return 4;
  }
  if (days <= 90) {
    return 2;
  }
  if (days <= 365) {
    return 1;
  }
  return 0;
}

function includesToken(haystack, token) {
  return haystack.toLowerCase().includes(token);
}

function isMetadataLine(line) {
  return line.startsWith("#") || /^-\s*Updated:/i.test(line) || /^-\s*Aliases:/i.test(line);
}

function snippetFor(text, tokens) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const token of tokens) {
    const line = lines.find((candidate) => includesToken(candidate, token) && !isMetadataLine(candidate));
    if (line) {
      return line.slice(0, 180);
    }
  }
  return lines.find((line) => !isMetadataLine(line)) || "";
}

function scoreTopic({ slug, relativePath, title, aliases, summary, body, updated, archived }, tokens) {
  if (relativePath === "INDEX.md") {
    return 0;
  }

  let score = 0;
  let matched = false;
  const aliasText = aliases.join(" ");

  for (const token of tokens) {
    let tokenMatched = false;
    if (slug === token) {
      score += 15;
      tokenMatched = true;
    } else if (includesToken(slug, token)) {
      score += 10;
      tokenMatched = true;
    }
    if (includesToken(title, token)) {
      score += 8;
      tokenMatched = true;
    }
    if (includesToken(aliasText, token)) {
      score += 10;
      tokenMatched = true;
    }
    if (summary && includesToken(summary, token)) {
      score += 4;
      tokenMatched = true;
    } else if (includesToken(body, token)) {
      score += 1;
      tokenMatched = true;
    }
    matched = matched || tokenMatched;
  }

  if (!matched) {
    return 0;
  }

  score += recencyBonus(updated);
  if (archived) {
    score *= 0.4;
  }
  return score;
}

async function loadStoreFiles(store, includeArchive) {
  if (!(await pathExists(store.root))) {
    return { topics: [], indexAliases: new Map() };
  }

  const indexPath = path.join(store.root, "INDEX.md");
  let indexAliases = new Map();
  if (await pathExists(indexPath)) {
    indexAliases = parseIndexAliases(await fsp.readFile(indexPath, "utf8"));
  }

  const topicsDir = path.join(store.root, "topics");
  const archiveDir = path.join(store.root, "archive");
  const files = [
    ...(await walkMarkdown(topicsDir, "topics")),
    ...(includeArchive ? await walkMarkdown(archiveDir, "archive") : []),
  ];

  const topics = [];
  for (const file of files) {
    const body = await fsp.readFile(file.fullPath, "utf8");
    const slug = path.basename(file.relativePath, ".md");
    const indexKey = file.relativePath.replaceAll("\\", "/");
    topics.push({
      store: store.name,
      slug,
      path: file.fullPath,
      relativePath: indexKey,
      title: parseTitle(body, slug),
      aliases: [...new Set([...(indexAliases.get(indexKey) || []), ...parseAliases(body)])],
      summary: parseSummary(body),
      updated: parseUpdated(body),
      archived: indexKey.startsWith("archive/"),
      body,
    });
  }

  return { topics, indexAliases };
}

async function search(args) {
  const tokens = tokenize(args.query);
  if (tokens.length === 0) {
    throw new MemoryError("search requires a query.");
  }

  const hits = [];
  for (const store of resolveStores(args.store, args.root)) {
    const loaded = await loadStoreFiles(store, args.includeArchive);
    for (const topic of loaded.topics) {
      const score = scoreTopic(topic, tokens);
      if (score <= 0) {
        continue;
      }
      hits.push({
        slug: topic.slug,
        store: topic.store,
        path: topic.path,
        relative_path: topic.relativePath,
        title: topic.title,
        aliases: topic.aliases,
        updated: topic.updated,
        archived: topic.archived,
        score: Number(score.toFixed(2)),
        summary: topic.summary,
        snippet: snippetFor(topic.body, tokens),
      });
    }
  }

  hits.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return (right.updated || "").localeCompare(left.updated || "");
  });

  return {
    action: "search",
    query: args.query,
    tokens,
    limit: args.limit,
    hits: hits.slice(0, args.limit),
    total_matches: hits.length,
  };
}

async function listTopics(args) {
  const topics = [];
  for (const store of resolveStores(args.store, args.root)) {
    const loaded = await loadStoreFiles(store, args.includeArchive);
    for (const topic of loaded.topics) {
      topics.push({
        slug: topic.slug,
        store: topic.store,
        path: topic.path,
        relative_path: topic.relativePath,
        title: topic.title,
        aliases: topic.aliases,
        updated: topic.updated,
        archived: topic.archived,
        summary: topic.summary,
      });
    }
  }

  topics.sort((left, right) => (right.updated || "").localeCompare(left.updated || "") || left.slug.localeCompare(right.slug));
  return {
    action: "list",
    count: topics.length,
    topics,
  };
}

async function stats(args) {
  const stores = [];
  for (const store of resolveStores(args.store, args.root)) {
    const active = await loadStoreFiles(store, false);
    const withArchive = await loadStoreFiles(store, true);
    stores.push({
      name: store.name,
      root: store.root,
      exists: await pathExists(store.root),
      active_topics: active.topics.length,
      archived_topics: withArchive.topics.length - active.topics.length,
    });
  }
  return { action: "stats", stores };
}

function emit(payload, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (payload.action === "search") {
    process.stdout.write(`Memory search: ${payload.query} (${payload.total_matches} matches, showing ${payload.hits.length})\n`);
    for (const hit of payload.hits) {
      process.stdout.write(
        `- [${hit.score}] ${hit.store}:${hit.slug}${hit.archived ? " (archived)" : ""} ${hit.path}\n  ${hit.summary || hit.snippet}\n`
      );
    }
    return;
  }

  if (payload.action === "list") {
    process.stdout.write(`${payload.count} topics\n`);
    for (const topic of payload.topics) {
      process.stdout.write(`- ${topic.store}:${topic.slug}${topic.archived ? " (archived)" : ""} ${topic.updated || "undated"}\n`);
    }
    return;
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "search") {
    emit(await search(args), args.json);
    return;
  }
  if (args.command === "list") {
    emit(await listTopics(args), args.json);
    return;
  }
  if (args.command === "stats") {
    emit(await stats(args), args.json);
    return;
  }

  throw new MemoryError(`Unsupported command: ${args.command}`);
}

main().catch((error) => {
  if (error instanceof MemoryError) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
