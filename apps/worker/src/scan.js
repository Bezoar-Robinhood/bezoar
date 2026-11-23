import { resolveTarget } from "./fetchers.js";
import { runRules, decideVerdict, RULES, RULE_BY_ID } from "./rules.js";

const RESCAN_MS = 10 * 60 * 1000;

const newId = () => {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return [...a].map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
};
const keyOf = (s) => String(s || "").trim().toLowerCase().replace(/\/+$/, "");

export async function getExcerpts(env, id) {
  const row = await env.DB.prepare("SELECT meta_json FROM scans WHERE id = ?").bind(id).first();
  return row ? JSON.parse(row.meta_json || "{}").excerpts || [] : [];
}

export function rowToReport(row, review = null) {
  if (!row) return null;
  const meta = JSON.parse(row.meta_json || "{}");
  delete meta.excerpts;
  return {
    id: row.id,
    target: row.target,
    registry: row.registry,
    name: row.name,
    version: row.version,
    url: row.url,
    sha256: row.sha256,
    verdict: row.verdict,
    rulesChecked: row.rules_checked,
    filesScanned: row.files_scanned,
    findings: JSON.parse(row.findings_json || "[]"),
    incomplete: JSON.parse(row.incomplete_json || "[]"),
    meta,
    source: row.source,
    durationMs: row.duration_ms,
    scannedAt: new Date(row.created_at).toISOString(),
    review: review ? { model: review.model, stance: review.stance, text: review.text, at: new Date(review.created_at).toISOString() } : null,
  };
}

export async function getReport(env, id) {
  const row = await env.DB.prepare("SELECT * FROM scans WHERE id = ?").bind(id).first();
  if (!row) return null;
  const review = await env.DB.prepare("SELECT * FROM reviews WHERE scan_id = ?").bind(id).first();
  return rowToReport(row, review);
}

export async function scanTarget(env, input, { source = "user", force = false } = {}) {
  const started = Date.now();
  const inputKey = keyOf(input);
  if (!force && inputKey && inputKey.length < 400) {
    const recent = await env.DB.prepare("SELECT * FROM scans WHERE target_key = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1").bind(inputKey, started - RESCAN_MS).first();
    if (recent) return { ...rowToReport(recent), cached: true };
  }

  const res = await resolveTarget(input);
  if (res.userError) return { error: res.error, status: 400 };

  const incomplete = [];
  let findings = [], filesScanned = 0;
  if (res.error) incomplete.push(res.error);
  if (res.notes?.length) incomplete.push(...res.notes.filter((n) => /JavaScript|failed|limit|stopped/i.test(n)));
  if (res.incompleteReason) incomplete.push(res.incompleteReason);
  if (res.files) {
    const out = runRules(res.files, { packageName: res.packageName });
    findings = out.findings;
    filesScanned = out.scannedFiles;
    if (res.files.length && filesScanned === 0 && !res.error) incomplete.push("no readable text files in the artifact");
  }

  if (res.toolsHash && res.meta?.url) {
    const pin = await env.DB.prepare("SELECT * FROM pins WHERE url = ?").bind(res.meta.url).first();
    if (!pin) {
      await env.DB.prepare("INSERT INTO pins (url, tools_hash, tools_json, pinned_at) VALUES (?, ?, ?, ?)").bind(res.meta.url, res.toolsHash, res.toolsCanonical, started).run();
    } else if (pin.tools_hash !== res.toolsHash) {
      const before = JSON.parse(pin.tools_json || "[]");
      const after = JSON.parse(res.toolsCanonical || "[]");
      const bMap = new Map(before.map((t) => [t.n, JSON.stringify(t)]));
      const changed = after.filter((t) => bMap.has(t.n) && bMap.get(t.n) !== JSON.stringify(t)).map((t) => t.n);
      const added = after.filter((t) => !bMap.has(t.n)).map((t) => t.n);
      const r = RULE_BY_ID["RUG-001"];
      findings.unshift({ rule: "RUG-001", group: r.group, severity: r.severity, title: r.title, file: "tools/list", line: 0, snippet: `changed: ${changed.join(", ") || "none"} · new: ${added.join(", ") || "none"}`, why: `Tool definitions changed since they were first pinned on ${new Date(pin.pinned_at).toISOString().slice(0, 10)}.` });
    }
  }

  const notFound = res.notFound && !res.files;
  const verdict = notFound ? "INCOMPLETE" : decideVerdict(findings, incomplete);
  const excerpts = [];
  if (res.files) {
    const byPath = new Map(res.files.map((f) => [f.path, f.text]));
    let budget = 14000;
    for (const f of findings.slice(0, 12)) {
      const text = byPath.get(f.file);
      if (!text || budget <= 0) continue;
      const lines = text.split(/\r?\n/);
      const from = Math.max(0, f.line - 8), to = Math.min(lines.length, f.line + 8);
      const excerpt = lines.slice(from, to).map((l, i) => `${from + i + 1}: ${l.slice(0, 220)}`).join("\n");
      budget -= excerpt.length;
      excerpts.push({ path: f.file, line: f.line, excerpt });
    }
    if (!excerpts.length) {
      for (const f of res.files.filter((x) => /SKILL\.md$|package\.json$|setup\.py$|index\.[jt]s$|main\.py$|tools\//i.test(x.path)).slice(0, 4)) {
        excerpts.push({ path: f.path, line: 1, excerpt: f.text.split(/\r?\n/).slice(0, 60).map((l, i) => `${i + 1}: ${l.slice(0, 220)}`).join("\n") });
      }
    }
  }
  const meta = { ...(res.meta || {}), notes: res.notes || [], notFound: !!notFound, excerpts };
  const id = newId();
  const row = {
    id, target: res.target || String(input).slice(0, 300), target_key: inputKey.slice(0, 400), registry: res.meta?.registry || null, name: res.meta?.name || null, version: res.meta?.version || null,
    url: res.meta?.url || null, sha256: res.sha256 || null, verdict, rules_checked: RULES.length, files_scanned: filesScanned,
    findings_json: JSON.stringify(findings), incomplete_json: JSON.stringify(incomplete), meta_json: JSON.stringify(meta), source, duration_ms: Date.now() - started, created_at: started,
  };
  await env.DB.prepare(`INSERT INTO scans (id, target, target_key, registry, name, version, url, sha256, verdict, rules_checked, files_scanned, findings_json, incomplete_json, meta_json, source, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(row.id, row.target, row.target_key, row.registry, row.name, row.version, row.url, row.sha256, row.verdict, row.rules_checked, row.files_scanned, row.findings_json, row.incomplete_json, row.meta_json, row.source, row.duration_ms, row.created_at).run();
  return rowToReport(row);
}
