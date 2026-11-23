(() => {
  const { esc, api, renderReport } = window.BZ;
  const el = document.getElementById("report");
  const id = (location.pathname.match(/\/scan\/([a-z0-9]{6,20})/) || [])[1];
  if (!id) { el.innerHTML = `<div class="notice">No report id in the address. Run a scan from the <a href="/">home page</a>.</div>`; return; }

  api(`/api/v1/scan/${id}`).then((rep) => {
    document.title = `${rep.verdict}: ${rep.target} · Bezoar`;
    renderReport(el, rep, { full: true });
    const site = location.origin;
    const md = `[![Bezoar](${site}/api/v1/badge/${id}.svg)](${site}/scan/${id})`;
    const tools = document.getElementById("report-tools");
    tools.classList.remove("hidden");
    tools.innerHTML = `
      <div class="actions">
        <button class="btn" data-act="link">Copy link</button>
        <button class="btn" data-act="badge">Copy README badge</button>
        ${rep.target !== "pasted text" ? `<button class="btn" data-act="rescan">Rescan</button>` : ""}
        <a class="btn" href="/api/v1/scan/${esc(id)}" target="_blank" rel="noopener">JSON</a>
      </div>
      <p class="small muted" style="margin-top:14px">Badge preview: <img src="/api/v1/badge/${esc(id)}.svg" alt="Bezoar badge" style="display:inline;vertical-align:middle"></p>
      <p class="small muted">Onchain registry: <span id="seal-state">verdict sealing is not live yet, see <a href="/registry/">Registry</a>.</span></p>`;
    tools.querySelector('[data-act="link"]').onclick = (e) => copy(e.target, `${site}/scan/${id}`);
    tools.querySelector('[data-act="badge"]').onclick = (e) => copy(e.target, md);
    const rs = tools.querySelector('[data-act="rescan"]');
    if (rs) rs.onclick = async () => {
      rs.disabled = true; rs.textContent = "Rescanning…";
      try { const n = await api("/api/v1/scan", { method: "POST", body: JSON.stringify({ target: rep.target, rescan: true }) }); location.href = `/scan/${n.id}`; }
      catch (e) { rs.textContent = e.message; }
    };
  }).catch((e) => { el.innerHTML = `<div class="notice">${esc(e.message)}</div>`; });

  async function copy(btn, text) {
    try { await navigator.clipboard.writeText(text); const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = t), 1400); } catch {}
  }
})();
