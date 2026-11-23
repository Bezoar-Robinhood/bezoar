// Resolve a user target into a list of text files plus metadata. Never throws for user errors:
// returns { error } so the scanner can answer with a clear message or INCOMPLETE.
import { readTarGz, readZip, sha256Hex, LIMITS } from "./archive.js";

const UA = { "user-agent": "bezoar-scanner/0.1 (+https://getbezoar.com)" };
const TIMEOUT = 12000;

async function get(url, opts = {}) {
  return fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeout || TIMEOUT) });
}

async function getBytes(url) {
  const r = await get(url);
  if (!r.ok) throw new Error(`download failed (${r.status})`);
  const len = Number(r.headers.get("content-length") || 0);
  if (len > LIMITS.maxArchiveBytes) throw new Error(`archive is ${(len / 1e6).toFixed(1)} MB, limit is ${LIMITS.maxArchiveBytes / 1e6} MB`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > LIMITS.maxArchiveBytes) throw new Error(`archive exceeds ${LIMITS.maxArchiveBytes / 1e6} MB`);
  return buf;
}

export function classify(input) {
  const raw = String(input || "").trim();
  if (!raw) return { kind: "empty" };
  if (raw.length > 300 || /\n/.test(raw) || (/\s/.test(raw) && !/^(npm|pypi):/i.test(raw) && !/^https?:\/\//i.test(raw))) return { kind: "text", text: raw.slice(0, 200_000) };
  let m;
  if ((m = raw.match(/^npm:(.+)$/i))) return { kind: "npm", ...splitVer(m[1].trim()) };
  if ((m = raw.match(/^pypi:(.+)$/i))) return { kind: "pypi", ...splitPyVer(m[1].trim()) };
  if (/^https?:\/\//i.test(raw)) {
    let u;
    try { u = new URL(raw); } catch { return { kind: "invalid", reason: "That URL could not be parsed." }; }
    const host = u.hostname.replace(/^www\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    if (host === "npmjs.com" && parts[0] === "package") {
      const scoped = parts[1]?.startsWith("@");
      const name = scoped ? `${parts[1]}/${parts[2]}` : parts[1];
      const vi = parts.indexOf("v");
      return { kind: "npm", name: decodeURIComponent(name), version: vi > 0 ? parts[vi + 1] : null };
    }
    if (host === "pypi.org" && parts[0] === "project") return { kind: "pypi", name: parts[1], version: parts[2] || null };
    if (host === "github.com" && parts.length >= 2) {
      if (parts[2] === "blob" && parts.length > 4) return { kind: "rawfile", url: `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(3).join("/")}`, label: raw };
      return { kind: "github", owner: parts[0], repo: parts[1].replace(/\.git$/, ""), ref: parts[2] === "tree" ? parts[3] : null, sub: parts[2] === "tree" ? parts.slice(4).join("/") : "" };
    }
    if (host === "raw.githubusercontent.com" || /\.(md|txt|json|ya?ml|sh|py|js|ts)$/i.test(u.pathname)) return { kind: "rawfile", url: raw, label: raw };
    return { kind: "url", url: raw };
  }
  if (/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.+-]+)?$/i.test(raw)) return { kind: "bare", ...splitVer(raw) };
  return { kind: "invalid", reason: "Paste an npm or PyPI package name, a GitHub URL, a skill URL, an MCP server URL or the text of a SKILL.md." };
}

function splitVer(s) {
  const at = s.lastIndexOf("@");
  if (at > 0) return { name: s.slice(0, at), version: s.slice(at + 1) || null };
  return { name: s, version: null };
}
function splitPyVer(s) {
  const m = s.match(/^([\w.-]+)(?:==([\w.+-]+))?$/);
  return m ? { name: m[1], version: m[2] || null } : { name: s, version: null };
}

async function fetchNpm({ name, version }) {
  const r = await get(`https://registry.npmjs.org/${name.replace("/", "%2F")}`);
  if (r.status === 404) return { error: `npm package "${name}" does not exist (or was removed by npm).`, notFound: true };
  if (!r.ok) return { error: `npm registry answered ${r.status}.`, incomplete: true };
  const meta = await r.json();
  const ver = version || meta["dist-tags"]?.latest;
  const v = meta.versions?.[ver];
  if (!v) return { error: `npm package "${name}" has no version ${ver}.`, notFound: true };
  const bytes = await getBytes(v.dist.tarball);
  const { files, notes } = await readTarGz(bytes);
  return {
    files, notes, sha256: await sha256Hex(bytes),
    meta: { registry: "npm", name, version: ver, url: `https://www.npmjs.com/package/${name}/v/${ver}`, published: meta.time?.[ver] || null, sizeBytes: bytes.length, security: /0\.0\.1-security/.test(ver) },
    packageName: name,
  };
}

async function fetchPypi({ name, version }) {
  const r = await get(`https://pypi.org/pypi/${encodeURIComponent(name)}/${version ? encodeURIComponent(version) + "/" : ""}json`);
  if (r.status === 404) return { error: `PyPI project "${name}"${version ? ` ${version}` : ""} does not exist (or was removed).`, notFound: true };
  if (!r.ok) return { error: `PyPI answered ${r.status}.`, incomplete: true };
  const meta = await r.json();
  const urls = meta.urls || [];
  const pick = urls.find((u) => u.packagetype === "sdist" && /\.tar\.gz$/.test(u.filename)) || urls.find((u) => u.packagetype === "bdist_wheel") || urls.find((u) => /\.zip$/.test(u.filename));
  if (!pick) return { error: `PyPI project "${name}" has no downloadable files for this version.`, incomplete: true };
  const bytes = await getBytes(pick.url);
  const { files, notes } = /\.tar\.gz$/.test(pick.filename) ? await readTarGz(bytes) : await readZip(bytes);
  return {
    files, notes, sha256: await sha256Hex(bytes),
    meta: { registry: "PyPI", name: meta.info.name, version: meta.info.version, url: `https://pypi.org/project/${meta.info.name}/${meta.info.version}/`, published: pick.upload_time_iso_8601 || null, sizeBytes: bytes.length, file: pick.filename },
    packageName: meta.info.name,
  };
}

async function fetchGithub({ owner, repo, ref, sub }) {
  const url = `https://codeload.github.com/${owner}/${repo}/tar.gz/${ref || "HEAD"}`;
  let bytes;
  try { bytes = await getBytes(url); }
  catch (e) {
    if (/404/.test(e.message)) return { error: `GitHub repo ${owner}/${repo} is private, missing or has no ref "${ref || "HEAD"}".`, notFound: true };
    return { error: `GitHub download failed: ${e.message}`, incomplete: true };
  }
  let { files, notes } = await readTarGz(bytes);
  if (sub) files = files.filter((f) => f.path.startsWith(sub));
  return {
    files, notes, sha256: await sha256Hex(bytes),
    meta: { registry: "GitHub", name: `${owner}/${repo}${sub ? "/" + sub : ""}`, version: ref || "HEAD", url: `https://github.com/${owner}/${repo}${ref ? "/tree/" + ref : ""}${sub ? "/" + sub : ""}`, sizeBytes: bytes.length },
  };
}

async function fetchRawFile({ url, label }) {
  const r = await get(url);
  if (!r.ok) return { error: `Could not fetch the file (${r.status}).`, notFound: r.status === 404, incomplete: r.status !== 404 };
  const text = (await r.text()).slice(0, 1_000_000);
  const bytes = new TextEncoder().encode(text);
  const path = new URL(url).pathname.split("/").pop() || "file.txt";
  return { files: [{ path, text, kind: /SKILL\.md$/i.test(path) ? "skill" : undefined }], notes: [], sha256: await sha256Hex(bytes), meta: { registry: "File", name: path, version: null, url: label || url, sizeBytes: bytes.length } };
}

async function mcpRpc(url, body, sessionId) {
  const r = await get(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(sessionId ? { "mcp-session-id": sessionId } : {}) },
    body: JSON.stringify(body),
    timeout: 8000,
  });
  const ct = r.headers.get("content-type") || "";
  const text = await r.text();
  let json = null;
  if (ct.includes("text/event-stream")) {
    const line = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).find((l) => l.includes('"jsonrpc"'));
    try { json = JSON.parse(line); } catch {}
  } else {
    try { json = JSON.parse(text); } catch {}
  }
  return { ok: r.ok, json, sessionId: r.headers.get("mcp-session-id") || sessionId, status: r.status, ct, text };
}

async function fetchUrl({ url }) {
  try {
    const init = await mcpRpc(url, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bezoar-scanner", version: "0.1" } } });
    if (init.json?.jsonrpc === "2.0" && init.json.result) {
      const sid = init.sessionId;
      await mcpRpc(url, { jsonrpc: "2.0", method: "notifications/initialized" }, sid).catch(() => {});
      const tools = await mcpRpc(url, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, sid);
      const prompts = await mcpRpc(url, { jsonrpc: "2.0", id: 3, method: "prompts/list", params: {} }, sid).catch(() => null);
      const list = tools.json?.result?.tools || [];
      const files = [];
      const instr = init.json.result.instructions;
      if (instr) files.push({ path: "server/instructions.txt", text: instr, kind: "tool" });
      for (const t of list) files.push({ path: `tools/${t.name}.txt`, text: `${t.name}\n${t.description || ""}\n${JSON.stringify(t.inputSchema || {}, null, 1)}`, kind: "tool" });
      for (const p of prompts?.json?.result?.prompts || []) files.push({ path: `prompts/${p.name}.txt`, text: `${p.name}\n${p.description || ""}`, kind: "tool" });
      const canonical = JSON.stringify(list.map((t) => ({ n: t.name, d: t.description || "", s: t.inputSchema || {} })));
      const bytes = new TextEncoder().encode(canonical);
      const notes = tools.json ? [] : [`tools/list failed (${tools.status})`];
      return {
        files, notes, sha256: await sha256Hex(bytes), toolsHash: await sha256Hex(bytes), toolsCanonical: canonical,
        meta: { registry: "MCP server", name: init.json.result.serverInfo?.name || new URL(url).host, version: init.json.result.serverInfo?.version || null, url, tools: list.length },
        incompleteReason: tools.json ? null : "tools/list did not answer",
      };
    }
  } catch {}
  const r = await get(url).catch((e) => ({ ok: false, status: 0, err: e }));
  if (!r.ok) return { error: `Could not reach ${url} (${r.status || "timeout"}).`, incomplete: true };
  const ct = r.headers.get("content-type") || "";
  let text = (await r.text()).slice(0, 1_000_000);
  const isHtml = ct.includes("html");
  if (isHtml) {
    text = text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<(?!!--)[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ");
  }
  const bytes = new TextEncoder().encode(text);
  const thin = isHtml && text.replace(/\s+/g, "").length < 400;
  return {
    files: [{ path: isHtml ? "page.md" : new URL(url).pathname.split("/").pop() || "file.txt", text, kind: "skill" }],
    notes: thin ? ["The page renders its content with JavaScript, so little text was readable. Paste the raw SKILL.md or the GitHub link instead."] : [],
    sha256: await sha256Hex(bytes),
    meta: { registry: "Web page", name: new URL(url).host + new URL(url).pathname, version: null, url, sizeBytes: bytes.length },
    incompleteReason: thin ? "page content is rendered by JavaScript" : null,
  };
}

export async function resolveTarget(input) {
  const t = classify(input);
  try {
    switch (t.kind) {
      case "empty": return { error: "Paste something to scan.", userError: true };
      case "invalid": return { error: t.reason, userError: true };
      case "text": {
        const bytes = new TextEncoder().encode(t.text);
        return { files: [{ path: "pasted/SKILL.md", text: t.text, kind: "skill" }], notes: [], sha256: await sha256Hex(bytes), meta: { registry: "Pasted text", name: t.text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 60) || "pasted text", version: null, url: null, sizeBytes: bytes.length }, target: "pasted text" };
      }
      case "npm": return { ...(await fetchNpm(t)), target: `npm:${t.name}${t.version ? "@" + t.version : ""}` };
      case "pypi": return { ...(await fetchPypi(t)), target: `pypi:${t.name}${t.version ? "==" + t.version : ""}` };
      case "github": return { ...(await fetchGithub(t)), target: `https://github.com/${t.owner}/${t.repo}${t.ref ? "/tree/" + t.ref : ""}${t.sub ? "/" + t.sub : ""}` };
      case "rawfile": return { ...(await fetchRawFile(t)), target: t.url };
      case "url": return { ...(await fetchUrl(t)), target: t.url };
      case "bare": {
        const npm = await fetchNpm(t);
        if (!npm.notFound) return { ...npm, target: `npm:${t.name}${t.version ? "@" + t.version : ""}` };
        const py = await fetchPypi(t);
        if (!py.notFound) return { ...py, target: `pypi:${t.name}` };
        return { error: `"${t.name}" was not found on npm or PyPI. It may have been removed after a malware report.`, notFound: true, target: t.name };
      }
    }
  } catch (e) {
    return { error: `Scan could not finish: ${e.message}`, incomplete: true, target: String(input).slice(0, 200) };
  }
  return { error: "Unsupported input.", userError: true };
}
