import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "final");
fs.mkdirSync(OUT, { recursive: true });

const C = { ink: "#16181B", grid: "#1D2024", slate: "#2A2D31", amber: "#C9862B", bone: "#F4F1EA", mute: "#8F8A80", signal: "#C8452F" };

const markInner = (fg, bg) => `
  <path d="M196 190 A56 56 0 0 0 84 190 A36 36 0 0 0 120 226 A20 20 0 0 0 140 206" stroke="${fg}" stroke-width="30" stroke-linecap="round" fill="none"/>
  <path d="M316 190 A56 56 0 0 1 428 190 A36 36 0 0 1 392 226 A20 20 0 0 1 372 206" stroke="${fg}" stroke-width="30" stroke-linecap="round" fill="none"/>
  <path d="M184 178 H328 V244 C328 316 298 366 256 400 C214 366 184 316 184 244 Z" fill="${fg}"/>
  <ellipse cx="256" cy="262" rx="30" ry="36" fill="none" stroke="${bg}" stroke-width="6"/>
  <ellipse cx="256" cy="262" rx="20" ry="25" fill="${C.amber}"/>`;

const TIGHT = "54 104 404 312";
const CENTERED = "-14 -10 540 540";

const svg = (w, h, vb, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${body}</svg>`;
const write = (name, s) => fs.writeFileSync(path.join(OUT, name), s);
const png = (s, name, w, h) => sharp(Buffer.from(s)).resize(w, h).png().toFile(path.join(OUT, name));

write("mark-ink.svg", svg(404, 312, TIGHT, markInner(C.ink, C.bone)));
write("mark-bone.svg", svg(404, 312, TIGHT, markInner(C.bone, C.ink)));

const avatarSvg = svg(540, 540, CENTERED, `<rect x="-14" y="-10" width="540" height="540" fill="${C.ink}"/>${markInner(C.bone, C.ink)}`);
write("avatar.svg", avatarSvg);
await png(avatarSvg, "avatar-400.png", 400, 400);
await png(avatarSvg, "logo-512.png", 512, 512);

const icon = (r) => svg(540, 540, CENTERED, `<rect x="-14" y="-10" width="540" height="540" rx="${r}" fill="${C.ink}"/>${markInner(C.bone, C.ink)}`);
write("favicon.svg", icon(110));
await png(icon(110), "favicon-32.png", 32, 32);
await png(icon(110), "favicon-16.png", 16, 16);
await png(icon(0), "apple-touch-icon.png", 180, 180);

const word = (x, y, size, fill, spacing, text, weight = 600) =>
  `<text x="${x}" y="${y}" font-family="Segoe UI Semibold, Segoe UI, Arial" font-weight="${weight}" font-size="${size}" letter-spacing="${spacing}" fill="${fill}">${text}</text>`;
const lockupSvg = (fg, bg, sub) => svg(1240, 320, "0 0 1240 320", `
  ${bg ? `<rect width="1240" height="320" fill="${bg}"/>` : ""}
  <svg x="40" y="50" width="285" height="220" viewBox="${TIGHT}">${markInner(fg, bg || C.bone)}</svg>
  ${word(370, 178, 112, fg, 18, "BEZOAR")}
  ${word(376, 236, 28, sub, 9.5, "SECURITY FOR AI AGENTS", 400)}`);
write("lockup-light.svg", lockupSvg(C.ink, null, "#6B675F"));
write("lockup-dark.svg", lockupSvg(C.bone, C.ink, C.mute));
await png(lockupSvg(C.ink, C.bone, "#6B675F"), "lockup-light.png", 1240, 320);
await png(lockupSvg(C.bone, C.ink, C.mute), "lockup-dark.png", 1240, 320);

const W = 1500, H = 500;
let grid = "";
for (let x = 0; x <= W; x += 50) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${C.grid}" stroke-width="1"/>`;
for (let y = 0; y <= H; y += 50) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`;

const CX = 1010, CW = 440;
const row = (y, name, tag, color, source) => `
  <rect x="${CX}" y="${y}" width="${CW}" height="74" rx="10" fill="${C.slate}"/>
  <rect x="${CX}" y="${y}" width="5" height="74" rx="2" fill="${color}"/>
  <text x="${CX + 26}" y="${y + 32}" font-family="Consolas, 'Cascadia Mono', monospace" font-size="18" fill="${C.bone}">${name}</text>
  <text x="${CX + 26}" y="${y + 57}" font-family="Segoe UI, Arial" font-size="13.5" fill="${C.mute}">${source}</text>
  <rect x="${CX + CW - 18 - tag.length * 9.6 - 22}" y="${y + 14}" width="${tag.length * 9.6 + 22}" height="28" rx="6" fill="none" stroke="${color}" stroke-width="1.6"/>
  <text x="${CX + CW - 18 - 11}" y="${y + 33}" text-anchor="end" font-family="Segoe UI Semibold, Segoe UI, Arial" font-weight="600" font-size="13" letter-spacing="1.4" fill="${color}">${tag}</text>`;

const header = svg(W, H, `0 0 ${W} ${H}`, `
  <rect width="${W}" height="${H}" fill="${C.ink}"/>
  ${grid}
  <svg x="-40" y="70" width="440" height="340" viewBox="${TIGHT}" opacity="0.05">${markInner(C.bone, C.ink)}</svg>
  ${word(420, 128, 15, C.amber, 5, "BEZOAR · SECURITY FOR AI AGENTS")}
  ${word(418, 192, 44, C.bone, -0.5, "Check every skill")}
  ${word(418, 246, 44, C.bone, -0.5, "before your agent installs it.")}
  <text x="420" y="296" font-family="Segoe UI, Arial" font-size="19" fill="${C.mute}">Skills, MCP servers and npm packages, scanned for</text>
  <text x="420" y="323" font-family="Segoe UI, Arial" font-size="19" fill="${C.mute}">hidden instructions and private key theft.</text>
  ${word(420, 384, 17, C.bone, 2, "getbezoar.com")}
  ${row(104, "latinum-wallet-mcp", "KEY THEFT", C.signal, "PyPI 0.0.34 · exfiltrates Solana private key")}
  ${row(190, "gadgethumans-mcp", "KEY THEFT", C.signal, "npm 1.0.9 · sends WALLET_PRIVATE_KEY in a header")}
  ${row(276, "openclaw skill", "FAKE INSTALLER", C.amber, "ClawHub · fake OpenClawCLI prerequisite → stealer")}
  <text x="${CX + CW}" y="384" text-anchor="end" font-family="Segoe UI, Arial" font-size="12.5" fill="#5E5A53">documented 2026 cases · GHSA-7fjp-p82r-q2c2 · Knostic · Trend Micro</text>`);
write("x-header.svg", header);
await png(header, "x-header-1500x500.png", W, H);

const preview = svg(W, 760, `0 0 ${W} 760`, `
  <rect width="${W}" height="760" fill="#E4DED2"/>
  <svg x="0" y="0" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${header.replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>
  <rect x="0" y="0" width="${W}" height="60" fill="#E4DED2" opacity="0.55"/>
  <rect x="0" y="440" width="${W}" height="60" fill="#E4DED2" opacity="0.55"/>
  <circle cx="190" cy="500" r="142" fill="#E4DED2"/>
  <svg x="56" y="366" width="268" height="268" viewBox="${CENTERED}"><clipPath id="c"><circle cx="256" cy="260" r="262"/></clipPath><g clip-path="url(#c)"><rect x="-14" y="-10" width="540" height="540" fill="${C.ink}"/>${markInner(C.bone, C.ink)}</g></svg>
  <text x="360" y="560" font-family="Segoe UI Semibold, Segoe UI, Arial" font-weight="600" font-size="30" fill="${C.ink}">Bezoar</text>
  <text x="360" y="594" font-family="Segoe UI, Arial" font-size="20" fill="#6B675F">@getbezoar</text>
  <text x="${W - 30}" y="740" text-anchor="end" font-family="Segoe UI, Arial" font-size="15" fill="#6B675F">полупрозрачные полосы сверху и снизу: зона, которую X обрезает на телефонах</text>`);
await png(preview, "x-profile-preview.png", W, 760);

console.log(fs.readdirSync(OUT).join("\n"));
