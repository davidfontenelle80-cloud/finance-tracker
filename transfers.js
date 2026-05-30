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
  let _mode = null;

  // ── Currency formatter ────────────────────────────────────
  function fmt(n) {
    return '$' + (parseFloat(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

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

    wrap.querySelectorAll('.mode-card').forEach(function(card) {
      card.addEventListener('click', function() {
        const mode = card.dataset.mode;
        if (mode === _mode) return;
        _mode = mode;
        wrap.querySelectorAll('.mode-card').forEach(function(c) {
          c.classList.toggle('active', c.dataset.mode === mode);
        });
        renderWorkflow(state, document.getElementById('transfers-workflow'), mode);
      });
    });

    if (!_mode) {
      const first = wrap.querySelector('.mode-card');
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
    const modes = [
      { id: 'paycheck',  icon: '💰', label: 'Paycheck Arrived' },
      { id: 'paycards',  icon: '💳', label: t('xfr.payCards') },
      { id: 'movemoney', icon: '🏦', label: 'Move Money'       },
      { id: 'fundvault', icon: '🎯', label: 'Fund a Vault'     },
      { id: 'withdraw',  icon: '📤', label: 'Withdraw / Spend' }
    ];
    return '<div class="mode-selector">' +
      modes.map(function(m) {
        return '<button class="mode-card" data-mode="' + m.id + '" tabindex="0">' +
          '<span class="mode-icon">' + m.icon + '</span>' + m.label + '</button>';
      }).join('') +
      '</div>';
  }

  // ── Workflow router ───────────────────────────────────────
  function renderWorkflow(state, container, mode) {
    if      (mode === 'paycheck')  renderPaycheckArrived(state, container);
    else if (mode === 'paycards')  renderPayCards(state, container);
    else if (mode === 'movemoney') renderMoveMoney(state, container);
    else if (mode === 'fundvault') renderFundVault(state, container);
    else if (mode === 'withdraw')  renderWithdraw(state, container);
  }

  // ═════════════════════════════════════════════════════════
  // WORKFLOW 1: Paycheck Arrived
  // ═════════════════════════════════════════════════════════
  function renderPaycheckArrived(state, container) {
    const periods    = getUpcomingPeriods(state);
    const bankAccts  = (state.accounts && state.accounts.bank) || [];
    const defaultAmt = (state.income && state.income.defaultPaycheckAmount) || 3000;
    const today      = App.Storage.toISODate(new Date());

    const periodOptions = periods.length
      ? periods.map(function(p) { return '<option value="' + p.key + '">' + p.label + '</option>'; }).join('')
      : '<option value="">No upcoming periods found</option>';

    const bankOptions = bankAccts.map(function(a) {
      return '<option value="' + a.id + '">' + a.name + ' (' + fmt(a.balance) + ')</option>';
    }).join('') || '<option value="">No bank accounts configured</option>';

    container.innerHTML =
      '<div class="workflow-card">' +
        '<h3>💰 Paycheck Arrived</h3>' +
        '<div class="form-group"><label class="form-label">Pay Period</label>' +
          '<select id="pc-period" class="form-control">' + periodOptions + '</select></div>' +
        '<div class="form-group"><label class="form-label">Amount Received</label>' +
          '<input id="pc-amount" type="number" class="form-control" value="' + defaultAmt + '" min="0" step="0.01" inputmode="decimal" /></div>' +
        '<div class="form-group"><label class="form-label">Date Deposited</label>' +
          '<input id="pc-date" type="date" class="form-control" value="' + today + '" /></div>' +
        '<div class="form-group"><label class="form-label">Deposit To</label>' +
          '<select id="pc-account" class="form-control">' + bankOptions + '</select></div>' +
        '<div class="alloc-section">' +
          '<div class="alloc-header"><span></span><span>Category</span><span>Amount</span></div>' +
          '<div id="pc-alloc-list" class="allocation-list"></div>' +
        '</div>' +
        '<div id="pc-totals" class="totals-row"></div>' +
        '<div class="workflow-actions">' +
          '<button id="pc-smart" class="btn-secondary">Smart Balance</button>' +
          '<button id="pc-reset" class="btn-secondary">Reset</button>' +
          '<button id="pc-execute" class="btn-execute">Execute</button>' +
        '</div>' +
      '</div>';

    const amtInput = container.querySelector('#pc-amount');
    const allocList = container.querySelector('#pc-alloc-list');

    function buildAllocRows() {
      const available = parseFloat(amtInput.value) || 0;
      const allocs = getSuggestedAllocations(state, available);
      allocList.innerHTML = allocs.map(function(a, i) {
        const completeBadge = a.complete ? ' <span class="badge badge--green" style="font-size:0.65rem">✓ Done</span>' : '';
        return '<div class="alloc-row' + (a.complete ? ' alloc-complete' : '') + '" data-idx="' + i + '">' +
          '<input type="checkbox" class="alloc-check"' + (a.complete ? '' : ' checked') + ' />' +
          '<span class="alloc-name">' + a.name + completeBadge + '</span>' +
          '<input type="number" class="alloc-amount" value="' + a.amount.toFixed(2) + '" min="0" step="0.01" inputmode="decimal" />' +
          '</div>';
      }).join('');
      allocList.querySelectorAll('.alloc-check, .alloc-amount').forEach(function(el) {
        el.addEventListener('change', updateTotals);
        el.addEventListener('input',  updateTotals);
      });
      allocList.querySelectorAll('.alloc-check').forEach(function(chk) {
        chk.addEventListener('change', function() {
          const row = chk.closest('.alloc-row');
          row.classList.toggle('disabled', !chk.checked);
        });
      });
      updateTotals();
    }

    function updateTotals() {
      const available  = parseFloat(amtInput.value) || 0;
      let   allocated  = 0;
      allocList.querySelectorAll('.alloc-row').forEach(function(row) {
        const checked = row.querySelector('.alloc-check').checked;
        if (checked) allocated += parseFloat(row.querySelector('.alloc-amount').value) || 0;
      });
      allocated = Math.round(allocated * 100) / 100;
      const diff = Math.round((allocated - available) * 100) / 100;
      const over = diff > 0;
      const totals = container.querySelector('#pc-totals');
      totals.innerHTML =
        '<div class="total-line"><span>Available</span><span>' + fmt(available) + '</span></div>' +
        '<div class="total-line"><span>Allocated</span><span>' + fmt(allocated) + '</span></div>' +
        '<div class="total-line ' + (over ? 'over' : 'ok') + ' emphasis"><span>' +
          (over ? '⚠ Over by' : '✓ Surplus') +
        '</span><span>' + fmt(Math.abs(diff)) + '</span></div>';
    }

    amtInput.addEventListener('input', buildAllocRows);
    buildAllocRows();

    // Smart Balance: scale checked amounts proportionally to fit available
    container.querySelector('#pc-smart').addEventListener('click', function() {
      const available = parseFloat(amtInput.value) || 0;
      const rows = allocList.querySelectorAll('.alloc-row');
      let total = 0;
      rows.forEach(function(row) {
        if (row.querySelector('.alloc-check').checked)
          total += parseFloat(row.querySelector('.alloc-amount').value) || 0;
      });
      if (total <= 0) return;
      const scale = available / total;
      rows.forEach(function(row) {
        if (row.querySelector('.alloc-check').checked) {
          const inp = row.querySelector('.alloc-amount');
          inp.value = ((parseFloat(inp.value) || 0) * scale).toFixed(2);
        }
      });
      updateTotals();
    });

    container.querySelector('#pc-reset').addEventListener('click', buildAllocRows);

    container.querySelector('#pc-execute').addEventListener('click', function() {
      const available = parseFloat(amtInput.value) || 0;
      const acctId    = container.querySelector('#pc-account').value;
      const date      = container.querySelector('#pc-date').value;
      const periodKey = container.querySelector('#pc-period').value;
      if (available <= 0) { App.showToast('Enter a paycheck amount.', 'error'); return; }

      const rows = allocList.querySelectorAll('.alloc-row');
      const movements = [{ account: acctId, change: +available }];
      const txIds = [];

      const s = App.Storage.cloneState(App.getState());
      if (!s.transactions) s.transactions = [];
      if (!s.journal)      s.journal      = [];
      if (!s.paychecks)    s.paychecks    = {};

      // Credit the deposit account
      const destAcct = (s.accounts.bank || []).find(function(a) { return a.id === acctId; });
      if (destAcct) destAcct.balance = Math.round((destAcct.balance + available) * 100) / 100;

      // Process each checked allocation
      rows.forEach(function(row) {
        if (!row.querySelector('.alloc-check').checked) return;
        const amt    = parseFloat(row.querySelector('.alloc-amount').value) || 0;
        if (amt <= 0) return;
        const name   = row.querySelector('.alloc-name').textContent;

        // Find vault matching this category name and fund it
        const vault = (s.accounts.vaults || []).find(function(v) {
          return v.name.toLowerCase() === name.toLowerCase();
        });
        const vaultId = vault ? vault.id : null;
        if (vault) {
          vault.balance = Math.round((vault.balance + amt) * 100) / 100;
          // Debit the bank account for this allocation
          if (destAcct) destAcct.balance = Math.round((destAcct.balance - amt) * 100) / 100;
          movements.push({ account: vaultId, change: +amt });
          movements.push({ account: acctId,  change: -amt });
        }

        const txId = App.Storage.generateId();
        txIds.push(txId);
        s.transactions.unshift({
          id: txId, date: date,
          category: name, amount: amt,
          account: acctId, note: 'Paycheck allocation'
        });
      });

      // Mark period as deposited
      if (periodKey) {
        if (!s.paychecks[periodKey]) s.paychecks[periodKey] = {};
        s.paychecks[periodKey].deposited = true;
        s.paychecks[periodKey].depositedAmount = available;
        s.paychecks[periodKey].depositDate = date;
      }

      s.journal.push({
        id: App.Storage.generateId(),
        timestamp: new Date().toISOString(),
        type: 'allocation',
        description: 'Paycheck ' + fmt(available) + ' allocated (' + (periodKey || date) + ')',
        movements: movements,
        relatedTxIds: txIds,
        canReverse: true
      });

      App.setState(s);
      App.showToast('Paycheck allocated — ' + fmt(available) + ' distributed.', 'success');
      _mode = 'paycheck';
      renderPaycheckArrived(App.getState(), container);
      showAdvanceFundingBanner(App.getState(), container);
      showGoalCompletionNotice(App.getState(), container);
    });
  }

  // Suggested allocations: per-paycheck amounts from yearly categories
  function getSuggestedAllocations(state, available) {
    const cats      = state.yearlyCategories || [];
    const overrides = state.allocationOverrides || {};
    const vaults    = (state.accounts && state.accounts.vaults) || [];
    const redirect  = (state.settings && state.settings.goalCompletionRedirect) || 'skip';
    const perYear   = 26;

    const results = cats.map(function(c) {
      const normalAmount = Math.round((c.annualGoal / perYear) * 100) / 100;

      // Check if this vault is fully funded for the year
      const vault = vaults.find(function(v) {
        return v.name.toLowerCase() === c.name.toLowerCase();
      });
      const isComplete = vault && vault.balance >= c.annualGoal;

      if (isComplete) {
        // Goal complete — amount depends on redirect setting
        return { id: c.id, name: c.name, amount: 0, annualGoal: c.annualGoal, complete: true };
      }

      // Check advance-funding override
      const ov = overrides[c.id];
      let amount;
      if (ov && ov.reducedAmount !== undefined) {
        const pace = calcVaultPace(state, c);
        amount = (pace && pace.aheadBy > 0) ? ov.reducedAmount : normalAmount;
      } else {
        amount = normalAmount;
      }

      return { id: c.id, name: c.name, amount: amount, annualGoal: c.annualGoal, complete: false };
    });

    // Handle redirect: if any category is complete, find redirect target
    const completeIds  = results.filter(function(r) { return r.complete; }).map(function(r) { return r.id; });
    const totalRedirect = completeIds.reduce(function(sum, id) {
      const cat = cats.find(function(c) { return c.id === id; });
      return sum + (cat ? Math.round((cat.annualGoal / perYear) * 100) / 100 : 0);
    }, 0);

    if (totalRedirect > 0 && redirect !== 'skip') {
      if (redirect === 'next') {
        // Find the first underfunded non-complete category and add the redirected amount
        const target = results.find(function(r) { return !r.complete; });
        if (target) target.amount = Math.round((target.amount + totalRedirect) * 100) / 100;
      } else if (redirect === 'slush') {
        // Add to a Slush entry (create a synthetic row if needed)
        const slush = results.find(function(r) { return /slush/i.test(r.name); });
        if (slush) slush.amount = Math.round((slush.amount + totalRedirect) * 100) / 100;
      }
    }

    return results;
  }

  // Calculate how far ahead of pace a vault/category is.
  // Returns { onPace, aheadBy, paychecksAhead, expectedBalance, actualBalance } or null.
  function calcVaultPace(state, cat) {
    if (!cat || !cat.annualGoal) return null;
    const paydayDates   = (state.income && state.income.paydayDates) || [];
    const perYear       = state.income && state.income.paychecksPerYear ? state.income.paychecksPerYear : 26;
    const today         = new Date(); today.setHours(0, 0, 0, 0);

    // Count how many paychecks have passed so far this year
    const paychecksSoFar = paydayDates.filter(function(d) {
      return new Date(d + 'T12:00:00') <= today;
    }).length;

    if (paychecksSoFar === 0) return null;

    const perPaycheck    = cat.annualGoal / perYear;
    const expectedBalance = Math.round(perPaycheck * paychecksSoFar * 100) / 100;

    // Find matching vault balance
    const vaults = (state.accounts && state.accounts.vaults) || [];
    const vault  = vaults.find(function(v) {
      return v.name.toLowerCase() === cat.name.toLowerCase();
    });
    if (!vault) return null;

    const actualBalance  = vault.balance || 0;
    const aheadBy        = Math.round((actualBalance - expectedBalance) * 100) / 100;
    const paychecksAhead = aheadBy > 0 ? Math.round((aheadBy / perPaycheck) * 10) / 10 : 0;

    return { onPace: aheadBy <= 0, aheadBy, paychecksAhead, expectedBalance, actualBalance, perPaycheck };
  }

  // After a paycheck execute or vault fund, scan all categories for ahead-of-pace.
  // Returns array of { cat, pace } for any vault >= 0.5 paychecks ahead.
  function findAheadOfPaceVaults(state) {
    const cats = state.yearlyCategories || [];
    const ahead = [];
    cats.forEach(function(c) {
      const pace = calcVaultPace(state, c);
      if (pace && pace.paychecksAhead >= 0.5) {
        ahead.push({ cat: c, pace: pace });
      }
    });
    return ahead;
  }

  // Show goal completion notice after paycheck execute
  function showGoalCompletionNotice(state, container) {
    const cats   = state.yearlyCategories || [];
    const vaults = (state.accounts && state.accounts.vaults) || [];
    const done   = cats.filter(function(c) {
      const vault = vaults.find(function(v) {
        return v.name.toLowerCase() === c.name.toLowerCase();
      });
      return vault && vault.balance >= c.annualGoal;
    });
    if (!done.length) return;

    const old = container.querySelector('.goal-complete-notice');
    if (old) old.remove();

    const notice = document.createElement('div');
    notice.className = 'goal-complete-notice';
    notice.innerHTML =
      '<div class="gcn-title">🏆 Goal Complete!</div>' +
      done.map(function(c) {
        return '<div class="gcn-row">✓ ' + c.name + ' — fully funded for the year</div>';
      }).join('');
    container.insertBefore(notice, container.firstChild);

    // Auto-dismiss after 6 seconds
    setTimeout(function() { if (notice.parentNode) notice.remove(); }, 6000);
  }

  // Show advance funding banner inside a workflow container.
  // Called after Paycheck Execute and Fund Vault Execute.
  function showAdvanceFundingBanner(state, container) {
    const ahead = findAheadOfPaceVaults(state);
    if (!ahead.length) return;

    // Remove any existing banner
    const old = container.querySelector('.advance-funding-banner');
    if (old) old.remove();

    const fmt2 = function(n) { return '$' + (parseFloat(n)||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };

    const rows = ahead.map(function(item) {
      const label = item.pace.paychecksAhead.toFixed(1) + ' paychecks ahead';
      return '<div class="afb-row" data-cat-id="' + item.cat.id + '" data-reduction="' + item.pace.perPaycheck.toFixed(2) + '">' +
        '<div class="afb-info">' +
          '<span class="afb-name">' + item.cat.name + '</span>' +
          '<span class="afb-detail">' + label + ' · reduce next by ' + fmt2(item.pace.perPaycheck) + '?</span>' +
        '</div>' +
        '<div class="afb-btns">' +
          '<button class="afb-yes btn-secondary" data-cat-id="' + item.cat.id + '" data-reduction="' + item.pace.perPaycheck.toFixed(2) + '">Reduce</button>' +
          '<button class="afb-no btn-secondary" data-cat-id="' + item.cat.id + '">Keep</button>' +
        '</div>' +
      '</div>';
    }).join('');

    const banner = document.createElement('div');
    banner.className = 'advance-funding-banner';
    banner.innerHTML =
      '<div class="afb-title">🎯 Ahead of Pace</div>' +
      rows;

    container.insertBefore(banner, container.firstChild);

    // Wire buttons
    banner.querySelectorAll('.afb-yes').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const catId    = btn.dataset.catId;
        const reduction = parseFloat(btn.dataset.reduction) || 0;
        const s = App.Storage.cloneState(App.getState());
        if (!s.allocationOverrides) s.allocationOverrides = {};
        s.allocationOverrides[catId] = { reducedAmount: 0, setAt: new Date().toISOString() };
        App.setState(s);
        btn.closest('.afb-row').remove();
        App.showToast('Next allocation for this category set to $0 until back on pace.', 'success');
        if (!banner.querySelectorAll('.afb-row').length) banner.remove();
      });
    });

    banner.querySelectorAll('.afb-no').forEach(function(btn) {
      btn.addEventListener('click', function() {
        btn.closest('.afb-row').remove();
        if (!banner.querySelectorAll('.afb-row').length) banner.remove();
      });
    });
  }

  // ═════════════════════════════════════════════════════════
  // WORKFLOW 2: Pay Credit Cards
  // ═════════════════════════════════════════════════════════
  function renderPayCards(state, container) {
    const bank  = (state.accounts && state.accounts.bank)  || [];
    const cards = (state.accounts && state.accounts.cards) || [];

    // Find transfer account; fall back to first bank account
    const transferAcct = bank.find(function(a) { return a.isTransferAccount; }) || bank[0] || { id: '', name: 'No account', balance: 0 };

    const bankOptions = bank.map(function(a) {
      return '<option value="' + a.id + '"' + (a.id === transferAcct.id ? ' selected' : '') + '>' +
        a.name + ' (' + fmt(a.balance) + ')</option>';
    }).join('');

    const cardRows = cards.filter(function(c) { return c.balance > 0; }).map(function(c) {
      return buildCardPayRow(c);
    }).join('') || '<p class="text-dim" style="padding:16px 0">All cards show $0 balance. Nothing to pay.</p>';

    container.innerHTML =
      '<div class="workflow-card">' +
        '<h3>💳 Pay Credit Cards</h3>' +
        '<div class="form-group"><label class="form-label">Pay From</label>' +
          '<select id="cp-from" class="form-control">' + bankOptions + '</select>' +
          '<span id="cp-from-bal" class="field-hint">Balance: ' + fmt(transferAcct.balance) + '</span></div>' +
        '<div id="cp-card-rows">' + cardRows + '</div>' +
        '<div id="cp-totals" class="totals-row"></div>' +
        '<div class="workflow-actions">' +
          '<button id="cp-execute" class="btn-execute">' + t('xfr.executePayments') + '</button>' +
        '</div>' +
      '</div>';

    wireCardPayRows(state, container, bank);
  }

  function buildCardPayRow(card) {
    const util     = card.limit > 0 ? (card.balance / card.limit) : 0;
    const utilPct  = (util * 100).toFixed(0) + '%';
    const avail    = Math.max(0, (card.limit || 0) - (card.balance || 0));
    let utilClass = 'util-good', utilLabel = '✓ Good &middot; ' + utilPct;
    if (util >= 0.5) { utilClass = 'util-bad';  utilLabel = '🚨 High &middot; ' + utilPct; }
    else if (util >= 0.3) { utilClass = 'util-warn'; utilLabel = '⚠ Watch &middot; ' + utilPct; }

    return '<div class="card-pay-row" data-card-id="' + card.id + '" data-full="' + card.balance + '" data-limit="' + (card.limit||0) + '">' +
      '<div class="card-pay-header">' +
        '<input type="checkbox" class="cp-check" checked />' +
        '<div style="flex:1;min-width:0">' +
          '<span class="card-pay-name">' + card.name + '</span>' +
          '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:1px">' +
            'Owed: <strong>' + fmt(card.balance) + '</strong> &middot; Avail: <strong style="color:var(--accent)">' + fmt(avail) + '</strong> / ' + fmt(card.limit||0) +
          '</div>' +
        '</div>' +
        '<span class="card-pay-util ' + utilClass + '">' + utilLabel + '</span>' +
      '</div>' +
      '<div class="pay-mode-btns">' +
        '<button class="pay-mode-btn active" data-pmode="full">Full</button>' +
        '<button class="pay-mode-btn" data-pmode="min">Min ($25)</button>' +
        '<button class="pay-mode-btn" data-pmode="custom">Custom</button>' +
      '</div>' +
      '<div class="card-pay-amount-row">' +
        '<label>Payment Amount</label>' +
        '<input type="number" class="cp-amount" value="' + card.balance.toFixed(2) + '" min="0" step="0.01" inputmode="decimal" />' +
      '</div>' +
      '<div class="card-pay-amount-row" style="margin-top:6px">' +
        '<label style="color:var(--text-dim)">Extra / Adjustment ($)</label>' +
        '<input type="number" class="cp-adjust" value="0" min="0" step="0.01" inputmode="decimal" placeholder="0.00" />' +
      '</div>' +
      '<div class="cp-after-row text-xs" style="text-align:right;margin-top:4px;color:var(--text-dim)">' +
        'Balance after: <strong class="cp-after-val text-green">' + fmt(0) + '</strong>' +
      '</div>' +
    '</div>';
  }

  function wireCardPayRows(state, container, bank) {
    // Wire pay-mode buttons
    container.querySelectorAll('.card-pay-row').forEach(function(row) {
      const fullAmt = parseFloat(row.dataset.full) || 0;

      function refreshAfterBal() {
        const amt    = parseFloat(row.querySelector('.cp-amount').value)  || 0;
        const adj    = parseFloat(row.querySelector('.cp-adjust').value)  || 0;
        const total  = Math.round((amt + adj) * 100) / 100;
        const after  = Math.max(0, Math.round((fullAmt - total) * 100) / 100);
        const el     = row.querySelector('.cp-after-val');
        if (el) {
          el.textContent = fmt(after);
          el.style.color = after <= 0 ? 'var(--accent)' : 'var(--text-dim)';
        }
        updateCardPayTotals(container, bank);
      }

      row.querySelectorAll('.pay-mode-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          row.querySelectorAll('.pay-mode-btn').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          const amtInput = row.querySelector('.cp-amount');
          if (btn.dataset.pmode === 'full')   amtInput.value = fullAmt.toFixed(2);
          else if (btn.dataset.pmode === 'min') amtInput.value = Math.min(25, fullAmt).toFixed(2);
          else amtInput.value = '0.00';
          row.querySelector('.cp-adjust').value = '0';
          refreshAfterBal();
        });
      });
      row.querySelector('.cp-check').addEventListener('change', refreshAfterBal);
      row.querySelector('.cp-amount').addEventListener('input', refreshAfterBal);
      row.querySelector('.cp-adjust').addEventListener('input', refreshAfterBal);
      refreshAfterBal();
    });
    updateCardPayTotals(container, bank);

    container.querySelector('#cp-from').addEventListener('change', function() {
      const acctId = this.value;
      const acct   = bank.find(function(a) { return a.id === acctId; });
      container.querySelector('#cp-from-bal').textContent = acct ? 'Balance: ' + fmt(acct.balance) : '';
      updateCardPayTotals(container, bank);
    });

    container.querySelector('#cp-execute').addEventListener('click', function() {
      const fromId = container.querySelector('#cp-from').value;
      const s      = App.Storage.cloneState(App.getState());
      const from   = (s.accounts.bank || []).find(function(a) { return a.id === fromId; });
      if (!from) { App.showToast('Select a payment account.', 'error'); return; }

      let totalPaid = 0;
      const movements = [];
      const txIds     = [];
      if (!s.transactions) s.transactions = [];
      if (!s.journal)      s.journal      = [];

      container.querySelectorAll('.card-pay-row').forEach(function(row) {
        if (!row.querySelector('.cp-check').checked) return;
        const cardId = row.dataset.cardId;
        const amt    = parseFloat(row.querySelector('.cp-amount').value) || 0;
        const adj    = parseFloat(row.querySelector('.cp-adjust').value) || 0;
        const amt_total = Math.round((amt + adj) * 100) / 100;
        if (amt_total <= 0) return;
        const card = (s.accounts.cards || []).find(function(c) { return c.id === cardId; });
        if (!card) return;
        card.balance  = Math.max(0, Math.round((card.balance - amt_total) * 100) / 100);
        from.balance  = Math.round((from.balance - amt_total) * 100) / 100;
        totalPaid    += amt_total;
        movements.push({ account: cardId, change: -amt });
        movements.push({ account: fromId, change: -amt });
        const txId = App.Storage.generateId();
        txIds.push(txId);
        s.transactions.unshift({
          id: txId, date: App.Storage.toISODate(new Date()),
          category: 'Credit Card Payment', amount: amt,
          account: fromId, note: 'Payment to ' + card.name
        });
      });

      if (totalPaid === 0) { App.showToast('No payments selected.', 'error'); return; }
      if (from.balance < 0) { App.showToast('Insufficient funds in payment account.', 'error'); return; }

      s.journal.push({
        id: App.Storage.generateId(),
        timestamp: new Date().toISOString(),
        type: 'payment',
        description: 'Credit card payments — ' + fmt(totalPaid) + ' total',
        movements: movements,
        relatedTxIds: txIds,
        canReverse: true
      });

      App.setState(s);
      App.showToast('Paid ' + fmt(totalPaid) + ' across credit cards.', 'success');
      _mode = 'paycards';
      renderPayCards(App.getState(), container);
    });
  }

  function updateCardPayTotals(container, bank) {
    const fromId = container.querySelector('#cp-from').value;
    const from   = bank.find(function(a) { return a.id === fromId; }) || { balance: 0 };
    let total = 0;
    container.querySelectorAll('.card-pay-row').forEach(function(row) {
      if (row.querySelector('.cp-check').checked)
        total += parseFloat(row.querySelector('.cp-amount').value) || 0;
    });
    total = Math.round(total * 100) / 100;
    const after  = Math.round((from.balance - total) * 100) / 100;
    const danger = after < 0;
    container.querySelector('#cp-totals').innerHTML =
      '<div class="total-line"><span>Total payment</span><span>' + fmt(total) + '</span></div>' +
      '<div class="total-line ' + (danger ? 'over' : 'ok') + ' emphasis"><span>Account after</span>' +
        '<span>' + fmt(after) + (danger ? ' ⚠' : ' ✓') + '</span></div>';
  }

  // ═════════════════════════════════════════════════════════
  // WORKFLOW 3: Move Money
  // ═════════════════════════════════════════════════════════
  function renderMoveMoney(state, container) {
    const allAccounts = getAllAccounts(state);

    container.innerHTML =
      '<div class="workflow-card">' +
        '<h3>🏦 Move Money</h3>' +
        '<div class="form-group"><label class="form-label">From</label>' +
          '<select id="mm-from" class="form-control">' + buildAccountOptions(allAccounts) + '</select>' +
          '<span id="mm-from-bal" class="field-hint"></span></div>' +
        '<div class="form-group"><label class="form-label">Amount</label>' +
          '<input id="mm-amount" type="number" class="form-control" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" /></div>' +
        '<div class="form-group"><label class="form-label">To</label>' +
          '<select id="mm-to" class="form-control">' + buildAccountOptions(allAccounts) + '</select>' +
          '<span id="mm-to-bal" class="field-hint"></span></div>' +
        '<div class="form-group"><label class="form-label">Note (optional)</label>' +
          '<input id="mm-note" type="text" class="form-control" placeholder="e.g. Moving to cover rent" /></div>' +
        '<div id="mm-preview" class="transfer-preview hidden"></div>' +
        '<div class="workflow-actions">' +
          '<button id="mm-execute" class="btn-execute">Execute Move</button>' +
        '</div>' +
      '</div>';

    const fromSel  = container.querySelector('#mm-from');
    const toSel    = container.querySelector('#mm-to');
    const amtInput = container.querySelector('#mm-amount');
    const fromBal  = container.querySelector('#mm-from-bal');
    const toBal    = container.querySelector('#mm-to-bal');
    const preview  = container.querySelector('#mm-preview');

    if (toSel.options.length > 1) toSel.selectedIndex = 1;

    function updatePreview() {
      const from = allAccounts.find(function(a) { return a.id === fromSel.value; });
      const to   = allAccounts.find(function(a) { return a.id === toSel.value;   });
      if (!from || !to) return;
      fromBal.textContent = 'Balance: ' + fmt(from.balance);
      toBal.textContent   = 'Balance: ' + fmt(to.balance);
      const amt = parseFloat(amtInput.value) || 0;
      if (amt <= 0 || fromSel.value === toSel.value) { preview.classList.add('hidden'); return; }
      const afterFrom = from.balance - amt;
      const afterTo   = to.balance   + amt;
      const danger    = afterFrom < 0;
      preview.classList.remove('hidden');
      preview.className = 'transfer-preview' + (danger ? ' danger' : '');
      preview.innerHTML =
        from.label + ': <strong>' + fmt(afterFrom) + '</strong>' + (danger ? ' ⚠ OVER' : '') + '<br>' +
        to.label   + ': <strong>' + fmt(afterTo)   + '</strong>';
    }

    fromSel.addEventListener('change', updatePreview);
    toSel.addEventListener('change',   updatePreview);
    amtInput.addEventListener('input',  updatePreview);
    updatePreview();

    container.querySelector('#mm-execute').addEventListener('click', function() {
      const fromId = fromSel.value;
      const toId   = toSel.value;
      const amt    = parseFloat(amtInput.value) || 0;
      const note   = container.querySelector('#mm-note').value.trim();
      if (fromId === toId) { App.showToast('From and To cannot be the same.', 'error'); return; }
      if (amt <= 0)        { App.showToast('Enter an amount greater than zero.', 'error'); return; }
      const s    = App.Storage.cloneState(App.getState());
      const from = findAccount(s, fromId);
      const to   = findAccount(s, toId);
      if (!from || !to) { App.showToast('Account not found.', 'error'); return; }
      if (from.balance < amt) { App.showToast('Insufficient balance in ' + from.name, 'error'); return; }
      from.balance = Math.round((from.balance - amt) * 100) / 100;
      to.balance   = Math.round((to.balance   + amt) * 100) / 100;
      if (!s.journal) s.journal = [];
      s.journal.push({
        id: App.Storage.generateId(), timestamp: new Date().toISOString(),
        type: 'transfer',
        description: note || ('Move ' + fmt(amt) + ': ' + from.name + ' → ' + to.name),
        movements: [{ account: fromId, change: -amt }, { account: toId, change: +amt }],
        relatedTxIds: [], canReverse: true
      });
      App.setState(s);
      App.showToast('Moved ' + fmt(amt) + ' from ' + from.name + ' to ' + to.name, 'success');
      _mode = 'movemoney';
      renderMoveMoney(App.getState(), container);
    });
  }

  // ═════════════════════════════════════════════════════════
  // WORKFLOW 4: Fund a Vault
  // ═════════════════════════════════════════════════════════
  function renderFundVault(state, container) {
    const bank   = (state.accounts && state.accounts.bank)   || [];
    const vaults = (state.accounts && state.accounts.vaults) || [];
    const cats   = state.yearlyCategories || [];

    const srcOptions = bank.map(function(a) {
      return '<option value="' + a.id + '">' + a.name + ' (' + fmt(a.balance) + ')</option>';
    }).join('') || '<option value="">No bank accounts</option>';

    const vaultOptions = vaults.map(function(v) {
      return '<option value="' + v.id + '">' + v.name + ' (' + fmt(v.balance) + ')</option>';
    }).join('') || '<option value="">No vaults configured</option>';

    container.innerHTML =
      '<div class="workflow-card">' +
        '<h3>🎯 Fund a Vault</h3>' +
        '<div class="form-group"><label class="form-label">From (Bank Account)</label>' +
          '<select id="fv-from" class="form-control">' + srcOptions + '</select>' +
          '<span id="fv-from-bal" class="field-hint"></span></div>' +
        '<div class="form-group"><label class="form-label">Vault</label>' +
          '<select id="fv-vault" class="form-control">' + vaultOptions + '</select></div>' +
        '<div id="fv-info" class="vault-info-card hidden"></div>' +
        '<div class="form-group"><label class="form-label">Amount</label>' +
          '<input id="fv-amount" type="number" class="form-control" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" /></div>' +
        '<div id="fv-preview" class="transfer-preview hidden"></div>' +
        '<div class="workflow-actions">' +
          '<button id="fv-execute" class="btn-execute">Fund Vault</button>' +
        '</div>' +
      '</div>';

    const fromSel   = container.querySelector('#fv-from');
    const vaultSel  = container.querySelector('#fv-vault');
    const amtInput  = container.querySelector('#fv-amount');
    const fromBalEl = container.querySelector('#fv-from-bal');
    const vaultInfo = container.querySelector('#fv-info');
    const preview   = container.querySelector('#fv-preview');

    function updateVaultInfo() {
      const vault = vaults.find(function(v) { return v.id === vaultSel.value; });
      if (!vault) { vaultInfo.classList.add('hidden'); return; }
      const cat = cats.find(function(c) { return c.name.toLowerCase() === vault.name.toLowerCase(); });
      const perPaycheck = cat ? (cat.annualGoal / 26) : null;
      vaultInfo.classList.remove('hidden');
      vaultInfo.innerHTML =
        '<span class="vi-label">Current:</span> <strong>' + fmt(vault.balance) + '</strong>' +
        (cat
          ? '&nbsp;&nbsp;<span class="vi-label">Annual goal:</span> <strong>' + fmt(cat.annualGoal) +
            '</strong>&nbsp;&nbsp;<span class="vi-label">Per paycheck:</span> <strong>' + fmt(perPaycheck) + '</strong>'
          : '');
      if (perPaycheck && !amtInput.value) {
        amtInput.value = perPaycheck.toFixed(2);
        updatePreview();
      }
    }

    function updatePreview() {
      const from  = bank.find(function(a)   { return a.id === fromSel.value;  });
      const vault = vaults.find(function(v) { return v.id === vaultSel.value; });
      if (!from || !vault) return;
      fromBalEl.textContent = 'Balance: ' + fmt(from.balance);
      const amt = parseFloat(amtInput.value) || 0;
      if (amt <= 0) { preview.classList.add('hidden'); return; }
      const afterFrom  = from.balance  - amt;
      const afterVault = vault.balance + amt;
      const danger     = afterFrom < 0;
      preview.classList.remove('hidden');
      preview.className = 'transfer-preview' + (danger ? ' danger' : '');
      preview.innerHTML =
        from.name  + ': <strong>' + fmt(afterFrom)  + '</strong>' + (danger ? ' ⚠ INSUFFICIENT' : '') + '<br>' +
        vault.name + ': <strong>' + fmt(afterVault)  + '</strong>';
    }

    vaultSel.addEventListener('change', function() { updateVaultInfo(); updatePreview(); });
    fromSel.addEventListener('change',  updatePreview);
    amtInput.addEventListener('input',  updatePreview);
    updateVaultInfo();

    container.querySelector('#fv-execute').addEventListener('click', function() {
      const fromId  = fromSel.value;
      const vaultId = vaultSel.value;
      const amt     = parseFloat(amtInput.value) || 0;
      if (amt <= 0) { App.showToast('Enter an amount.', 'error'); return; }
      const s     = App.Storage.cloneState(App.getState());
      const from  = (s.accounts.bank   || []).find(function(a) { return a.id === fromId;  });
      const vault = (s.accounts.vaults || []).find(function(v) { return v.id === vaultId; });
      if (!from || !vault) { App.showToast('Account not found.', 'error'); return; }
      if (from.balance < amt) { App.showToast('Insufficient balance in ' + from.name, 'error'); return; }
      from.balance  = Math.round((from.balance  - amt) * 100) / 100;
      vault.balance = Math.round((vault.balance + amt) * 100) / 100;
      if (!s.journal) s.journal = [];
      s.journal.push({
        id: App.Storage.generateId(), timestamp: new Date().toISOString(),
        type: 'transfer',
        description: 'Funded vault: ' + vault.name + ' +' + fmt(amt),
        movements: [{ account: fromId, change: -amt }, { account: vaultId, change: +amt }],
        relatedTxIds: [], canReverse: true
      });
      App.setState(s);
      App.showToast('Funded ' + vault.name + ' with ' + fmt(amt), 'success');
      _mode = 'fundvault';
      renderFundVault(App.getState(), container);
      showAdvanceFundingBanner(App.getState(), container);
    });
  }

  // ═════════════════════════════════════════════════════════
  // WORKFLOW 5: Withdraw / Spend Cash
  // ═════════════════════════════════════════════════════════
  function renderWithdraw(state, container) {
    const allAccounts = getAllAccounts(state);
    const cats        = state.yearlyCategories || [];
    const fixedCats   = state.fixedMonthlyExpenses || [];
    const today       = App.Storage.toISODate(new Date());

    const catOptions =
      '<option value="">-- category (optional) --</option>' +
      cats.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('') +
      '<optgroup label="Fixed Expenses">' +
      fixedCats.map(function(f) { return '<option value="fx_' + f.id + '">' + f.name + '</option>'; }).join('') +
      '</optgroup>';

    container.innerHTML =
      '<div class="workflow-card">' +
        '<h3>📤 Withdraw / Spend Cash</h3>' +
        '<div class="form-group"><label class="form-label">Pull From</label>' +
          '<select id="wd-from" class="form-control">' + buildAccountOptions(allAccounts) + '</select>' +
          '<span id="wd-from-bal" class="field-hint"></span></div>' +
        '<div class="form-group"><label class="form-label">Amount</label>' +
          '<input id="wd-amount" type="number" class="form-control" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" /></div>' +
        '<div class="form-group"><label class="form-label">Category</label>' +
          '<select id="wd-category" class="form-control">' + catOptions + '</select></div>' +
        '<div class="form-group"><label class="form-label">Date</label>' +
          '<input id="wd-date" type="date" class="form-control" value="' + today + '" /></div>' +
        '<div class="form-group"><label class="form-label">Note (optional)</label>' +
          '<input id="wd-note" type="text" class="form-control" placeholder="What was this for?" /></div>' +
        '<div id="wd-preview" class="transfer-preview hidden"></div>' +
        '<div class="workflow-actions">' +
          '<button id="wd-execute" class="btn-execute">Record Withdrawal</button>' +
        '</div>' +
      '</div>';

    const fromSel   = container.querySelector('#wd-from');
    const amtInput  = container.querySelector('#wd-amount');
    const fromBalEl = container.querySelector('#wd-from-bal');
    const preview   = container.querySelector('#wd-preview');

    function updatePreview() {
      const from = allAccounts.find(function(a) { return a.id === fromSel.value; });
      if (!from) return;
      fromBalEl.textContent = 'Balance: ' + fmt(from.balance);
      const amt = parseFloat(amtInput.value) || 0;
      if (amt <= 0) { preview.classList.add('hidden'); return; }
      const after  = from.balance - amt;
      const danger = after < 0;
      preview.classList.remove('hidden');
      preview.className = 'transfer-preview' + (danger ? ' danger' : '');
      preview.innerHTML = from.label + ' after: <strong>' + fmt(after) + '</strong>' + (danger ? ' ⚠ OVER' : '');
    }

    fromSel.addEventListener('change', updatePreview);
    amtInput.addEventListener('input',  updatePreview);
    updatePreview();

    container.querySelector('#wd-execute').addEventListener('click', function() {
      const fromId = fromSel.value;
      const amt    = parseFloat(amtInput.value) || 0;
      const catId  = container.querySelector('#wd-category').value;
      const date   = container.querySelector('#wd-date').value;
      const note   = container.querySelector('#wd-note').value.trim();
      if (amt <= 0) { App.showToast('Enter an amount.', 'error'); return; }
      const s    = App.Storage.cloneState(App.getState());
      const from = findAccount(s, fromId);
      if (!from) { App.showToast('Account not found.', 'error'); return; }
      if (from.balance < amt) { App.showToast('Insufficient balance in ' + from.name, 'error'); return; }
      from.balance = Math.round((from.balance - amt) * 100) / 100;
      if (!s.transactions) s.transactions = [];
      if (!s.journal)      s.journal      = [];
      const txId = App.Storage.generateId();
      s.transactions.unshift({
        id: txId, date: date || today,
        category: catId, amount: amt,
        account: fromId, note: note || 'Withdrawal'
      });
      s.journal.push({
        id: App.Storage.generateId(), timestamp: new Date().toISOString(),
        type: 'withdrawal',
        description: 'Withdrawal ' + fmt(amt) + ' from ' + from.name + (note ? ' — ' + note : ''),
        movements: [{ account: fromId, change: -amt }],
        relatedTxIds: [txId], canReverse: true
      });
      App.setState(s);
      App.showToast('Recorded withdrawal of ' + fmt(amt) + ' from ' + from.name, 'success');
      _mode = 'withdraw';
      renderWithdraw(App.getState(), container);
    });
  }

  // ═════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ═════════════════════════════════════════════════════════

  // Flatten bank accounts + vaults into one list for dropdowns
  function getAllAccounts(state) {
    const bank   = (state.accounts && state.accounts.bank)   || [];
    const vaults = (state.accounts && state.accounts.vaults) || [];
    return bank.map(function(a) {
      return { id: a.id, label: a.name, balance: a.balance, type: 'bank' };
    }).concat(vaults.map(function(v) {
      return { id: v.id, label: v.name + ' (vault)', balance: v.balance, type: 'vault' };
    }));
  }

  // Build <option> string from account list
  function buildAccountOptions(accounts) {
    return accounts.map(function(a) {
      return '<option value="' + a.id + '">' + a.label + ' (' + fmt(a.balance) + ')</option>';
    }).join('');
  }

  // Find a bank account or vault by id in a mutable state clone
  function findAccount(s, id) {
    const bank   = (s.accounts && s.accounts.bank)   || [];
    const vaults = (s.accounts && s.accounts.vaults) || [];
    return bank.find(function(a)   { return a.id === id; }) ||
           vaults.find(function(v) { return v.id === id; });
  }

  // Return upcoming payday dates as { key, label } for the period dropdown
  function getUpcomingPeriods(state) {
    const paydayDates = (state.income && state.income.paydayDates) || [];
    const today = new Date(); today.setHours(0,0,0,0);
    let relevant = paydayDates.filter(function(d) {
      const dt   = new Date(d + 'T12:00:00');
      const diff = (dt - today) / 86400000;
      return diff >= -14 && diff <= 60;
    });
    if (relevant.length === 0) relevant = paydayDates.slice(0, 5);
    return relevant.map(function(d) {
      const idx = paydayDates.indexOf(d);
      return { key: buildPeriodKey(state, d), label: 'Period ' + (idx + 1) + ' — ' + d };
    });
  }

  function buildPeriodKey(state, dateStr) {
    const d   = new Date(dateStr + 'T12:00:00');
    const yr  = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, '0');
    const pay = (state.income && state.income.paydayDates) || [];
    const pfx = yr + '-' + mo;
    const inM = pay.filter(function(p) { return p.startsWith(pfx); });
    const ck  = inM.indexOf(dateStr) + 1 || 1;
    return yr + '-' + mo + '-' + ck;
  }

  // ── Public API ────────────────────────────────────────────
  App.Transfers = { render: render };

})(window.App = window.App || {});
