(() => {
  const state = window.__LUMENCI_INITIAL_STATE__ || {};

  const el = {
    tbody: document.getElementById("claimChartTbody"),
    chatHistory: document.getElementById("chatHistory"),
    chatInput: document.getElementById("chatInput"),
    sendBtn: document.getElementById("sendBtn"),
    docChips: document.getElementById("docChips"),
    uploadDocBtn: document.getElementById("uploadDocBtn"),
    systemInstructions: document.getElementById("systemInstructions"),
    toast: document.getElementById("appToast"),
    toastBody: document.getElementById("toastBody"),
  };

  const ui = {
    activeRowId: null,
    pendingSuggestion: null, // {row_id, field, old_text, new_text}
    isTyping: false,
  };

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
    return "";
  }

  function toast(msg) {
    if (!el.toast) return;
    el.toastBody.textContent = msg;
    const t = bootstrap.Toast.getOrCreateInstance(el.toast, { delay: 2400 });
    t.show();
  }

  function strengthLabel(strength) {
    if (strength === "strong") return "🟢 Strong";
    if (strength === "weak") return "🟡 Weak";
    return "🔴 Missing";
  }

  function escapeHtml(s) {
    return (s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderDocs() {
    el.docChips.innerHTML = "";
    (state.uploadedDocs || []).forEach((d) => {
      const chip = document.createElement("div");
      chip.className = "doc-chip";
      chip.innerHTML = `<span class="doc-dot"></span><span>${escapeHtml(d.name)}</span>`;
      el.docChips.appendChild(chip);
    });
  }

  function renderTable() {
    const rows = state.claimChartRows || [];
    el.tbody.innerHTML = "";

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.className = "claim-row";
      tr.dataset.rowId = String(r.id);

      if (ui.activeRowId === r.id) tr.classList.add("is-active");

      const pending = ui.pendingSuggestion && ui.pendingSuggestion.row_id === r.id;
      const field = pending ? ui.pendingSuggestion.field : null;

      const strength = r.strength || "weak";

      const cell = (key) => {
        if (pending && field === key) {
          return `
            <div class="diff-old">${escapeHtml(ui.pendingSuggestion.old_text)}</div>
            <div class="diff-new">${escapeHtml(ui.pendingSuggestion.new_text)}</div>
            <div class="diff-actions">
              <button class="btn btn-sm btn-success" data-action="accept">Accept</button>
              <button class="btn btn-sm btn-outline-danger" data-action="reject">Reject</button>
            </div>
          `;
        }
        return `<div>${escapeHtml(r[key] || "")}</div>`;
      };

      tr.innerHTML = `
        <td>
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="me-2">${cell("claim")}</div>
            <span class="strength-badge ${strength}">
              <span class="dot dot-${strength}"></span>
              ${strengthLabel(strength)}
            </span>
          </div>
        </td>
        <td>${cell("evidence")}</td>
        <td>${cell("reasoning")}</td>
      `;

      el.tbody.appendChild(tr);
    });
  }

  function renderChat() {
    el.chatHistory.innerHTML = "";

    (state.chatHistory || []).forEach((m) => {
      const row = document.createElement("div");
      const isUser = m.role === "user";
      row.className = `msg-row ${isUser ? "user" : "ai"}`;

      const bubble = document.createElement("div");
      bubble.className = `bubble ${isUser ? "user" : "ai"}`;

      if (!isUser) {
        const label = document.createElement("div");
        label.className = "label";
        label.textContent = "Lumenci AI";
        bubble.appendChild(label);
      }

      const content = document.createElement("pre");
      content.textContent = m.content || "";
      bubble.appendChild(content);

      row.appendChild(bubble);
      el.chatHistory.appendChild(row);
    });

    if (ui.isTyping) {
      const row = document.createElement("div");
      row.className = "msg-row ai";
      row.innerHTML = `
        <div class="typing">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
      `;
      el.chatHistory.appendChild(row);
    }

    el.chatHistory.scrollTop = el.chatHistory.scrollHeight;
  }

  function setActiveRow(rowId) {
    ui.activeRowId = rowId;
    renderTable();
  }

  function clearPendingSuggestion() {
    ui.pendingSuggestion = null;
    ui.activeRowId = null;
    renderTable();
  }

  function pushChange(prevRows) {
    state.changeHistory = state.changeHistory || [];
    state.changeHistory.push({
      ts: Date.now(),
      prevRows: JSON.parse(JSON.stringify(prevRows)),
    });
  }

  function applySuggestion(s) {
    const prev = JSON.parse(JSON.stringify(state.claimChartRows || []));
    const rows = state.claimChartRows || [];
    const r = rows.find((x) => x.id === s.row_id);
    if (!r) return;

    pushChange(prev);

    if (s.field === "claim") r.claim = s.new_text;
    if (s.field === "evidence") r.evidence = s.new_text;
    if (s.field === "reasoning") r.reasoning = s.new_text;

    // Heuristic: if reasoning/evidence was strengthened, bump weak->strong (prototype)
    if (r.strength === "weak" && (s.field === "reasoning" || s.field === "evidence")) {
      r.strength = "strong";
    }

    clearPendingSuggestion();
    toast("Change accepted");
    syncStateToServer();
  }

  function undoLastChange() {
    const stack = state.changeHistory || [];
    if (!stack.length) {
      toast("Nothing to undo");
      return;
    }
    const last = stack.pop();
    state.claimChartRows = last.prevRows;
    clearPendingSuggestion();
    toast("Reverted to previous version");
    renderChat();
    renderDocs();
    syncStateToServer();
  }

  async function syncStateToServer() {
    // Prototype: keep session in sync so server sends the latest chart context to Claude.
    const csrf = getCookie("csrftoken");
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrf,
        },
        body: JSON.stringify({
          message: "",
          systemInstructions: state.systemInstructions || "",
          state,
        }),
      });
    } catch {
      // ignore prototype sync errors
    }
  }

  function maybeHighlightFromText(text) {
    const t = (text || "").toLowerCase();
    const m = t.match(/(?:row|element)\s*(1|2|3)/);
    if (m) setActiveRow(Number(m[1]));
  }

  async function sendMessage(msg) {
    const message = (msg ?? "").trim();
    if (!message) return;

    if (message.toLowerCase() === "undo" || message.toLowerCase() === "undo last change") {
      state.chatHistory.push({ role: "user", content: message });
      renderChat();
      undoLastChange();
      return;
    }

    state.chatHistory.push({ role: "user", content: message });
    renderChat();

    ui.isTyping = true;
    renderChat();

    const csrf = getCookie("csrftoken");

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrf,
        },
        body: JSON.stringify({
          message,
          systemInstructions: state.systemInstructions || "",
          state,
        }),
      });

      const data = await resp.json();

      ui.isTyping = false;

      if (!data.ok) {
        state.chatHistory.push({ role: "assistant", content: "Something went wrong." });
        renderChat();
        return;
      }

      state.claimChartRows = (data.state && data.state.claimChartRows) || state.claimChartRows;
      state.uploadedDocs = (data.state && data.state.uploadedDocs) || state.uploadedDocs;
      state.changeHistory = (data.state && data.state.changeHistory) || state.changeHistory;

      const assistantText = data.assistant || "";
      state.chatHistory.push({ role: "assistant", content: assistantText });

      renderChat();
      renderDocs();

      maybeHighlightFromText(assistantText);

      const suggestions = data.suggestions || [];
      if (suggestions.length) {
        const s = suggestions[0]; // prototype: handle one at a time
        ui.pendingSuggestion = {
          row_id: Number(s.row_id),
          field: s.field,
          old_text: s.old_text,
          new_text: s.new_text,
        };
        setActiveRow(ui.pendingSuggestion.row_id);
      } else {
        renderTable();
      }
    } catch (e) {
      ui.isTyping = false;
      state.chatHistory.push({
        role: "assistant",
        content: "I couldn't reach the server. Is Django running?",
      });
      renderChat();
    }
  }

  function wireEvents() {
    el.sendBtn.addEventListener("click", () => {
      const v = el.chatInput.value;
      el.chatInput.value = "";
      sendMessage(v);
    });

    el.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = el.chatInput.value;
        el.chatInput.value = "";
        sendMessage(v);
      }
    });

    document.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const text = btn.getAttribute("data-chip") || "";
        if (text === "Undo last change") {
          state.chatHistory.push({ role: "user", content: "Undo last change" });
          renderChat();
          undoLastChange();
          return;
        }
        el.chatInput.value = text;
        el.chatInput.focus();
      });
    });

    el.uploadDocBtn.addEventListener("click", () => {
      state.uploadedDocs = state.uploadedDocs || [];
      const exists = state.uploadedDocs.some((d) => d.name === "Acme_TechSpecs.pdf");
      if (!exists) {
        state.uploadedDocs.push({ name: "Acme_TechSpecs.pdf", kind: "product_doc" });
        renderDocs();
        toast("Added Acme_TechSpecs.pdf");
        syncStateToServer();
      } else {
        toast("Acme_TechSpecs.pdf already uploaded");
      }
    });

    el.systemInstructions.addEventListener("input", () => {
      state.systemInstructions = el.systemInstructions.value || "";
    });

    el.tbody.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const tr = target.closest("tr");
      if (!tr) return;
      const rowId = Number(tr.dataset.rowId);
      if (!rowId) return;

      if (target.matches("[data-action='accept']") && ui.pendingSuggestion) {
        applySuggestion(ui.pendingSuggestion);
        return;
      }
      if (target.matches("[data-action='reject']") && ui.pendingSuggestion) {
        const rejected = ui.pendingSuggestion;
        clearPendingSuggestion();
        state.chatHistory.push({
          role: "user",
          content:
            `I reject your suggestion for row ${rejected.row_id} (${rejected.field}). ` +
            "What specific technical aspect should I focus on instead?",
        });
        renderChat();
        sendMessage(
          `I rejected your suggestion for row ${rejected.row_id} (${rejected.field}). ` +
            "Ask me a clarifying question about what technical aspect to focus on next."
        );
        return;
      }

      setActiveRow(rowId);
    });
  }

  function boot() {
    el.systemInstructions.value = state.systemInstructions || "";
    renderDocs();
    renderTable();
    renderChat();
    wireEvents();
    syncStateToServer();
  }

  boot();
})();

