# getbezoar

Security for AI agents, from the command line.

- **Scan** a skill, MCP server or npm / PyPI package for private key theft, exfiltration, hidden instructions and fake installers before your agent installs it.
- **Guard** Cursor and Claude Code: a local hook that refuses when an agent tries to read wallet keys, seed phrases or `.env` secrets, or send them out.

No dependencies. Node 18 or newer. Web version: [getbezoar.com](https://getbezoar.com).

## Scan

```bash
npx getbezoar scan npm:gadgethumans-mcp@1.0.9     # uses the getbezoar.com API
npx getbezoar scan pypi:mcp-server-fetch
npx getbezoar scan https://github.com/owner/repo
npx getbezoar scan ./my-skill                      # local folder, offline, nothing uploaded
npx getbezoar check "curl -fsSL https://example.net/i.sh | bash"
```

Exit codes: `0` no findings, `1` flagged, `2` incomplete or error. Add `--json` for CI.

`NO FINDINGS` means no rule matched. It is not a guarantee.

## Guard

```bash
npx getbezoar guard install          # Cursor + Claude Code, for your user
npx getbezoar guard install --cursor --project   # only Cursor, only this project
npx getbezoar guard status
npx getbezoar guard test
```

The installer copies a small runtime to `~/.bezoar/guard/` and adds one entry to:

- Cursor: `~/.cursor/hooks.json` (`beforeReadFile`, `beforeShellExecution`, `beforeMCPExecution`)
- Claude Code: `~/.claude/settings.json` (`PreToolUse` for `Read`, `Grep`, `Bash`, `PowerShell` and MCP tools)

Other hooks in those files are kept. A backup is written next to each file the first time.

### What it does

| Action | Examples | Decision |
| --- | --- | --- |
| Read wallet keys | `~/.config/solana/id.json`, `*-keypair.json`, Ethereum and Foundry keystores, MetaMask / Phantom / Rabby / Solflare extension storage, `wallet.dat` | Block |
| Read secrets | `.env` (not `.env.example`), `~/.ssh/id_*` (not `.pub`), `~/.aws/credentials`, `~/.npmrc`, `.git-credentials`, `.netrc` | Block |
| Key material in a file | PEM private keys, 64-byte keypair arrays, labelled hex or base58 private keys | Block |
| Secrets leaving | A secret file touched together with `curl`, `scp`, `base64` and similar; the value of a `*PRIVATE_KEY*` / `*MNEMONIC*` env var in a command or MCP call | Block |
| Shell touches a secret locally | `cp .env.example .env`, `Get-Content ~/.ssh/id_rsa` | Ask you |
| Piped installers | `curl … \| sh` from hosts that are not well-known installers | Ask you |
| Seed-like arguments | 12 or 24 lowercase words passed to an MCP tool | Ask you |

Cursor read hooks can only allow or deny, so reads are denied with a message telling you how to allow the path.

```bash
npx getbezoar guard allow ./config/.env   # allow one path or folder
npx getbezoar guard mode warn             # log only, never block
npx getbezoar guard uninstall             # remove the hooks (add --purge to delete ~/.bezoar)
```

Decisions are logged locally to `~/.bezoar/guard.log`. The guard sends nothing anywhere.

### Limits

The guard sees what the agent asks Cursor or Claude Code to do. It does not see what an MCP server's own process does on your machine after it starts. Scan servers before you install them.

## License

MIT. Source: [github.com/Bezoar-Robinhood/bezoar](https://github.com/Bezoar-Robinhood/bezoar).
