/* ══════════════════════════════════════════════════════════════
   ACCOUNTS.JS — Vaults + Bank + Credit Cards
   Tab 5: Three sections with the critical safety-net banner at top.

   SAFETY NET: Compares Transfer Account balance to total credit
   card balance. Red if Transfer < Cards (you'd be short), green
   if covered.
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  const fmt = (n) => App.Storage.formatCurrency(n);

  // ── Entry point ───────────────────────────────────────────
  function render(state, container) {
    container.innerHTML = buildHtml(state);
    wireEvents(container, state);
  }

  // ── HTML ──────────────────────────────────────────────────
  function buildHtml(state) {
    const accts = state.accounts || { bank: [], vaults: [], cards: [] };
    return `
      ${renderSafetyBanner(accts)}
      ${renderVaults(accts)}
      ${renderBank(accts)}
      ${renderCards(accts)}
    `;
  }

  // ── Safety net banner ─────────────────────────────────────
  // THE critical feature. Always at top. Compares the designated
  // Transfer Account balance vs total credit card balance.
  function renderSafetyBanner(accts) {
    const transferAcct = (accts.bank || []).find(a => a.isTransferAccount);
    const transferBal  = transferAcct ? (Number(transferAcct.balance) || 0) : 0;
    const cardTotal    = (accts.cards || []).reduce((s, c) => s + (Number(c.balance) || 0), 0);
    const delta        = transferBal - cardTotal;
    const isOk         = delta >= 0;

    if (!transferAcct) {
      return `
        <div class="safety-banner" style="background:rgba(255,176,0,0.08);border:1px solid rgba(255,176,0,0.4);color:var(--neon-amber)">
          <div class="safety-banner__headline">⚠ No Transfer Account Set</div>
          <div class="text-sm" style="font-weight:400;margin-top:4px">
            Go to Setup → Accounts and mark one bank account as your Transfer Account.
          </div>
        </div>`;
    }

    return `
      <div class="safety-banner safety-banner--${isOk ? 'ok' : 'warn'}">
        <div class="safety-banner__row">
          <span>Transfer Account (${esc(transferAcct.name)})</span>
          <span class="font-mono">${fmt(transferBal)}</span>
        </div>
        <div class="safety-banner__row">
          <span>Credit Cards Total (${(accts.cards || []).length} cards)</span>
          <span class="font-mono">${fmt(cardTotal)}</span>
        </div>
        <div class="divider" style="margin:8px 0;opacity:0.4"></div>
        <div class="safety-banner__headline">
          ${isOk
            ? `✓ COVERED — Surplus ${fmt(delta)}`
            : `⚠ SHORT by ${fmt(Math.abs(delta))} — MOVE MONEY NOW`}
        </div>
      </div>`;
  }

  // ── Vaults section ────────────────────────────────────────
  function renderVaults(accts) {
    const vaults = accts.vaults || [];
    const total  = vaults.reduce((s, v) => s + (Number(v.balance) || 0), 0);

    const items = vaults.map(v => `
      <div class="list-item">
        <div style="flex:1">
          <div class="font-bold text-sm">${esc(v.name)}</div>
          <div class="font-mono text-cyan">${fmt(v.balance)}</div>
        </div>
        <button class="btn btn--secondary btn--sm" data-action="edit-vault-bal" data-id="${v.id}"
                data-name="${esc(v.name)}" data-bal="${v.balance}">Edit</button>
      </div>`).join('');

    return `
      <details class="card" open>
        <summary>
          <div>
            <div class="card-title">🏺 Vaults</div>
            <div class="card-subtitle">${vaults.length} envelopes · ${fmt(total)} total</div>
          </div>
        </summary>
        <div>
          ${items || '<p class="text-secondary text-sm">No vaults. Add them in Setup → Accounts.</p>'}
          <div class="flex-between mt-12" style="padding-top:10px;border-top:1px solid var(--border)">
            <span class="text-secondary font-bold text-sm">Total Vaults</span>
            <span class="font-mono font-bold text-cyan">${fmt(total)}</span>
          </div>
        </div>
      </details>`;
  }

  // ── Bank accounts section ─────────────────────────────────
  function renderBank(accts) {
    const bank  = accts.bank || [];
    const total = bank.reduce((s, a) => s + (Number(a.balance) || 0), 0);

    const items = bank.map(a => `
      <div class="list-item">
        <div style="flex:1">
          <div class="font-bold text-sm">
            ${esc(a.name)}
            ${a.isTransferAccount ? '<span class="badge badge--cyan" style="margin-left:6px">Transfer</span>' : ''}
          </div>
          <div class="font-mono text-cyan">${fmt(a.balance)}</div>
        </div>
        <button class="btn btn--secondary btn--sm" data-action="edit-bank-bal" data-id="${a.id}"
                data-name="${esc(a.name)}" data-bal="${a.balance}">Edit</button>
      </div>`).join('');

    return `
      <details class="card">
        <summary>
          <div>
            <div class="card-title">🏦 Bank Accounts</div>
            <div class="card-subtitle">${bank.length} accounts · ${fmt(total)} total cash</div>
          </div>
        </summary>
        <div>
          ${items || '<p class="text-secondary text-sm">No bank accounts. Add them in Setup → Accounts.</p>'}
          <div class="flex-between mt-12" style="padding-top:10px;border-top:1px solid var(--border)">
            <span class="text-secondary font-bold text-sm">Total Cash</span>
            <span class="font-mono font-bold text-cyan">${fmt(total)}</span>
          </div>
        </div>
      </details>`;
  }

  // ── Credit cards section ──────────────────────────────────
  function renderCards(accts) {
    const cards = accts.cards || [];
    const total = cards.reduce((s, c) => s + (Number(c.balance) || 0), 0);

    const cardHtml = cards.map(c => {
      const pct   = c.limit > 0 ? Math.min(100, (c.balance / c.limit) * 100) : 0;
      // Health thresholds from spec: <30% good, 30-50% caution, >50% danger
      const color     = pct >= 50 ? 'red' : pct >= 30 ? 'amber' : 'green';
      const healthIcon = pct >= 50 ? '🚨' : pct >= 30 ? '⚠️' : '✓';
      const avail = (c.limit || 0) - (c.balance || 0);

      return `
        <details class="card" style="background:var(--bg-tertiary);margin-bottom:10px">
          <summary>
            <div style="flex:1;min-width:0">
              <div class="card-title text-sm">${esc(c.name)}</div>
              <div class="flex-between mt-4">
                <span class="font-mono text-sm">
                  <span class="text-${color} font-bold">${fmt(c.balance)}</span>
                  <span class="text-secondary"> / ${fmt(c.limit)}</span>
                </span>
                <span class="badge badge--${color}">${healthIcon} ${pct.toFixed(0)}% used</span>
              </div>
              <div class="progress-bar mt-6">
                <div class="progress-bar__fill progress-bar__fill--${color}" style="width:${pct.toFixed(1)}%"></div>
              </div>
            </div>
          </summary>

          <div>
            <div class="flex-between mb-12">
              <div>
                <div class="text-xs text-secondary">Available Credit</div>
                <div class="font-mono font-bold text-green">${fmt(avail)}</div>
              </div>
              <div style="text-align:right">
                <div class="text-xs text-secondary">Credit Limit</div>
                <div class="font-mono font-bold">${fmt(c.limit)}</div>
              </div>
            </div>

            <!-- Recent transactions on this card -->
            ${renderCardTransactions(c.id)}

            <div style="display:flex;gap:8px;margin-top:12px">
              <button class="btn btn--secondary btn--sm" style="flex:1"
                      data-action="edit-card-bal" data-id="${c.id}"
                      data-name="${esc(c.name)}" data-bal="${c.balance}" data-limit="${c.limit}">
                Edit Balance
              </button>
              <button class="btn btn--primary btn--sm" style="flex:1"
                      data-action="add-payment" data-id="${c.id}"
                      data-name="${esc(c.name)}" data-bal="${c.balance}">
                Add Payment
              </button>
            </div>
          </div>
        </details>`;
    }).join('');

    return `
      <details class="card" open>
        <summary>
          <div>
            <div class="card-title">💳 Credit Cards</div>
            <div class="card-subtitle">${cards.length} cards · ${fmt(total)} total balance</div>
          </div>
        </summary>
        <div>
          ${cardHtml || '<p class="text-secondary text-sm">No credit cards. Add them in Setup → Accounts.</p>'}
          <div class="flex-between mt-4" style="padding-top:10px;border-top:1px solid var(--border)">
            <span class="text-secondary font-bold text-sm">Total Debt</span>
            <span class="font-mono font-bold text-red">${fmt(total)}</span>
          </div>
        </div>
      </details>`;
  }

  // Show the last 3 transactions on a card (from state)
  function renderCardTransactions(cardId) {
    const state = App.getState();
    const txs   = (state.transactions || [])
      .filter(tx => tx.accountId === `card-${cardId}`)
      .slice(-5)
      .reverse();
    if (!txs.length) return '<p class="text-xs text-dim">No transactions on this card yet.</p>';
    return `
      <div style="border-top:1px solid var(--border);padding-top:8px">
        ${txs.map(tx => `
          <div class="flex-between" style="padding:4px 0">
            <span class="text-xs text-secondary">${tx.date} · ${esc(tx.categoryName || '?')}</span>
            <span class="font-mono text-xs text-red">${fmt(tx.amount)}</span>
          </div>`).join('')}
      </div>`;
  }

  // ── Modals ────────────────────────────────────────────────
  function openModal(html, onSubmit) {
    const bd = document.getElementById('modal-backdrop');
    const mc = document.getElementById('modal-content');
    mc.innerHTML = html;
    bd.classList.remove('hidden');
    bd.setAttribute('aria-hidden', 'false');
    mc.querySelector('[data-action="modal-close"]')?.addEventListener('click', closeModal);
    mc.querySelector('[data-action="modal-submit"]')?.addEventListener('click', () => onSubmit(mc));
    bd.addEventListener('click', function h(e) { if (e.target === bd) { closeModal(); bd.removeEventListener('click', h); } });
    const fi = mc.querySelector('input, select');
    if (fi) setTimeout(() => fi.focus(), 50);
  }

  function closeModal() {
    const bd = document.getElementById('modal-backdrop');
    bd.classList.add('hidden');
    bd.setAttribute('aria-hidden', 'true');
    document.getElementById('modal-content').innerHTML = '';
  }

  // ── Events ────────────────────────────────────────────────
  function wireEvents(container, state) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, name, bal, limit } = btn.dataset;

      switch (action) {

        case 'edit-vault-bal':
          openModal(`
            <div class="modal-header">
              <div class="modal-title">Update ${esc(name)} Balance</div>
              <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
            </div>
            <div class="form-group">
              <label>Current Balance ($)</label>
              <input type="number" id="m-val" value="${bal}" min="0" step="0.01" />
            </div>
            <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Save</button>
          `, mc => {
            const val = parseFloat(mc.querySelector('#m-val').value) || 0;
            const ns  = App.getState();
            const idx = ns.accounts.vaults.findIndex(v => v.id === id);
            if (idx !== -1) ns.accounts.vaults[idx].balance = val;
            App.setState(ns);
            closeModal();
            App.refreshCurrentTab();
            App.showToast(`${name} updated ✓`, 'success');
          });
          break;

        case 'edit-bank-bal':
          openModal(`
            <div class="modal-header">
              <div class="modal-title">Update ${esc(name)} Balance</div>
              <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
            </div>
            <div class="form-group">
              <label>Current Balance ($)</label>
              <input type="number" id="m-val" value="${bal}" min="0" step="0.01" />
            </div>
            <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Save</button>
          `, mc => {
            const val = parseFloat(mc.querySelector('#m-val').value) || 0;
            const ns  = App.getState();
            const idx = ns.accounts.bank.findIndex(a => a.id === id);
            if (idx !== -1) ns.accounts.bank[idx].balance = val;
            App.setState(ns);
            closeModal();
            App.refreshCurrentTab();
            App.showToast(`${name} updated ✓`, 'success');
          });
          break;

        case 'edit-card-bal':
          openModal(`
            <div class="modal-header">
              <div class="modal-title">Update ${esc(name)}</div>
              <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Current Balance ($)</label>
                <input type="number" id="m-bal" value="${bal}" min="0" step="0.01" />
              </div>
              <div class="form-group">
                <label>Credit Limit ($)</label>
                <input type="number" id="m-lim" value="${limit}" min="0" step="1" />
              </div>
            </div>
            <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Save</button>
          `, mc => {
            const newBal = parseFloat(mc.querySelector('#m-bal').value) || 0;
            const newLim = parseFloat(mc.querySelector('#m-lim').value) || 0;
            const ns     = App.getState();
            const idx    = ns.accounts.cards.findIndex(c => c.id === id);
            if (idx !== -1) { ns.accounts.cards[idx].balance = newBal; ns.accounts.cards[idx].limit = newLim; }
            App.setState(ns);
            closeModal();
            App.refreshCurrentTab();
            App.showToast(`${name} updated ✓`, 'success');
          });
          break;

        case 'add-payment':
          openModal(`
            <div class="modal-header">
              <div class="modal-title">Payment — ${esc(name)}</div>
              <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
            </div>
            <p class="text-secondary text-sm mb-12">Current balance: <strong>${fmt(Number(bal))}</strong></p>
            <div class="form-group">
              <label>Payment Amount ($)</label>
              <input type="number" id="m-pay" value="${bal}" min="0" step="0.01" />
            </div>
            <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Record Payment</button>
          `, mc => {
            const payment = parseFloat(mc.querySelector('#m-pay').value) || 0;
            const ns      = App.getState();
            const idx     = ns.accounts.cards.findIndex(c => c.id === id);
            if (idx !== -1) {
              ns.accounts.cards[idx].balance = Math.max(0, ns.accounts.cards[idx].balance - payment);
            }
            App.setState(ns);
            closeModal();
            App.refreshCurrentTab();
            App.showToast(`${fmt(payment)} payment recorded ✓`, 'success');
          });
          break;
      }
    });
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  App.Accounts = { render };

})(window.App = window.App || {});
