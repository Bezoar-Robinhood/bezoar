// Stateless Streamable HTTP MCP endpoint (JSON responses).
import { scanTarget, getReport } from "./scan.js";
import { runRules, decideVerdict } from "./rules.js";
import { searchFeed } from "./feed.js";

const TOOLS = [
  { name: "scan_target", description: "Scan an AI agent skill, MCP server, npm/PyPI package, GitHub repo or pasted SKILL.md text for key theft, exfiltration, hidden instructions and fake installers. Returns a verdict with evidence lines.", inputSchema: { type: "object", properties: { target: { type: "string", description: "npm:name, pypi:name, a GitHub URL, a skill URL, an MCP server URL or SKILL.md text" } }, required: ["target"] } },
  { name: "get_report", description: "Fetch a Bezoar report by id.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "search_feed", description: "Search recent Bezoar scans. Filter by verdict (e.g. KEY THEFT) or registry.", inputSchema: { type: "object", properties: { verdict: { type: "string" }, registry: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } } } },
  { name: "check_install_command", description: "Check a shell install command (e.g. from a README or a skill) before running it. Flags curl|sh from unknown hosts, decoded payloads, password prompts.", inputSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
];

const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
const text = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });

function compact(rep, site) {
  if (!rep) return null;
  return { verdict: rep.verdict, target: rep.target, report: `${site}/scan/${rep.id}`, rulesChecked: rep.rulesChecked, incomplete: rep.incomplete, findings: rep.findings.slice(0, 15).map((f) => ({ rule: f.rule, severity: f.severity, where: `${f.file}:${f.line}`, why: f.why })) };
}

async function handle(env, msg) {
  const site = env.SITE_URL || "https://getbezoar.com";
  const { id, method, params } = msg;
  if (method === "initialize") return ok(id, { protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "bezoar", version: "0.1.0" }, instructions: "Use scan_target before installing any skill, MCP server or package. A NO FINDINGS result is not a guarantee." });
  if (method === "notifications/initialized" || method?.startsWith("notifications/")) return null;
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: TOOLS });
  if (method === "tools/call") {
    const a = params?.arguments || {};
    switch (params?.name) {
      case "scan_target": {
        const rep = await scanTarget(env, a.target, { source: "mcp" });
        if (rep.error) return ok(id, { ...text(rep.error), isError: true });
        return ok(id, text(compact(rep, site)));
      }
      case "get_report": {
        const rep = await getReport(env, String(a.id || ""));
        return ok(id, rep ? text(compact(rep, site)) : { ...text("Report not found."), isError: true });
      }
      case "search_feed": {
        const rows = await searchFeed(env, { verdict: a.verdict, registry: a.registry, limit: Math.min(50, a.limit || 20) });
        return ok(id, text(rows.items.map((r) => ({ verdict: r.verdict, target: r.target, report: `${site}/scan/${r.id}`, at: r.scannedAt }))));
      }
      case "check_install_command": {
        const out = runRules([{ path: "command.sh", text: String(a.command || "").slice(0, 20000), kind: "skill" }]);
        return ok(id, text({ verdict: decideVerdict(out.findings), findings: out.findings.map((f) => ({ rule: f.rule, severity: f.severity, why: f.why })) }));
      }
    }
    return err(id, -32602, `Unknown tool ${params?.name}`);
  }
  return err(id, -32601, `Method not found: ${method}`);
}

export async function mcpFetch(req, env) {
  if (req.method === "GET") return new Response("Bezoar MCP endpoint. POST JSON-RPC 2.0 here (Streamable HTTP).", { status: 405, headers: { allow: "POST" } });
  if (req.method !== "POST") return new Response(null, { status: 405 });
  let body;
  try { body = await req.json(); } catch { return Response.json(err(null, -32700, "Parse error"), { status: 400 }); }
  const batch = Array.isArray(body) ? body : [body];
  const out = (await Promise.all(batch.map((m) => handle(env, m)))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? out : out[0]);
}
