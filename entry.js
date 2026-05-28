/* ══════════════════════════════════════════════════════════════
   ENTRY.JS — Data Entry / Transaction Log
   Tab 4: Quick form to log spending.
   Cascade on submit:
     → state.transactions (append)
     → account/card balance (subtract)
     → Paycheck Tracker will read transactions when rendered
     → Dashboard reads transactions when rendered
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
    const categories  = buildCategoryOptions(state);
    const accounts    = buildAccountOptions(state);
    const today       = App.Storage.toISODate(new Date());
    const recent      = (state.transactions || []).slice().reverse().slice(0, 50);

    return `
      <!-- Quick entry form -->
      <div class="card card--glow-cyan">
        <div class="card-title mb-16">➕ Log Transaction</div>

        <div class="form-row">
          <div class="form-group">
            <label for="ent-date">Date</label>
            <input type="date" id="ent-date" value="${today}" />
          </div>
          <div class="form-group">
            <label for="ent-amount">Amount ($)</label>
            <input type="number" id="ent-amount" placeholder="0.00" min="0" step="0.01" />
          </div>
        </div>

        <div class="form-group">
          <label for="ent-category">Category</label>
          <select id="ent-category">
            <option value="">— Select category —</option>
            <optgroup label="Yearly Goals">
              ${categories.yearly}
            </optgroup>
            <optgroup label="Fixed Expenses">
              ${categories.fixed}
            </optgroup>
          </select>
        </div>

        <div class="form-group">
          <label for="ent-account">Account / Card Used</label>
          <select id="ent-account">
            <option value="">— Select account —</option>
            <optgroup label="Bank Accounts">
              ${accounts.bank}
            </optgroup>
            <optgroup label="Credit Cards">
              ${accounts.cards}
            </optgroup>
          </select>
        </div>

        <div class="form-group">
          <label for="ent-note">Note <span class="text-dim">(optional)</span></label>
          <input type="text" id="ent-note" placeholder="e.g. Gas stop, Walmart run…" />
        </div>

        <button class="btn btn--primary btn--full" data-action="submit-entry">Record Transaction</button>
      </div>

      <!-- Recent transactions -->
      <div class="card">
        <div class="flex-between mb-12">
          <div class="card-title">Recent Transactions</div>
          <span class="text-secondary text-xs">${(state.transactions || []).length} total</span>
        </div>
        <div id="tx-list">
          ${renderTransactionList(recent, state)}
        </div>
        ${recent.length === 0 ? '<p class="text-secondary text-sm">No transactions yet.</p>' : ''}
      </div>
    `;
  }

  // ── Transaction list ──────────────────────────────────────
  function renderTransactionList(transactions, state) {
    if (!transactions.length) return '';

    return transactions.map(tx => {
      const acctName = resolveAccountName(tx.accountId, state);
      return `
        <div class="list-item" data-tx-id="${tx.id}">
          <div style="flex:1;min-width:0">
            <div class="flex-between">
              <span class="font-bold text-sm" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${esc(tx.categoryName || '—')}
              </span>
              <span class="font-mono font-bold text-red" style="flex-shrink:0;margin-left:8px">
                ${fmt(tx.amount)}
              </span>
            </div>
            <div class="text-xs text-secondary mt-4" style="display:flex;gap:8px;flex-wrap:wrap">
              <span>${tx.date}</span>
              ${acctName ? `<span>· ${esc(acctName)}</span>` : ''}
              ${tx.note   ? `<span>· ${esc(tx.note)}</span>` : ''}
            </div>
          </div>
          <button class="btn btn--danger btn--sm btn--icon" data-action="delete-tx" data-id="${tx.id}"
                  style="margin-left:12px;flex-shrink:0" title="Delete">✕</button>
        </div>
      `;
    }).join('');
  }

  // ── Options builders ──────────────────────────────────────
  function buildCategoryOptions(state) {
    const yearly = (state.yearlyCategories || [])
      .map(c => `<option value="${c.id}" data-name="${esc(c.name)}">${esc(c.name)}</option>`)
      .join('');
    const fixed  = (state.fixedMonthlyExpenses || [])
      .map(f => `<option value="fixed-${f.id}" data-name="${esc(f.name)}">${esc(f.name)}</option>`)
      .join('');
    return { yearly, fixed };
  }

  function buildAccountOptions(state) {
    const accts = state.accounts || {};
    const bank  = (accts.bank || [])
      .map(a => `<option value="bank-${a.id}" data-name="${esc(a.name)}">${esc(a.name)} (${fmt(a.balance)})</option>`)
      .join('');
    const cards = (accts.cards || [])
      .map(c => `<option value="card-${c.id}" data-name="${esc(c.name)}">${esc(c.name)} (${fmt(c.balance)})</option>`)
      .join('');
    return { bank, cards };
  }

  // ── Events ────────────────────────────────────────────────
  function wireEvents(container, state) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'submit-entry') {
        submitEntry(container);
        return;
      }
      if (btn.dataset.action === 'delete-tx') {
        deleteTx(btn.dataset.id);
        return;
      }
    });
  }

  function submitEntry(container) {
    const date     = container.querySelector('#ent-date').value;
    const amount   = parseFloat(container.querySelector('#ent-amount').value) || 0;
    const catSel   = container.querySelector('#ent-category');
    const catId    = catSel.value;
    const catName  = catId ? (catSel.selectedOptions[0]?.dataset.name || catSel.selectedOptions[0]?.text || '') : '';
    const acctSel  = container.querySelector('#ent-account');
    const acctVal  = acctSel.value;
    const acctName = acctVal ? (acctSel.selectedOptions[0]?.dataset.name || '') : '';
    const note     = container.querySelector('#ent-note').value.trim();

    // Validation
    if (!date)   { App.showToast('Date is required.', 'error'); return; }
    if (amount <= 0) { App.showToast('Enter a positive amount.', 'error'); return; }
    if (!catId)  { App.showToast('Select a category.', 'error'); return; }

    const ns = App.getState();

    // ── Cascade 1: Add transaction ──────────────────────────
    const tx = {
      id:           App.Storage.generateId(),
      date,
      categoryId:   catId,
      categoryName: catName,
      amount,
      accountId:    acctVal  || null,
      accountName:  acctName || null,
      note:         note     || null,
      // Which paycheck period this falls in (for Tracker)
      paycheckPeriod: resolvePaycheckPeriod(date, ns)
    };
    if (!ns.transactions) ns.transactions = [];
    ns.transactions.push(tx);

    // ── Cascade 2: Update account / card balance ────────────
    if (acctVal) {
      if (acctVal.startsWith('bank-')) {
        const id  = acctVal.replace('bank-', '');
        const idx = (ns.accounts.bank || []).findIndex(a => a.id === id);
        if (idx !== -1) ns.accounts.bank[idx].balance -= amount;
      } else if (acctVal.startsWith('card-')) {
        const id  = acctVal.replace('card-', '');
        const idx = (ns.accounts.cards || []).findIndex(c => c.id === id);
        if (idx !== -1) ns.accounts.cards[idx].balance += amount; // cards: balance goes up when you spend
      }
    }

    App.setState(ns);
    App.showToast(`${fmt(amount)} recorded ✓`, 'success');

    // Reset form (keep date, clear amount/note)
    container.querySelector('#ent-amount').value   = '';
    container.querySelector('#ent-note').value     = '';
    container.querySelector('#ent-category').value = '';
    container.querySelector('#ent-account').value  = '';

    // Refresh transaction list in place without full re-render
    const fresh  = App.getState();
    const recent = (fresh.transactions || []).slice().reverse().slice(0, 50);
    const listEl = container.querySelector('#tx-list');
    if (listEl) {
      listEl.innerHTML = renderTransactionList(recent, fresh);
      // Update account select to reflect new balances
      const acctOptGroup = container.querySelector('#ent-account');
      if (acctOptGroup) {
        const bankOpts  = buildAccountOptions(fresh);
        acctOptGroup.innerHTML =
          `<option value="">— Select account —</option>` +
          `<optgroup label="Bank Accounts">${bankOpts.bank}</optgroup>` +
          `<optgroup label="Credit Cards">${bankOpts.cards}</optgroup>`;
      }
    }
  }

  function deleteTx(id) {
    if (!confirm('Delete this transaction? The account balance will be reversed.')) return;
    const ns = App.getState();
    const tx = (ns.transactions || []).find(t => t.id === id);
    if (!tx) return;

    // Reverse the balance change the transaction created
    const amount = Number(tx.amount) || 0;
    if (tx.account) {
      if (tx.account.startsWith('bank-')) {
        const bankId = tx.account.replace('bank-', '');
        const acct = (ns.accounts.bank || []).find(a => a.id === bankId);
        if (acct) acct.balance = Math.round((acct.balance + amount) * 100) / 100;
      } else if (tx.account.startsWith('card-')) {
        const cardId = tx.account.replace('card-', '');
        const card = (ns.accounts.cards || []).find(c => c.id === cardId);
        if (card) card.balance = Math.max(0, Math.round((card.balance - amount) * 100) / 100);
      } else {
        // Plain ID — check bank then vaults
        const acct = (ns.accounts.bank   || []).find(a => a.id === tx.account) ||
                     (ns.accounts.vaults || []).find(v => v.id === tx.account);
        if (acct) acct.balance = Math.round((acct.balance + amount) * 100) / 100;
      }
    }

    // Append reversal journal entry
    if (!ns.journal) ns.journal = [];
    ns.journal.push({
      id:          App.Storage.generateId(),
      timestamp:   new Date().toISOString(),
      type:        'manual_edit',
      description: 'Deleted transaction: ' + (tx.note || tx.category || id),
      movements:   tx.account ? [{ account: tx.account, change: +amount }] : [],
      relatedTxIds: [id],
      canReverse:  false
    });

    ns.transactions = (ns.transactions || []).filter(t => t.id !== id);
    App.setState(ns);
    App.showToast('Transaction deleted and balance reversed.', 'info');
    App.refreshCurrentTab();
  }

  // ── Helpers ───────────────────────────────────────────────
  // Determine which 1-26 paycheck period a date falls into
  function resolvePaycheckPeriod(dateStr, state) {
    const dates = state.income?.paydayDates || [];
    if (!dates.length) return null;
    // Period N = from paydayDates[N-1] up to (but not including) paydayDates[N]
    for (let i = 0; i < dates.length - 1; i++) {
      if (dateStr >= dates[i] && dateStr < dates[i + 1]) return i + 1;
    }
    // Last period
    if (dateStr >= dates[dates.length - 1]) return dates.length;
    return null;
  }

  function resolveAccountName(accountId, state) {
    if (!accountId) return null;
    const accts = state.accounts || {};
    if (accountId.startsWith('bank-')) {
      const id = accountId.replace('bank-', '');
      return (accts.bank || []).find(a => a.id === id)?.name || null;
    }
    if (accountId.startsWith('card-')) {
      const id = accountId.replace('card-', '');
      return (accts.cards || []).find(c => c.id === id)?.name || null;
    }
    return null;
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  App.Entry = { render };

})(window.App = window.App || {});
