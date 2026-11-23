// Cron crawler: picks up new MCP servers and agent packages and scans them.
import { scanTarget } from "./scan.js";

const PER_RUN = 6;
const INTERESTING = /mcp|agent|skill|claude|cursor|codex|openclaw|clawd|wallet|solana|x402/i;

async function getState(env, key, fallback) {
  const row = await env.DB.prepare("SELECT value FROM crawl_state WHERE key = ?").bind(key).first();
  return row ? row.value : fallback;
}
async function setState(env, key, value) {
  await env.DB.prepare("INSERT INTO crawl_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(key, String(value), Date.now()).run();
}

async function fromMcpRegistry(env) {
  const since = await getState(env, "mcp_since", new Date(Date.now() - 2 * 86400e3).toISOString());
  const r = await fetch(`https://registry.modelcontextprotocol.io/v0/servers?limit=50&updated_since=${encodeURIComponent(since)}`, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`MCP registry ${r.status}`);
  const j = await r.json();
  const out = [];
  let newest = since;
  for (const item of j.servers || []) {
    const s = item.server || {};
    const m = item._meta?.["io.modelcontextprotocol.registry/official"] || {};
    if (m.updatedAt && m.updatedAt > newest) newest = m.updatedAt;
    for (const p of s.packages || []) {
      if (p.registryType === "npm" && p.identifier) out.push({ target: `npm:${p.identifier}${p.version ? "@" + p.version : ""}`, source: "MCP Registry" });
      if (p.registryType === "pypi" && p.identifier) out.push({ target: `pypi:${p.identifier}${p.version ? "==" + p.version : ""}`, source: "MCP Registry" });
    }
    if (!(s.packages || []).length) for (const rm of s.remotes || []) if (rm.type === "streamable-http" && rm.url) out.push({ target: rm.url, source: "MCP Registry" });
  }
  await setState(env, "mcp_since", newest);
  return out;
}

async function fromNpm() {
  const r = await fetch("https://registry.npmjs.org/-/v1/search?text=mcp&size=100", { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`npm search ${r.status}`);
  const j = await r.json();
  const cutoff = Date.now() - 3 * 86400e3;
  return (j.objects || [])
    .filter((o) => Date.parse(o.package.date) > cutoff)
    .map((o) => ({ target: `npm:${o.package.name}@${o.package.version}`, source: "npm" }));
}

async function fromPypi() {
  const r = await fetch("https://pypi.org/rss/updates.xml", { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`PyPI RSS ${r.status}`);
  const x = await r.text();
  const out = [];
  for (const m of x.matchAll(/<title>([\w.-]+) ([\w.+-]+)<\/title>/g)) {
    if (INTERESTING.test(m[1])) out.push({ target: `pypi:${m[1]}==${m[2]}`, source: "PyPI" });
  }
  return out;
}

export async function crawl(env) {
  const started = Date.now();
  const log = { sources: {}, scanned: [], errors: [] };
  const candidates = [];
  for (const [name, fn] of [["MCP Registry", () => fromMcpRegistry(env)], ["npm", fromNpm], ["PyPI", fromPypi]]) {
    try {
      const list = await fn();
      log.sources[name] = list.length;
      candidates.push(...list);
    } catch (e) {
      log.errors.push(`${name}: ${e.message}`);
    }
  }
  const seen = new Set();
  const fresh = [];
  for (const c of candidates) {
    const k = c.target.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const exists = await env.DB.prepare("SELECT 1 FROM scans WHERE target_key = ? LIMIT 1").bind(k).first();
    if (!exists) fresh.push(c);
  }
  for (let i = fresh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
  for (const c of fresh.slice(0, PER_RUN)) {
    try {
      const rep = await scanTarget(env, c.target, { source: `crawler:${c.source}`, force: true });
      log.scanned.push({ target: c.target, verdict: rep.verdict, id: rep.id });
    } catch (e) {
      log.errors.push(`${c.target}: ${e.message}`);
    }
  }
  await setState(env, "last_crawl", JSON.stringify({ at: started, ms: Date.now() - started, queued: fresh.length, ...log }));
  return log;
}

export async function lastCrawl(env) {
  const v = await getState(env, "last_crawl", null);
  return v ? JSON.parse(v) : null;
}
