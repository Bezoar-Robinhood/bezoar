#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { pages } from "./pages.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "..", "site");
const BRAND = path.resolve(HERE, "..", "..", "brand", "final");
const SITE = "https://getbezoar.com";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(HERE, "static"), OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, "brand"), { recursive: true });
for (const f of ["mark-ink.svg", "mark-bone.svg", "lockup-light.svg", "lockup-dark.svg", "avatar-400.png", "logo-512.png"]) fs.copyFileSync(path.join(BRAND, f), path.join(OUT, "brand", f));
for (const f of ["favicon.svg", "favicon-32.png", "favicon-16.png", "apple-touch-icon.png"]) fs.copyFileSync(path.join(BRAND, f), path.join(OUT, f));

const NAV = [["/", "Scan"], ["/feed/", "Feed"], ["/guard/", "Guard"], ["/registry/", "Registry"], ["/docs/", "Docs"], ["/token/", "Token"], ["/status/", "Status"]];

function layout(p) {
  const url = SITE + p.route;
  const nav = NAV.map(([href, label]) => `<li><a href="${href}"${(href === "/" ? p.route === "/" : p.route.startsWith(href)) ? ' aria-current="page"' : ""}>${label}</a></li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title}</title>
<meta name="description" content="${p.desc}">
<meta name="bezoar:ca" content="{CA}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/ibm-plex-sans-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/ibm-plex-sans-600.woff2" as="font" type="font/woff2" crossorigin>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Bezoar">
<meta property="og:title" content="${p.title}">
<meta property="og:description" content="${p.desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#16181B">
<link rel="stylesheet" href="/css/site.css">
<script src="/config.js"></script>
<script src="/js/common.js" defer></script>
${(p.scripts || []).map((s) => `<script src="/js/${s}.js" defer></script>`).join("\n")}
</head>
<body>
<header class="nav">
  <div class="wrap">
    <a class="brand" href="/" aria-label="Bezoar home"><img src="/brand/mark-bone.svg" alt="" width="38" height="29"><span>BEZOAR</span></a>
    <button class="menu-btn" aria-expanded="false" aria-label="Menu">Menu</button>
    <ul>${nav}</ul>
  </div>
</header>
<main>
${p.body}
</main>
<footer>
  <div class="wrap">
    <div class="cols">
      <div>
        <img class="lockup" src="/brand/lockup-dark.svg" alt="Bezoar — security for AI agents" width="220" height="57">
        <p>Checks skills, MCP servers and packages before your agent installs them. No wallet needed to scan.</p>
      </div>
      <div><h4>Product</h4><a href="/">Scan</a><a href="/feed/">Feed</a><a href="/guard/">Guard</a><a href="/canary/">Canary wallets</a><a href="/registry/">Registry</a></div>
      <div><h4>Developers</h4><a href="/docs/">Docs</a><a href="/docs/#api">API</a><a href="/docs/#mcp">MCP</a><a href="/llms.txt">llms.txt</a><a href="/feed.xml">RSS</a></div>
      <div><h4>Project</h4><a href="/about/">About</a><a href="/status/">Status</a><a href="/token/">Token</a><a data-link="x" href="#" rel="noopener">X</a><a data-link="github" href="#" rel="noopener">GitHub</a><a data-link="npm" href="#" rel="noopener">npm</a></div>
    </div>
    <div class="base">
      <span>© 2026 Bezoar. A clean scan is not a guarantee.</span>
      <span data-needs-ca class="hidden">CA <span class="ca-foot" data-ca>{CA}</span></span>
    </div>
  </div>
</footer>
</body>
</html>`;
}

for (const p of pages) {
  const dir = p.route === "/404" ? OUT : path.join(OUT, p.route);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p.route === "/404" ? path.join(OUT, "404.html") : path.join(dir, "index.html"), layout(p));
}

fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.filter((p) => !["/404", "/scan/"].includes(p.route)).map((p) => `<url><loc>${SITE}${p.route}</loc></url>`).join("")}</urlset>\n`);

const mark = fs.readFileSync(path.join(BRAND, "mark-bone.svg"), "utf8").replace(/^<svg[^>]*>|<\/svg>$/g, "");
let grid = "";
for (let x = 0; x <= 1200; x += 50) grid += `<line x1="${x}" y1="0" x2="${x}" y2="630" stroke="#1D2024"/>`;
for (let y = 0; y <= 630; y += 50) grid += `<line x1="0" y1="${y}" x2="1200" y2="${y}" stroke="#1D2024"/>`;
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#16181B"/>${grid}
<svg x="80" y="90" width="230" height="178" viewBox="54 104 404 312">${mark}</svg>
<text x="80" y="370" font-family="Segoe UI Semibold, Segoe UI, Arial" font-weight="600" font-size="62" fill="#F4F1EA">Check every skill</text>
<text x="80" y="446" font-family="Segoe UI Semibold, Segoe UI, Arial" font-weight="600" font-size="62" fill="#F4F1EA">before your agent installs it.</text>
<text x="82" y="520" font-family="Segoe UI, Arial" font-size="26" fill="#8F8A80">Skills · MCP servers · npm and PyPI packages · GitHub repos</text>
<text x="82" y="574" font-family="Segoe UI Semibold, Segoe UI, Arial" font-weight="600" font-size="22" letter-spacing="6" fill="#C9862B">GETBEZOAR.COM</text></svg>`;
await sharp(Buffer.from(og)).png().toFile(path.join(OUT, "og-image.png"));

console.log(`built ${pages.length} pages into ${OUT}`);
