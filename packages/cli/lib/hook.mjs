#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkRead, checkShell, checkToolArgs } from "./policy.js";

const HOME = os.homedir();
const DIR = path.join(HOME, ".bezoar");
const agent = process.argv[2] || "cursor";

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, "guard.json"), "utf8")); } catch { return {}; }
}

function log(entry) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(path.join(DIR, "guard.log"), JSON.stringify({ at: new Date().toISOString(), agent, ...entry }) + "\n");
  } catch {}
}

function readStdin() {
  try { return fs.readFileSync(0, "utf8"); } catch { return ""; }
}

function decide(input, cfg) {
  const opts = { cfg, home: HOME };
  if (agent === "claude") {
    const t = input.tool_name || "";
    const ti = input.tool_input || {};
    if (t === "Read") return { event: "read", target: ti.file_path, d: checkRead(ti.file_path, opts) };
    if (t === "Grep" && ti.path) return { event: "read", target: ti.path, d: checkRead(ti.path, opts) };
    if (t === "Bash" || t === "PowerShell") return { event: "shell", target: ti.command, d: checkShell(ti.command, opts) };
    if (t.startsWith("mcp__")) return { event: "mcp", target: t, d: checkToolArgs(ti, { ...opts, tool: t }) };
    return { event: "other", d: { action: "allow" } };
  }
  if (input.tool_name !== undefined && input.tool_input !== undefined) {
    return { event: "mcp", target: `${input.mcp_server_name || "?"}/${input.tool_name}`, d: checkToolArgs(input.tool_input, { ...opts, tool: input.tool_name }) };
  }
  if (typeof input.command === "string") return { event: "shell", target: input.command, d: checkShell(input.command, opts) };
  if (input.file_path) return { event: "read", target: input.file_path, d: checkRead(input.file_path, { ...opts, content: input.content }) };
  return { event: "other", d: { action: "allow" } };
}

function respond(event, d) {
  const how = d.target ? ` To allow this path: npx getbezoar guard allow "${d.target}"` : "";
  const userMsg = `Bezoar guard ${d.action === "ask" ? "flagged" : "blocked"}: ${d.reason}${how}`;
  const agentMsg = `Bezoar guard ${d.action === "ask" ? "flagged" : "blocked"} this action (${d.rule}): ${d.reason} Do not try another way to read or send this data. Tell the user what you were trying to do.`;

  if (agent === "claude") {
    if (d.action === "allow") return "";
    return JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: d.action, permissionDecisionReason: d.action === "deny" ? agentMsg : userMsg } });
  }
  if (d.action === "allow") return JSON.stringify({ permission: "allow" });
  if (event === "read") return JSON.stringify({ permission: "deny", user_message: userMsg });
  return JSON.stringify({ permission: d.action, user_message: userMsg, agent_message: agentMsg });
}

let out;
try {
  const raw = readStdin();
  const input = raw.trim() ? JSON.parse(raw) : {};
  const cfg = loadConfig();
  let { event, target, d } = decide(input, cfg);
  if (d.action !== "allow") {
    log({ event, action: d.action, rule: d.rule, reason: d.reason, target: String(target || "").slice(0, 300), mode: cfg.mode || "enforce" });
    if (cfg.mode === "warn") d = { action: "allow" };
  }
  out = respond(event, d);
} catch (e) {
  log({ event: "error", error: String(e && e.message || e).slice(0, 300) });
  out = agent === "claude" ? "" : JSON.stringify({ permission: "allow" });
}
if (out) process.stdout.write(out);
process.exitCode = 0;
