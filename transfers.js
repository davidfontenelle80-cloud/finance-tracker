/* ══════════════════════════════════════════════════════════════
   TRANSFERS.JS — Operational command center
   Handles: Paycheck allocation, credit card payments,
   money moves, vault funding, and withdrawals.

   Every action creates an append-only journal entry in state.journal.
   Balances are updated atomically (all or nothing per workflow).
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  // ── Module-level state ────────────────────────────────────
  // Tracks which workflow mode is active so re-renders don't reset it.
  let _mode = null;

  // ── Main render ───────────────────────────────────────────
  function render(state, container) {
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'tab-inner';
    wrap.innerHTML =
      '<h2 class="tab-title">Transfers</h2>' +
      buildModeSelector() +
      '<div id="transfers-workflow" class="transfers-workflow"></div>';

    container.appendChild(wrap);

    // Wire mode buttons
    wrap.querySelectorAll('.mode-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var mode = card.dataset.mode;
        if (mode === _mode) return;
        _mode = mode;
        wrap.querySelectorAll('.mode-card').forEach(function(c) {
          c.classList.toggle('active', c.dataset.mode === mode);
        });
        renderWorkflow(state, document.getElementById('transfers-workflow'), mode);
      });
    });

    // Auto-select first mode on fresh render
    if (!_mode) {
      var first = wrap.querySelector('.mode-card');
      if (first) first.click();
    } else {
      wrap.querySelectorAll('.mode-card').forEach(function(c) {
        c.classList.toggle('active', c.dataset.mode === _mode);
      });
      renderWorkflow(state, document.getElementById('transfers-workflow'), _mode);
    }
  }

  // ── Mode selector ─────────────────────────────────────────
  function buildModeSelector() {
    var modes = [
      { id: 'paycheck',  icon: '💰', label: 'Paycheck Arrived' },
      { id: 'paycards',  icon: '💳', label: 'Pay Credit Cards' },
      { id: 'movemoney', icon: '🏦', label: 'Move Money'       },
      { id: 'fundvault', icon: '🎯', label: 'Fund a Vault'     },
      { id: 'withdraw',  icon: '📤', label: 'Withdraw / Spend' }
    ];
    return '<div class="mode-selector">' +
      modes.map(function(m) {
        return '<button class="mode-card' + (_mode === m.id ? ' active' : '') +
          '" data-mode="' + m.id + '">' +
          '<span class="mode-icon">' + m.icon + '</span>' +
          '<span class="mode-label">' + m.label + '</span>' +
          '</button>';
      }).join('') +
      '</div>';
  }

  // ── Workflow router ───────────────────────────────────────
  function renderWorkflow(state, container, mode) {
    if      (mode === 'paycheck')  renderPaycheckArrived(state, container);
    else if (mode === 'paycards')  renderPayCards(state, container);
    else if (mode === 'movemoney') renderStub(container, '🏦 Move Money');
    else if (mode === 'fundvault') renderStub(container, '🎯 Fund a Vault');
    else if (mode === 'withdraw')  renderStub(container, '📤 Withdraw / Spend Cash');
  }

  // ── WORKFLOW 1: Paycheck Arrived ──────────────────────────
  function renderPaycheckArrived(state, container) {
    var periods     = getUpcomingPeriods(state);
    var bankAccts   = (state.accounts && state.accounts.bank)  || [];
    var defaultAmt  = (state.income   && state.income.defaultPaycheckAmount) || 3000;
    var today       = App.Storage.toISODate(new Date());

    var periodOptions = periods.length
      ? periods.map(function(p) { return '<option value="' + p.key + '">' + p.label + '</option>'; }).join('')
      : '<option value="">No upcoming periods found</option>';

    var acctOptions = bankAccts.map(function(b) {
      return '<option value="' + b.id + '">' + b.name + ' (' + App.Storage.formatCurrency(b.balance) + ')</option>';
    }).join('');

    container.innerHTML =
      '<div class="workflow-card">' +
        '<h3 class="workflow-title">💰 Paycheck Arrived</h3>' +
        '<div class="form-grid">' +
          '<label class="form-label">Which paycheck period?</label>' +
          '<select id="xfr-period" class="form-input">' + periodOptions + '</select>' +
          '<label class="form-label">Amount received</label>' +
          '<div class="input-prefix-wrap">' +
            '<span class="input-prefix">$</span>' +
            '<input id="xfr-amount" type="number" step="0.01" min="0" class="form-input prefix-input" value="' + defaultAmt + '">' +
          '</div>' +
          '<label class="form-label">Date deposited</label>' +
          '<input id="xfr-date" type="date" class="form-input" value="' + today + '">' +
          '<label class="form-label">Deposit to account</label>' +
          '<select id="xfr-account" class="form-input">' + acctOptions + '</select>' +
        '</div>' +
        '<div class="allocation-section">' +
          '<div class="allocation-header">' +
            '<h4>Suggested Allocation</h4>' +
            '<p class="allocation-hint">Based on your yearly goals and fixed expenses. Uncheck any line to skip it this paycheck. Edit amounts for a one-time override.</p>' +
          '</div>' +
          '<div id="allocation-list" class="allocation-list"></div>' +
          '<div id="allocation-totals" class="allocation-totals"></div>' +
        '</div>' +
        '<div class="workflow-actions">' +
          '<button id="btn-smart-balance" class="btn btn-secondary">⚖ Smart Balance</button>' +
          '<button id="btn-reset-alloc"   class="btn btn-secondary">↺ Reset</button>' +
          '<button id="btn-execute-paycheck" class="btn btn-primary">✓ Execute</button>' +
        '</div>' +
      '</div>';

    buildAllocationList(state);
    updateAllocationTotals();

    document.getElementById('xfr-amount').addEventListener('input', function() { updateAllocationTotals(); });
    document.getElementById('xfr-period').addEventListener('change', function() { buildAllocationList(state); updateAllocationTotals(); });
    document.getElementById('btn-smart-balance').addEventListener('click', smartBalance);
    document.getElementById('btn-reset-alloc').addEventListener('click', function() { buildAllocationList(state); updateAllocationTotals(); });
    document.getElementById('btn-execute-paycheck').addEventListener('click', function() { executePaycheck(state); });
  }

  // Build the allocation rows from yearly categories + fixed expenses
  function buildAllocationList(state) {
    var list = document.getElementById('allocation-list');
    if (!list) return;

    var periodKey  = (document.getElementById('xfr-period') || {}).value || '';
    var suggestions = getSuggestedAllocations(state, periodKey);

    list.innerHTML = suggestions.map(function(s, i) {
      return '<div class="alloc-row" data-index="' + i + '">' +
        '<label class="alloc-check-wrap">' +
          '<input type="checkbox" class="alloc-check" data-index="' + i + '" checked>' +
        '</label>' +
        '<span class="alloc-name">' + s.name + '</span>' +
        '<div class="alloc-amount-wrap">' +
          '<span class="input-prefix small">$</span>' +
          '<input type="number" step="0.01" min="0" class="alloc-amount-input form-input prefix-input" data-index="' + i + '" value="' + s.amount.toFixed(2) + '">' +
        '</div>' +
      '</div>';
    }).join('');

    // Wire events on all rows
    list.querySelectorAll('.alloc-check').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var idx = cb.dataset.index;
        var inp = list.querySelector('.alloc-amount-input[data-index="' + idx + '"]');
        if (inp) inp.disabled = !cb.checked;
        updateAllocationTotals();
      });
    });
    list.querySelectorAll('.alloc-amount-input').forEach(function(inp) {
      inp.addEventListener('input', updateAllocationTotals);
    });
  }

  // Generate suggested amounts: yearly categories + this paycheck's fixed expenses
  function getSuggestedAllocations(state, periodKey) {
    var suggestions = [];
    var perYear = (state.income && state.income.paychecksPerYear) || 26;

    // Yearly categories
    (state.yearlyCategories || []).forEach(function(cat) {
      var perCheck = Math.round((cat.annualGoal || 0) / perYear * 100) / 100;
      if (perCheck > 0) {
        suggestions.push({ type: 'category', id: cat.id, name: cat.name, amount: perCheck });
      }
    });

    // Fixed expenses for this paycheck number
    var checkNum = getCheckNumFromKey(periodKey);
    (state.fixedMonthlyExpenses || []).forEach(function(exp) {
      var assign = exp.paycheckAssign || 1;
      if (assign === checkNum) {
        suggestions.push({ type: 'fixed', id: exp.id, name: exp.name + ' (fixed)', amount: exp.amount || 0 });
      }
    });

    return suggestions;
  }

  function getCheckNumFromKey(key) {
    if (!key) return 1;
    var parts = key.split('-');
    return parseInt(parts[2], 10) || 1;
  }

  // Update the Allocated / Available / Remaining totals display
  function updateAllocationTotals() {
    var totalsEl = document.getElementById('allocation-totals');
    var amtEl    = document.getElementById('xfr-amount');
    if (!totalsEl || !amtEl) return;

    var available  = parseFloat(amtEl.value) || 0;
    var allocated  = 0;
    document.querySelectorAll('.alloc-check:checked').forEach(function(cb) {
      var inp = document.querySelector('.alloc-amount-input[data-index="' + cb.dataset.index + '"]');
      if (inp) allocated += parseFloat(inp.value) || 0;
    });
    allocated = Math.round(allocated * 100) / 100;

    var diff = Math.round((available - allocated) * 100) / 100;
    var over = diff < 0;

    totalsEl.innerHTML =
      '<div class="totals-row"><span>Allocated</span><span class="' + (over ? 'text-danger' : '') + '">' + App.Storage.formatCurrency(allocated) + '</span></div>' +
      '<div class="totals-row"><span>Available</span><span>' + App.Storage.formatCurrency(available) + '</span></div>' +
      '<div class="totals-row ' + (over ? 'totals-over' : 'totals-under') + '">' +
        '<span>' + (over ? '⚠ Over by' : '✓ Remaining') + '</span>' +
        '<span class="' + (over ? 'text-danger' : 'text-success') + '">' + App.Storage.formatCurrency(Math.abs(diff)) + '</span>' +
      '</div>';
  }

  // Scale all checked amounts proportionally to fit available
  function smartBalance() {
    var available = parseFloat((document.getElementById('xfr-amount') || {}).value) || 0;
    if (available <= 0) return;

    var inputs = [];
    var currentTotal = 0;
    document.querySelectorAll('.alloc-check:checked').forEach(function(cb) {
      var inp = document.querySelector('.alloc-amount-input[data-index="' + cb.dataset.index + '"]');
      if (inp) { inputs.push(inp); currentTotal += parseFloat(inp.value) || 0; }
    });
    if (currentTotal === 0 || inputs.length === 0) return;

    var scale = available / currentTotal;
    inputs.forEach(function(inp) {
      inp.value = (Math.round((parseFloat(inp.value) || 0) * scale * 100) / 100).toFixed(2);
    });
    updateAllocationTotals();
  }

  // Execute the paycheck allocation
  function executePaycheck(state) {
    var amtEl    = document.getElementById('xfr-amount');
    var acctEl   = document.getElementById('xfr-account');
    var dateEl   = document.getElementById('xfr-date');
    var periodEl = document.getElementById('xfr-period');
    var listEl   = document.getElementById('allocation-list');
    if (!amtEl || !acctEl || !dateEl || !periodEl || !listEl) return;

    var depositAmt  = Math.round(parseFloat(amtEl.value) * 100) / 100 || 0;
    var accountId   = acctEl.value;
    var depositDate = dateEl.value;
    var periodKey   = periodEl.value;

    if (depositAmt <= 0) { App.showToast('Enter a paycheck amount.', 'error'); return; }
    if (!accountId)      { App.showToast('Select a deposit account.', 'error'); return; }

    var ns = App.getState();

    // Credit the deposit account first
    var bankAcct = (ns.accounts.bank || []).find(function(b) { return b.id === accountId; });
    if (bankAcct) bankAcct.balance = Math.round((bankAcct.balance + depositAmt) * 100) / 100;

    var movements    = [{ accountId: accountId, accountName: bankAcct ? bankAcct.name : '', change: +depositAmt }];
    var relatedTxIds = [];

    // Process each checked allocation line
    listEl.querySelectorAll('.alloc-check:checked').forEach(function(cb) {
      var idx      = cb.dataset.index;
      var inp      = listEl.querySelector('.alloc-amount-input[data-index="' + idx + '"]');
      var nameEl   = listEl.querySelector('.alloc-row[data-index="' + idx + '"] .alloc-name');
      if (!inp || !nameEl) return;

      var allocAmt  = Math.round(parseFloat(inp.value) * 100) / 100 || 0;
      if (allocAmt <= 0) return;
      var allocName = nameEl.textContent.replace(' (fixed)', '').trim();

      // Debit the bank account for this allocation
      if (bankAcct) bankAcct.balance = Math.round((bankAcct.balance - allocAmt) * 100) / 100;
      movements.push({ accountId: accountId, accountName: bankAcct ? bankAcct.name : '', change: -allocAmt });

      // Credit matching vault (fuzzy match on name)
      var vault = (ns.accounts.vaults || []).find(function(v) {
        var vn = v.name.toLowerCase();
        var an = allocName.toLowerCase();
        return vn.includes(an) || an.includes(vn);
      });
      if (vault) {
        vault.balance = Math.round((vault.balance + allocAmt) * 100) / 100;
        movements.push({ accountId: vault.id, accountName: vault.name, change: +allocAmt });
      }

      // Log individual transaction
      var txId = App.Storage.generateId();
      relatedTxIds.push(txId);
      if (!ns.transactions) ns.transactions = [];
      ns.transactions.push({
        id:            txId,
        date:          depositDate,
        categoryName:  allocName,
        amount:        allocAmt,
        accountId:     accountId,
        accountName:   bankAcct ? bankAcct.name : '',
        note:          'Paycheck allocation — ' + periodKey,
        paycheckPeriod: periodKey
      });
    });

    // Append-only journal entry
    if (!ns.journal) ns.journal = [];
    ns.journal.push({
      id:           App.Storage.generateId(),
      timestamp:    new Date().toISOString(),
      type:         'allocation',
      description:  'Paycheck arrived — ' + periodKey,
      movements:    movements,
      relatedTxIds: relatedTxIds,
      canReverse:   true
    });

    // Mark paycheck period as deposited in state.paychecks
    if (!ns.paychecks) ns.paychecks = {};
    var parts    = periodKey.split('-');
    var monthKey = parts[0] + '-' + parts[1];
    var ckNum    = parts[2] || '1';
    if (!ns.paychecks[monthKey]) ns.paychecks[monthKey] = {};
    if (!ns.paychecks[monthKey][ckNum]) ns.paychecks[monthKey][ckNum] = {};
    ns.paychecks[monthKey][ckNum].deposited     = true;
    ns.paychecks[monthKey][ckNum].depositedDate = depositDate;
    ns.paychecks[monthKey][ckNum].amount        = depositAmt;

    App.setState(ns);
    App.showToast('Paycheck allocated ✓', 'success');
    if (App.events) {
      App.events.emit('paycheck:allocated', { periodKey: periodKey, depositAmt: depositAmt });
      App.events.emit('account:balanceChanged', {});
    }

    _mode = null;
    App.refreshCurrentTab();
  }

  // ── WORKFLOW 2: Pay Credit Cards ──────────────────────────
  function renderPayCards(state, container) {
    var cards    = (state.accounts && state.accounts.cards) || [];
    var bankAccts = (state.accounts && state.accounts.bank)  || [];
    var transfer  = bankAccts.find(function(b) { return b.isTransferAccount; }) || bankAccts[0];

    var acctOptions = bankAccts.map(function(b) {
      return '<option value="' + b.id + '"' + (transfer && b.id === transfer.id ? ' selected' : '') + '>' +
        b.name + ' (' + App.Storage.formatCurrency(b.balance) + ')</option>';
    }).join('');

    var withBalance = cards.filter(function(c) { return c.balance > 0; });
    var zeroBal     = cards.filter(function(c) { return c.balance <= 0; });

    container.innerHTML =
      '<div class="workflow-card">' +
        '<h3 class="workflow-title">💳 Pay Credit Cards</h3>' +
        '<div class="form-grid">' +
          '<label class="form-label">Pay from account</label>' +
          '<select id="pay-from-acct" class="form-input">' + acctOptions + '</select>' +
        '</div>' +
        '<div class="card-payments-list" id="card-payments-list">' +
          (withBalance.length
            ? withBalance.map(buildCardPayRow).join('')
            : '<p class="text-secondary" style="padding:16px 0">All cards have $0 balance. Nothing to pay.</p>') +
          zeroBal.map(function(c) {
            return '<div class="card-pay-row zero-bal">' +
              '<span class="alloc-check-wrap" style="opacity:.3">☐</span>' +
              '<div class="card-pay-info"><span class="card-pay-name">' + c.name + '</span>' +
              '<span class="card-pay-bal text-secondary">$0.00 balance</span></div>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div id="card-pay-totals" class="allocation-totals"></div>' +
        '<div class="workflow-actions">' +
          '<button id="btn-execute-cards" class="btn btn-primary">✓ Execute Payments</button>' +
        '</div>' +
      '</div>';

    updateCardPayTotals(state);

    document.querySelectorAll('.card-pay-check, .card-pay-amount').forEach(function(el) {
      el.addEventListener('change', function() { updateCardPayTotals(state); });
      el.addEventListener('input',  function() { updateCardPayTotals(state); });
    });
    document.querySelectorAll('.pay-mode-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var row    = btn.closest('.card-pay-row');
        var cardId = row.dataset.cardId;
        var card   = cards.find(function(c) { return c.id === cardId; });
        if (!card) return;
        var inp  = row.querySelector('.card-pay-amount');
        var mode = btn.dataset.payMode;
        if      (mode === 'full') inp.value = card.balance.toFixed(2);
        else if (mode === 'min')  inp.value = Math.max(25, Math.round(card.balance * 0.02 * 100) / 100).toFixed(2);
        else if (mode === 'custom') inp.focus();
        updateCardPayTotals(state);
      });
    });
    document.getElementById('pay-from-acct').addEventListener('change', function() { updateCardPayTotals(state); });
    document.getElementById('btn-execute-cards').addEventListener('click', function() { executeCardPayments(state); });
  }

  function buildCardPayRow(card) {
    var util    = card.limit > 0 ? (card.balance / card.limit) * 100 : 0;
    var health  = util < 30 ? '✓ Good'    : util < 50 ? '⚠ Caution' : '🚨 High';
    var hClass  = util < 30 ? 'text-success' : util < 50 ? 'text-warning' : 'text-danger';
    return '<div class="card-pay-row" data-card-id="' + card.id + '">' +
      '<label class="alloc-check-wrap">' +
        '<input type="checkbox" class="card-pay-check" data-id="' + card.id + '" checked>' +
      '</label>' +
      '<div class="card-pay-info">' +
        '<span class="card-pay-name">' + card.name + '</span>' +
        '<span class="card-pay-bal">Balance: ' + App.Storage.formatCurrency(card.balance) +
          ' &nbsp;<span class="' + hClass + '">' + health + ' (' + util.toFixed(1) + '%)</span></span>' +
      '</div>' +
      '<div class="card-pay-controls">' +
        '<div class="pay-mode-btns">' +
          '<button class="pay-mode-btn" data-pay-mode="min">Min</button>' +
          '<button class="pay-mode-btn pay-mode-active" data-pay-mode="full">Full</button>' +
          '<button class="pay-mode-btn" data-pay-mode="custom">Custom</button>' +
        '</div>' +
        '<div class="alloc-amount-wrap">' +
          '<span class="input-prefix small">$</span>' +
          '<input type="number" step="0.01" min="0" class="card-pay-amount form-input prefix-input" data-id="' + card.id + '" value="' + card.balance.toFixed(2) + '">' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function updateCardPayTotals(state) {
    var totalsEl = document.getElementById('card-pay-totals');
    var fromEl   = document.getElementById('pay-from-acct');
    if (!totalsEl || !fromEl) return;

    var fromAcct  = (state.accounts.bank || []).find(function(b) { return b.id === fromEl.value; });
    var available = fromAcct ? fromAcct.balance : 0;
    var total     = 0;

    document.querySelectorAll('.card-pay-check:checked').forEach(function(cb) {
      var inp = document.querySelector('.card-pay-amount[data-id="' + cb.dataset.id + '"]');
      if (inp) total += parseFloat(inp.value) || 0;
    });
    total = Math.round(total * 100) / 100;
    var after = Math.round((available - total) * 100) / 100;
    var short = after < 0;

    totalsEl.innerHTML =
      '<div class="totals-row"><span>Total payment</span><span>' + App.Storage.formatCurrency(total) + '</span></div>' +
      '<div class="totals-row"><span>Source balance</span><span>' + App.Storage.formatCurrency(available) + '</span></div>' +
      '<div class="totals-row ' + (short ? 'totals-over' : 'totals-under') + '">' +
        '<span>' + (short ? '⚠ Would go negative' : '✓ Balance after') + '</span>' +
        '<span class="' + (short ? 'text-danger' : 'text-success') + '">' + App.Storage.formatCurrency(after) + '</span>' +
      '</div>';
  }

  function executeCardPayments(state) {
    var fromEl = document.getElementById('pay-from-acct');
    if (!fromEl) return;

    var ns       = App.getState();
    var fromAcct = (ns.accounts.bank || []).find(function(b) { return b.id === fromEl.value; });
    if (!fromAcct) { App.showToast('Select a source account.', 'error'); return; }

    // Validate: check total won't exceed balance
    var totalPmt = 0;
    document.querySelectorAll('.card-pay-check:checked').forEach(function(cb) {
      var inp = document.querySelector('.card-pay-amount[data-id="' + cb.dataset.id + '"]');
      if (inp) totalPmt += parseFloat(inp.value) || 0;
    });
    if (totalPmt <= 0) { App.showToast('No payments selected.', 'error'); return; }
    if (totalPmt > fromAcct.balance) {
      App.showToast('Payment would exceed source balance.', 'error');
      return;
    }

    var movements    = [];
    var relatedTxIds = [];

    document.querySelectorAll('.card-pay-check:checked').forEach(function(cb) {
      var cardId = cb.dataset.id;
      var inp    = document.querySelector('.card-pay-amount[data-id="' + cardId + '"]');
      if (!inp) return;
      var pmtAmt = Math.round(parseFloat(inp.value) * 100) / 100 || 0;
      if (pmtAmt <= 0) return;

      var card = (ns.accounts.cards || []).find(function(c) { return c.id === cardId; });
      if (!card) return;

      card.balance     = Math.max(0, Math.round((card.balance - pmtAmt) * 100) / 100);
      fromAcct.balance = Math.round((fromAcct.balance - pmtAmt) * 100) / 100;

      movements.push({ accountId: fromAcct.id, accountName: fromAcct.name, change: -pmtAmt });
      movements.push({ accountId: card.id,     accountName: card.name,     change: -pmtAmt });

      var txId = App.Storage.generateId();
      relatedTxIds.push(txId);
      if (!ns.transactions) ns.transactions = [];
      ns.transactions.push({
        id:           txId,
        date:         App.Storage.toISODate(new Date()),
        categoryName: 'Credit Card Payment',
        amount:       pmtAmt,
        accountId:    fromAcct.id,
        accountName:  fromAcct.name,
        note:         'Payment to ' + card.name,
        paycheckPeriod: ''
      });
    });

    if (!ns.journal) ns.journal = [];
    ns.journal.push({
      id:           App.Storage.generateId(),
      timestamp:    new Date().toISOString(),
      type:         'payment',
      description:  'Credit card payments — ' + App.Storage.formatCurrency(totalPmt),
      movements:    movements,
      relatedTxIds: relatedTxIds,
      canReverse:   true
    });

    App.setState(ns);
    App.showToast('Payments executed ✓', 'success');
    if (App.events) {
      App.events.emit('card:paid', { totalPaid: totalPmt });
      App.events.emit('account:balanceChanged', {});
    }

    _mode = null;
    App.refreshCurrentTab();
  }

  // ── Stub for unbuilt workflows ────────────────────────────
  function renderStub(container, title) {
    container.innerHTML =
      '<div class="workflow-card">' +
        '<h3 class="workflow-title">' + title + '</h3>' +
        '<p class="workflow-coming-soon">🔧 This workflow is coming in the next build step.</p>' +
      '</div>';
  }

  // ── Helper: upcoming pay periods ─────────────────────────
  // Returns the 4 most relevant upcoming periods (±14 to +45 days from today).
  function getUpcomingPeriods(state) {
    var paydayDates = (state.income && state.income.paydayDates) || [];
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var relevant = paydayDates.filter(function(d) {
      var dt   = new Date(d + 'T12:00:00');
      var diff = (dt - today) / 86400000;
      return diff >= -14 && diff <= 60;
    });

    // Fallback: use first 5 periods if none are near today
    if (relevant.length === 0) relevant = paydayDates.slice(0, 5);

    return relevant.map(function(d) {
      var idx = paydayDates.indexOf(d);
      return {
        key:   buildPeriodKey(state, d),
        label: 'Period ' + (idx + 1) + ' — ' + d
      };
    });
  }

  // Build "YYYY-MM-N" key for a given payday date
  function buildPeriodKey(state, dateStr) {
    var d  = new Date(dateStr + 'T12:00:00');
    var yr = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    var paydayDates = (state.income && state.income.paydayDates) || [];
    var prefix      = yr + '-' + mo;
    var inMonth     = paydayDates.filter(function(p) { return p.startsWith(prefix); });
    var ck          = inMonth.indexOf(dateStr) + 1 || 1;
    return yr + '-' + mo + '-' + ck;
  }

  // ── Public API ────────────────────────────────────────────
  App.Transfers = { render: render };

})(window.App = window.App || {});
