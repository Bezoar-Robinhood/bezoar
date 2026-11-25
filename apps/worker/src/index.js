import { scanTarget, getReport, getExcerpts } from "./scan.js";
import { RULES } from "./rules.js";
import { streamReview, reviewAvailable, modelName, stanceOf } from "./llm.js";
import { searchFeed, stats } from "./feed.js";
import { crawl, lastCrawl } from "./crawler.js";
import { mcpFetch } from "./mcp.js";
import { indexBurns, keeper, burnsSummary } from "./burns.js";

const VERSION = "0.1.0";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, mcp-session-id" };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra } });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function rateLimit(env, req, bucketName, max, windowMs) {
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const bucket = `${bucketName}:${ip}`;
  const now = Date.now();
  const row = await env.DB.prepare("SELECT count, window_start FROM rate WHERE bucket = ?").bind(bucket).first();
  if (!row || now - row.window_start > windowMs) {
    await env.DB.prepare("INSERT INTO rate (bucket, count, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = 1, window_start = excluded.window_start").bind(bucket, now).run();
    return true;
  }
  if (row.count >= max) return false;
  await env.DB.prepare("UPDATE rate SET count = count + 1 WHERE bucket = ?").bind(bucket).run();
  return true;
}

const VERDICT_COLOR = { "KEY THEFT": "#C8452F", EXFILTRATION: "#C8452F", "HIDDEN INSTRUCTIONS": "#C8452F", "FAKE INSTALLER": "#C9862B", "RUG PULL": "#C9862B", SUSPICIOUS: "#C9862B", INCOMPLETE: "#6B675F", "NO FINDINGS": "#2E6B58" };

function badge(rep) {
  const left = "bezoar";
  const right = `${rep.verdict.toLowerCase()} · ${rep.scannedAt.slice(0, 10)}`;
  const lw = 58, rw = Math.round(right.length * 6.4 + 16);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${esc(left)}: ${esc(right)}"><rect width="${lw}" height="20" fill="#16181B"/><rect x="${lw}" width="${rw}" height="20" fill="${VERDICT_COLOR[rep.verdict] || "#6B675F"}"/><g fill="#F4F1EA" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="8" y="14">${left}</text><text x="${lw + 8}" y="14">${esc(right)}</text></g></svg>`;
}

function rss(items, site) {
  const entries = items.map((i) => `<item><title>${esc(`${i.verdict}: ${i.target}`)}</title><link>${site}/scan/${i.id}</link><guid>${site}/scan/${i.id}</guid><pubDate>${new Date(i.scannedAt).toUTCString()}</pubDate><description>${esc(i.top ? `${i.top.rule} at ${i.top.where}: ${i.top.why}` : "No rule matched.")}</description></item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Bezoar feed: flagged agent skills and packages</title><link>${site}/feed/</link><description>Skills, MCP servers and packages flagged by Bezoar.</description>${entries}</channel></rss>`;
}

function llmsTxt(site) {
  return `# Bezoar

> Security for AI agents. Scans skills, MCP servers, npm/PyPI packages and GitHub repos for private key theft, exfiltration, hidden instructions and fake installers before an agent installs them. Free, no wallet needed.

## API
- POST ${site}/api/v1/scan  body {"target": "npm:name | pypi:name | GitHub URL | skill URL | MCP server URL | SKILL.md text"}
- GET ${site}/api/v1/scan/{id}
- GET ${site}/api/v1/scan/{id}/review  (LLM second opinion, streamed text)
- GET ${site}/api/v1/feed?verdict=&registry=&flagged=1
- GET ${site}/api/v1/rules

## MCP
- Streamable HTTP: ${site}/mcp  tools: scan_target, get_report, search_feed, check_install_command

## Notes
- Verdicts: KEY THEFT, EXFILTRATION, HIDDEN INSTRUCTIONS, FAKE INSTALLER, RUG PULL, SUSPICIOUS, INCOMPLETE, NO FINDINGS.
- NO FINDINGS means no rule matched. It is not a guarantee.
`;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    const site = env.SITE_URL || url.origin;
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    try {
      if (p === "/mcp") return mcpFetch(req, env);
      if (p === "/llms.txt") return new Response(llmsTxt(site), { headers: { "content-type": "text/plain; charset=utf-8" } });
      if (p === "/feed.xml") {
        const { items } = await searchFeed(env, { flagged: true, limit: 50 });
        return new Response(rss(items, site), { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
      }

      if (p === "/api/v1/health") {
        const [s, c] = await Promise.all([stats(env), lastCrawl(env)]);
        return json({ ok: true, version: VERSION, rules: RULES.length, llm: { available: reviewAvailable(env), model: reviewAvailable(env) ? modelName(env) : null }, crawler: c ? { at: new Date(c.at).toISOString(), sources: c.sources, scanned: c.scanned.length, errors: c.errors } : null, stats: s, registry: env.REGISTRY_ADDRESS || null, time: new Date().toISOString() });
      }
      if (p === "/api/v1/burns") {
        try { return json(await burnsSummary(env)); } catch (e) { return json({ error: `Chain RPC unavailable: ${e.shortMessage || e.message}`.slice(0, 200) }, 503); }
      }
      if (p === "/api/v1/rules") return json({ count: RULES.length, rules: RULES });
      if (p === "/api/v1/stats") return json(await stats(env));
      if (p === "/api/v1/feed" || p === "/feed.json") {
        const q = url.searchParams;
        return json(await searchFeed(env, { verdict: q.get("verdict") || undefined, registry: q.get("registry") || undefined, flagged: q.get("flagged") === "1", since: q.get("since") || undefined, cursor: q.get("cursor") || undefined, limit: q.get("limit") || 30 }));
      }
      if (p === "/api/v1/scan" && req.method === "POST") {
        if (!(await rateLimit(env, req, "scan", Number(env.SCAN_PER_10MIN || 30), 600e3))) return json({ error: "Too many scans from your address. Try again in a few minutes." }, 429);
        let body = {};
        try { body = await req.json(); } catch {}
        const rep = await scanTarget(env, body.target, { source: "user", force: body.rescan === true });
        if (rep.error) return json({ error: rep.error }, rep.status || 400);
        return json(rep);
      }
      let m;
      if ((m = p.match(/^\/api\/v1\/scan\/([a-z0-9]{6,20})$/))) {
        const rep = await getReport(env, m[1]);
        return rep ? json(rep) : json({ error: "Report not found." }, 404);
      }
      if ((m = p.match(/^\/api\/v1\/scan\/([a-z0-9]{6,20})\/review$/))) {
        const stored = await env.DB.prepare("SELECT * FROM reviews WHERE scan_id = ?").bind(m[1]).first();
        if (stored) return json({ model: stored.model, stance: stored.stance, text: stored.text, at: new Date(stored.created_at).toISOString() });
        const rep = await getReport(env, m[1]);
        if (!rep) return json({ error: "Report not found." }, 404);
        if (!reviewAvailable(env)) return json({ error: "LLM review unavailable: no model is configured on this server." }, 503);
        if (!(await rateLimit(env, req, "review", Number(env.REVIEW_PER_10MIN || 20), 600e3))) return json({ error: "Too many reviews requested. Try again shortly." }, 429);
        const excerpts = await getExcerpts(env, m[1]);
        const model = modelName(env);
        const stream = await streamReview(env, rep, excerpts, async (text) => {
          if (!text.trim()) return;
          await env.DB.prepare("INSERT OR IGNORE INTO reviews (scan_id, model, stance, text, created_at) VALUES (?, ?, ?, ?, ?)").bind(m[1], model, stanceOf(text), text, Date.now()).run();
        });
        return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "x-model": model, "cache-control": "no-store", ...CORS } });
      }
      if ((m = p.match(/^\/api\/v1\/badge\/([a-z0-9]{6,20})\.svg$/))) {
        const rep = await getReport(env, m[1]);
        if (!rep) return new Response("not found", { status: 404 });
        return new Response(badge(rep), { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=600", ...CORS } });
      }
      if (p === "/api/v1/admin/crawl" && req.method === "POST") {
        if (!env.ADMIN_KEY || req.headers.get("x-admin-key") !== env.ADMIN_KEY) return json({ error: "forbidden" }, 403);
        return json(await crawl(env));
      }
      if (p.startsWith("/api/")) return json({ error: "Not found." }, 404);

      if (/^\/scan\/[a-z0-9]{6,20}\/?$/.test(p)) {
        return env.ASSETS.fetch(new Request(new URL("/scan/", url), req));
      }
      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error(e);
      return json({ error: `Server error: ${e.message}` }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    const burns = async () => {
      try { console.log("keeper", JSON.stringify(await keeper(env))); } catch (e) { console.error("keeper", e.shortMessage || e.message); }
      try { await indexBurns(env); } catch (e) { console.error("burns index", e.message); }
    };
    ctx.waitUntil(burns());
    if (new Date(event.scheduledTime).getUTCMinutes() % 30 === 0) ctx.waitUntil(crawl(env));
  },
};
