/* ══════════════════════════════════════════════════════════════
   ACCOUNTS.JS — Vaults + Bank + Credit Cards
   Phase 1 features built in:
   1. Vault sub-items: named line items, balance = sum of items
   2. Transfer Account CC coverage monitor + exclude toggle
   3. Inline balance editing: tap any balance to edit in place
   4. Credit card edit: enter by Available Credit OR Balance (live sync)
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  var t = function(k) { return App.Lang ? App.Lang.t(k) : k; };

  const fmt = (n) => App.Storage.formatCurrency(n);

  // Vault effective balance: sum of items when defined, else manual balance
  function vaultBalance(vault) {
    if (vault.items && vault.items.length > 0) {
      return vault.items.reduce((s, item) => s + (Number(item.amount) || 0), 0);
    }
    return Number(vault.balance) || 0;
  }

  // ── Entry point ───────────────────────────────────────────
  function render(state, container) {
    container.innerHTML = buildHtml(state);
    wireEvents(container, state);
  }

  // ── HTML ──────────────────────────────────────────────────
  function buildHtml(state) {
    const accts = state.accounts || { bank: [], vaults: [], cards: [] };
    return `
${renderSafetyBanner(state, accts)}
      ${renderSubscriptions(state)}
      ${renderVaults(accts)}
      ${renderBank(accts)}
      ${renderCards(accts)}
    `;
  }


  // ── Subscription / Hold Account tracker ──────────────────
  // Monthly recurring bills: name, amount, due day, paid toggle,
  // add-to-paycheck toggle. Past-due items show a warning badge.
  function renderSubscriptions(state) {
    const subs  = state.subscriptions || [];
    const today = new Date();
    const dom   = today.getDate();   // current day of month
    const month = today.getMonth();
    const year  = today.getFullYear();

    if (!subs.length) {
      return `<details class="card">
        <summary><div class="card-title">📋 Subscriptions</div></summary>
        <div><p class="text-secondary text-sm">No subscriptions. Add one below.</p>
        <button class="btn btn--secondary btn--sm mt-8" data-action="add-sub">+ Add Subscription</button></div>
      </details>`;
    }

    const total     = subs.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const paidTotal = subs.filter(x => x.paid).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const unpaid    = total - paidTotal;
    const addTotal  = subs.filter(x => x.addToPaycheck && !x.paid)
                          .reduce((s, x) => s + (Number(x.amount) || 0), 0);

    function dueStatus(sub) {
      if (sub.paid) return { label: '✓ Paid', cls: 'text-green', urgent: false };
      if (!sub.dueDay) return { label: 'No date', cls: 'text-secondary', urgent: false };
      const dueDate = new Date(year, month, sub.dueDay);
      const diff    = Math.ceil((dueDate - today) / 86400000);
      if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: 'text-red',   urgent: true  };
      if (diff === 0) return { label: 'Due today',                  cls: 'text-amber', urgent: true  };
      if (diff <= 5)  return { label: `Due in ${diff}d`,           cls: 'text-amber', urgent: true  };
      return { label: `Due ${sub.dueDay < 10 ? '0' : ''}${sub.dueDay}`,
               cls: 'text-secondary', urgent: false };
    }

    const rows = subs.map(sub => {
      const ds  = dueStatus(sub);
      return `
        <div class="list-item" style="display:block;padding:10px 16px;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="font-bold text-sm">${esc(sub.name)}</span>
                ${ds.urgent && !sub.paid ? `<span class="badge" style="background:rgba(255,100,0,0.18);color:var(--amber);font-size:0.65rem;padding:1px 5px;border-radius:4px">${ds.label}</span>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:10px;margin-top:4px;flex-wrap:wrap">
                <span class="font-mono text-sm">${fmt(sub.amount)}/mo</span>
                ${!ds.urgent || sub.paid ? `<span class="text-xs ${ds.cls}">${ds.label}</span>` : ''}
                ${sub.addToPaycheck && !sub.paid ? '<span class="text-xs text-cyan">→ Adding to paycheck</span>' : ''}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              <button class="btn btn--sm ${sub.paid ? 'btn--primary' : 'btn--secondary'}"
                      data-action="sub-toggle-paid"
                      data-id="${sub.id}"
                      style="min-width:52px;font-size:0.75rem">
                ${sub.paid ? '✓ Paid' : t('ui.markPaid')}
              </button>
              <button class="btn btn--sm ${sub.addToPaycheck ? 'btn--primary' : 'btn--secondary'}"
                      data-action="sub-toggle-add"
                      data-id="${sub.id}"
                      title="Add to next paycheck"
                      style="font-size:0.75rem;padding:4px 8px">
                ${sub.addToPaycheck ? '📋 Added' : '+ Check'}
              </button>
              <button class="btn btn--icon btn--secondary"
                      data-action="sub-edit"
                      data-id="${sub.id}"
                      data-name="${esc(sub.name)}"
                      data-amount="${sub.amount}"
                      data-dueday="${sub.dueDay || 0}"
                      style="font-size:0.8rem;padding:4px 7px">✎</button>
            </div>
          </div>
        </div>`;
    }).join('');

    const urgentCount = subs.filter(s => !s.paid && dueStatus(s).urgent).length;

    return `
      <details class="card" ${urgentCount > 0 ? 'open' : ''} style="padding:0;overflow:hidden">
        <summary style="padding:14px 16px">
          <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
            <div>
              <div class="card-title">📋 Subscriptions
                ${urgentCount > 0 ? `<span class="badge" style="background:rgba(255,100,0,0.18);color:var(--amber);margin-left:6px;font-size:0.7rem">${urgentCount} due soon</span>` : ''}
              </div>
              <div class="card-subtitle">${subs.length} subs · ${fmt(total)}/mo · ${fmt(unpaid)} unpaid</div>
            </div>
          </div>
        </summary>
        <div>
          ${rows}
          <div style="padding:10px 16px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border);flex-wrap:wrap;gap:8px">
            <div class="text-xs text-secondary">
              ${addTotal > 0 ? `<span class="text-cyan font-bold">${fmt(addTotal)} queued for next paycheck</span>` : 'None queued for paycheck'}
            </div>
            <button class="btn btn--secondary btn--sm" data-action="add-sub">+ Add</button>
          </div>
        </div>
      </details>`;
  }

  // ── Safety net banner ─────────────────────────────────────
  // Transfer Account balance vs total CC balance.
  // Toggle lets user exclude Transfer Account from the deficit calculation
  // (e.g. when Transfer Account funds are already earmarked elsewhere).
  function renderSafetyBanner(state, accts) {
    const settings     = state.settings || {};
    const excluded     = !!settings.excludeTransferFromDeficit;
    const transferAcct = (accts.bank || []).find(a => a.isTransferAccount);
    const transferBal  = transferAcct ? (Number(transferAcct.balance) || 0) : 0;
    const cardTotal    = (accts.cards || []).reduce((s, c) => s + (Number(c.balance) || 0), 0);
    const delta        = excluded ? -cardTotal : transferBal - cardTotal;
    const isOk         = !excluded && delta >= 0;

    if (!transferAcct) {
      return `
        <div class="safety-banner" style="background:rgba(255,176,0,0.08);border:1px solid rgba(255,176,0,0.4);color:var(--neon-amber)">
          <div class="safety-banner__headline">&#9888; No Transfer Account Set</div>
          <div class="text-sm" style="font-weight:400;margin-top:4px">
            Go to Setup &rarr; Accounts and mark one bank account as your Transfer Account. In SoFi, this is your Checking account.
          </div>
        </div>`;
    }

    return `
      <div class="safety-banner safety-banner--${isOk ? 'ok' : 'warn'}">
        <div class="safety-banner__row">
          <span>Transfer Account (${esc(transferAcct.name)})</span>
          <span class="font-mono">${excluded ? '<span class="text-secondary" style="font-style:italic">excluded</span>' : fmt(transferBal)}</span>
        </div>
        <div class="safety-banner__row">
          <span>Credit Cards Total (${(accts.cards || []).length} cards)</span>
          <span class="font-mono">${fmt(cardTotal)}</span>
        </div>
        <div class="divider" style="margin:8px 0;opacity:0.4"></div>
        <div class="safety-banner__headline">
          ${isOk
            ? `&#10003; COVERED &mdash; Surplus ${fmt(delta)}`
            : excluded
            ? `&#9888; SHORT by ${fmt(cardTotal)} &mdash; Transfer excluded`
            : `&#9888; SHORT by ${fmt(Math.abs(delta))} &mdash; MOVE MONEY NOW`}
        </div>
        <div style="margin-top:10px">
          <button class="btn btn--sm ${excluded ? 'btn--primary' : 'btn--secondary'}"
                  data-action="toggle-transfer-exclude"
                  style="font-size:0.75rem">
            ${excluded ? '&#10003; Transfer Excluded' : 'Exclude Transfer Acct'}
          </button>
        </div>
      </div>`;
  }

  // ── Vaults section ────────────────────────────────────────
  function renderVaults(accts) {
    const vaults = accts.vaults || [];
    const total  = vaults.reduce((s, v) => s + vaultBalance(v), 0);

    const rows = vaults.map(v => {
      const bal      = vaultBalance(v);
      const hasItems = v.items && v.items.length > 0;
      return `
        <details class="vault-row" style="border-bottom:1px solid var(--border);padding:2px 0">
          <summary style="display:flex;align-items:center;justify-content:space-between;padding:10px 4px;cursor:pointer;list-style:none;-webkit-appearance:none">
            <div style="flex:1">
              <div class="font-bold text-sm">${esc(v.name)}</div>
              ${hasItems ? `<div class="text-xs text-secondary">${v.items.length} item${v.items.length !== 1 ? 's' : ''}</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="font-mono text-cyan font-bold">${fmt(bal)}</span>
              <button class="btn btn--icon btn--secondary"
                      data-action="inline-edit"
                      data-id="${v.id}"
                      data-type="vault"
                      data-bal="${bal}"
                      style="padding:3px 7px;font-size:0.75rem;opacity:0.7"
                      title="Edit balance">✎</button>
            </div>
            <span style="margin-left:8px;font-size:0.65rem;color:var(--text-secondary);user-select:none">&#9660;</span>
          </summary>
          <div style="padding:6px 4px 10px 12px">
            ${renderVaultItems(v)}
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
              <button class="btn btn--secondary btn--sm"
                      data-action="add-vault-item"
                      data-id="${v.id}"
                      data-name="${esc(v.name)}">+ Add Item</button>
              ${!hasItems ? `
              <button class="btn btn--secondary btn--sm"
                      data-action="edit-vault-bal"
                      data-id="${v.id}"
                      data-name="${esc(v.name)}"
                      data-bal="${v.balance}">Edit Balance</button>` : ''}
            </div>
          </div>
        </details>`;
    }).join('');

    return `
      <details class="card" open>
        <summary>
          <div>
            <div class="card-title">&#127994; Vaults</div>
            <div class="card-subtitle">${vaults.length} envelopes &middot; ${fmt(total)} total</div>
          </div>
        </summary>
        <div>
          ${rows || '<p class="text-secondary text-sm">No vaults. Add them in Setup &rarr; Accounts.</p>'}
          <div class="flex-between mt-12" style="padding-top:10px;border-top:1px solid var(--border)">
            <span class="text-secondary font-bold text-sm">Total Vaults</span>
            <span class="font-mono font-bold text-cyan">${fmt(total)}</span>
          </div>
        </div>
      </details>`;
  }

  function renderVaultItems(vault) {
    if (!vault.items || vault.items.length === 0) {
      return '<p class="text-xs text-secondary" style="margin:4px 0 6px;opacity:0.7">No sub-items &mdash; balance is manual.</p>';
    }
    const subtotal = vault.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const rows = vault.items.map(item => `
      <div class="flex-between" style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
        <span class="text-sm">${esc(item.name)}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="font-mono text-sm text-cyan">${fmt(item.amount)}</span>
          <button class="btn btn--icon btn--secondary"
                  style="padding:1px 5px;font-size:0.7rem;line-height:1.4"
                  data-action="edit-vault-item"
                  data-vault-id="${vault.id}"
                  data-item-id="${item.id}"
                  data-item-name="${esc(item.name)}"
                  data-item-amount="${item.amount}"
                  title="Edit">&#9998;</button>
          <button class="btn btn--icon btn--secondary"
                  style="padding:1px 5px;font-size:0.7rem;line-height:1.4;color:var(--color-danger)"
                  data-action="delete-vault-item"
                  data-vault-id="${vault.id}"
                  data-item-id="${item.id}"
                  data-item-name="${esc(item.name)}"
                  title="Delete">&#10005;</button>
        </div>
      </div>`).join('');

    return `
      ${rows}
      <div class="flex-between" style="padding:6px 0 2px;font-weight:700">
        <span class="text-xs text-secondary">Subtotal</span>
        <span class="font-mono text-xs text-cyan">${fmt(subtotal)}</span>
      </div>`;
  }

  // ── Bank accounts section ─────────────────────────────────
  function renderBank(accts) {
    const bank  = accts.bank || [];
    const total = bank.reduce((s, a) => s + (Number(a.balance) || 0), 0);

    const rows = bank.map(a => `
      <div class="list-item" style="padding:10px 4px">
        <div style="flex:1">
          <div class="font-bold text-sm">
            ${esc(a.name)}
            ${a.isTransferAccount ? '<span class="badge badge--cyan" style="margin-left:6px">Transfer</span>' : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="font-mono text-cyan font-bold">${fmt(a.balance)}</span>
          <button class="btn btn--icon btn--secondary"
                  data-action="inline-edit"
                  data-id="${a.id}"
                  data-type="bank"
                  data-bal="${a.balance}"
                  style="padding:3px 7px;font-size:0.75rem;opacity:0.7"
                  title="Edit balance">✎</button>
        </div>
      </div>`).join('');

    return `
      <details class="card" open>
        <summary>
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
              <div>
                <div class="card-title">&#127970; Bank Accounts</div>
                <div class="card-subtitle">${bank.length} accounts &middot; ${fmt(total)} total cash &middot; <span style="color:var(--text-dim);font-size:0.72rem">tap ✎ to edit</span></div>
              </div>
              <button class="btn btn--secondary btn--sm" data-action="scan-screenshot"
                      style="flex-shrink:0;margin-left:8px;font-size:0.72rem">
                &#128247; Scan
              </button>
            </div>
          </div>
        </summary>
        <div>
          ${rows || '<p class="text-secondary text-sm">No bank accounts. Add them in Setup &rarr; Accounts.</p>'}
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
      const pct        = c.limit > 0 ? Math.min(100, (c.balance / c.limit) * 100) : 0;
      const color      = pct >= 30 ? (pct >= 50 ? 'red' : 'amber') : 'green';
      const statusText = pct >= 50 ? '🚨 High' : pct >= 30 ? '⚠ Watch' : '✓ Good';
      const avail      = (c.limit || 0) - (c.balance || 0);

      return `
        <details class="card" style="background:var(--bg-tertiary);margin-bottom:10px">
          <summary>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <div class="card-title text-sm">${esc(c.name)}</div>
                <span class="badge badge--${color}" style="flex-shrink:0;margin-left:8px">${statusText} &middot; ${pct.toFixed(0)}%</span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px">
                <div>
                  <div class="text-xs text-secondary">Balance</div>
                  <div class="font-mono font-bold text-${color} text-sm">${fmt(c.balance)}</div>
                </div>
                <div style="text-align:right">
                  <div class="text-xs text-secondary">Available</div>
                  <div class="font-mono font-bold text-green text-sm">${fmt(avail)}</div>
                </div>
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

            ${renderCardTransactions(c.id)}

            <div style="display:flex;gap:8px;margin-top:12px">
              <button class="btn btn--secondary btn--sm" style="flex:1"
                      data-action="edit-card-bal"
                      data-id="${c.id}"
                      data-name="${esc(c.name)}"
                      data-bal="${c.balance}"
                      data-limit="${c.limit}"
                      data-avail="${avail}">
                Edit Balance
              </button>
              <button class="btn btn--primary btn--sm" style="flex:1"
                      data-action="add-payment"
                      data-id="${c.id}"
                      data-name="${esc(c.name)}"
                      data-bal="${c.balance}">
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
            <div class="card-title">&#128179; Credit Cards</div>
            <div class="card-subtitle">${cards.length} cards &middot; <span class="text-red">${fmt(total)} owed</span> &middot; <span class="text-green">${fmt(cards.reduce((s,c) => s + Math.max(0, (c.limit||0) - (c.balance||0)), 0))} available</span></div>
          </div>
        </summary>
        <div>
          ${cardHtml || '<p class="text-secondary text-sm">No credit cards. Add them in Setup &rarr; Accounts.</p>'}
          <div class="flex-between mt-4" style="padding-top:10px;border-top:1px solid var(--border)">
            <span class="text-secondary font-bold text-sm">Total Debt</span>
            <span class="font-mono font-bold text-red">${fmt(total)}</span>
          </div>
        </div>
      </details>`;
  }

  // Last 5 transactions on a card
  function renderCardTransactions(cardId) {
    const state = App.getState();
    const txs   = (state.transactions || [])
      .filter(tx => tx.accountId === 'card-' + cardId)
      .slice(-5)
      .reverse();
    if (!txs.length) return '<p class="text-xs text-dim">No transactions on this card yet.</p>';
    return `
      <div style="border-top:1px solid var(--border);padding-top:8px">
        ${txs.map(tx => `
          <div class="flex-between" style="padding:4px 0">
            <span class="text-xs text-secondary">${tx.date} &middot; ${esc(tx.categoryName || '?')}</span>
            <span class="font-mono text-xs text-red">${fmt(tx.amount)}</span>
          </div>`).join('')}
      </div>`;
  }

  // ── Modal helpers ─────────────────────────────────────────
  function openModal(html, onSubmit) {
    const bd = document.getElementById('modal-backdrop');
    const mc = document.getElementById('modal-content');
    mc.innerHTML = html;
    bd.classList.remove('hidden');
    bd.setAttribute('aria-hidden', 'false');
    mc.querySelector('[data-action="modal-close"]')
      .addEventListener('click', closeModal);
    mc.querySelector('[data-action="modal-submit"]')
      .addEventListener('click', () => onSubmit(mc));
    bd.addEventListener('click', function h(e) {
      if (e.target === bd) { closeModal(); bd.removeEventListener('click', h); }
    });
    const fi = mc.querySelector('input, select');
    if (fi) setTimeout(() => fi.focus(), 50);
  }

  function closeModal() {
    const bd = document.getElementById('modal-backdrop');
    bd.classList.add('hidden');
    bd.setAttribute('aria-hidden', 'true');
    document.getElementById('modal-content').innerHTML = '';
  }

  // ── Event wiring ──────────────────────────────────────────
  function wireEvents(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const ds = btn.dataset;

      switch (ds.action) {

        // ── Inline balance edit (vault or bank) ──────────
        case 'inline-edit': {
          const id     = ds.id;
          const type   = ds.type;
          const oldVal = parseFloat(ds.bal) || 0;
          const input  = document.createElement('input');
          input.type   = 'number';
          input.step   = '0.01';
          input.min    = '0';
          input.value  = oldVal;
          input.style.cssText = [
            'width:90px',
            'font-family:var(--font-mono,monospace)',
            'font-size:0.9rem',
            'background:var(--bg-tertiary,#1a1a2e)',
            'border:1px solid var(--color-primary,#00f0ff)',
            'border-radius:4px',
            'padding:2px 6px',
            'color:var(--text-primary,#e0e0e0)',
            'text-align:right'
          ].join(';');
          btn.replaceWith(input);
          input.focus();
          input.select();

          let saved = false;
          function saveInline() {
            if (saved) return;
            saved = true;
            const val = parseFloat(input.value);
            if (isNaN(val)) { App.refreshCurrentTab(); return; }
            const ns = App.Storage.cloneState(App.getState());
            if (type === 'vault') {
              const idx = ns.accounts.vaults.findIndex(v => v.id === id);
              if (idx !== -1) ns.accounts.vaults[idx].balance = val;
            } else if (type === 'bank') {
              const idx = ns.accounts.bank.findIndex(a => a.id === id);
              if (idx !== -1) ns.accounts.bank[idx].balance = val;
            }
            App.setState(ns);
            App.showToast('Saved ✓', 'success');
          }

          input.addEventListener('blur',    saveInline);
          input.addEventListener('keydown', ev => {
            if (ev.key === 'Enter')  { ev.preventDefault(); saveInline(); }
            if (ev.key === 'Escape') { App.refreshCurrentTab(); }
          });
          break;
        }

        // ── Screenshot OCR scan ──────────────────────────────
        case 'scan-screenshot':
        case 'open-screenshot':
          if (App.Screenshot) App.Screenshot.open();
          else App.showToast('Screenshot module not loaded', 'error');
          break;

        // ── Subscription: mark paid ──────────────────────────
        case 'sub-toggle-paid': {
          const ns  = App.Storage.cloneState(App.getState());
          const sub = (ns.subscriptions || []).find(s => s.id === btn.dataset.id);
          if (sub) { sub.paid = !sub.paid; App.setState(ns); }
          break;
        }

        // ── Subscription: add to paycheck toggle ─────────────
        case 'sub-toggle-add': {
          const ns  = App.Storage.cloneState(App.getState());
          const sub = (ns.subscriptions || []).find(s => s.id === btn.dataset.id);
          if (sub) { sub.addToPaycheck = !sub.addToPaycheck; App.setState(ns); }
          break;
        }

        // ── Subscription: edit ────────────────────────────────
        case 'sub-edit':
          openModal(`
            <div class="modal-header">
              <div class="modal-title">Edit Subscription</div>
              <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
            </div>
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="m-sub-name" enterkeyhint="next" value="${esc(btn.dataset.name)}" />
            </div>
            <div class="form-group">
              <label>Monthly Amount ($)</label>
              <input type="number" id="m-sub-amt" value="${btn.dataset.amount}" min="0" step="0.01" inputmode="decimal" />
            </div>
            <div class="form-group">
              <label>Day of Month Due (0 = no fixed date)</label>
              <input type="number" id="m-sub-day" value="${btn.dataset.dueday}" min="0" max="31" step="1" inputmode="numeric" />
            </div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button class="btn btn--primary" style="flex:1" data-action="modal-submit">'+t('common.save')+'</button>
              <button class="btn btn--secondary" style="color:var(--coral)" data-action="sub-delete" data-id="${btn.dataset.id}">Delete</button>
            </div>
          `, mc => {
            const name   = mc.querySelector('#m-sub-name').value.trim();
            const amount = parseFloat(mc.querySelector('#m-sub-amt').value) || 0;
            const dueDay = parseInt(mc.querySelector('#m-sub-day').value)  || 0;
            if (!name) return;
            const ns  = App.Storage.cloneState(App.getState());
            const sub = (ns.subscriptions || []).find(s => s.id === btn.dataset.id);
            if (sub) { sub.name = name; sub.amount = amount; sub.dueDay = dueDay; }
            App.setState(ns);
            closeModal();
            App.showToast(name + ' updated ✓', 'success');
          });
          break;

        // ── Subscription: delete (from edit modal) ────────────
        case 'sub-delete': {
          const ns = App.Storage.cloneState(App.getState());
          ns.subscriptions = (ns.subscriptions || []).filter(s => s.id !== btn.dataset.id);
          App.setState(ns);
          closeModal();
          App.showToast('Subscription removed', 'success');
          break;
        }

        // ── Subscription: add new ─────────────────────────────
        case 'add-sub':
          openModal(`
            <div class="modal-header">
              <div class="modal-title">Add Subscription</div>
              <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
            </div>
            <div class="form-group">
              <label>Name</label>
              <input type="text" id="m-sub-name" enterkeyhint="next" placeholder="e.g. Spotify" />
            </div>
            <div class="form-group">
              <label>Monthly Amount ($)</label>
              <input type="number" id="m-sub-amt" placeholder="0.00" min="0" step="0.01" inputmode="decimal" />
            </div>
            <div class="form-group">
              <label>Day of Month Due (0 = no fixed date)</label>
              <input type="number" id="m-sub-day" placeholder="1-31" min="0" max="31" step="1" inputmode="numeric" />
            </div>
            <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Add</button>
          `, mc => {
            const name   = mc.querySelector('#m-sub-name').value.trim();
            const amount = parseFloat(mc.querySelector('#m-sub-amt').value) || 0;
            const dueDay = parseInt(mc.querySelector('#m-sub-day').value)  || 0;
            if (!name) return;
            const ns = App.Storage.cloneState(App.getState());
            if (!ns.subscriptions) ns.subscriptions = [];
            ns.subscriptions.push({
              id: App.Storage.generateId(),
              name, amount, dueDay, paid: false, addToPaycheck: false
            });
            App.setState(ns);
            closeModal();
            App.showToast(name + ' added ✓', 'success');
          });
          break;

        // ── Toggle Transfer Account exclude ──────────────
        case 'toggle-transfer-exclude': {
          const ns = App.Storage.cloneState(App.getState());
          ns.settings = ns.settings || {};
          ns.settings.excludeTransferFromDeficit = !ns.settings.excludeTransferFromDeficit;
          App.setState(ns);
          break;
        }

        // ── Vault: manual balance edit (no items) ────────
        case 'edit-vault-bal':
          openModal(`
            <div class="modal-header">
              <div class="modal-title">Update ${esc(ds.name)} Balance</div>
              <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
            </div>
            <div class="form-group">
              <label>Current Balance ($)</label>
              <input type="number" id="m-val" value="${ds.bal}" min="0" step="0.01" inputmode="decimal" />
            </div>
            <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">'+t('common.save')+'</button>
          `, mc => {
            const val = parseFloat(mc.querySelector('#m-val').value) || 0;
            const ns  = App.Storage.cloneState(App.getState());
            const idx = ns.accounts.vaults.findIndex(v => v.id === ds.id);
            if (idx !== -1) ns.accounts.vaults[idx].balance = val;
            App.setState(ns);
            closeModal();
            App.showToast(ds.name + ' updated ✓', 'success');
          });
          break;

        // ── Vault: add sub-item ──────────────────────────
        case 'add-vault-item':
          openModal(`
            <div class="modal-header">
              <div class="modal-title">Add Item to ${esc(ds.name)}</div>
              <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
            </div>
            <div class="form-group">
              <label>Item Name</label>
              <input type="text" id="m-item-name" placeholder="e.g. Netflix, Claude..." />
            </div>
            <div class="form-group mt-8">
              <label>Amount ($)</label>
              <input type="number" id="m-item-amt" value="0" min="0" step="0.01" inputmode="decimal" />
            </div>
            <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Add Item</button>
          `, mc => {
            const name = mc.querySelector('#m-item-name').value.trim();
            const amt  = parseFloat(mc.querySelector('#m-item-amt').value) || 0;
            if (!name) { App.showToast('Enter a name', 'error'); return; }
            const ns  = App.Storage.cloneState(App.getState());
            const idx = ns.accounts.vaults.findIndex(v => v.id === ds.id);
            if (idx !== -1) {
              if (!ns.accounts.vaults[idx].items) ns.accounts.vaults[idx].items = [];
              ns.accounts.vaults[idx].items.push({
                id: App.Storage.generateId(), name: name, amount: amt
              });
              // Keep balance in sync for consumers that read vault.balance directly
              ns.accounts.vaults[idx].balance =
                ns.accounts.vaults[idx].items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
            }
            App.setState(ns);
            closeModal();
            App.showToast('Item added ✓', 'success');
          });
          break;

        // ── Vault: edit sub-item ─────────────────────────
        case 'edit-vault-item':
          openModal(`
            <div class="modal-header">
              <div class="modal-title">Edit ${esc(ds.itemName)}</div>
              <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
            </div>
            <div class="form-group">
              <label>Item Name</label>
              <input type="text" id="m-item-name" value="${esc(ds.itemName)}" />
            </div>
            <div class="form-group mt-8">
              <label>Amount ($)</label>
              <input type="number" id="m-item-amt" value="${ds.itemAmount}" min="0" step="0.01" inputmode="decimal" />
            </div>
            <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">'+t('common.save')+'</button>
          `, mc => {
            const name = mc.querySelector('#m-item-name').value.trim();
            const amt  = parseFloat(mc.querySelector('#m-item-amt').value) || 0;
            if (!name) { App.showToast('Enter a name', 'error'); return; }
            const ns = App.Storage.cloneState(App.getState());
            const vi = ns.accounts.vaults.findIndex(v => v.id === ds.vaultId);
            if (vi !== -1) {
              const ii = ns.accounts.vaults[vi].items.findIndex(i => i.id === ds.itemId);
              if (ii !== -1) {
                ns.accounts.vaults[vi].items[ii].name   = name;
                ns.accounts.vaults[vi].items[ii].amount = amt;
              }
              ns.accounts.vaults[vi].balance =
                ns.accounts.vaults[vi].items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
            }
            App.setState(ns);
            closeModal();
            App.showToast('Item updated ✓', 'success');
          });
          break;

        // ── Vault: delete sub-item ───────────────────────
        case 'delete-vault-item': {
          if (!confirm('Delete "' + ds.itemName + '" from this vault?')) break;
          const ns = App.Storage.cloneState(App.getState());
          const vi = ns.accounts.vaults.findIndex(v => v.id === ds.vaultId);
          if (vi !== -1) {
            ns.accounts.vaults[vi].items =
              ns.accounts.vaults[vi].items.filter(i => i.id !== ds.itemId);
            ns.accounts.vaults[vi].balance =
              ns.accounts.vaults[vi].items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
          }
          App.setState(ns);
          App.showToast('Item removed ✓', 'success');
          break;
        }

        // ── Bank: edit balance ───────────────────────────
        case 'edit-bank-bal':
          openModal(`
            <div class="modal-header">
              <div class="modal-title">Update ${esc(ds.name)} Balance</div>
              <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
            </div>
            <div class="form-group">
              <label>Current Balance ($)</label>
              <input type="number" id="m-val" value="${ds.bal}" min="0" step="0.01" inputmode="decimal" />
            </div>
            <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">'+t('common.save')+'</button>
          `, mc => {
            const val = parseFloat(mc.querySelector('#m-val').value) || 0;
            const ns  = App.Storage.cloneState(App.getState());
            const idx = ns.accounts.bank.findIndex(a => a.id === ds.id);
            if (idx !== -1) ns.accounts.bank[idx].balance = val;
            App.setState(ns);
            closeModal();
            App.showToast(ds.name + ' updated ✓', 'success');
          });
          break;

        // ── Card: edit by balance OR available credit ────
        // Both fields are shown. Entering one auto-calculates the other.
        // Balance = Limit - Available Credit
        case 'edit-card-bal': {
          openModal(`
            <div class="modal-header">
              <div class="modal-title">Update ${esc(ds.name)}</div>
              <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
            </div>
            <div class="form-group">
              <label>Credit Limit ($)</label>
              <input type="number" id="m-lim" value="${ds.limit}" min="0" step="1" inputmode="numeric" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
              <div class="form-group">
                <label style="color:var(--color-success)">Available Credit ($)</label>
                <input type="number" id="m-avail" value="${ds.avail}" min="0" step="0.01" inputmode="decimal" style="border-color:var(--color-success)" />
              </div>
              <div class="form-group">
                <label style="color:var(--color-danger)">Balance ($)</label>
                <input type="number" id="m-bal" value="${ds.bal}" min="0" step="0.01" inputmode="decimal" style="border-color:var(--color-danger)" />
              </div>
            </div>
            <p class="text-xs text-secondary mt-4">Enter either field &mdash; the other updates automatically.</p>
            <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">'+t('common.save')+'</button>
          `, mc => {
            const newLim = parseFloat(mc.querySelector('#m-lim').value)   || 0;
            const newBal = parseFloat(mc.querySelector('#m-bal').value)   || 0;
            const ns     = App.Storage.cloneState(App.getState());
            const idx    = ns.accounts.cards.findIndex(c => c.id === ds.id);
            if (idx !== -1) {
              ns.accounts.cards[idx].balance = newBal;
              ns.accounts.cards[idx].limit   = newLim;
            }
            App.setState(ns);
            closeModal();
            App.showToast(ds.name + ' updated ✓', 'success');
          });

          // Wire live sync after modal renders
          setTimeout(function() {
            const mc      = document.getElementById('modal-content');
            if (!mc) return;
            const limEl   = mc.querySelector('#m-lim');
            const availEl = mc.querySelector('#m-avail');
            const balEl   = mc.querySelector('#m-bal');
            if (!limEl || !availEl || !balEl) return;

            availEl.addEventListener('input', function() {
              const lim   = parseFloat(limEl.value)   || 0;
              const avail = parseFloat(availEl.value) || 0;
              balEl.value = Math.max(0, lim - avail).toFixed(2);
            });
            balEl.addEventListener('input', function() {
              const lim = parseFloat(limEl.value) || 0;
              const bal = parseFloat(balEl.value) || 0;
              availEl.value = Math.max(0, lim - bal).toFixed(2);
            });
            limEl.addEventListener('input', function() {
              const lim = parseFloat(limEl.value) || 0;
              const bal = parseFloat(balEl.value) || 0;
              availEl.value = Math.max(0, lim - bal).toFixed(2);
            });
          }, 60);
          break;
        }

        // ── Card: record payment ─────────────────────────
        case 'add-payment':
          openModal(`
            <div class="modal-header">
              <div class="modal-title">Payment &mdash; ${esc(ds.name)}</div>
              <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
            </div>
            <p class="text-secondary text-sm mb-12">Current balance: <strong>${fmt(Number(ds.bal))}</strong></p>
            <div class="form-group">
              <label>Payment Amount ($)</label>
              <input type="number" id="m-pay" value="${ds.bal}" min="0" step="0.01" inputmode="decimal" />
            </div>
            <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Record Payment</button>
          `, mc => {
            const payment = parseFloat(mc.querySelector('#m-pay').value) || 0;
            const ns      = App.Storage.cloneState(App.getState());
            const idx     = ns.accounts.cards.findIndex(c => c.id === ds.id);
            if (idx !== -1) {
              ns.accounts.cards[idx].balance = Math.max(0, ns.accounts.cards[idx].balance - payment);
            }
            App.setState(ns);
            closeModal();
            App.showToast(fmt(payment) + ' payment recorded ✓', 'success');
          });
          break;
      }
    });
  }


  // ── Screenshot Balance Scanner ────────────────────────────
  // Uses Tesseract.js (browser OCR) to read balances from a
  // banking screenshot. Parses dollar amounts and matches them
  // to your known account names for confirmation.
  function openScreenshotScanner(state) {
    const bd = document.getElementById('modal-backdrop');
    const mc = document.getElementById('modal-content');
    if (!bd || !mc) return;

    mc.innerHTML =
      '<div class="modal-header">' +
        '<div class="modal-title">&#128247; Scan Screenshot</div>' +
        '<button class="btn btn--icon btn--secondary" data-action="modal-close">&#10005;</button>' +
      '</div>' +
      '<p class="text-secondary text-sm" style="margin-bottom:12px">' +
        'Take or upload a screenshot of your banking app. The scanner reads the ' +
        'dollar amounts and lets you match them to your accounts.' +
      '</p>' +
      '<input type="file" id="ocr-file" accept="image/*" capture="environment" ' +
        'style="display:none" />' +
      '<button class="btn btn--primary btn--full" id="ocr-pick-btn">&#128247; Choose / Take Photo</button>' +
      '<div id="ocr-preview" style="margin-top:12px;display:none">' +
        '<img id="ocr-img" style="max-width:100%;border-radius:8px;margin-bottom:10px" />' +
        '<div id="ocr-status" class="text-xs text-secondary" style="text-align:center;margin-bottom:8px">Reading image...</div>' +
        '<div id="ocr-results"></div>' +
      '</div>';

    bd.classList.remove('hidden');
    bd.setAttribute('aria-hidden', 'false');

    mc.querySelector('[data-action="modal-close"]').addEventListener('click', function() {
      bd.classList.add('hidden'); mc.innerHTML = '';
    });
    bd.addEventListener('click', function h(e) {
      if (e.target === bd) { bd.classList.add('hidden'); mc.innerHTML = ''; bd.removeEventListener('click', h); }
    });

    const fileInput = mc.querySelector('#ocr-file');
    mc.querySelector('#ocr-pick-btn').addEventListener('click', function() {
      fileInput.click();
    });

    fileInput.addEventListener('change', function() {
      const file = fileInput.files[0];
      if (!file) return;
      const preview = mc.querySelector('#ocr-preview');
      const img     = mc.querySelector('#ocr-img');
      const status  = mc.querySelector('#ocr-status');
      const results = mc.querySelector('#ocr-results');
      preview.style.display = 'block';
      const url = URL.createObjectURL(file);
      img.src = url;
      status.textContent = 'Loading OCR engine...';
      results.innerHTML  = '';

      // Load Tesseract.js from CDN
      if (!window.Tesseract) {
        var script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js';
        script.onload = function() { runOCR(img, url, status, results, state, mc, bd); };
        script.onerror = function() { status.textContent = 'Could not load OCR engine. Check your connection.'; };
        document.head.appendChild(script);
      } else {
        runOCR(img, url, status, results, state, mc, bd);
      }
    });
  }

  function runOCR(img, url, status, results, state, mc, bd) {
    status.textContent = 'Scanning image...';
    Tesseract.recognize(url, 'eng', {
      logger: function(m) {
        if (m.status === 'recognizing text') {
          status.textContent = 'Reading... ' + Math.round((m.progress || 0) * 100) + '%';
        }
      }
    }).then(function(result) {
      var text = result.data.text;
      status.textContent = 'Done. Tap a balance to update an account.';
      // Parse dollar amounts from OCR text
      var amounts = parseAmountsFromOCR(text);
      if (!amounts.length) {
        results.innerHTML = '<p class="text-secondary text-sm">No dollar amounts found. Try a clearer screenshot.</p>';
        return;
      }
      // Build match UI
      var allAccounts = [];
      ((state.accounts && state.accounts.bank) || []).forEach(function(a) {
        allAccounts.push({ type: 'bank', id: a.id, name: a.name });
      });
      ((state.accounts && state.accounts.vaults) || []).forEach(function(v) {
        allAccounts.push({ type: 'vault', id: v.id, name: v.name });
      });
      var opts = allAccounts.map(function(a) {
        return '<option value="' + a.type + ':' + a.id + '">' + a.name + '</option>';
      }).join('');

      var rows = amounts.map(function(a, i) {
        return '<div style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">' +
          '<span class="font-mono font-bold text-cyan">' + a.display + '</span>' +
          '<select class="ocr-acct-sel" data-idx="' + i + '" style="font-size:0.78rem;padding:4px 6px">' +
            '<option value="">— Skip —</option>' + opts +
          '</select>' +
          '<button class="btn btn--primary btn--sm" data-action="ocr-apply" data-amount="' + a.value + '" data-idx="' + i + '">Apply</button>' +
        '</div>';
      }).join('');

      results.innerHTML =
        '<div class="text-xs text-secondary" style="margin-bottom:8px">Match each amount to an account:</div>' +
        rows +
        '<button class="btn btn--primary btn--full mt-12" data-action="ocr-apply-all">Apply All Matched</button>';

      // Wire individual apply buttons
      results.querySelectorAll('[data-action="ocr-apply"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var idx    = btn.dataset.idx;
          var amount = parseFloat(btn.dataset.amount) || 0;
          var sel    = results.querySelector('.ocr-acct-sel[data-idx="' + idx + '"]');
          if (!sel || !sel.value) { App.showToast('Pick an account first', 'error'); return; }
          applyOCRBalance(sel.value, amount, state);
          btn.textContent = '✓';
          btn.disabled = true;
          sel.disabled = true;
        });
      });

      // Apply all
      results.querySelector('[data-action="ocr-apply-all"]').addEventListener('click', function() {
        results.querySelectorAll('.ocr-acct-sel').forEach(function(sel) {
          if (!sel.value || sel.disabled) return;
          var idx    = sel.dataset.idx;
          var btn    = results.querySelector('[data-action="ocr-apply"][data-idx="' + idx + '"]');
          var amount = btn ? (parseFloat(btn.dataset.amount) || 0) : 0;
          applyOCRBalance(sel.value, amount, state);
          sel.disabled = true;
          if (btn) { btn.textContent = '✓'; btn.disabled = true; }
        });
        App.showToast('Balances updated ✓', 'success');
        setTimeout(function() { bd.classList.add('hidden'); mc.innerHTML = ''; }, 800);
      });
    }).catch(function(err) {
      status.textContent = 'Error reading image. Try again with a clearer screenshot.';
      console.error('OCR error:', err);
    });
  }

  function parseAmountsFromOCR(text) {
    // Match patterns like $1,234.56 or $1,234 or 1,234.56
    var amounts = [];
    var seen    = new Set();
    var re      = /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)(?!\d)/g;
    var match;
    while ((match = re.exec(text)) !== null) {
      var raw   = match[1].replace(/,/g, '');
      var value = parseFloat(raw);
      if (value > 0 && !seen.has(raw)) {
        seen.add(raw);
        amounts.push({ value: value, display: '$' + match[1] });
      }
    }
    // Sort largest first (most likely to be account balances)
    return amounts.sort(function(a, b) { return b.value - a.value; }).slice(0, 12);
  }

  function applyOCRBalance(typeIdStr, amount, state) {
    var parts  = typeIdStr.split(':');
    var type   = parts[0];
    var id     = parts[1];
    var ns     = App.Storage.cloneState(App.getState());
    if (type === 'bank') {
      var acct = (ns.accounts.bank || []).find(function(a) { return a.id === id; });
      if (acct) { acct.balance = amount; App.setState(ns); }
    } else if (type === 'vault') {
      var vault = (ns.accounts.vaults || []).find(function(v) { return v.id === id; });
      if (vault) { vault.balance = amount; App.setState(ns); }
    }
    App.showToast('Updated ✓', 'success');
  }

  // HTML escape helper
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  App.Accounts = { render };

})(window.App = window.App || {});
