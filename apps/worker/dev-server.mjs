#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./src/index.js";
import { sqliteD1 } from "./d1-sqlite.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(HERE, "..", "site");
const PORT = Number(process.env.PORT || 8797);
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };

const env = {
  DB: sqliteD1(path.join(HERE, ".local-bezoar.sqlite")),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  SITE_URL: `http://localhost:${PORT}`,
  ADMIN_KEY: "dev-admin",
  ASSETS: {
    async fetch(req) {
      let rel = decodeURIComponent(new URL(req.url).pathname);
      let file = path.resolve(SITE_DIR, "." + rel);
      if (file.startsWith(SITE_DIR) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      else if (!path.extname(file) && fs.existsSync(file + ".html")) file += ".html";
      if (!file.startsWith(SITE_DIR) || !fs.existsSync(file)) {
        return new Response(fs.readFileSync(path.join(SITE_DIR, "404.html")), { status: 404, headers: { "content-type": MIME[".html"] } });
      }
      return new Response(fs.readFileSync(file), { headers: { "content-type": MIME[path.extname(file)] || "application/octet-stream" } });
    },
  },
};

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const r = await worker.fetch(new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }), env, { waitUntil() {} });
  res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
  if (r.body) for await (const chunk of r.body) res.write(chunk);
  res.end();
}).listen(PORT, () => console.log(`[bezoar] http://localhost:${PORT}`));

if (process.argv.includes("--crawl")) {
  const { crawl } = await import("./src/crawler.js");
  console.log("[bezoar] crawl:", JSON.stringify(await crawl(env)));
}
