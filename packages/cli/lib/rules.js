// Deterministic rule engine. Input: [{ path, text }]. Output: findings with evidence lines.
// Every finding carries rule id, severity, file, line, a redacted snippet and a plain-English line.

export const VERDICTS = ["KEY THEFT", "EXFILTRATION", "HIDDEN INSTRUCTIONS", "FAKE INSTALLER", "RUG PULL", "SUSPICIOUS", "INCOMPLETE", "NO FINDINGS"];
const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

export const RULES = [
  { id: "KEY-001", group: "KEY THEFT", severity: "critical", title: "Secret sent over the network", desc: "A private key, mnemonic or secret env var is placed into a request header, body, URL or socket payload.", fp: "Rare. A signing proxy you run yourself may do this on purpose." },
  { id: "KEY-002", group: "KEY THEFT", severity: "critical", title: "Browser wallet data plus network", desc: "Reads browser wallet extension storage (MetaMask, Phantom and others) or wallet.dat in a file that also makes network calls.", fp: "Wallet backup tools you wrote yourself." },
  { id: "KEY-003", group: "SUSPICIOUS", severity: "medium", title: "Local keypair read plus network", desc: "Reads a local Solana keypair or Ethereum keystore in a file that also makes network calls. Often legitimate signing, worth checking.", fp: "Common in honest wallet tools that sign locally and call an RPC." },
  { id: "KEY-004", group: "SUSPICIOUS", severity: "medium", title: "Credential files read", desc: "Reads SSH keys, cloud credentials, .npmrc or git credentials.", fp: "Deployment tools that need these on purpose." },
  { id: "NET-001", group: "EXFILTRATION", severity: "high", title: "Known exfiltration endpoint", desc: "Sends data to a Discord webhook, Telegram bot API, paste site, request bin, tunnel or a raw IP address.", fp: "Notification tools that post to your own webhook." },
  { id: "HID-001", group: "HIDDEN INSTRUCTIONS", severity: "high", title: "Invisible Unicode tag text", desc: "Unicode tag characters (U+E0000 block) encode text the user cannot see but the model reads.", fp: "Almost never legitimate in source or docs." },
  { id: "HID-002", group: "SUSPICIOUS", severity: "low", title: "Zero-width or bidi characters", desc: "Zero-width spaces or bidirectional overrides that can hide or reorder text.", fp: "Some i18n strings and emoji sequences." },
  { id: "HID-003", group: "HIDDEN INSTRUCTIONS", severity: "high", title: "Instructions aimed at the model", desc: "Text that tells the agent to ignore prior instructions, hide actions from the user or always call a tool first.", fp: "Security docs and test fixtures that quote attacks." },
  { id: "HID-004", group: "HIDDEN INSTRUCTIONS", severity: "medium", title: "Hidden comment for the agent", desc: "An HTML comment in markdown that addresses the AI or agent. It is invisible when rendered.", fp: "Editor notes that mention AI tooling." },
  { id: "HID-005", group: "HIDDEN INSTRUCTIONS", severity: "high", title: "Encoded payload with instructions", desc: "A base64 blob that decodes to model-directed text or a script.", fp: "Embedded test vectors." },
  { id: "INS-001", group: "FAKE INSTALLER", severity: "high", title: "Download piped into a shell", desc: "curl or wget output piped straight into sh/bash from a host that is not a well-known installer.", fp: "Self-hosted installers of real products." },
  { id: "INS-002", group: "FAKE INSTALLER", severity: "high", title: "Fake prerequisite download", desc: "Says a tool must be installed first and links a binary, archive or throwaway host (vercel.app, netlify, file lockers, shorteners).", fp: "Projects that genuinely ship desktop apps from such hosts." },
  { id: "INS-003", group: "FAKE INSTALLER", severity: "high", title: "Password prompt", desc: "Asks for the system password via osascript dialogs or sudo -S.", fp: "System installers." },
  { id: "INS-004", group: "FAKE INSTALLER", severity: "critical", title: "Decoded payload executed", desc: "base64 -d output piped into a shell.", fp: "None known." },
  { id: "EXE-001", group: "SUSPICIOUS", severity: "low", title: "Install-time script", desc: "package.json runs preinstall/install/postinstall.", fp: "Native modules that compile on install." },
  { id: "EXE-002", group: "SUSPICIOUS", severity: "medium", title: "Install-time network or shell", desc: "An install script or setup.py fetches from the network or runs shell commands.", fp: "Binary downloaders for real tools." },
  { id: "OBF-001", group: "SUSPICIOUS", severity: "medium", title: "Decode-and-execute", desc: "eval / new Function / exec over base64, char codes or zlib output.", fp: "Bundlers and some licensing code." },
  { id: "TYP-001", group: "SUSPICIOUS", severity: "medium", title: "Look-alike package name", desc: "The name is one or two characters away from a popular MCP or crypto package.", fp: "Forks with honest names." },
  { id: "SHD-001", group: "HIDDEN INSTRUCTIONS", severity: "medium", title: "Tool shadowing", desc: "A tool description tries to change how the agent uses other tools or servers.", fp: "Orchestrator tools documenting their order." },
  { id: "RUG-001", group: "RUG PULL", severity: "high", title: "Tool definitions changed", desc: "The MCP server's tools differ from the pinned hash of an earlier scan.", fp: "Normal upgrades. Review the diff." },
];
export const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

const TEXT_EXT = /\.(m?[jt]sx?|cjs|py|sh|bash|zsh|ps1|bat|cmd|rb|go|rs|json|ya?ml|toml|md|mdx|txt|html?|cfg|ini|env|lock)$|(^|\/)(Dockerfile|Makefile|SKILL|README)[^/]*$/i;
const SKIP_PATH = /(^|\/)(node_modules|\.git|test|tests|__tests__|fixtures?|examples?|docs?)\//i;
const AGENT_COMMENT = /(?<![\w-])(?:ai|assistant|llm|model|agent|claude|cursor|codex|openclaw)s?(?![\w-])[\s\S]{0,80}?\b(?:must|should|always|never|ignore|do\s+not|don'?t|read|send|upload|run|execute|fetch|call|include|reply)\b|\byou\s+must\b|\bignore\s+(?:all|any|previous|prior)\b|\bsystem\s+prompt\b/i;
const CRED_READ = /\breadFile(?:Sync)?\s*\(|\bopen\s*\(|\bfs\.\w+\(|\bPath\(|expanduser|homedir\(|(?:^|[\s;&|])cat\s/;
const MINIFIED = /(\.min\.js|\.map)$|(^|\/)(dist|build)\//i;
const CODE_FILE = /\.(m?[jt]sx?|cjs|py|rb|go|rs)$/i;
const EXEC_CTX = /\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|system|popen|check_output|check_call|call|run|Popen)\s*\(|child_process|subprocess|os\.system|shell\s*[:=]\s*(?:true|True)/;
const DETECTOR_LINE = /^\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*\/.*\/[dgimsuy]*[;,]?\s*$|^\s*\[\s*\/.+\/[dgimsuy]*\s*,\s*["'`][^"'`]*["'`]\s*\],?\s*$|\b(?:desc|title|fp|why)\s*:\s*["'`]|^\s*["']?[a-p]{32}["']?\s*:\s*["'][^"']*["'],?\s*$|=\s*re\.compile\(/;
const isDetector = (ln) => DETECTOR_LINE.test(ln) && !NET.test(ln.replace(/\/.*\//, "")) && !EXEC_CTX.test(ln);

const SECRET_NAME = /([A-Z0-9_]*(PRIVATE_?KEY|SECRET_?KEY|MNEMONIC|SEED_?PHRASE|WALLET_?KEY|SECRET_?PHRASE)[A-Z0-9_]*)/;
const ENV_READ_JS = /(?:const|let|var)\s+(\w+)\s*=\s*(?:process\.env(?:\.(\w+)|\[\s*['"`](\w+)['"`]\s*\]))/g;
const ENV_READ_PY = /(\w+)\s*=\s*os\.(?:environ\.get|getenv)\(\s*['"](\w+)['"]|(\w+)\s*=\s*os\.environ\[\s*['"](\w+)['"]\s*\]/g;
const DIRECT_ENV = /process\.env(?:\.|\[\s*['"`])([A-Z0-9_]+)|os\.(?:environ\.get|getenv)\(\s*['"]([A-Z0-9_]+)|os\.environ\[\s*['"]([A-Z0-9_]+)/g;
const SINK = /headers?\s*[:=[({]|['"`]x-[\w-]+['"`]\s*:|\bbody\s*[:=]|JSON\.stringify\(|\bdata\s*[:=]|\bjson\s*=|\bparams\s*[:=]|\.send\(|\.write\(|\.emit\(|\.post\(|\bsearchParams\.(set|append)\(/i;
const NET = /\bfetch\s*\(|\baxios\b|\brequests\.(get|post|put)\(|\burllib\.request|\bhttpx\.|\baiohttp\.|\bhttps?\.request\(|\bXMLHttpRequest\b|new\s+WebSocket\(|\bgot\(|\bundici\b|\bcurl\s|\bwget\s|\bnet\.connect\(|\bsocket\.connect\(/;
const EXFIL = /discord(?:app)?\.com\/api\/webhooks|api\.telegram\.org\/bot|pastebin\.com|paste\.ee|hastebin|transfer\.sh|webhook\.site|requestbin|pipedream\.net|ngrok(?:-free)?\.(?:io|app)|trycloudflare\.com|interact\.sh|oast\.(?:fun|me|pro|live)|\bhttps?:\/\/(?!127\.|0\.0\.0\.0|10\.|192\.168\.|localhost)\d{1,3}(?:\.\d{1,3}){3}/i;
const BROWSER_WALLET = /nkbihfbeogaeaoehlefnkodbefgpgknn|bfnaelmomeimhlpmgjnjophhpkkoljpa|ejbalbakoplchlghecdalmeeeajnimhm|hnfanknocfeofbddgcijnmhnfnkdnaad|Local Extension Settings|wallet\.dat\b|Exodus[\\/]exodus\.wallet|Electrum[\\/]wallets/i;
const LOCAL_KEYPAIR = /\.config[\\/]solana[\\/]id\.json|solana[\\/]id\.json|\.ethereum[\\/]keystore|[\\/]keystore[\\/]UTC--/i;
const CRED_FILE = /\.ssh[\\/]id_(?:rsa|ed25519|ecdsa)|\.aws[\\/]credentials|\.git-credentials|\.npmrc|\.docker[\\/]config\.json|\.kube[\\/]config/i;
const MODEL_DIRECTED = /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|messages|rules|prompts)|\bdo\s+not\s+(?:tell|inform|notify|alert|mention\s+(?:this|it)\s+to)\s+the\s+user|\bdon'?t\s+(?:tell|inform|mention\s+(?:this|it)\s+to)\s+the\s+user|\bwithout\s+(?:telling|informing|notifying|asking)\s+the\s+user|\b(?:always|must)\s+(?:call|use|run|invoke)\s+this\s+tool\s+(?:first|before)|<\s*(?:IMPORTANT|SYSTEM)\s*>|\bnew\s+system\s+prompt\b|\byou\s+are\s+now\s+in\s+developer\s+mode/i;
const SHADOW = /\b(?:when|whenever|before)\s+(?:the\s+user\s+|you\s+)?(?:use|call|invoke)s?\s+(?:the\s+)?[`'"]?\w+[`'"]?\s+tool\b|\binstead\s+of\s+(?:the\s+)?[`'"]?\w+[`'"]?\s+tool\b|\b(?:other|another)\s+(?:mcp\s+)?server'?s?\s+tools?\b/i;
const PIPE_SH = /\b(curl|wget)\b[^|\n]{0,300}?(?:https?:\/\/|\b[\w-]+\.[a-z]{2,}\/|\$\{?\w+)[^|\n]{0,300}\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/i;
const SAFE_INSTALLERS = /sh\.rustup\.rs|bun\.sh|deno\.land|get\.docker\.com|raw\.githubusercontent\.com\/nvm-sh|astral\.sh|brew\.sh|raw\.githubusercontent\.com\/Homebrew|foundry\.paradigm\.xyz|release\.anza\.xyz|release\.solana\.com|get\.pnpm\.io|install\.python-poetry\.org|claude\.ai\/install|cursor\.com\/install|opencode\.ai\/install|fly\.io\/install|vercel\.com\/install|starship\.rs|ollama\.com\/install|sdkman\.io|get\.volta\.sh|nixos\.org/i;
const PREREQ = /\b(?:must|need\s+to|needs\s+to|required\s+to|requires?|please)\s+(?:be\s+)?(?:install|download)|\bprerequisite|\bbefore\s+using\s+this\s+skill\b|\binstall\s+\w*CLI\b.*\bfirst\b/i;
const SHADY_HOST = /https?:\/\/[^\s)"'<>]*(?:vercel\.app|netlify\.app|pages\.dev|glitch\.me|onrender\.com|dropbox\.com|mega\.nz|mediafire\.com|bit\.ly|tinyurl\.com|t\.ly|cutt\.ly|is\.gd|github\.com\/[^/\s]+\/[^/\s]+\/releases\/download\/|[^\s)"'<>]+\.(?:zip|dmg|exe|pkg|msi|appimage|scr)\b)/i;
const PASSWORD = /osascript[^\n]{0,200}(?:password|display\s+dialog)|\bsudo\s+-S\b|\bread\s+-s[^\n]{0,40}pass/i;
const B64_SH = /base64\s+(?:-d|--decode|-D)\b[^\n]{0,200}\|\s*(?:ba|z)?sh\b/i;
const DECODE_EXEC = /\b(?:eval|new\s+Function|exec|execSync)\s*\([^)]{0,200}(?:atob\(|Buffer\.from\([^)]*['"]base64['"]|fromCharCode|b64decode|zlib\.decompress|codecs\.decode)/i;
const PY_EXEC_B64 = /\bexec\s*\(\s*(?:base64\.b64decode|zlib\.decompress|marshal\.loads|bytes\.fromhex)/i;
const SETUP_NET = /\b(?:urllib|requests|httpx|subprocess|os\.system|socket)\b/;
const B64_BLOB = /[A-Za-z0-9+/]{160,}={0,2}/g;

const POPULAR = ["@modelcontextprotocol/sdk", "@modelcontextprotocol/server-filesystem", "@modelcontextprotocol/server-github", "@modelcontextprotocol/server-memory", "@modelcontextprotocol/server-puppeteer", "@playwright/mcp", "mcp-remote", "fastmcp", "mcp", "firecrawl-mcp", "@upstash/context7-mcp", "solana-agent-kit", "@solana/web3.js", "@solana/spl-token", "ethers", "viem", "web3", "openai", "@anthropic-ai/sdk", "anthropic", "langchain", "@coinbase/agentkit", "x402", "@metamask/sdk", "bitcoinjs-lib", "tweetnacl", "bs58"];

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function redact(line) {
  return line
    .replace(/0x[a-fA-F0-9]{64}/g, "0x[redacted-64]")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/g, "[redacted-base58-key]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]{12,}/g, "$1…")
    .replace(/((?:PRIVATE_?KEY|MNEMONIC|SECRET)\s*[=:]\s*['"]?)[^'"\s]{12,}/gi, "$1[redacted]")
    .slice(0, 240);
}

function decodeTags(s) {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xe0020 && cp <= 0xe007e) out += String.fromCharCode(cp - 0xe0000);
  }
  return out;
}

function b64decode(s) {
  try {
    const bin = atob(s);
    let printable = 0;
    for (let i = 0; i < bin.length; i++) { const c = bin.charCodeAt(i); if ((c >= 32 && c < 127) || c === 10 || c === 13 || c === 9) printable++; }
    return printable / bin.length > 0.9 ? bin : null;
  } catch { return null; }
}

export function isScannable(path, size = 0) {
  if (size > 1_000_000) return false;
  return TEXT_EXT.test(path);
}

export function runRules(files, ctx = {}) {
  const findings = [];
  const add = (id, file, line, snippet, why, extra = {}) => {
    const r = RULE_BY_ID[id];
    findings.push({ rule: id, group: r.group, severity: extra.severity || r.severity, title: r.title, file, line, snippet: redact(snippet || ""), why, ...extra.more });
  };
  let scannedFiles = 0;

  for (const f of files) {
    const path = f.path;
    if (SKIP_PATH.test(path) && !/SKILL\.md$/i.test(path)) continue;
    const text = f.text || "";
    if (!text || text.includes("\u0000")) continue;
    scannedFiles++;
    const lines = text.split(/\r?\n/);
    const isDoc = /\.(md|mdx|txt)$/i.test(path) || /SKILL/i.test(path) || f.kind === "tool";
    const isSkill = /SKILL\.md$/i.test(path) || f.kind === "skill" || f.kind === "tool";
    const minified = MINIFIED.test(path);

    const secretVars = new Set();
    for (const re of [ENV_READ_JS, ENV_READ_PY]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const envName = re === ENV_READ_JS ? m[2] || m[3] : m[2] || m[4];
        const varName = re === ENV_READ_JS ? m[1] : m[1] || m[3];
        if (envName && varName && SECRET_NAME.test(envName)) secretVars.add(varName);
      }
    }
    for (const m of text.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*process\.env/g)) {
      for (const part of m[1].split(",")) {
        const [envName, alias] = part.split(":").map((s) => s.trim().split("=")[0].trim());
        if (envName && SECRET_NAME.test(envName)) secretVars.add(alias || envName);
      }
    }

    let netLine = -1, browserWalletLine = -1, keypairLine = -1, credLine = -1;
    const fileHasNet = NET.test(text);

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (ln.length > 4000 && minified) continue;
      const n = i + 1;

      if (/[\u{E0000}-\u{E007F}]/u.test(ln)) {
        const hidden = decodeTags(ln);
        add("HID-001", path, n, hidden ? `hidden text: "${hidden.slice(0, 160)}"` : ln, hidden ? `Contains invisible tag characters that spell: "${hidden.slice(0, 120)}".` : "Contains invisible Unicode tag characters.");
      }
      if (/[\u200B-\u200F\u202A-\u202E\u2060-\u2064]/.test(ln) && (isDoc || /['"`]/.test(ln)) && !/\.replace(?:All)?\(\s*\/\[|\bre\.sub\(/.test(ln)) {
        add("HID-002", path, n, ln.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064]/g, "⟦·⟧"), "Contains zero-width or bidirectional control characters (shown as ⟦·⟧).");
      }
      if (MODEL_DIRECTED.test(ln) && !/(?:detect|flag|example|attack|injection|e\.g\.|such as)/i.test(ln)) {
        const phrase = ln.trim().match(MODEL_DIRECTED)[0];
        const consentOnly = /^without\s+asking/i.test(phrase);
        if (!(phrase.startsWith("<") && !isDoc)) add("HID-003", path, n, ln.trim(),
          consentOnly ? `Tells the agent to act "${phrase}". Skips consent but does not hide anything.` : `Text addressed to the agent: "${phrase}".`,
          consentOnly ? { severity: "medium" } : undefined);
      }
      if (isDoc && SHADOW.test(ln)) {
        add("SHD-001", path, n, ln.trim(), "Tries to change how the agent uses other tools.");
      }

      if (NET.test(ln) && netLine < 0) netLine = n;
      const ex = ln.match(EXFIL);
      if (ex && !/^\s*(?:\/\/|#|\*)/.test(ln) && !isDetector(ln)) {
        add("NET-001", path, n, ln.trim(), `Talks to ${ex[0].replace(/^https?:\/\//, "")}, a host commonly used to collect stolen data.`);
      }
      const readsCount = (!isDoc || isSkill) && !isDetector(ln);
      if (readsCount && BROWSER_WALLET.test(ln) && browserWalletLine < 0) browserWalletLine = n;
      if (readsCount && LOCAL_KEYPAIR.test(ln) && keypairLine < 0 && (isSkill || CRED_READ.test(lines.slice(Math.max(0, i - 3), i + 4).join("\n")))) keypairLine = n;
      if (readsCount && credLine < 0 && ln.length < 400 && !/^\s*(?:\/\/|#|\*)/.test(ln) && CRED_READ.test(ln) && CRED_FILE.test(ln.replace(/\S*\.pub\b/g, ""))) credLine = n;

      if (SINK.test(ln)) {
        let hit = null;
        for (const v of secretVars) if (new RegExp(`\\b${v}\\b`).test(ln)) { hit = v; break; }
        if (!hit) {
          DIRECT_ENV.lastIndex = 0;
          let m;
          while ((m = DIRECT_ENV.exec(ln))) { const nm = m[1] || m[2] || m[3]; if (SECRET_NAME.test(nm)) { hit = nm; break; } }
        }
        if (hit && fileHasNet) {
          add("KEY-001", path, n, ln.trim(), `Puts the secret \`${hit}\` into an outgoing request (header, body or payload).`);
        }
      }

      const pipe = ln.match(PIPE_SH);
      if (pipe && !SAFE_INSTALLERS.test(ln)) {
        const executed = !CODE_FILE.test(path) || EXEC_CTX.test([lines[i - 1], ln, lines[i + 1]].filter(Boolean).join("\n"));
        const sev = isSkill || /\.(sh|bash|ps1)$/i.test(path) ? "high" : isDoc ? "low" : "medium";
        if (executed) add("INS-001", path, n, ln.trim(), "Downloads a script and runs it immediately in a shell.", { severity: sev });
      }
      if (isDoc && SHADY_HOST.test(ln)) {
        const ctxText = [lines[i - 2], lines[i - 1], ln, lines[i + 1]].filter(Boolean).join(" ");
        if (PREREQ.test(ctxText)) add("INS-002", path, n, ln.trim(), `Asks to install a "prerequisite" from ${ln.match(SHADY_HOST)[0].slice(0, 80)}.`);
      }
      if (PASSWORD.test(ln) && !isDetector(ln)) add("INS-003", path, n, ln.trim(), "Prompts for the system password.");
      if (B64_SH.test(ln)) add("INS-004", path, n, ln.trim(), "Decodes a hidden payload and runs it in a shell.");
      if (DECODE_EXEC.test(ln) || PY_EXEC_B64.test(ln)) add("OBF-001", path, n, ln.trim(), "Decodes data at runtime and executes it as code.", { severity: PY_EXEC_B64.test(ln) ? "high" : "medium" });

      if (!minified && ln.length < 20000) {
        B64_BLOB.lastIndex = 0;
        let bm;
        while ((bm = B64_BLOB.exec(ln))) {
          const dec = b64decode(bm[0]);
          if (dec && (MODEL_DIRECTED.test(dec) || PIPE_SH.test(dec) || EXFIL.test(dec) || /\beval\(|child_process|subprocess|os\.system/.test(dec))) {
            add("HID-005", path, n, `${bm[0].slice(0, 48)}… → "${dec.replace(/\s+/g, " ").slice(0, 120)}"`, "A base64 blob decodes to instructions or code.");
            break;
          }
        }
      }
    }

    if (/<!--[\s\S]*?-->/.test(text) && /\.(md|mdx)$/i.test(path)) {
      const re = /<!--([\s\S]*?)-->/g;
      let m;
      while ((m = re.exec(text))) {
        if (AGENT_COMMENT.test(m[1]) && m[1].length > 20) {
          const n = text.slice(0, m.index).split("\n").length;
          add("HID-004", path, n, m[0].replace(/\s+/g, " ").slice(0, 200), "An HTML comment, invisible when rendered, speaks to the agent.");
        }
      }
    }

    if (browserWalletLine > 0) {
      if (fileHasNet) add("KEY-002", path, browserWalletLine, lines[browserWalletLine - 1].trim(), "Reads browser wallet storage in a file that also sends network requests.");
      else add("KEY-003", path, browserWalletLine, lines[browserWalletLine - 1].trim(), "Reads browser wallet storage.", { severity: "high" });
    }
    if (keypairLine > 0 && fileHasNet) add("KEY-003", path, keypairLine, lines[keypairLine - 1].trim(), "Reads a local keypair or keystore in a file that also sends network requests. Check that the key is only used to sign.");
    if (credLine > 0) add("KEY-004", path, credLine, lines[credLine - 1].trim(), "Reads local credential files.");

    if (/(^|\/)package\.json$/.test(path)) {
      try {
        const pj = JSON.parse(text);
        for (const hook of ["preinstall", "install", "postinstall"]) {
          const cmd = pj.scripts?.[hook];
          if (!cmd) continue;
          const n = lines.findIndex((l) => l.includes(`"${hook}"`)) + 1;
          if (/curl|wget|https?:\/\/|node\s+-e|eval|powershell|\|\s*(ba)?sh/i.test(cmd)) add("EXE-002", path, n, `"${hook}": "${cmd}"`, `Runs network or shell commands on install: ${cmd.slice(0, 100)}`);
          else add("EXE-001", path, n, `"${hook}": "${cmd}"`, `Runs \`${cmd.slice(0, 80)}\` automatically on install.`);
        }
      } catch {}
    }
    if (/(^|\/)setup\.py$/.test(path) && SETUP_NET.test(text)) {
      const n = lines.findIndex((l) => SETUP_NET.test(l)) + 1;
      add("EXE-002", path, n, lines[n - 1]?.trim(), "setup.py uses network or shell modules, which run at install time.");
    }
  }

  if (ctx.packageName) {
    const name = ctx.packageName.toLowerCase();
    for (const p of POPULAR) {
      if (name === p) break;
      const d = lev(name, p);
      if (d > 0 && d <= (p.length > 8 ? 2 : 1)) {
        add("TYP-001", "package name", 0, ctx.packageName, `"${ctx.packageName}" is ${d} character${d > 1 ? "s" : ""} away from the popular "${p}".`);
        break;
      }
    }
  }

  const seen = new Set();
  const unique = findings.filter((f) => {
    const k = `${f.rule}|${f.file}|${f.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
  return { findings: unique.slice(0, 200), scannedFiles, rulesChecked: RULES.length };
}

export function decideVerdict(findings, incomplete = []) {
  const strong = findings.filter((f) => SEV_RANK[f.severity] >= 3);
  if (strong.length) {
    const order = VERDICTS;
    return strong.map((f) => f.group === "SUSPICIOUS" ? "SUSPICIOUS" : f.group).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  }
  if (findings.some((f) => SEV_RANK[f.severity] === 2)) return "SUSPICIOUS";
  if (incomplete.length) return "INCOMPLETE";
  return "NO FINDINGS";
}
