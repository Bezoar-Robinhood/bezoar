(() => {
  const { esc, ago, api, CFG, caSet } = window.BZ;
  const tbody = document.getElementById("status-rows");
  const S = { live: '<span class="status-live">Live</span>', test: '<span class="status-test">In testing</span>', plan: '<span class="status-plan">Planned</span>', down: '<span class="status-test">Unavailable</span>' };
  const row = (f, s, proof) => `<tr><td>${f}</td><td>${s}</td><td class="small">${proof}</td></tr>`;

  Promise.all([
    api("/api/v1/health").catch((e) => ({ error: e.message })),
    fetch("/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }).then((r) => r.json()).catch(() => null),
  ]).then(([h, mcp]) => {
    const ok = !h.error;
    document.getElementById("api-state").innerHTML = ok ? `API healthy · version ${esc(h.version)} · checked ${new Date(h.time).toLocaleTimeString()}` : `API error: ${esc(h.error)}`;
    const c = h.crawler;
    tbody.innerHTML = [
      row("Scanner (npm, PyPI, GitHub, skill URLs, MCP servers, pasted text)", ok ? S.live : S.down, `<a href="/">Run a scan</a> · <code>POST /api/v1/scan</code>`),
      row("Deterministic rules", ok ? S.live : S.down, ok ? `${h.rules} rules · <a href="/docs/#rules">catalog</a>` : "—"),
      row("AI review (second opinion)", h.llm?.available ? S.live : S.down, h.llm?.available ? esc(h.llm.model) : "No model configured on this server"),
      row("Feed crawler (MCP Registry, npm, PyPI)", c ? S.live : S.test, c ? `Last run ${ago(c.at)} · ${c.scanned} scanned${c.errors?.length ? ` · errors: ${esc(c.errors.join("; "))}` : ""}` : "Not run yet on this deployment"),
      row("MCP endpoint", mcp?.result?.tools ? S.live : S.down, mcp?.result?.tools ? `<code>/mcp</code> · ${mcp.result.tools.length} tools` : "—"),
      row("Local guard (<code>npx</code> hooks)", CFG.npmPackage ? S.live : S.test, CFG.npmPackage ? `<a href="https://www.npmjs.com/package/${esc(CFG.npmPackage)}">${esc(CFG.npmPackage)}</a>` : "Not published yet"),
      row("Onchain verdict registry", CFG.registryAddress || h.registry ? S.live : S.plan, CFG.registryAddress || h.registry ? `<code>${esc(CFG.registryAddress || h.registry)}</code>` : "Contract not deployed yet"),
      row("Hourly fee burn (15% buy and burn, 85% dev)", window.BZ.burnerSet ? S.live : S.plan, window.BZ.burnerSet ? `<a href="${esc(CFG.explorer)}/address/${esc(CFG.feeBurner)}">contract</a> · <a href="/burns/">burns</a>` : "Contract deploys before launch"),
      row("Canary wallets", S.plan, "Sandbox not live yet"),
      row("Holder monitoring and quotas", S.plan, caSet ? "Token launched, feature not live yet" : "Token not launched yet"),
    ].join("");
  });
})();
