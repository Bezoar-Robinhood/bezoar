(() => {
  const { esc, api } = window.BZ;
  const el = document.getElementById("rules-table");
  api("/api/v1/rules").then(({ rules }) => {
    el.innerHTML = `<table class="data"><thead><tr><th>Rule</th><th>Verdict</th><th>What it matches</th><th>Known false positives</th></tr></thead><tbody>${rules.map((r) => `<tr><td><code>${esc(r.id)}</code><br><span class="sev ${esc(r.severity)}">${esc(r.severity)}</span></td><td class="small">${esc(r.group)}</td><td><b>${esc(r.title)}</b><br><span class="small muted">${esc(r.desc)}</span></td><td class="small muted">${esc(r.fp)}</td></tr>`).join("")}</tbody></table>`;
  }).catch((e) => (el.innerHTML = `<div class="notice">${esc(e.message)}</div>`));
  document.querySelectorAll("[data-origin]").forEach((n) => (n.textContent = n.textContent.replaceAll("{origin}", location.origin)));
})();
