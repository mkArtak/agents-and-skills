#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");

const DEFAULT_AGENT = "assistant";
const REGISTRY_FILE = "projects.json";

function normalizePath(p) {
  return path.resolve(p).replace(/\\/g, "/");
}

function findRepoRoot(startDirectory) {
  let current = path.resolve(startDirectory);
  for (;;) {
    if (fs.existsSync(path.join(current, ".git")) || fs.existsSync(path.join(current, ".agents", "agents"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function getPortfolioRoot(customRoot) {
  if (customRoot) return path.resolve(customRoot);
  if (process.env.PORTFOLIO_ROOT) return path.resolve(process.env.PORTFOLIO_ROOT);
  if (process.env.MEMORY_ROOT) return path.resolve(process.env.MEMORY_ROOT);
  const cwdRoot = findRepoRoot(process.cwd());
  if (cwdRoot) return cwdRoot;
  const scriptRoot = findRepoRoot(__dirname);
  if (scriptRoot) return scriptRoot;
  return process.cwd();
}

function getPortfolioFile(customRoot) {
  const baseDir = getPortfolioRoot(customRoot);
  const memRoot = path.join(baseDir, ".memory", DEFAULT_AGENT);
  if (!fs.existsSync(memRoot)) {
    fs.mkdirSync(memRoot, { recursive: true });
  }
  return path.join(memRoot, REGISTRY_FILE);
}

function extractRootOption(args) {
  const idx = args.indexOf("--root");
  if (idx !== -1 && args[idx + 1]) {
    const val = args[idx + 1];
    args.splice(idx, 2);
    return val;
  }
  return null;
}

function loadRegistry(customRoot) {
  const filePath = getPortfolioFile(customRoot);
  if (!fs.existsSync(filePath)) {
    return { version: "1.0", projects: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.projects)) {
      data.projects = [];
    }
    return data;
  } catch (err) {
    return { version: "1.0", projects: [] };
  }
}

function saveRegistry(data, customRoot) {
  const filePath = getPortfolioFile(customRoot);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cmdList(args) {
  const root = extractRootOption(args);
  const isJson = args.includes("--json");
  const reg = loadRegistry(root);

  if (isJson) {
    console.log(JSON.stringify(reg.projects, null, 2));
    return;
  }

  if (reg.projects.length === 0) {
    console.log("No projects registered in portfolio yet.");
    console.log("Use 'add' or 'bootstrap' to register your active projects.");
    return;
  }

  console.log(`\nActive Projects in Portfolio (${reg.projects.length}):\n`);
  for (const p of reg.projects) {
    console.log(`- ${p.name} [${p.status || "active"}]`);
    console.log(`  Path:        ${p.path}`);
    if (p.description) console.log(`  Description: ${p.description}`);
    if (p.stack)       console.log(`  Stack:       ${p.stack}`);
    if (p.lastActive)  console.log(`  Last Active: ${p.lastActive}`);
    console.log("");
  }
}

function cmdGet(args) {
  const root = extractRootOption(args);
  const name = args[0];
  const isJson = args.includes("--json");
  if (!name || name.startsWith("--")) {
    console.error("Usage: portfolio get <project-name> [--json] [--root <path>]");
    process.exit(1);
  }

  const reg = loadRegistry(root);
  const found = reg.projects.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (!found) {
    console.error(`Project '${name}' not found in portfolio registry.`);
    process.exit(1);
  }

  if (isJson) {
    console.log(JSON.stringify(found, null, 2));
  } else {
    console.log(`\nProject:     ${found.name}`);
    console.log(`Path:        ${found.path}`);
    console.log(`Status:      ${found.status || "active"}`);
    console.log(`Description: ${found.description || "(none)"}`);
    console.log(`Stack:       ${found.stack || "(none)"}`);
    console.log(`Created:     ${found.createdAt || "(unknown)"}`);
    console.log(`Last Active: ${found.lastActive || "(unknown)"}\n`);
  }
}

function cmdAdd(args) {
  const root = extractRootOption(args);
  let name, pPath, description, stack, status = "active";

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--name" && args[i + 1]) name = args[++i];
    else if (a === "--path" && args[i + 1]) pPath = args[++i];
    else if (a === "--description" && args[i + 1]) description = args[++i];
    else if (a === "--stack" && args[i + 1]) stack = args[++i];
    else if (a === "--status" && args[i + 1]) status = args[++i];
  }

  if (!name || !pPath) {
    console.error("Usage: portfolio add --name <name> --path <path> [--description <desc>] [--stack <stack>] [--status <status>] [--root <path>]");
    process.exit(1);
  }

  const normPath = normalizePath(pPath);
  const reg = loadRegistry(root);
  const existing = reg.projects.find(p => p.name.toLowerCase() === name.toLowerCase());

  const now = new Date().toISOString();
  if (existing) {
    existing.path = normPath;
    if (description !== undefined) existing.description = description;
    if (stack !== undefined) existing.stack = stack;
    if (status !== undefined) existing.status = status;
    existing.lastActive = now;
    saveRegistry(reg, root);
    console.log(`Updated existing project '${name}' in portfolio registry.`);
  } else {
    reg.projects.push({
      name,
      path: normPath,
      description: description || "",
      stack: stack || "",
      status: status || "active",
      createdAt: now,
      lastActive: now,
    });
    saveRegistry(reg, root);
    console.log(`Added project '${name}' (${normPath}) to portfolio registry.`);
  }
}

function cmdUpdate(args) {
  const root = extractRootOption(args);
  const name = args[0];
  if (!name || name.startsWith("--")) {
    console.error("Usage: portfolio update <name> [--path <path>] [--description <desc>] [--stack <stack>] [--status <status>] [--root <path>]");
    process.exit(1);
  }

  const reg = loadRegistry(root);
  const p = reg.projects.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!p) {
    console.error(`Project '${name}' not found.`);
    process.exit(1);
  }

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--path" && args[i + 1]) p.path = normalizePath(args[++i]);
    else if (a === "--description" && args[i + 1]) p.description = args[++i];
    else if (a === "--stack" && args[i + 1]) p.stack = args[++i];
    else if (a === "--status" && args[i + 1]) p.status = args[++i];
  }
  p.lastActive = new Date().toISOString();
  saveRegistry(reg, root);
  console.log(`Updated project '${name}' in portfolio registry.`);
}

function cmdRemove(args) {
  const root = extractRootOption(args);
  const name = args[0];
  if (!name) {
    console.error("Usage: portfolio remove <name> [--root <path>]");
    process.exit(1);
  }

  const reg = loadRegistry(root);
  const initialLen = reg.projects.length;
  reg.projects = reg.projects.filter(p => p.name.toLowerCase() !== name.toLowerCase());

  if (reg.projects.length === initialLen) {
    console.error(`Project '${name}' not found in registry.`);
    process.exit(1);
  }

  saveRegistry(reg, root);
  console.log(`Removed project '${name}' from portfolio registry.`);
}

function cmdBootstrap(args) {
  const root = extractRootOption(args);
  let name, targetDir, description = "", stack = "", sourceRepo;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--name" && args[i + 1]) name = args[++i];
    else if (a === "--target" && args[i + 1]) targetDir = args[++i];
    else if (a === "--description" && args[i + 1]) description = args[++i];
    else if (a === "--stack" && args[i + 1]) stack = args[++i];
    else if (a === "--source" && args[i + 1]) sourceRepo = args[++i];
  }

  if (!name || !targetDir) {
    console.error("Usage: portfolio bootstrap --name <name> --target <target-directory> [--description <desc>] [--stack <stack>] [--source <source-repo>] [--root <path>]");
    process.exit(1);
  }

  const resolvedTarget = path.resolve(targetDir);
  console.log(`Bootstrapping new project '${name}' at ${resolvedTarget}...`);

  if (!fs.existsSync(resolvedTarget)) {
    fs.mkdirSync(resolvedTarget, { recursive: true });
  }

  // 1. Initialize git if not already present
  const gitDir = path.join(resolvedTarget, ".git");
  if (!fs.existsSync(gitDir)) {
    try {
      execSync("git init", { cwd: resolvedTarget, stdio: "pipe" });
      console.log("Initialized git repository.");
    } catch (e) {
      console.warn("Notice: git init was skipped or failed:", e.message);
    }
  }

  // 2. Locate source agents repository
  const candidateSource = sourceRepo
    ? path.resolve(sourceRepo)
    : (findRepoRoot(__dirname) || path.resolve(__dirname, "..", "..", "..", ".."));

  const agentsSrcDir = path.join(candidateSource, ".agents", "agents");
  const skillsSrcDir = path.join(candidateSource, ".agents", "skills");

  if (fs.existsSync(agentsSrcDir)) {
    // Scaffold multi-harness folders
    const harnessDirs = [
      path.join(resolvedTarget, ".agents", "agents"),
      path.join(resolvedTarget, ".claude", "agents"),
      path.join(resolvedTarget, ".grok", "agents"),
      path.join(resolvedTarget, ".github", "agents")
    ];

    for (const hDir of harnessDirs) {
      fs.mkdirSync(hDir, { recursive: true });
    }

    // Copy agent files
    const agentFiles = ["architect.md", "coder.md", "frontend-engineer.md", "project-lead.md", "team-lead.md", "tester.md"];
    for (const f of agentFiles) {
      const srcAgent = path.join(agentsSrcDir, f);
      if (fs.existsSync(srcAgent)) {
        for (const hDir of harnessDirs) {
          fs.copyFileSync(srcAgent, path.join(hDir, f));
        }
      }
    }
    console.log("Scaffolded multi-harness agents (.agents, .claude, .grok, .github).");

    // Copy essential skills
    if (fs.existsSync(skillsSrcDir)) {
      const targetSkillsDir = path.join(resolvedTarget, ".agents", "skills");
      const skillsToCopy = ["software-team", "assistant-memory", "commit-and-push"];
      for (const s of skillsToCopy) {
        const sSrc = path.join(skillsSrcDir, s);
        if (fs.existsSync(sSrc)) {
          copyDirRecursive(sSrc, path.join(targetSkillsDir, s));
        }
      }
      console.log("Installed core skills (software-team, assistant-memory, commit-and-push).");
    }
  }

  // 3. Create AGENTS.md if missing
  const agentsMdPath = path.join(resolvedTarget, "AGENTS.md");
  if (!fs.existsSync(agentsMdPath)) {
    const agentsMdContent = `# AGENTS.md — Repository Instructions for AI Agents

## 1. Universal Cross-Harness Capability
All capabilities, skills, and agent workflows in this repository must support:
1. **Antigravity (\`agy\`)** — \`.agents/agents/\`
2. **Grok (\`grok-build\`)** — \`.grok/agents/\`
3. **Claude (Claude Code)** — \`.claude/agents/\`
4. **GitHub Copilot** — \`.github/agents/\`

Strict mirroring is enforced across all four agent folders.

## 2. Document Sizing & Modularity (300-Line Ceiling)
- No single Markdown file may exceed 300 lines.
- Topic files must be split into \`<folder>.<area>.md\` with index files.

## 3. Storage & Work Directory Conventions
- Team deliverables belong under \`.agents/work/<slug>/\`.
- Durable agent memories live under \`.memory/<agent-name>/\`.
`;
    fs.writeFileSync(agentsMdPath, agentsMdContent, "utf8");
  }

  // 4. Create .gitignore if missing
  const gitignorePath = path.join(resolvedTarget, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    const gitignoreContent = `.memory/
.agents/work/
node_modules/
.DS_Store
Thumbs.db
`;
    fs.writeFileSync(gitignorePath, gitignoreContent, "utf8");
  }

  // 5. Create README.md if missing
  const readmePath = path.join(resolvedTarget, "README.md");
  if (!fs.existsSync(readmePath)) {
    const readmeContent = `# ${name}

${description || "Project bootstrapped with multi-harness agent team."}

## Tech Stack
${stack || "To be determined during architecture phase."}

## Agent Team
This project is configured with a complete autonomous software team:
- \`project-lead\`: Requirements elicitation and functional solution specification (\`req/\`, \`spec/\`).
- \`team-lead\`: Technical feasibility validation, task decomposition (\`tasks/\`), and code/diff reviews (\`reviews/\`).
- \`architect\`: Architecture documents and boundaries (\`arch/\`).
- \`coder\`: TDD and SOLID production implementation.
- \`frontend-engineer\`: UI/UX implementation, component styling, and accessibility.
- \`tester\`: Acceptance verification against requirements (\`validation/\`).

Start any new initiative by invoking \`project-lead\`!
`;
    fs.writeFileSync(readmePath, readmeContent, "utf8");
  }

  // 6. Register in Portfolio
  const normPath = normalizePath(resolvedTarget);
  const reg = loadRegistry(root);
  const existing = reg.projects.find(p => p.name.toLowerCase() === name.toLowerCase());
  const now = new Date().toISOString();

  if (existing) {
    existing.path = normPath;
    if (description) existing.description = description;
    if (stack) existing.stack = stack;
    existing.lastActive = now;
  } else {
    reg.projects.push({
      name,
      path: normPath,
      description: description || "",
      stack: stack || "",
      status: "active",
      createdAt: now,
      lastActive: now,
    });
  }
  saveRegistry(reg, root);
  console.log(`Successfully bootstrapped '${name}' and registered in portfolio registry.`);
}

function printHelp() {
  console.log(`
portfolio - Multi-project registry and bootstrapping tool

Usage:
  node scripts/portfolio.js list [--json] [--root <path>]
  node scripts/portfolio.js get <project-name> [--json] [--root <path>]
  node scripts/portfolio.js add --name <name> --path <path> [--description <desc>] [--stack <stack>] [--status <status>] [--root <path>]
  node scripts/portfolio.js update <name> [--path <path>] [--description <desc>] [--stack <stack>] [--status <status>] [--root <path>]
  node scripts/portfolio.js remove <name> [--root <path>]
  node scripts/portfolio.js bootstrap --name <name> --target <target-dir> [--description <desc>] [--stack <stack>] [--source <source-repo>] [--root <path>]
`);
}

function main() {
  const [,, cmd, ...rest] = process.argv;
  if (!cmd || cmd === "help" || cmd === "--help") {
    printHelp();
    return;
  }

  switch (cmd) {
    case "list":
      cmdList(rest);
      break;
    case "get":
      cmdGet(rest);
      break;
    case "add":
      cmdAdd(rest);
      break;
    case "update":
      cmdUpdate(rest);
      break;
    case "remove":
      cmdRemove(rest);
      break;
    case "bootstrap":
      cmdBootstrap(rest);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}

main();
