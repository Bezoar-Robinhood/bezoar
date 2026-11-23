import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
export const DIR = path.join(HOME, ".bezoar");
export const RUNTIME = path.join(DIR, "guard");
const RUNTIME_FILES = ["hook.mjs", "policy.js", "rules.js"];
const MARK = ".bezoar/guard/hook.mjs";
const CURSOR_EVENTS = ["beforeReadFile", "beforeShellExecution", "beforeMCPExecution"];
const CLAUDE_MATCHER = "Read|Grep|Bash|PowerShell|mcp__.*";

const fwd = (p) => p.replace(/\\/g, "/");
const hookCommand = (agent) => `node "${fwd(path.join(RUNTIME, "hook.mjs"))}" ${agent}`;
const isOurs = (h) => typeof h?.command === "string" && fwd(h.command).includes(MARK);

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  const txt = fs.readFileSync(file, "utf8").trim();
  if (!txt) return fallback;
  try { return JSON.parse(txt); } catch { throw new Error(`${file} is not valid JSON. Fix it first; Bezoar will not overwrite it.`); }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && !fs.existsSync(file + ".bezoar-backup")) fs.copyFileSync(file, file + ".bezoar-backup");
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export function targets({ project = false, cwd = process.cwd() } = {}) {
  const base = project ? cwd : HOME;
  return {
    cursor: path.join(base, ".cursor", "hooks.json"),
    claude: path.join(base, ".claude", "settings.json"),
  };
}

export function installRuntime(version) {
  fs.mkdirSync(RUNTIME, { recursive: true });
  for (const f of RUNTIME_FILES) fs.copyFileSync(path.join(HERE, f), path.join(RUNTIME, f));
  fs.writeFileSync(path.join(RUNTIME, "package.json"), JSON.stringify({ type: "module", version }, null, 2));
  const cfgFile = path.join(DIR, "guard.json");
  if (!fs.existsSync(cfgFile)) fs.writeFileSync(cfgFile, JSON.stringify({ mode: "enforce", allowPaths: [] }, null, 2) + "\n");
}

export function installCursor(file) {
  const data = readJson(file, { version: 1, hooks: {} });
  data.version = data.version || 1;
  data.hooks = data.hooks || {};
  for (const ev of CURSOR_EVENTS) {
    const list = (data.hooks[ev] || []).filter((h) => !isOurs(h));
    list.unshift({ command: hookCommand("cursor"), timeout: 10 });
    data.hooks[ev] = list;
  }
  writeJson(file, data);
}

export function installClaude(file) {
  const data = readJson(file, {});
  data.hooks = data.hooks || {};
  const groups = (data.hooks.PreToolUse || [])
    .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
    .filter((g) => g.hooks.length);
  groups.unshift({ matcher: CLAUDE_MATCHER, hooks: [{ type: "command", command: hookCommand("claude"), timeout: 10 }] });
  data.hooks.PreToolUse = groups;
  writeJson(file, data);
}

export function uninstallCursor(file) {
  if (!fs.existsSync(file)) return false;
  const data = readJson(file, null);
  if (!data?.hooks) return false;
  let changed = false;
  for (const ev of Object.keys(data.hooks)) {
    const before = data.hooks[ev].length;
    data.hooks[ev] = data.hooks[ev].filter((h) => !isOurs(h));
    if (data.hooks[ev].length !== before) changed = true;
    if (!data.hooks[ev].length) delete data.hooks[ev];
  }
  if (changed) writeJson(file, data);
  return changed;
}

export function uninstallClaude(file) {
  if (!fs.existsSync(file)) return false;
  const data = readJson(file, null);
  if (!data?.hooks?.PreToolUse) return false;
  const before = JSON.stringify(data.hooks.PreToolUse);
  data.hooks.PreToolUse = data.hooks.PreToolUse
    .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
    .filter((g) => g.hooks.length);
  if (!data.hooks.PreToolUse.length) delete data.hooks.PreToolUse;
  if (!Object.keys(data.hooks).length) delete data.hooks;
  const changed = JSON.stringify(data.hooks?.PreToolUse) !== before;
  if (changed) writeJson(file, data);
  return changed;
}

export function isInstalled(agent, file) {
  try {
    const data = readJson(file, null);
    if (agent === "cursor") return CURSOR_EVENTS.every((ev) => (data?.hooks?.[ev] || []).some(isOurs));
    return (data?.hooks?.PreToolUse || []).some((g) => (g.hooks || []).some(isOurs));
  } catch { return false; }
}

export function readConfig() {
  return readJson(path.join(DIR, "guard.json"), { mode: "enforce", allowPaths: [] });
}

export function writeConfig(cfg) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, "guard.json"), JSON.stringify(cfg, null, 2) + "\n");
}

export function recentLog(n = 10) {
  const f = path.join(DIR, "guard.log");
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").trim().split("\n").slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
