// Minimal tar / gzip / zip readers built on DecompressionStream (available in Workers and Node 18+).
import { isScannable } from "./rules.js";

export const LIMITS = { maxArchiveBytes: 15_000_000, maxUnpackedBytes: 60_000_000, maxFiles: 4000, maxFileBytes: 1_000_000 };

const dec = new TextDecoder("utf-8", { fatal: false });

async function inflate(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > LIMITS.maxUnpackedBytes) {
      await reader.cancel();
      throw new Error(`unpacked size exceeds ${LIMITS.maxUnpackedBytes / 1e6} MB (possible archive bomb)`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

const str = (b, s, l) => {
  let e = s;
  while (e < s + l && b[e] !== 0) e++;
  return dec.decode(b.subarray(s, e));
};

export async function readTarGz(bytes, { stripFirst = true } = {}) {
  const tar = await inflate(bytes, "gzip");
  const files = [];
  const notes = [];
  let off = 0, longName = null, paxPath = null, count = 0;
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    let name = str(h, 0, 100);
    const prefix = str(h, 345, 155);
    if (prefix) name = `${prefix}/${name}`;
    const size = parseInt(str(h, 124, 12).trim() || "0", 8) || 0;
    const type = String.fromCharCode(h[156] || 48);
    const body = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") { longName = str(body, 0, body.length); continue; }
    if (type === "x") { const m = dec.decode(body).match(/\d+ path=([^\n]+)\n/); paxPath = m ? m[1] : null; continue; }
    if (type === "g") continue;
    if (longName) { name = longName; longName = null; }
    if (paxPath) { name = paxPath; paxPath = null; }
    if (type !== "0" && type !== "\u0000" && type !== "7") continue;
    if (++count > LIMITS.maxFiles) { notes.push(`stopped after ${LIMITS.maxFiles} files`); break; }
    const path = stripFirst ? name.split("/").slice(1).join("/") || name : name;
    if (!isScannable(path, size)) continue;
    if (size > LIMITS.maxFileBytes) { notes.push(`skipped large file ${path}`); continue; }
    files.push({ path, text: dec.decode(body) });
  }
  return { files, notes };
}

export async function readZip(bytes) {
  const files = [];
  const notes = [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip archive");
  const entries = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (entries > LIMITS.maxFiles) notes.push(`archive has ${entries} entries, reading first ${LIMITS.maxFiles}`);
  let unpacked = 0;
  for (let i = 0; i < Math.min(entries, LIMITS.maxFiles); i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (name.endsWith("/") || !isScannable(name, usize)) continue;
    if (usize > LIMITS.maxFileBytes) { notes.push(`skipped large file ${name}`); continue; }
    unpacked += usize;
    if (unpacked > LIMITS.maxUnpackedBytes) { notes.push("unpacked size limit reached"); break; }
    const lnlen = dv.getUint16(local + 26, true), lelen = dv.getUint16(local + 28, true);
    const data = bytes.subarray(local + 30 + lnlen + lelen, local + 30 + lnlen + lelen + csize);
    let raw;
    if (method === 0) raw = data;
    else if (method === 8) raw = await inflate(data, "deflate-raw");
    else { notes.push(`unsupported compression in ${name}`); continue; }
    files.push({ path: name, text: dec.decode(raw) });
  }
  return { files, notes };
}

export async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
