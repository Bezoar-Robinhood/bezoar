import fs from "node:fs";
import path from "node:path";
import { runRules, decideVerdict, isScannable } from "./rules.js";

const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", ".next", ".turbo"]);
const MAX_FILES = 4000;

function walk(root) {
  const files = [];
  const stat = fs.statSync(root);
  if (stat.isFile()) return [{ abs: root, rel: path.basename(root), size: stat.size }];
  const stack = [root];
  while (stack.length && files.length < MAX_FILES) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(abs); continue; }
      if (!e.isFile()) continue;
      const size = fs.statSync(abs).size;
      files.push({ abs, rel: path.relative(root, abs).replace(/\\/g, "/"), size });
    }
  }
  return files;
}

export function scanLocal(target) {
  const t0 = Date.now();
  const abs = path.resolve(target);
  const entries = walk(abs).filter((f) => isScannable(f.rel, f.size));
  const files = entries.map((f) => ({ path: f.rel, text: fs.readFileSync(f.abs, "utf8") }));
  let packageName;
  try { packageName = JSON.parse(fs.readFileSync(path.join(abs, "package.json"), "utf8")).name; } catch {}
  const { findings, scannedFiles, rulesChecked } = runRules(files, { packageName });
  return { target: abs, source: "local", verdict: decideVerdict(findings), findings, filesScanned: scannedFiles, rulesChecked, durationMs: Date.now() - t0 };
}

export async function scanRemote(target, api) {
  const res = await fetch(`${api}/api/v1/scan`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "getbezoar-cli" },
    body: JSON.stringify({ target }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Scan failed with HTTP ${res.status}`);
  return { ...body, source: "remote", reportUrl: body.id ? `${api}/scan/${body.id}` : undefined };
}
