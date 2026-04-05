/**
 * Youvelop – Template Persistence
 * Handles: text inputs, textareas, date inputs, metric inputs,
 *          platform buttons, custom check-boxes, ten-people list
 */

(function () {
  const WORKER_URL  = (typeof window.WORKER_URL  !== 'undefined') ? window.WORKER_URL  : "";
  const TEMPLATE_ID = (typeof window.TEMPLATE_ID !== 'undefined') ? window.TEMPLATE_ID : "unknown";

  const LS_KEY     = "youvelop_access_code";
  const SAVE_DELAY = 1500;
  let   saveTimer  = null;
  let   currentCode = null;
  let   booted     = false;

  // ── UI injection ──────────────────────────────────────────────────────────
  function injectUI() {
    const style = document.createElement("style");
    style.textContent = `
      #ylv-bar {
        position: fixed; bottom: 0; left: 0; right: 0;
        background: #1a1a1a; color: #fff;
        font-family: 'IBM Plex Mono', monospace, sans-serif; font-size: 12px;
        display: flex; align-items: center; gap: 12px;
        padding: 10px 18px; z-index: 9999;
        border-top: 2px solid #4a5c2f;
        box-shadow: 0 -2px 16px rgba(0,0,0,0.4); flex-wrap: wrap;
      }
      #ylv-bar .ylv-label { color: #888; white-space: nowrap; }
      #ylv-bar .ylv-code {
        background: #2a2a2a; border: 1px solid #444; border-radius: 4px;
        padding: 4px 10px; letter-spacing: 0.12em; font-weight: 600;
        color: #c8d87a; cursor: pointer; user-select: all; white-space: nowrap;
      }
      #ylv-bar .ylv-code:hover { border-color: #c8d87a; }
      #ylv-bar .ylv-btn {
        background: none; border: 1px solid #555; border-radius: 4px;
        color: #aaa; padding: 4px 10px; font-size: 11px;
        font-family: inherit; cursor: pointer; white-space: nowrap;
      }
      #ylv-bar .ylv-btn:hover { border-color: #aaa; color: #fff; }
      #ylv-bar .ylv-status {
        color: #6a8a3a; font-size: 11px; margin-left: auto;
        white-space: nowrap; transition: opacity 0.4s;
      }
      #ylv-modal-overlay {
        display: none; position: fixed; inset: 0;
        background: rgba(0,0,0,0.7); z-index: 10000;
        align-items: center; justify-content: center;
      }
      #ylv-modal-overlay.open { display: flex; }
      #ylv-modal {
        background: #1a1a1a; border: 1px solid #444; border-radius: 8px;
        padding: 28px 32px; max-width: 380px; width: 90%;
        font-family: 'IBM Plex Mono', monospace, sans-serif; color: #fff;
      }
      #ylv-modal h3 { margin: 0 0 8px; font-size: 14px; color: #c8d87a; letter-spacing: 0.08em; }
      #ylv-modal p  { margin: 0 0 16px; font-size: 12px; color: #888; line-height: 1.6; }
      #ylv-modal input {
        width: 100%; box-sizing: border-box; background: #2a2a2a;
        border: 1px solid #555; border-radius: 4px; color: #fff;
        font-family: inherit; font-size: 14px; letter-spacing: 0.12em;
        padding: 10px 12px; margin-bottom: 12px; text-transform: uppercase;
      }
      #ylv-modal input:focus { outline: none; border-color: #c8d87a; }
      #ylv-modal .ylv-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
      #ylv-modal .ylv-modal-actions button {
        font-family: inherit; font-size: 12px; padding: 8px 16px;
        border-radius: 4px; cursor: pointer; border: 1px solid #555;
        background: none; color: #aaa;
      }
      #ylv-modal .ylv-modal-actions button.primary {
        background: #4a5c2f; border-color: #4a5c2f; color: #fff;
      }
      #ylv-modal .ylv-modal-actions button:hover { opacity: 0.85; }
      #ylv-modal .ylv-error { color: #e07070; font-size: 11px; margin-top: -8px; margin-bottom: 10px; display: none; }
    `;
    document.head.appendChild(style);

    const bar = document.createElement("div");
    bar.id = "ylv-bar";
    bar.innerHTML = `
      <span class="ylv-label">YOUR ACCESS CODE</span>
      <span class="ylv-code" id="ylv-code-display" title="Click to copy">——————</span>
      <button class="ylv-btn" id="ylv-switch-btn">Use different code</button>
      <span class="ylv-status" id="ylv-status"></span>
    `;
    document.body.appendChild(bar);

    const modal = document.createElement("div");
    modal.id = "ylv-modal-overlay";
    modal.innerHTML = `
      <div id="ylv-modal">
        <h3>LOAD YOUR PROGRESS</h3>
        <p>Enter your access code to load your saved answers on this device.</p>
        <input type="text" id="ylv-code-input" placeholder="UGLY-XXXX-XX" maxlength="12" />
        <div class="ylv-error" id="ylv-modal-error">Code not found. Check for typos.</div>
        <div class="ylv-modal-actions">
          <button id="ylv-modal-cancel">Cancel</button>
          <button class="primary" id="ylv-modal-load">Load my answers</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("ylv-code-display").addEventListener("click", copyCode);
    document.getElementById("ylv-switch-btn").addEventListener("click", openModal);
    document.getElementById("ylv-modal-cancel").addEventListener("click", closeModal);
    document.getElementById("ylv-modal-load").addEventListener("click", handleModalLoad);
    document.getElementById("ylv-code-input").addEventListener("keydown", e => { if (e.key === "Enter") handleModalLoad(); });
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  }

  // ── Access code ───────────────────────────────────────────────────────────
  function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const rand = n => Array.from({length: n}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    return `UGLY-${rand(4)}-${rand(2)}`;
  }
  function getOrCreateCode() {
    let code = localStorage.getItem(LS_KEY);
    if (!code) { code = generateCode(); localStorage.setItem(LS_KEY, code); }
    return code;
  }
  function setCode(code) {
    localStorage.setItem(LS_KEY, code);
    currentCode = code;
    document.getElementById("ylv-code-display").textContent = code;
  }
  function copyCode() {
    navigator.clipboard.writeText(currentCode).then(() => setStatus("Copied!", 2000));
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function openModal() {
    document.getElementById("ylv-modal-overlay").classList.add("open");
    document.getElementById("ylv-code-input").value = "";
    document.getElementById("ylv-modal-error").style.display = "none";
    setTimeout(() => document.getElementById("ylv-code-input").focus(), 50);
  }
  function closeModal() { document.getElementById("ylv-modal-overlay").classList.remove("open"); }
  async function handleModalLoad() {
    const input = document.getElementById("ylv-code-input").value.trim().toUpperCase();
    if (!input) return;
    setStatus("Loading...");
    const result = await loadAnswers(input);
    if (!result.found) {
      document.getElementById("ylv-modal-error").style.display = "block";
      setStatus(""); return;
    }
    setCode(input);
    applyAnswers(result.answers);
    closeModal();
    setStatus("Progress loaded ✓", 3000);
  }

  // ── Collect all field state ───────────────────────────────────────────────
  function collectAnswers() {
    const answers = {};

    // Standard inputs + textareas (need id or name)
    document.querySelectorAll("input[id], input[name], textarea[id], textarea[name]").forEach(el => {
      const key = el.id || el.name;
      if (el.type === "checkbox" || el.type === "radio") {
        answers[key] = el.checked;
      } else {
        answers[key] = el.value;
      }
    });

    // Date inputs (no id) — index by position
    document.querySelectorAll("input[type='date']").forEach((el, i) => {
      answers[`__date_${i}`] = el.value;
    });

    // Nameless text/number inputs inside metric-field — index by position
    document.querySelectorAll(".metric-field input").forEach((el, i) => {
      answers[`__metric_${i}`] = el.value;
    });

    // Ten-people list inputs
    document.querySelectorAll("#ten-people input").forEach((el, i) => {
      answers[`__person_${i}`] = el.value;
    });

    // Nameless textareas (pcb-body, day5 textareas without id)
    document.querySelectorAll("textarea:not([id])").forEach((el, i) => {
      answers[`__textarea_${i}`] = el.value;
    });

    // Nameless text inputs (field-input without id)
    document.querySelectorAll("input[type='text'].field-input:not([id])").forEach((el, i) => {
      answers[`__fieldinput_${i}`] = el.value;
    });

    // Platform buttons — store selected text per group
    document.querySelectorAll(".platform-row").forEach((row, i) => {
      const selected = row.querySelector(".platform-btn.selected");
      answers[`__platform_${i}`] = selected ? selected.textContent.trim() : "";
    });

    // Custom check-boxes
    document.querySelectorAll(".check-box").forEach((el, i) => {
      answers[`__checkbox_${i}`] = el.classList.contains("checked");
    });

    return answers;
  }

  // ── Apply saved state ─────────────────────────────────────────────────────
  function applyAnswers(answers) {
    // Standard inputs + textareas
    document.querySelectorAll("input[id], input[name], textarea[id], textarea[name]").forEach(el => {
      const key = el.id || el.name;
      if (!(key in answers)) return;
      if (el.type === "checkbox" || el.type === "radio") {
        el.checked = answers[key];
      } else {
        el.value = answers[key];
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    // Date inputs
    document.querySelectorAll("input[type='date']").forEach((el, i) => {
      const v = answers[`__date_${i}`];
      if (v !== undefined) el.value = v;
    });

    // Metric inputs
    document.querySelectorAll(".metric-field input").forEach((el, i) => {
      const v = answers[`__metric_${i}`];
      if (v !== undefined) el.value = v;
    });

    // Ten-people
    document.querySelectorAll("#ten-people input").forEach((el, i) => {
      const v = answers[`__person_${i}`];
      if (v !== undefined) el.value = v;
    });

    // Nameless textareas
    document.querySelectorAll("textarea:not([id])").forEach((el, i) => {
      const v = answers[`__textarea_${i}`];
      if (v !== undefined) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }
    });

    // Nameless field-inputs
    document.querySelectorAll("input[type='text'].field-input:not([id])").forEach((el, i) => {
      const v = answers[`__fieldinput_${i}`];
      if (v !== undefined) el.value = v;
    });

    // Platform buttons
    document.querySelectorAll(".platform-row").forEach((row, i) => {
      const saved = answers[`__platform_${i}`];
      if (!saved) return;
      row.querySelectorAll(".platform-btn").forEach(btn => {
        btn.classList.toggle("selected", btn.textContent.trim() === saved);
      });
    });

    // Custom check-boxes
    document.querySelectorAll(".check-box").forEach((el, i) => {
      const v = answers[`__checkbox_${i}`];
      if (v !== undefined) el.classList.toggle("checked", v);
    });
  }

  // ── Save / load ───────────────────────────────────────────────────────────
  async function saveAnswers() {
    const answers = collectAnswers();
    try {
      const res = await fetch(`${WORKER_URL}/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentCode, template: TEMPLATE_ID, answers }),
      });
      if (res.ok) setStatus("Saved ✓", 2000);
      else        setStatus("Save failed", 3000);
    } catch {
      setStatus("Offline – will retry on next change", 3000);
    }
  }

  async function loadAnswers(code) {
    try {
      const res = await fetch(
        `${WORKER_URL}/data?id=${encodeURIComponent(code)}&template=${encodeURIComponent(TEMPLATE_ID)}`
      );
      return await res.json();
    } catch {
      return { found: false, answers: {} };
    }
  }

  function scheduleSave() {
    if (!booted) return;
    clearTimeout(saveTimer);
    setStatus("Saving...");
    saveTimer = setTimeout(saveAnswers, SAVE_DELAY);
  }

  // ── Status ────────────────────────────────────────────────────────────────
  let statusTimer = null;
  function setStatus(msg, clearAfter = 0) {
    const el = document.getElementById("ylv-status");
    if (!el) return;
    el.textContent = msg;
    clearTimeout(statusTimer);
    if (clearAfter) statusTimer = setTimeout(() => { el.textContent = ""; }, clearAfter);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  async function init() {
    injectUI();
    currentCode = getOrCreateCode();
    document.getElementById("ylv-code-display").textContent = currentCode;

    // Wait for dynamic content (ten-people list) to render
    await new Promise(r => setTimeout(r, 300));

    setStatus("Loading your progress...");
    const result = await loadAnswers(currentCode);
    if (result.found) {
      applyAnswers(result.answers);
      setStatus("Progress loaded ✓", 3000);
    } else {
      setStatus("");
    }

    booted = true;

    // Watch everything
    document.addEventListener("input",  scheduleSave);
    document.addEventListener("change", scheduleSave);

    // Platform buttons and check-boxes use onclick — patch them to also trigger save
    // We use a MutationObserver to catch dynamically added elements too
    const observer = new MutationObserver(() => {
      if (booted) scheduleSave();
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
