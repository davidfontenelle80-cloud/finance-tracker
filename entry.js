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
  var t = function(k) { return App.Lang ? App.Lang.t(k) : k; };

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
            <input type="number" id="ent-amount" placeholder="0.00" min="0" step="0.01" inputmode="decimal" />
          </div>
        </div>

        <div class="form-group">
          <label for="ent-category">${t('entry.category')}</label>
          <select id="ent-category">
            <option value="">${t('entry.selectCat')}</option>
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
            <option value="">${t('entry.selectAcct')}</option>
            <optgroup label="Bank Accounts">
              ${accounts.bank}
            </optgroup>
            <optgroup label="Credit Cards">
              ${accounts.cards}
            </optgroup>
            <optgroup label="Vaults">
              ${accounts.vaults}
            </optgroup>
          </select>
        </div>

        <div class="form-group">
          <label for="ent-note">Note <span class="text-dim">(optional)</span></label>
          <input type="text" id="ent-note" enterkeyhint="done" autocorrect="off" placeholder="e.g. Gas stop, Walmart run…" />
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 10px;background:var(--surface-2);border-radius:8px">
          <input type="checkbox" id="ent-recurring" style="width:16px;height:16px" />
          <div>
            <div class="text-sm">🔁 Recurring expense</div>
            <div class="text-xs text-secondary">Mark for tracking — shows in monthly recurring summary</div>
          </div>
        </div>

        <button class="btn btn--primary btn--full" data-action="submit-entry">${t('entry.record')}</button>
      </div>

      <!-- Category Summary -->
      ${buildCategorySummary(state)}

      <!-- Recent transactions -->
      <div class="card">
        <div class="flex-between mb-8">
          <div class="card-title">${t('entry.recent')}</div>
          <span class="text-secondary text-xs">${(state.transactions || []).length} total</span>
        </div>
        <!-- Filter row -->
        <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
          <select id="tx-filter-cat" style="flex:1;padding:6px 10px;font-size:0.85rem">
            <option value="">All Categories</option>
            ${(state.yearlyCategories||[]).map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('')}
          </select>
          <input type="month" id="tx-filter-month" style="flex:1;padding:6px 10px;font-size:0.85rem"
            value="${today.slice(0,7)}" title="Filter by month" />
          <button class="btn btn--secondary btn--sm" id="tx-filter-clear">Clear</button>
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
              ${tx.recurring ? '<span style="color:var(--neon-cyan);font-size:0.68rem">🔁 recurring</span>' : ''}
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


  // ── Category Summary Card ─────────────────────────────────
  function buildCategorySummary(state) {
    var cats = state.yearlyCategories || [];
    if (!cats.length) return '';
    var txs  = state.transactions || [];
    var now  = App.Storage.toISODate(new Date());
    var year = now.slice(0, 4);

    var rows = cats
      .filter(function(c) { return c.annualGoal > 0; })
      .map(function(c) {
        var spent = txs
          .filter(function(tx) { return tx.categoryId === c.id && tx.date && tx.date.startsWith(year); })
          .reduce(function(s, tx) { return s + (Number(tx.amount) || 0); }, 0);
        var goal      = c.annualGoal || 0;
        var pct       = goal > 0 ? Math.min(100, (spent / goal) * 100) : 0;
        var remaining = goal - spent;
        var barColor  = pct > 90 ? 'red' : pct > 65 ? 'amber' : 'cyan';
        return (
          '<div style="margin-bottom:10px">' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:3px">' +
              '<span class="text-sm font-bold">' + esc(c.name) + '</span>' +
              '<span class="font-mono text-sm">' +
                fmt(spent) +
                '<span class="text-secondary text-xs"> / ' + fmt(goal) + '</span>' +
              '</span>' +
            '</div>' +
            '<div class="progress-bar" style="height:6px;margin-bottom:2px">' +
              '<div class="progress-bar__fill progress-bar__fill--' + barColor + '"' +
                ' style="width:' + pct.toFixed(1) + '%;border-radius:3px"></div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between">' +
              '<span class="text-xs text-secondary">' + pct.toFixed(0) + '% of annual goal</span>' +
              '<span class="text-xs ' + (remaining >= 0 ? 'text-secondary' : 'text-red') + '">' +
                (remaining >= 0 ? fmt(remaining) + ' remaining' : fmt(Math.abs(remaining)) + ' over budget') +
              '</span>' +
            '</div>' +
          '</div>'
        );
      }).join('');

    if (!rows) return '';

    return (
      '<div class="card" id="cat-summary-card">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer"' +
          ' data-action="toggle-cat-summary">' +
          '<div class="card-title" style="margin:0">📊 YTD by Category</div>' +
          '<span id="cat-summary-chevron" class="text-secondary text-xs">▼</span>' +
        '</div>' +
        '<div id="cat-summary-body" style="display:none;margin-top:12px">' + rows + '</div>' +
      '</div>'
    );
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
      if (btn.dataset.action === 'toggle-cat-summary') {
        const body    = document.getElementById('cat-summary-body');
        const chevron = document.getElementById('cat-summary-chevron');
        if (!body) return;
        const open = body.style.display === 'block';
        body.style.display = open ? 'none' : 'block';
        if (chevron) chevron.textContent = open ? '▼' : '▲';
        return;
      }
    });

    // Filter by category and/or month
    function applyFilter() {
      const catId  = (container.querySelector('#tx-filter-cat')   || {}).value || '';
      const month  = (container.querySelector('#tx-filter-month') || {}).value || '';
      const st     = App.getState();
      let   txs    = (st.transactions || []).slice().reverse();
      if (catId)  txs = txs.filter(tx => tx.categoryId === catId);
      if (month)  txs = txs.filter(tx => tx.date && tx.date.startsWith(month));
      const listEl = container.querySelector('#tx-list');
      if (listEl) listEl.innerHTML = renderTransactionList(txs.slice(0, 100), st) ||
        '<p class="text-secondary text-sm">No transactions match this filter.</p>';
    }

    const catFilter   = container.querySelector('#tx-filter-cat');
    const monthFilter = container.querySelector('#tx-filter-month');
    const clearBtn    = container.querySelector('#tx-filter-clear');
    if (catFilter)   catFilter.addEventListener('change', applyFilter);
    if (monthFilter) monthFilter.addEventListener('change', applyFilter);
    if (clearBtn)    clearBtn.addEventListener('click', () => {
      if (catFilter)   catFilter.value   = '';
      if (monthFilter) monthFilter.value = '';
      applyFilter();
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
    const recurring = !!(container.querySelector('#ent-recurring') && container.querySelector('#ent-recurring').checked);
    const tx = {
      id:           App.Storage.generateId(),
      date,
      categoryId:   catId,
      categoryName: catName,
      amount,
      accountId:    acctVal  || null,
      accountName:  acctName || null,
      note:         note     || null,
      recurring:    recurring,
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
      } else if (acctVal.startsWith('vault-')) {
        const id  = acctVal.replace('vault-', '');
        const idx = (ns.accounts.vaults || []).findIndex(v => v.id === id);
        if (idx !== -1) ns.accounts.vaults[idx].balance = Math.round((ns.accounts.vaults[idx].balance - amount) * 100) / 100;
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
          `<option value="">${t('entry.selectAcct')}</option>` +
          `<optgroup label="Bank Accounts">${bankOpts.bank}</optgroup>` +
          `<optgroup label="Credit Cards">${bankOpts.cards}</optgroup>` +
          `<optgroup label="Vaults">${bankOpts.vaults}</optgroup>`;
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
    const acctRef = tx.accountId || tx.account; // accountId is the correct field; tx.account is legacy
    if (acctRef) {
      if (acctRef.startsWith('bank-')) {
        const bankId = acctRef.replace('bank-', '');
        const acct = (ns.accounts.bank || []).find(a => a.id === bankId);
        if (acct) acct.balance = Math.round((acct.balance + amount) * 100) / 100;
      } else if (acctRef.startsWith('card-')) {
        const cardId = acctRef.replace('card-', '');
        const card = (ns.accounts.cards || []).find(c => c.id === cardId);
        if (card) card.balance = Math.max(0, Math.round((card.balance - amount) * 100) / 100);
      } else if (acctRef.startsWith('vault-')) {
        const vaultId = acctRef.replace('vault-', '');
        const vault = (ns.accounts.vaults || []).find(v => v.id === vaultId);
        if (vault) vault.balance = Math.round((vault.balance + amount) * 100) / 100;
      } else {
        const acct = (ns.accounts.bank   || []).find(a => a.id === acctRef) ||
                     (ns.accounts.vaults || []).find(v => v.id === acctRef);
        if (acct) acct.balance = Math.round((acct.balance + amount) * 100) / 100;
      }
    }

    // Append reversal journal entry
    if (!ns.journal) ns.journal = [];
    ns.journal.push({
      id:          App.Storage.generateId(),
      timestamp:   new Date().toISOString(),
      type:        'manual_edit',
      description: 'Deleted transaction: ' + (tx.note || tx.categoryName || tx.category || id),
      movements:   acctRef ? [{ account: acctRef, change: +amount }] : [],
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
    if (accountId.startsWith('vault-')) {
      const id = accountId.replace('vault-', '');
      return (accts.vaults || []).find(v => v.id === id)?.name || null;
    }
    return null;
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  App.Entry = { render };

})(window.App = window.App || {});
