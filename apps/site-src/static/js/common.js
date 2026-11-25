(() => {
  const CFG = window.BEZOAR_CONFIG || {};
  const caSet = !!CFG.ca && !/[{}]/.test(CFG.ca) && /^0x[0-9a-fA-F]{40}$/.test(CFG.ca);
  const burnerSet = /^0x[0-9a-fA-F]{40}$/.test(CFG.feeBurner || "");
  if (caSet && !CFG.ponsUrl) CFG.ponsUrl = `https://ponsfamily.com/launchpad/${CFG.ca}`;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const VCLASS = { "KEY THEFT": "v-red", EXFILTRATION: "v-red", "HIDDEN INSTRUCTIONS": "v-red", "FAKE INSTALLER": "v-amber", "RUG PULL": "v-amber", SUSPICIOUS: "v-amber", INCOMPLETE: "v-gray", "NO FINDINGS": "v-green" };
  const VDOT = { "v-red": "#C8452F", "v-amber": "#C9862B", "v-gray": "#6B675F", "v-green": "#2E6B58" };
  const tag = (v, lg) => `<span class="tag ${lg ? "lg " : ""}${VCLASS[v] || "v-gray"}">${esc(v)}</span>`;
  const dot = (v) => VDOT[VCLASS[v] || "v-gray"];
  const ago = (iso) => {
    const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  };
  async function api(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    let data = null;
    try { data = await r.json(); } catch {}
    if (!r.ok) throw new Error(data?.error || `Request failed (${r.status})`);
    return data;
  }

  function renderReport(el, rep, { full = false } = {}) {
    const f = rep.findings || [];
    const sha = rep.sha256 ? `${rep.sha256.slice(0, 12)}…` : "—";
    const facts = [
      rep.registry && `<span>Source <b>${esc(rep.registry)}</b></span>`,
      rep.name && `<span>Artifact <b class="mono">${esc(rep.name)}${rep.version ? "@" + esc(rep.version) : ""}</b></span>`,
      `<span>Rules <b>${rep.rulesChecked}</b></span>`,
      `<span>Files read <b>${rep.filesScanned}</b></span>`,
      rep.sha256 && `<span>sha256 <b class="mono" title="${esc(rep.sha256)}">${sha}</b></span>`,
      `<span>Scanned <b>${new Date(rep.scannedAt).toLocaleString()}</b></span>`,
      rep.durationMs != null && `<span>Took <b>${(rep.durationMs / 1000).toFixed(2)} s</b></span>`,
    ].filter(Boolean).join("");
    const notices = [];
    if (rep.verdict === "NO FINDINGS") notices.push(`<div class="notice gray">${rep.rulesChecked} rules checked, nothing matched. This is not a guarantee: a determined attacker can hide code that no rule sees. Limit what your agent can reach.</div>`);
    for (const n of rep.incomplete || []) notices.push(`<div class="notice">${esc(n)}</div>`);
    if (rep.meta?.security) notices.push(`<div class="notice">npm replaced this package with a security placeholder. The original was removed, which usually follows a malware report.</div>`);
    const evidence = f.length ? `<ul class="evidence">${f.slice(0, full ? 200 : 6).map((x) => `
      <li>
        <div><div class="rid">${esc(x.rule)}</div><span class="sev ${esc(x.severity)}">${esc(x.severity)}</span></div>
        <div><div class="why">${esc(x.why)}</div><div class="where">${esc(x.file)}${x.line ? ":" + x.line : ""} · ${esc(x.title)}</div></div>
        ${x.snippet ? `<pre>${esc(x.snippet)}</pre>` : ""}
      </li>`).join("")}</ul>${!full && f.length > 6 ? `<p class="small muted" style="margin-top:12px">${f.length - 6} more findings in the full report.</p>` : ""}` : "";
    el.innerHTML = `
      <div class="verdict-head">
        <div>${tag(rep.verdict, true)}</div>
        <div class="small muted">${rep.cached ? "Cached result from the last 10 minutes · " : ""}Report <a href="/scan/${esc(rep.id)}" class="mono">${esc(rep.id)}</a></div>
      </div>
      <div class="target" style="margin-top:16px">${esc(rep.target)}</div>
      ${rep.url ? `<div class="small" style="margin-top:4px"><a href="${esc(rep.url)}" rel="nofollow noopener" target="_blank">${esc(rep.url)}</a></div>` : ""}
      <div class="facts">${facts}</div>
      ${notices.join("")}
      ${evidence}
      <div class="review" data-review>
        <div class="review-head"><b>AI review · second opinion</b><span data-model></span></div>
        <div class="review-text" data-review-text></div>
      </div>
      ${!full ? `<div class="actions"><a class="btn solid" href="/scan/${esc(rep.id)}">Open full report</a></div>` : ""}`;
    const box = el.querySelector("[data-review]");
    if (rep.review) return showReview(box, rep.review);
    if (f.length) streamReview(rep.id, box);
    else box.querySelector("[data-review-text]").innerHTML = `<button class="btn" data-ask>Ask the AI reviewer anyway</button>`, box.querySelector("[data-ask]").onclick = () => streamReview(rep.id, box);
  }

  function showReview(box, r) {
    box.querySelector("[data-model]").textContent = `${r.model}${r.stance ? " · " + r.stance.toLowerCase() + "s with rules" : ""}`;
    box.querySelector("[data-review-text]").textContent = r.text.replace(/^STANCE:\s*\w+\s*/i, "");
  }

  async function streamReview(id, box) {
    const out = box.querySelector("[data-review-text]");
    out.innerHTML = `<span class="muted">Reviewing the flagged code…</span> <span class="cursor"></span>`;
    try {
      const r = await fetch(`/api/v1/scan/${id}/review`);
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = await r.json();
        if (!r.ok) { out.innerHTML = `<span class="muted">${esc(j.error || "LLM review unavailable.")}</span>`; return; }
        return showReview(box, j);
      }
      box.querySelector("[data-model]").textContent = r.headers.get("x-model") || "";
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        out.innerHTML = `${esc(text.replace(/^STANCE:\s*\w+\s*/i, ""))}<span class="cursor"></span>`;
      }
      const stance = (text.match(/STANCE:\s*(AGREE|DISAGREE|UNSURE)/i) || [])[1];
      if (stance) box.querySelector("[data-model]").textContent += ` · ${stance.toLowerCase()}s with rules`;
      out.textContent = text.replace(/^STANCE:\s*\w+\s*/i, "") || "The model returned no text.";
    } catch (e) {
      out.innerHTML = `<span class="muted">LLM review failed: ${esc(e.message)}</span>`;
    }
  }

  function wire() {
    document.querySelectorAll("[data-needs-ca]").forEach((n) => n.classList.toggle("hidden", !caSet));
    document.querySelectorAll("[data-no-ca]").forEach((n) => n.classList.toggle("hidden", caSet));
    document.querySelectorAll("[data-ca]").forEach((n) => { if (caSet) n.textContent = CFG.ca; });
    document.querySelectorAll("[data-needs-burner]").forEach((n) => n.classList.toggle("hidden", !burnerSet));
    document.querySelectorAll("[data-no-burner]").forEach((n) => n.classList.toggle("hidden", burnerSet));
    const links = { burner: burnerSet ? `${CFG.explorer}/address/${CFG.feeBurner}` : "", x: CFG.xUrl, github: CFG.githubUrl, npm: CFG.npmPackage ? `https://www.npmjs.com/package/${CFG.npmPackage}` : "", pons: CFG.ponsUrl, explorer: caSet ? `${CFG.explorer}/token/${CFG.ca}` : "", dispute: CFG.disputeUrl || (CFG.githubUrl ? `${CFG.githubUrl}/issues/new` : "") };
    document.querySelectorAll("[data-link]").forEach((a) => {
      const href = links[a.dataset.link];
      if (href) a.href = href; else a.classList.add("hidden");
    });
    document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      const src = b.dataset.copy === "ca" ? CFG.ca : document.querySelector(b.dataset.copy)?.textContent || b.dataset.copy;
      try { await navigator.clipboard.writeText(src); const t = b.textContent; b.textContent = "Copied"; setTimeout(() => (b.textContent = t), 1400); } catch {}
    }));
    const btn = document.querySelector(".menu-btn");
    btn?.addEventListener("click", () => { const ul = document.querySelector(".nav ul"); ul.classList.toggle("open"); btn.setAttribute("aria-expanded", ul.classList.contains("open")); });
  }
  document.addEventListener("DOMContentLoaded", wire);

  window.BZ = { CFG, caSet, burnerSet, esc, tag, dot, ago, api, renderReport, streamReview };
})();
