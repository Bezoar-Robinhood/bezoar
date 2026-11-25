<p align="center"><img src="brand/final/lockup-light.svg" alt="Bezoar" width="320"></p>

# Bezoar

Checks AI agent skills, MCP servers and npm / PyPI packages for private key theft, data exfiltration, hidden instructions and fake installers **before your agent installs them**.

Live at **[getbezoar.com](https://getbezoar.com)**. Scanning is free and needs no wallet.

Every verdict comes with the file, line and code that caused it. A real language model reads the flagged code as a second opinion, but the deterministic rules come first and the verdict never depends on the model.

## Why

In 2026 agent registries became a supply chain. Documented cases include:

- `gadgethumans-mcp@1.0.9` on npm put the user's wallet key into an outgoing request header ([Knostic](https://www.knostic.ai/blog/when-auto-signing-sends-your-wallet-private-key-to-a-remote-server-a-malicious-mcp-package-on-npm)). Bezoar flags it as `KEY THEFT` at `index.js:206`.
- `latinum-wallet-mcp` on PyPI sent a Solana private key out as "telemetry" ([GHSA-7fjp-p82r-q2c2](https://github.com/advisories/GHSA-7fjp-p82r-q2c2)).
- OpenClaw skills told the agent to install a "prerequisite" that was an infostealer ([Trend Micro](https://www.trendmicro.com/en/research/26/b/openclaw-skills-used-to-distribute-atomic-macos-stealer.html)). Island counted more than 800 fake skills and MCP servers in one campaign ([Island](https://www.island.io/blog/agentbaiting-how-800-fake-ai-skills-and-mcp-servers-delivered-malware)).

## Verdicts

| Verdict | Meaning |
| --- | --- |
| `KEY THEFT` | A private key, seed or wallet file leaves the machine. |
| `EXFILTRATION` | Data goes to webhooks, paste sites, tunnels or raw IPs. |
| `HIDDEN INSTRUCTIONS` | Text aimed at the model that the user does not see. |
| `FAKE INSTALLER` | A download piped into a shell, a fake prerequisite or a password prompt. |
| `RUG PULL` | An MCP server changed its tool definitions after an earlier scan. |
| `SUSPICIOUS` | Medium-severity patterns worth reading before you install. |
| `INCOMPLETE` | Something could not be fetched or unpacked. Not a clean result. |
| `NO FINDINGS` | No rule above low severity matched. This is not a guarantee of safety. |

There are 20 rules. The full list with false-positive notes is at [`/api/v1/rules`](https://getbezoar.com/api/v1/rules) and in [`apps/worker/src/rules.js`](apps/worker/src/rules.js).

## Use it

**Web:** paste a target at [getbezoar.com](https://getbezoar.com).

**API:**

```bash
curl -s https://getbezoar.com/api/v1/scan \
  -H 'content-type: application/json' \
  -d '{"target":"npm:gadgethumans-mcp@1.0.9"}'
```

Targets: `npm:name[@version]`, `pypi:name[==version]`, a GitHub repo URL, a raw skill URL, an MCP server URL (Streamable HTTP) or pasted `SKILL.md` text.

| Endpoint | |
| --- | --- |
| `POST /api/v1/scan` | Scan a target |
| `GET /api/v1/scan/{id}` | Fetch a report |
| `GET /api/v1/scan/{id}/review` | Streamed LLM second opinion |
| `GET /api/v1/feed?flagged=1` | Latest scans, also as `/feed.xml` (RSS) |
| `GET /api/v1/badge/{id}.svg` | README badge |

**CLI and guard:** `npx getbezoar scan <target>`, `npx getbezoar guard install`. See [`packages/cli`](packages/cli).

**MCP:** add `https://getbezoar.com/mcp` as a Streamable HTTP server. Tools: `scan_target`, `get_report`, `search_feed`, `check_install_command`.

## How it works

1. **Fetch** the exact artifact an agent would get: npm tarball, PyPI sdist or wheel, GitHub archive, or the MCP `tools/list` response. It is unpacked in memory and hashed with sha256.
2. **Rules** run over every text file and tool description. A light taint check follows secret environment variables into request headers and bodies.
3. **Pins** store the hash of each MCP server's tool definitions. A later change is reported as `RUG PULL` with the diff.
4. **Review** asks a language model whether it agrees with the findings. It runs on Cloudflare Workers AI.
5. **Crawler** scans new entries from the MCP Registry, npm and PyPI every 30 minutes.
6. **Fee burner keeper** checks every 10 minutes and calls `run()` on the fee burner once the hour has passed and fees are waiting.

## Status

| Component | Status |
| --- | --- |
| Scanner, API, MCP server, feed | Live |
| LLM review | Live |
| CLI and local guard for Cursor and Claude Code ([`getbezoar`](https://www.npmjs.com/package/getbezoar) on npm) | Live |
| Guard for Codex | Planned |
| Canary wallet sandbox | Planned |
| Onchain scan registry | Planned |
| Hourly creator-fee burn ([`BezoarFeeBurner`](contracts/BezoarFeeBurner.sol)) | Deployed, verified on [Sourcify](https://repo.sourcify.dev/4663/0x4e83596410b2d40802A4dF6014a6d46633A7c07e) |

## Fee burner contract

[`contracts/BezoarFeeBurner.sol`](contracts/BezoarFeeBurner.sol) on Robinhood Chain at `0x4e83596410b2d40802A4dF6014a6d46633A7c07e`. It receives the $BEZOAR creator fees from Pons. Once an hour anyone can call `run()`: it claims the fees, sends 85% to the dev wallet and spends 15% buying $BEZOAR, which it destroys with `burn()` so `totalSupply` goes down. There is no owner; the split, interval and dev wallet are fixed at deployment. Every run is listed at [getbezoar.com/burns](https://getbezoar.com/burns/).

## Run locally

Requires Node 22.5 or newer.

```bash
npm install
npm test
npm run dev        # http://localhost:8797
```

The dev server uses `node:sqlite` in place of Cloudflare D1. LLM review works locally if `OPENAI_API_KEY` is set.

To deploy your own copy: create a D1 database, put its id in `apps/worker/wrangler.toml`, apply `apps/worker/schema.sql`, set an `ADMIN_KEY` secret and run `wrangler deploy --config apps/worker/wrangler.toml`.

## False positives

If Bezoar flags something that is fine, open an issue with the report link. Each rule documents its known false positives, and regression tests for past mistakes live in [`apps/worker/test`](apps/worker/test).

## License

MIT
