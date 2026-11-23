import { rowToReport } from "./scan.js";

const FLAGGED = ["KEY THEFT", "EXFILTRATION", "HIDDEN INSTRUCTIONS", "FAKE INSTALLER", "RUG PULL", "SUSPICIOUS"];

export async function searchFeed(env, { verdict, registry, flagged, since, cursor, limit = 30 } = {}) {
  const where = [];
  const args = [];
  if (verdict) { where.push("verdict = ?"); args.push(String(verdict).toUpperCase()); }
  else if (flagged) { where.push(`verdict IN (${FLAGGED.map(() => "?").join(",")})`); args.push(...FLAGGED); }
  if (registry) { where.push("registry = ?"); args.push(registry); }
  if (since) { where.push("created_at > ?"); args.push(Number(since)); }
  if (cursor) { where.push("created_at < ?"); args.push(Number(cursor)); }
  const sql = `SELECT * FROM scans ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT ?`;
  const { results } = await env.DB.prepare(sql).bind(...args, Math.min(100, Number(limit) || 30)).all();
  const items = results.map((r) => {
    const rep = rowToReport(r);
    return { id: rep.id, target: rep.target, registry: rep.registry, name: rep.name, version: rep.version, verdict: rep.verdict, top: rep.findings[0] ? { rule: rep.findings[0].rule, why: rep.findings[0].why, where: `${rep.findings[0].file}:${rep.findings[0].line}` } : null, findings: rep.findings.length, source: rep.source, scannedAt: rep.scannedAt };
  });
  return { items, nextCursor: results.length ? results[results.length - 1].created_at : null };
}

export async function stats(env) {
  const dayAgo = Date.now() - 86400e3;
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).first();
  const [today, flaggedToday, keyTheft, total] = await Promise.all([
    q("SELECT COUNT(*) AS c FROM scans WHERE created_at > ?", dayAgo),
    q(`SELECT COUNT(*) AS c FROM scans WHERE created_at > ? AND verdict IN (${FLAGGED.map(() => "?").join(",")})`, dayAgo, ...FLAGGED),
    q("SELECT COUNT(*) AS c FROM scans WHERE verdict = 'KEY THEFT'"),
    q("SELECT COUNT(*) AS c FROM scans"),
  ]);
  return { scannedToday: today?.c || 0, flaggedToday: flaggedToday?.c || 0, keyTheftAllTime: keyTheft?.c || 0, totalScans: total?.c || 0 };
}
