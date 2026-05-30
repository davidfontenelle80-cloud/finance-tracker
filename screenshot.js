/* ══════════════════════════════════════════════════════════════
   SCREENSHOT.JS — Smart Balance Updater
   Drop or paste a screenshot from any bank/card portal.
   Claude Vision reads the image, matches accounts by name or
   last-4 digits, proposes updates — user confirms or overrides.
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  const fmt = (n) => App.Storage.formatCurrency(n);

  // ── Public API ────────────────────────────────────────────
  App.Screenshot = { open };

  // ── Open the screenshot modal ─────────────────────────────
  function open() {
    const state  = App.getState();
    const apiKey = (state.settings && state.settings.claudeApiKey) || '';

    if (!apiKey) {
      App.showModal(`
        <div style="padding:8px">
          <div class="card-title mb-8">📸 Screenshot Balance Updater</div>
          <p class="text-secondary text-sm mb-16">
            This feature uses Claude AI to read your screenshots and match balances
            to your accounts automatically.<br><br>
            You need a free Anthropic API key to use it.
          </p>
          <a href="https://console.anthropic.com/" target="_blank"
             class="btn btn--secondary btn--full mb-12">
            🔑 Get API Key at console.anthropic.com
          </a>
          <p class="text-xs text-secondary mb-12">Then add it in Settings → Claude API Key</p>
          <button class="btn btn--primary btn--full" onclick="App.showTab('settings');App.closeModal()">
            Go to Settings
          </button>
        </div>
      `);
      return;
    }

    App.showModal(`
      <div style="padding:8px" id="ss-modal">
        <div class="card-title mb-4">📸 Screenshot Balance Updater</div>
        <p class="text-secondary text-xs mb-12">
          Drop a screenshot or tap to upload. Works with SoFi, American Eagle,
          Citi, Costco, Chase, Discover, Fidelity — any bank or card portal.
        </p>

        <div id="ss-dropzone" style="
          border:2px dashed var(--neon-cyan);
          border-radius:12px;
          padding:32px 16px;
          text-align:center;
          cursor:pointer;
          transition:background 0.2s;
          margin-bottom:12px;
        ">
          <div style="font-size:2rem;margin-bottom:8px">📷</div>
          <div class="text-sm text-secondary">Tap to upload or paste screenshot</div>
          <div class="text-xs text-secondary mt-4">PNG, JPG supported</div>
          <input type="file" id="ss-file-input" accept="image/*" style="display:none">
        </div>

        <div id="ss-preview" style="display:none;margin-bottom:12px">
          <img id="ss-img" style="max-width:100%;border-radius:8px;border:1px solid var(--border)">
        </div>

        <div id="ss-status" class="text-xs text-secondary" style="min-height:20px;margin-bottom:8px"></div>

        <div id="ss-results" style="display:none"></div>

        <button id="ss-analyze-btn" class="btn btn--primary btn--full" style="display:none">
          🔍 Analyze Screenshot
        </button>
      </div>
    `);

    wireDropzone(apiKey);
  }

  // ── Dropzone wiring ───────────────────────────────────────
  function wireDropzone(apiKey) {
    const dz       = document.getElementById('ss-dropzone');
    const input    = document.getElementById('ss-file-input');
    const analyzeBtn = document.getElementById('ss-analyze-btn');
    if (!dz || !input) return;

    let currentFile = null;

    // Click to upload
    dz.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    // Drag and drop
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.style.background = 'rgba(0,240,255,0.08)';
    });
    dz.addEventListener('dragleave', () => { dz.style.background = ''; });
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.style.background = '';
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) handleFile(file);
    });

    // Paste anywhere in modal
    document.addEventListener('paste', function onPaste(e) {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          handleFile(item.getAsFile());
          document.removeEventListener('paste', onPaste);
          break;
        }
      }
    });

    // Analyze button
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => {
        if (currentFile) analyzeImage(currentFile, apiKey);
      });
    }

    function handleFile(file) {
      currentFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.getElementById('ss-img');
        const preview = document.getElementById('ss-preview');
        const btn = document.getElementById('ss-analyze-btn');
        if (img) img.src = e.target.result;
        if (preview) preview.style.display = 'block';
        if (btn) btn.style.display = 'block';
        setStatus('Image loaded — tap Analyze to read balances.');
      };
      reader.readAsDataURL(file);
    }
  }

  // ── Call Claude Vision API ────────────────────────────────
  async function analyzeImage(file, apiKey) {
    const btn = document.getElementById('ss-analyze-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Analyzing...'; }
    setStatus('Reading image with Claude AI...');

    try {
      const base64 = await fileToBase64(file);
      const mediaType = file.type || 'image/jpeg';
      const state = App.getState();
      const knownAccounts = buildKnownAccountsList(state);

      const prompt = `You are analyzing a financial account screenshot. Extract every account balance visible and return JSON only.

Known accounts to match against:
${knownAccounts}

Rules:
- For CREDIT CARDS: extract "Available Credit" (not current balance)
- For BANK ACCOUNTS and VAULTS: extract the account balance
- Match by account name text AND/OR last 4 digits if visible
- Extract the date if visible anywhere in the screenshot
- If multiple accounts are shown, return all of them

Return ONLY this JSON format (no markdown, no explanation):
{
  "date": "YYYY-MM-DD or null if not visible",
  "source": "bank name or portal name visible in screenshot",
  "updates": [
    {
      "matchedId": "id from known accounts list or null",
      "matchedName": "name from known accounts list or best guess",
      "confidence": "high or medium or low",
      "value": 1234.56,
      "type": "available_credit or balance",
      "rawText": "exact text seen in image for this account"
    }
  ]
}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text',  text: prompt }
            ]
          }]
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error ${response.status}`);
      }

      const data = await response.json();
      const text = data.content[0].text.trim();

      // Parse JSON — strip markdown fences if present
      const jsonText = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      const result   = JSON.parse(jsonText);

      showResults(result, state);

    } catch (err) {
      setStatus(`❌ Error: ${err.message}`);
      if (btn) { btn.disabled = false; btn.textContent = '🔍 Analyze Screenshot'; }
    }
  }

  // ── Show proposed updates ─────────────────────────────────
  function showResults(result, state) {
    const container = document.getElementById('ss-results');
    const btn       = document.getElementById('ss-analyze-btn');
    if (!container) return;

    if (btn) btn.style.display = 'none';

    const updates  = result.updates || [];
    const dateStr  = result.date ? ` · Date: ${result.date}` : '';
    const source   = result.source ? `From: ${result.source}` : 'Screenshot';

    if (!updates.length) {
      setStatus('No accounts found in this screenshot.');
      return;
    }

    setStatus(`Found ${updates.length} account(s)${dateStr}`);

    const rows = updates.map((u, i) => {
      const confColor = u.confidence === 'high' ? 'var(--neon-green)'
                      : u.confidence === 'medium' ? 'var(--neon-amber)'
                      : 'var(--text-secondary)';
      const typeLabel = u.type === 'available_credit' ? 'Available Credit' : 'Balance';
      const matched   = u.matchedId ? '✓ Matched' : '? Unmatched';
      const matchedColor = u.matchedId ? 'var(--neon-green)' : 'var(--neon-amber)';

      return `
        <div class="ss-row" style="
          background:var(--surface-2);
          border:1px solid var(--border);
          border-radius:10px;
          padding:12px;
          margin-bottom:8px;
        " data-idx="${i}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
            <div>
              <div class="text-sm font-bold">${esc(u.matchedName)}</div>
              <div class="text-xs" style="color:${matchedColor}">${matched}</div>
            </div>
            <div style="text-align:right">
              <div class="font-mono text-sm" style="color:var(--neon-cyan)">${fmt(u.value)}</div>
              <div class="text-xs text-secondary">${typeLabel}</div>
            </div>
          </div>
          <div class="text-xs text-secondary" style="margin-bottom:8px">
            Seen as: "${esc(u.rawText)}" ·
            <span style="color:${confColor}">${u.confidence} confidence</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn--primary" style="flex:1;padding:6px" 
              data-action="ss-apply" data-idx="${i}">✓ Apply</button>
            <button class="btn btn--secondary" style="flex:1;padding:6px"
              data-action="ss-skip" data-idx="${i}">✕ Skip</button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="text-xs text-secondary mb-8">${source}${dateStr}</div>
      ${rows}
      <button class="btn btn--primary btn--full mt-4" data-action="ss-apply-all">
        ✓ Apply All Matched
      </button>
    `;
    container.style.display = 'block';

    // Wire buttons
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const idx    = parseInt(btn.dataset.idx);

      if (action === 'ss-apply') {
        applyUpdate(updates[idx], result.date, state);
        markRowDone(container, idx);
      } else if (action === 'ss-skip') {
        markRowSkipped(container, idx);
      } else if (action === 'ss-apply-all') {
        updates.forEach((u, i) => {
          if (u.matchedId) {
            applyUpdate(u, result.date, state);
            markRowDone(container, i);
          }
        });
        App.showToast(`Applied ${updates.filter(u => u.matchedId).length} updates ✓`, 'success');
        setTimeout(() => App.closeModal(), 1200);
      }
    });
  }

  // ── Apply a single update to state ───────────────────────
  function applyUpdate(update, date, state) {
    if (!update.matchedId) {
      App.showToast(`No match for "${update.matchedName}" — skipped`, 'info');
      return;
    }

    const ns    = App.Storage.cloneState(App.getState());
    const accts = ns.accounts || {};
    const ts    = date || App.Storage.toISODate(new Date());
    let   applied = false;

    if (update.type === 'available_credit') {
      // Update card: available credit = limit - balance → infer balance from available
      const card = (accts.cards || []).find(c => c.id === update.matchedId);
      if (card) {
        const limit    = Number(card.limit) || 0;
        card.balance   = limit > 0 ? Math.max(0, limit - update.value) : 0;
        // Also store available directly for reference
        card.availableCredit = update.value;
        if (!card.history) card.history = [];
        card.history.push({ date: ts, availableCredit: update.value, balance: card.balance });
        if (card.history.length > 24) card.history.shift();
        applied = true;
      }
    } else {
      // Bank or vault balance
      const bank  = (accts.bank   || []).find(a => a.id === update.matchedId);
      const vault = (accts.vaults || []).find(v => v.id === update.matchedId);
      const target = bank || vault;
      if (target) {
        target.balance = update.value;
        if (!target.history) target.history = [];
        target.history.push({ date: ts, balance: update.value });
        if (target.history.length > 24) target.history.shift();
        applied = true;
      }
    }

    if (applied) {
      App.setState(ns);
      App.showToast(`${update.matchedName} → ${fmt(update.value)} ✓`, 'success');
    } else {
      App.showToast(`Could not find "${update.matchedName}" in accounts`, 'error');
    }
  }

  // ── Build known accounts list for the prompt ──────────────
  function buildKnownAccountsList(state) {
    const accts = state.accounts || {};
    const lines = [];

    (accts.cards || []).forEach(c => {
      const last4 = c.name.match(/\d{4}/) ? c.name.match(/\d{4}/)[0] : '';
      lines.push(`CARD | id:${c.id} | name:"${c.name}"${last4 ? ' | last4:'+last4 : ''} | limit:${c.limit || 0} | type:available_credit`);
    });

    (accts.bank || []).forEach(b => {
      lines.push(`BANK | id:${b.id} | name:"${b.name}" | type:balance`);
    });

    (accts.vaults || []).forEach(v => {
      lines.push(`VAULT | id:${v.id} | name:"${v.name}" | type:balance`);
    });

    return lines.join('\n') || 'No accounts configured yet.';
  }

  // ── Helpers ───────────────────────────────────────────────
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = (e) => {
        // Strip the data:image/xxx;base64, prefix
        const b64 = e.target.result.split(',')[1];
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function setStatus(msg) {
    const el = document.getElementById('ss-status');
    if (el) el.textContent = msg;
  }

  function markRowDone(container, idx) {
    const row = container.querySelector(`[data-idx="${idx}"].ss-row`);
    if (!row) return;
    row.style.opacity = '0.5';
    row.style.borderColor = 'var(--neon-green)';
    row.querySelectorAll('button').forEach(b => b.disabled = true);
  }

  function markRowSkipped(container, idx) {
    const row = container.querySelector(`[data-idx="${idx}"].ss-row`);
    if (!row) return;
    row.style.opacity  = '0.4';
    row.querySelectorAll('button').forEach(b => b.disabled = true);
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
    );
  }

})(window.App = window.App || {});
