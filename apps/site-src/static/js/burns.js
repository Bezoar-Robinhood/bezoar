(() => {
  const { esc, ago, api, CFG, burnerSet } = window.BZ;
  if (!burnerSet) return;
  const tx = (h) => `<a class="mono" href="${esc(CFG.explorer)}/tx/${esc(h)}" rel="noopener">${esc(h.slice(0, 10))}…</a>`;
  const num = (s, d = 0) => Number(s).toLocaleString(undefined, { maximumFractionDigits: d });
  const eth = (s) => `${Number(s).toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH`;
  const stat = (k, v) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`;

  if (/^0x[0-9a-fA-F]{64}$/.test(CFG.launchBurnTx || "")) {
    document.getElementById("burn-launch").innerHTML = `Launch: the full dev buy of 10,000,000 $BEZOAR was burned with <code>burn()</code> in ${tx(CFG.launchBurnTx)}.`;
  }

  const load = () => api("/api/v1/burns").then((d) => {
    if (!d.live) return;
    if (d.stale) document.getElementById("burn-launch").textContent = `Showing the last good read from ${ago(d.readAt)}; the chain RPC did not answer just now.`;
    const t = d.totals;
    const mins = Math.ceil(d.nextRunInSec / 60);
    document.getElementById("burn-stats").innerHTML = [
      stat("Total supply now", d.totalSupply ? num(d.totalSupply) : "Not bound yet"),
      stat("Burned by this contract", `${num(t.tokensBurned)} $BEZOAR`),
      stat("ETH spent on burns", eth(t.ethSpentOnBurns)),
      stat("ETH sent to dev wallet", eth(t.ethToDev)),
      stat("Next run", d.runs === 0 && !d.lastRun ? "After the first fees arrive" : d.nextRunInSec > 0 ? `in ${mins} min` : "Due now"),
      stat("Waiting", `${eth(d.pending.inEscrow)} in escrow`),
    ].join("");
    const rows = d.history.map((r) => {
      const burned = Number(r.tokensBurned) > 0;
      return `<tr><td>${r.run}</td><td title="${esc(r.at)}">${ago(r.at)}</td><td>${eth(r.ethClaimed)}</td><td>${eth(r.ethToDev)}</td><td>${burned ? eth(r.ethSpent) : `<span class="muted">waiting${Number(r.ethToBurn) > 0 ? ` (+${eth(r.ethToBurn)})` : ""}</span>`}</td><td>${burned ? `<b>${num(r.tokensBurned)}</b>${r.onCurve ? ' <span class="small muted">curve</span>' : ""}` : "—"}</td><td>${r.supplyAfter ? num(r.supplyAfter) : "—"}</td><td>${tx(r.tx)}</td></tr>`;
    });
    document.getElementById("burn-rows").innerHTML = rows.length ? rows.join("") : `<tr><td colspan="8" class="muted">No runs yet. The first one happens within an hour of the first fees.</td></tr>`;
  }).catch((e) => {
    document.getElementById("burn-stats").innerHTML = `<p class="muted">Could not read the contract: ${esc(e.message)}</p>`;
  });
  load();
  setInterval(load, 60_000);
})();
