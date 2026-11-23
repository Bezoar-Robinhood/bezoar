import os from "node:os";
import { runRules } from "./rules.js";

const WALLET_EXTENSIONS = {
  nkbihfbeogaeaoehlefnkodbefgpgknn: "MetaMask",
  bfnaelmomeimhlpmgjnjophhpkkoljpa: "Phantom",
  hnfanknocfeofbddgcijnmhnfnkdnaad: "Coinbase Wallet",
  egjidjbpglichdcondbcbdnbeeppgdph: "Trust Wallet",
  acmacodkjbdgmoleebolmdjonilkdbch: "Rabby",
  bhhhlbepdkbapadjdnnojkbgioiodbic: "Solflare",
};

const WALLET_PATHS = [
  [/\/\.config\/solana\/[^/]+\.json$/, "Solana CLI keypair"],
  [/\/solana\/id\.json$/, "Solana keypair"],
  [/(?:^|\/)[^/]*-?keypair\.json$/, "keypair file"],
  [/\/\.ethereum\/keystore\//, "Ethereum keystore"],
  [/\/keystores?\/utc--/, "Ethereum keystore"],
  [/\/\.foundry\/keystores\//, "Foundry keystore"],
  [/(?:^|\/)wallet\.dat$/, "Bitcoin wallet.dat"],
  [/\/exodus\/exodus\.wallet\//, "Exodus wallet"],
  [/\/electrum\/wallets\//, "Electrum wallet"],
  [/(?:^|\/)(?:mnemonic|seed[-_ ]?phrase|recovery[-_ ]?phrase|secret[-_ ]?phrase)s?(?:\.txt|\.md|\.json)?$/, "seed phrase file"],
];

const SECRET_PATHS = [
  [/(?:^|\/)\.env(?:\.(?!example$|sample$|template$|dist$|defaults?$)[\w.-]+)?$/, ".env secrets"],
  [/\/\.ssh\/id_(?:rsa|ed25519|ecdsa|dsa)$/, "SSH private key"],
  [/\/\.aws\/credentials$/, "AWS credentials"],
  [/(?:^|\/)\.git-credentials$/, "git credentials"],
  [/(?:^|\/)\.netrc$/, ".netrc credentials"],
  [/(?:^|\/)\.pypirc$/, "PyPI credentials"],
  [/\/\.docker\/config\.json$/, "Docker credentials"],
  [/\/\.kube\/config$/, "Kubernetes credentials"],
  [/\/\.config\/gh\/hosts\.yml$/, "GitHub CLI token"],
  [/\/\.wrangler\/config\/default\.toml$/, "Cloudflare token"],
];

const KEY_MATERIAL = [
  [/-----BEGIN (?:RSA |OPENSSH |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/, "a PEM private key"],
  [/\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/, "a 64-byte keypair array"],
  [/(?:private[_ -]?key|secret[_ -]?key|priv)["'\s:=]{1,6}(?:0x)?[a-fA-F0-9]{64}\b/i, "a hex private key"],
  [/(?:private[_ -]?key|secret[_ -]?key|secret)["'\s:=]{1,6}[1-9A-HJ-NP-Za-km-z]{86,90}\b/i, "a base58 secret key"],
];

const SEED_LIKE = /^\s*(?:[a-z]{3,8}\s+){11}[a-z]{3,8}\s*$|^\s*(?:[a-z]{3,8}\s+){23}[a-z]{3,8}\s*$/;
const SECRET_ENV = /PRIVATE_?KEY|SECRET_?KEY|MNEMONIC|SEED_?PHRASE|WALLET_?KEY|SECRET_?PHRASE/i;
const NETWORK_CMD = /\b(?:curl|wget|nc|ncat|netcat|scp|sftp|rsync|ftp|telnet)\b|(?:^|[\s;&|])ssh\s|Invoke-WebRequest|Invoke-RestMethod|\biwr\b|\birm\b|Net\.WebClient|requests\.(?:post|put)|fetch\(/i;
const ENCODE_CMD = /\bbase64\b|\bxxd\b|\bod\s|ToBase64String|certutil\s+-encode/i;
const IGNORE_FILE_EDIT = /\.(?:git|docker|npm|eslint|prettier)ignore\b/;

export function normPath(p, home = os.homedir()) {
  if (!p) return "";
  let s = String(p).trim().replace(/^["']|["']$/g, "");
  s = s.replace(/^~(?=[\\/]|$)/, home).replace(/^\$HOME|^%USERPROFILE%|^\$env:USERPROFILE/i, home);
  return s.replace(/\\/g, "/").toLowerCase();
}

export function classifyPath(p, home) {
  const n = normPath(p, home);
  if (!n || n.endsWith(".pub")) return null;
  for (const [id, name] of Object.entries(WALLET_EXTENSIONS)) {
    if (n.includes(`/${id}`)) return { kind: "wallet", what: `${name} extension storage`, rule: "GUARD-KEY" };
  }
  for (const [re, what] of WALLET_PATHS) if (re.test(n)) return { kind: "wallet", what, rule: "GUARD-KEY" };
  for (const [re, what] of SECRET_PATHS) if (re.test(n)) return { kind: "secret", what, rule: "GUARD-SECRET" };
  if (/(?:^|\/)\.npmrc$/.test(n) && n === normPath(home, home) + "/.npmrc") return { kind: "secret", what: "npm token", rule: "GUARD-SECRET" };
  return null;
}

export function findKeyMaterial(text) {
  if (!text) return null;
  const s = String(text);
  for (const [re, what] of KEY_MATERIAL) if (re.test(s)) return what;
  return null;
}

function secretEnvValues(env) {
  const out = [];
  for (const [k, v] of Object.entries(env || {})) if (SECRET_ENV.test(k) && v && v.length >= 16) out.push([k, v]);
  return out;
}

function isAllowed(p, cfg, home) {
  const n = normPath(p, home);
  return (cfg.allowPaths || []).some((a) => {
    const x = normPath(a, home);
    return n === x || n.startsWith(x.endsWith("/") ? x : x + "/");
  });
}

const allow = () => ({ action: "allow" });
const block = (rule, reason, target) => ({ action: "deny", rule, reason, target });
const ask = (rule, reason, target) => ({ action: "ask", rule, reason, target });

export function checkRead(filePath, { content = "", cfg = {}, home = os.homedir() } = {}) {
  if (isAllowed(filePath, cfg, home)) return allow();
  const c = classifyPath(filePath, home);
  if (c) return block(c.rule, `Reading ${c.what} (${filePath}).`, filePath);
  const km = findKeyMaterial(content);
  if (km) return block("GUARD-KEY", `The file contains ${km}.`, filePath);
  return allow();
}

const PATH_TOKEN = /(?:"[^"]+"|'[^']+'|[^\s"'|;&<>()]+)/g;

export function checkShell(command, { cfg = {}, home = os.homedir(), env = process.env } = {}) {
  const cmd = String(command || "");
  if (!cmd.trim()) return allow();

  const km = findKeyMaterial(cmd);
  if (km) return block("GUARD-LEAK", `The command contains ${km}.`);
  for (const [k, v] of secretEnvValues(env)) {
    if (cmd.includes(v)) return block("GUARD-LEAK", `The command contains the value of ${k}.`);
  }

  const hits = [];
  for (const tok of cmd.match(PATH_TOKEN) || []) {
    if (!/[./\\~]/.test(tok)) continue;
    const c = classifyPath(tok.replace(/^[@=]+/, ""), home);
    if (c && !isAllowed(tok, cfg, home)) hits.push({ ...c, tok });
  }
  if (hits.length && !IGNORE_FILE_EDIT.test(cmd)) {
    const h = hits[0];
    if (NETWORK_CMD.test(cmd) || ENCODE_CMD.test(cmd)) return block("GUARD-LEAK", `The command touches ${h.what} and sends or encodes data.`, h.tok);
    return ask(h.rule, `The command touches ${h.what} (${h.tok}).`, h.tok);
  }

  const { findings } = runRules([{ path: "command.sh", text: cmd }]);
  const crit = findings.find((f) => f.severity === "critical");
  if (crit) return block(crit.rule, crit.why);
  const high = findings.find((f) => f.severity === "high");
  if (high) return ask(high.rule, high.why);
  return allow();
}

function strings(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}

export function checkToolArgs(args, { cfg = {}, home = os.homedir(), env = process.env, tool = "" } = {}) {
  let parsed = args;
  if (typeof args === "string") { try { parsed = JSON.parse(args); } catch { parsed = args; } }
  const all = strings(parsed);
  const joined = all.join("\n");

  const km = findKeyMaterial(joined) || findKeyMaterial(JSON.stringify(parsed ?? ""));
  if (km) return block("GUARD-LEAK", `The arguments for ${tool || "this tool"} contain ${km}.`);
  for (const [k, v] of secretEnvValues(env)) {
    if (joined.includes(v)) return block("GUARD-LEAK", `The arguments for ${tool || "this tool"} contain the value of ${k}.`);
  }
  for (const s of all) {
    if (s.length < 400 && /[./\\~]/.test(s)) {
      const c = classifyPath(s, home);
      if (c && !isAllowed(s, cfg, home)) return block(c.rule, `${tool || "The tool"} wants to read ${c.what} (${s}).`, s);
    }
  }
  if (all.some((s) => SEED_LIKE.test(s))) return ask("GUARD-SEED", `The arguments for ${tool || "this tool"} look like a 12 or 24 word seed phrase.`);
  return allow();
}
