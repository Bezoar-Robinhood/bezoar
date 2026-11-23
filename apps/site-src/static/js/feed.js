(() => {
  const { esc, tag, ago, api } = window.BZ;
  const list = document.getElementById("feed");
  const more = document.getElementById("more");
  const fv = document.getElementById("f-verdict"), fr = document.getElementById("f-registry"), ff = document.getElementById("f-flagged");
  let cursor = null;

  api("/api/v1/stats").then((s) => {
    for (const [k, v] of Object.entries(s)) { const n = document.querySelector(`[data-stat="${k}"]`); if (n) n.textContent = v.toLocaleString(); }
  }).catch(() => {});
  api("/api/v1/health").then((h) => {
    const c = h.crawler;
    document.getElementById("crawl-state").textContent = c ? `Crawler last ran ${ago(c.at)} · sources: ${Object.entries(c.sources || {}).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}${c.errors?.length ? ` · ${c.errors.length} source error(s)` : ""}` : "The crawler has not run yet on this deployment.";
  }).catch(() => {});

  async function load(reset) {
    if (reset) { cursor = null; list.innerHTML = ""; }
    const q = new URLSearchParams({ limit: "30" });
    if (fv.value) q.set("verdict", fv.value);
    if (fr.value) q.set("registry", fr.value);
    if (ff.checked && !fv.value) q.set("flagged", "1");
    if (cursor) q.set("cursor", cursor);
    try {
      const { items, nextCursor } = await api(`/api/v1/feed?${q}`);
      if (reset && !items.length) list.innerHTML = `<li><span class="muted">Nothing matches these filters yet.</span></li>`;
      list.insertAdjacentHTML("beforeend", items.map((i) => `<li><div>${tag(i.verdict)}</div><a href="/scan/${esc(i.id)}"><div class="t">${esc(i.target)}</div><div class="s">${esc(i.registry || "")}${i.source?.startsWith("crawler") ? " · found by crawler" : ""}${i.top ? ` · ${esc(i.top.rule)}: ${esc(i.top.why)}` : ""}</div></a><div class="when">${ago(i.scannedAt)}</div></li>`).join(""));
      cursor = nextCursor;
      more.classList.toggle("hidden", items.length < 30);
    } catch (e) {
      list.innerHTML = `<li><span class="muted">${esc(e.message)}</span></li>`;
    }
  }
  [fv, fr, ff].forEach((n) => n.addEventListener("change", () => load(true)));
  more.addEventListener("click", () => load(false));
  load(true);
})();
