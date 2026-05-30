/* ══════════════════════════════════════════════════════════════
   PAYCHECKS.JS — Paycheck Planner + Forecast
   Phase 2 features:
   - Variable weekly budget: Food × Sundays, Gas × Saturdays
   - Goal countdown: target date → paychecks left → per-check amount
   - Upcoming Expenses panel: month/payee/amount/applied
   - Lock amounts per category per month
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  var t = function(k) { return App.Lang ? App.Lang.t(k) : k; };
  const fmt = (n) => App.Storage.formatCurrency(n);

  let _year  = new Date().getFullYear();
  let _month = new Date().getMonth() + 1;

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  // ── Day-of-week counter ───────────────────────────────────
  // Counts how many times a given day (0=Sun..6=Sat) falls in a month
  function countDayOfWeek(year, month, dayOfWeek) {
    let count = 0;
    const d = new Date(year, month - 1, 1);
    while (d.getMonth() === month - 1) {
      if (d.getDay() === dayOfWeek) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  // Weekly allocation for a category:
  // If weeklyBudget + weeklyDay are set → weeklyBudget × day count in month
  // Otherwise → annualGoal / paychecksPerYear
  function weeklyAlloc(cat, year, month, ppy) {
    if (cat.weeklyBudget && cat.weeklyDay) {
      const dow = cat.weeklyDay === 'sunday' ? 0 : 6; // sunday=0, saturday=6
      return round2(cat.weeklyBudget * countDayOfWeek(year, month, dow));
    }
    return round2((cat.annualGoal || 0) / (ppy || 26));
  }

  // Goal countdown: count payday dates from today through targetDate
  function paychecksToGoal(targetDateStr, paydayDates) {
    if (!targetDateStr) return null;
    const today  = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDateStr);
    target.setHours(23, 59, 59, 0);
    const future = (paydayDates || []).filter(function(d) {
      const pd = new Date(d);
      return pd >= today && pd <= target;
    });
    return future.length;
  }


  // Count paychecks from today (or paycheck date) through end of year
  function paychecksRemainingInYear(paydayDates, year) {
    var today = new Date(); today.setHours(0,0,0,0);
    var yearEnd = new Date(year, 11, 31);
    return (paydayDates || []).filter(function(d) {
      var pd = new Date(d);
      return pd >= today && pd <= yearEnd;
    }).length || 1; // never divide by zero
  }

  // Per-paycheck contribution needed to hit goal
  function perPaycheckForGoal(cat, vaultBalance, paychecksLeft) {
    if (!paychecksLeft || paychecksLeft <= 0) return null;
    const goal   = cat.targetAmount || cat.annualGoal || 0;
    const needed = Math.max(0, goal - (vaultBalance || 0));
    return round2(needed / paychecksLeft);
  }

  // ── Entry point ───────────────────────────────────────────
  function render(state, container) {
    container.innerHTML = buildHtml(state);
    wireEvents(container, state);
  }

  // ── HTML builder ──────────────────────────────────────────
  function buildHtml(state) {
    const key      = mkKey(_year, _month);
    const paydates = App.Storage.getPaydaysInMonth(state.income.paydayDates || [], _year, _month);
    const override = (state.monthOverrides || {})[key];
    const count    = override ? override.paycheckCount : (paydates.length || 2);
    const plan     = getOrBuildPlan(state, key, paydates, count);

    let cards = '';
    for (let i = 1; i <= count; i++) {
      cards += renderCard(state, plan, i, paydates[i - 1] || '', key, count);
    }

    return `
      <div class="flex-between mb-16">
        <button class="btn btn--secondary btn--sm" data-action="prev-month">&#8249;</button>
        <div style="text-align:center">
          <div class="card-title" style="font-size:1.1rem">${MONTH_NAMES[_month - 1]} ${_year}</div>
          <div class="text-secondary text-xs mt-4">
            ${count} paycheck${count !== 1 ? 's' : ''} this month
            ${override ? '<span class="badge badge--amber" style="margin-left:6px">overridden</span>' : ''}
          </div>
        </div>
        <button class="btn btn--secondary btn--sm" data-action="next-month">&#8250;</button>
      </div>

      ${renderWeeklyBudgetPanel(state)}
      ${cards}
      ${renderMonthTotals(plan, count)}
      ${renderUpcomingExpenses(state, key)}
    `;
  }

  // ── Weekly Budget Settings Panel ─────────────────────────
  // Shows categories with weeklyBudget set. User can adjust the weekly amount.
  function renderWeeklyBudgetPanel(state) {
    const cats = (state.yearlyCategories || []).filter(function(c) {
      return c.weeklyBudget !== null && c.weeklyBudget !== undefined;
    });
    if (!cats.length) return '';

    const rows = cats.map(function(cat) {
      const dow   = cat.weeklyDay === 'sunday' ? 0 : 6;
      const count = countDayOfWeek(_year, _month, dow);
      const total = round2(cat.weeklyBudget * count);
      const day   = cat.weeklyDay === 'sunday' ? 'Sundays' : 'Saturdays';
      return '<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<div>' +
          '<div class="text-sm font-bold">' + esc(cat.name) + '</div>' +
          '<div class="text-xs text-secondary">' + count + ' ' + day + ' this month &rarr; ' + fmt(total) + '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span class="text-xs text-secondary">$/wk</span>' +
          '<input type="number" class="weekly-budget-input" ' +
            'data-cat-id="' + cat.id + '" ' +
            'value="' + cat.weeklyBudget + '" ' +
            'min="0" step="1" inputmode="numeric" ' +
            'style="width:70px;padding:4px 8px" />' +
        '</div>' +
      '</div>';
    }).join('');

    return '<details class="card" style="margin-bottom:12px">' +
      '<summary>' +
        '<div>' +
          '<div class="card-title">&#128200; Weekly Budget Settings</div>' +
          '<div class="card-subtitle">Food &amp; Gas calculated from day counts</div>' +
        '</div>' +
      '</summary>' +
      '<div>' +
        rows +
        '<button class="btn btn--primary btn--sm btn--full mt-12" data-action="save-weekly-budgets">' +
          t('plan.saveWeekly') +
        '</button>' +
      '</div>' +
    '</details>';
  }

  // ── Upcoming Expenses Panel ───────────────────────────────
  function renderUpcomingExpenses(state, currentKey) {
    const expenses = (state.upcomingExpenses || []);
    const monthKey = mkKey(_year, _month);

    const rows = expenses.map(function(exp, idx) {
      const isCurrentMonth = exp.month === monthKey;
      return '<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:4px">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="text-sm font-bold">' + esc(exp.payee) + '</div>' +
          '<div class="text-xs text-secondary">' + exp.month + (exp.note ? ' &middot; ' + esc(exp.note) : '') + '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span class="font-mono text-sm text-cyan">' + fmt(exp.amount) + '</span>' +
          (isCurrentMonth
            ? '<label style="display:flex;align-items:center;gap:4px;font-size:0.75rem;cursor:pointer">' +
                '<input type="checkbox" data-action="toggle-upcoming-applied" data-idx="' + idx + '" ' +
                  (exp.applied ? 'checked' : '') + ' />' +
                'Apply</label>'
            : '') +
          '<button class="btn btn--icon btn--secondary" style="padding:1px 6px;font-size:0.7rem;color:var(--color-danger)"' +
            ' data-action="del-upcoming" data-idx="' + idx + '" title="Delete">&#10005;</button>' +
        '</div>' +
      '</div>';
    }).join('');

    const noRows = '<p class="text-xs text-secondary" style="margin:8px 0">No upcoming expenses. Add one below.</p>';

    return '<details class="card" style="margin-top:12px">' +
      '<summary>' +
        '<div>' +
          '<div class="card-title">&#128203; Upcoming Expenses</div>' +
          '<div class="card-subtitle">' + expenses.length + ' planned &middot; check &ldquo;Apply&rdquo; to pull into this month</div>' +
        '</div>' +
      '</summary>' +
      '<div>' +
        (rows || noRows) +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px">' +
          '<div class="form-group">' +
            '<label>Month (YYYY-MM)</label>' +
            '<input type="month" id="ue-month" value="' + mkKey(_year, _month) + '" />' +
          '</div>' +
          '<div class="form-group">' +
            '<label>Amount ($)</label>' +
            '<input type="number" id="ue-amount" placeholder="0.00" min="0" step="0.01" inputmode="decimal" />' +
          '</div>' +
        '</div>' +
        '<div class="form-group mt-8">' +
          '<label>Payee / Description</label>' +
          '<input type="text" id="ue-payee" placeholder="e.g. Amica Insurance, Rent increase..." />' +
        '</div>' +
        '<div class="form-group mt-8">' +
          '<label>Note (optional)</label>' +
          '<input type="text" id="ue-note" placeholder="e.g. Annual renewal, effective Jun 1..." />' +
        '</div>' +
        '<button class="btn btn--secondary btn--sm btn--full mt-8" data-action="add-upcoming">+ Add Expense</button>' +
      '</div>' +
    '</details>';
  }

  // ── Get or build plan ─────────────────────────────────────
  function getOrBuildPlan(state, key, paydates, count) {
    const saved = (state.paychecks || {})[key];
    if (saved) return mergeMissingCategories(state, saved, count);
    return buildDefaultPlan(state, paydates, count);
  }

  function buildDefaultPlan(state, paydates, count) {
    const plan = {};
    for (let i = 1; i <= count; i++) {
      plan[i] = buildDefaultCheck(state, i, paydates);
    }
    return plan;
  }

  // Build a single default paycheck with weekly-budget-aware allocations
  function buildDefaultCheck(state, checkNum, paydates) {
    const ppy = state.income.paychecksPerYear || 26;

    // P3 (bonus paycheck in a 5-week month) starts blank — user decides allocation
    const isBonus = checkNum >= 3;

    const categories = (state.yearlyCategories || []).map(function(cat) {
      // Bonus paycheck: all categories default to 0, user fills in freely
      if (isBonus) {
        return {
          categoryId:   cat.id,
          name:         cat.name,
          amount:       0,
          locked:       false,
          weeklyBudget: null,
          weeklyDay:    null,
          targetDate:   null
        };
      }
      // Dynamic allocation: (goal - vault balance) / paydays remaining
      // Uses target date countdown if set, otherwise remaining paychecks in year
      var vault = (state.accounts && state.accounts.vaults || []).find(function(v) {
        return v.name.toLowerCase() === cat.name.toLowerCase();
      });
      var vaultBal = vault ? (Number(vault.balance) || 0) : 0;

      var amount;
      if (cat.weeklyBudget && cat.weeklyDay) {
        // Weekly-budget categories keep their own logic
        amount = weeklyAlloc(cat, _year, _month, ppy);
      } else if (cat.targetDate) {
        // Target date set: count down to that date
        var paychecksLeft = paychecksToGoal(cat.targetDate, state.income.paydayDates);
        var cdAmount = perPaycheckForGoal(cat, vaultBal, paychecksLeft || 1);
        amount = cdAmount !== null ? cdAmount : weeklyAlloc(cat, _year, _month, ppy);
      } else {
        // No target: spread remaining gap across remaining paychecks in year
        var remaining = paychecksRemainingInYear(state.income.paydayDates, _year);
        var goal = cat.annualGoal || 0;
        var needed = Math.max(0, goal - vaultBal);
        amount = round2(needed / remaining);
      }
      return {
        categoryId:    cat.id,
        name:          cat.name,
        amount:        amount,
        locked:        false,
        weeklyBudget:  cat.weeklyBudget || null,
        weeklyDay:     cat.weeklyDay    || null,
        targetDate:    cat.targetDate   || null
      };
    });

    const fixed = (state.fixedMonthlyExpenses || [])
      .filter(function(fx) { return (fx.paycheckAssign || 1) === checkNum; })
      .map(function(fx) { return { fixedId: fx.id, name: fx.name, amount: fx.amount }; });

    // Pull applied upcoming expenses for this month into this check
    const monthKey   = mkKey(_year, _month);
    const appliedExp = (state.upcomingExpenses || [])
      .filter(function(e) { return e.applied && e.month === monthKey && (e.paycheckNum || 1) === checkNum; })
      .map(function(e) { return { id: e.id, name: e.payee, amount: e.amount }; });

    return {
      amount:      state.income.defaultPaycheckAmount || 0,
      categories,
      fixed,
      customItems: appliedExp
    };
  }

  function mergeMissingCategories(state, savedPlan, count) {
    const ppy = state.income.paychecksPerYear || 26;
    for (let i = 1; i <= count; i++) {
      if (!savedPlan[i]) { savedPlan[i] = buildDefaultCheck(state, i, []); continue; }
      if (!savedPlan[i].categories) savedPlan[i].categories = [];
      (state.yearlyCategories || []).forEach(function(cat) {
        const exists = savedPlan[i].categories.some(function(c) { return c.categoryId === cat.id; });
        if (!exists) {
          savedPlan[i].categories.push({
            categoryId: cat.id, name: cat.name,
            amount: weeklyAlloc(cat, _year, _month, ppy),
            locked: false
          });
        }
      });
    }
    return savedPlan;
  }

  // ── Paycheck card ─────────────────────────────────────────
  function renderCard(state, plan, num, paydate, key, totalCount) {
    const check     = plan[num] || buildDefaultCheck(state, num, []);
    const cats      = check.categories  || [];
    const fixed     = check.fixed       || [];
    const custom    = check.customItems || [];
    const allocated = sumExpenses(check);
    const surplus   = (check.amount || 0) - allocated;
    const sc        = surplus >= 0 ? 'green' : 'red';
    const sl        = surplus >= 0 ? 'Surplus' : 'Deficit';

    const paydayDates = state.income.paydayDates || [];

    const catRows = cats.map(function(c, idx) {
      const paychecksLeft = paychecksToGoal(c.targetDate, paydayDates);
      let goalLine = '';
      if (c.targetDate && paychecksLeft !== null) {
        const dateLabel = c.targetDate.substring(0, 10);
        goalLine = '<div class="text-xs" style="color:var(--neon-amber);margin-top:2px">' +
          '&#127919; ' + dateLabel + ' &middot; ' + paychecksLeft + ' paycheck' +
          (paychecksLeft !== 1 ? 's' : '') + ' left' +
          '</div>';
      }
      const weeklyNote = (c.weeklyBudget && c.weeklyDay)
        ? '<div class="text-xs text-secondary" style="margin-top:1px">$' + c.weeklyBudget + '/wk &times; ' +
            countDayOfWeek(_year, _month, c.weeklyDay === 'sunday' ? 0 : 6) +
            ' ' + (c.weeklyDay === 'sunday' ? 'Sundays' : 'Saturdays') + '</div>'
        : '';

      var ppy = (state.income && state.income.paychecksPerYear) || 26;
      var annualCost = round2(c.amount * ppy);
      return '<tr>' +
        '<td class="text-sm">' +
          '<div>' + esc(c.name) + '</div>' +
          weeklyNote +
          goalLine +
        '</td>' +
        '<td>' +
          '<input type="number" class="inline-amt" ' +
            'data-check="' + num + '" data-idx="' + idx + '" data-field="cat-amount" ' +
            'value="' + c.amount.toFixed(2) + '" min="0" step="0.01" inputmode="decimal" ' +
            'style="width:90px;padding:4px 8px;min-height:32px" />' +
          '<div class="text-xs text-dim" style="margin-top:2px;padding-left:2px">&times;' + ppy + '&nbsp;=&nbsp;' + fmt(annualCost) + '/yr</div>' +
        '</td>' +
        '<td style="text-align:center">' +
          '<input type="checkbox" class="lock-chk" ' +
            'data-check="' + num + '" data-idx="' + idx + '" ' +
            (c.locked ? 'checked' : '') + ' ' +
            'title="' + (c.locked ? 'Locked for this month' : 'Click to lock') + '" />' +
        '</td>' +
      '</tr>';
    }).join('');

    const fixedRows = fixed.map(function(f) {
      return '<tr>' +
        '<td class="text-sm">' + esc(f.name) + ' <span class="badge badge--cyan" style="font-size:0.58rem">fixed</span></td>' +
        '<td class="font-mono text-sm">' + fmt(f.amount) + '</td>' +
        '<td style="text-align:center;color:var(--text-dim)">&#128274;</td>' +
      '</tr>';
    }).join('');

    const customRows = custom.map(function(item, idx) {
      return '<tr>' +
        '<td class="text-sm">' + esc(item.name) + ' <span class="badge badge--magenta" style="font-size:0.58rem">custom</span></td>' +
        '<td class="font-mono text-sm">' + fmt(item.amount) + '</td>' +
        '<td style="text-align:center">' +
          '<button class="btn btn--danger btn--sm" style="min-height:28px;padding:0 8px" ' +
            'data-action="del-custom" data-check="' + num + '" data-idx="' + idx + '">&#10005;</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    const datelabel = paydate ? '<span class="text-secondary text-xs"> &middot; ' + paydate + '</span>' : '';
    const isBonus   = num >= 3;
    const bonusBadge = isBonus
      ? ' <span class="badge badge--amber" style="margin-left:6px;font-size:0.65rem;vertical-align:middle">&#127381; BONUS</span>'
      : '';
    const bonusNote = isBonus
      ? '<div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:0.82rem">' +
          '<strong style="color:var(--amber)">&#127381; 5-Week Bonus Paycheck</strong><br>' +
          '<span class="text-secondary">This is your extra check this month. No fixed expenses — ' +
          'allocate freely to savings, goals, or debt payoff. All categories start at $0.</span>' +
        '</div>'
      : '';

    return '<details class="card card--glow-cyan" open data-check-card="' + num + '">' +
      '<summary>' +
        '<div>' +
          '<div class="card-title">Paycheck ' + num + ' of ' + totalCount + bonusBadge + datelabel + '</div>' +
          '<div class="flex-gap-8 mt-4">' +
            '<span class="font-mono text-cyan text-sm">' + fmt(check.amount) + '</span>' +
            '<span class="text-dim">&middot;</span>' +
            '<span class="text-' + sc + ' text-sm font-bold">' + sl + ': ' + fmt(Math.abs(surplus)) + '</span>' +
          '</div>' +
        '</div>' +
      '</summary>' +
      '<div>' +
        bonusNote +
        '<div class="form-group">' +
          '<label>Paycheck Amount ($)</label>' +
          '<input type="number" class="check-amount" data-check="' + num + '" ' +
            'value="' + check.amount + '" min="0" step="0.01" inputmode="decimal" />' +
        '</div>' +
        '<table class="data-table" style="margin:10px 0 4px">' +
          '<thead><tr>' +
            '<th>Category</th>' +
            '<th>Amount</th>' +
            '<th style="width:44px;text-align:center" title="Lock amount for this month">Lock</th>' +
          '</tr></thead>' +
          '<tbody>' + catRows + fixedRows + customRows + '</tbody>' +
          '<tfoot>' +
            '<tr style="border-top:1px solid var(--border)">' +
              '<td class="text-xs text-secondary font-bold">ALLOCATED</td>' +
              '<td class="font-mono font-bold">' + fmt(allocated) + '</td>' +
              '<td></td>' +
            '</tr>' +
            '<tr>' +
              '<td class="text-xs text-' + sc + ' font-bold">' + sl.toUpperCase() + '</td>' +
              '<td class="font-mono font-bold text-' + sc + '">' + fmt(Math.abs(surplus)) + '</td>' +
              '<td></td>' +
            '</tr>' +
          '</tfoot>' +
        '</table>' +
        '<div style="display:flex;gap:8px;align-items:flex-end;margin-top:12px">' +
          '<div style="flex:1">' +
            '<label class="text-xs text-secondary">Custom Item</label>' +
            '<input type="text" class="custom-name" data-check="' + num + '" placeholder="Name" />' +
          '</div>' +
          '<div style="width:90px">' +
            '<label class="text-xs text-secondary">Amount</label>' +
            '<input type="number" class="custom-amt" data-check="' + num + '" placeholder="0" min="0" step="0.01" inputmode="decimal" />' +
          '</div>' +
          '<button class="btn btn--secondary btn--sm" data-action="add-custom" data-check="' + num + '" data-key="' + key + '">+</button>' +
        '</div>' +
        '<button class="btn btn--primary btn--sm btn--full mt-12" ' +
          'data-action="save-check" data-check="' + num + '" data-key="' + key + '">' +
          'Save Paycheck ' + num +
        '</button>' +
        buildDistributionSection(state, key, num, surplus) +
        buildNotesSection(state, key, num) +
      '</div>' +
    '</details>';
  }


  // ── SoFi Distribution Summary ────────────────────────────
  // Shows how the surplus gets routed via SoFi auto-distribution.
  // Transfer Account, Hold (subscriptions), American Eagle, Investing.
  // Hold auto-calculates from due subscriptions for this period.
  function buildDistributionSection(state, key, num, surplus) {
    const saved  = ((state.paychecks || {})[key] || {})[num] || {};
    const dist   = saved.distributions || {};

    // Auto-calculate Hold from subscriptions due this period
    const subs   = state.subscriptions || [];
    const subTotal = subs.filter(function(s) { return !s.paid && (s.addToPaycheck || false); })
                        .reduce(function(s, x) { return s + (Number(x.amount) || 0); }, 0);
    // Fall back to stored hold amount if no subscriptions queued
    const holdAmt    = subTotal > 0 ? round2(subTotal) : (dist.hold || 0);
    const transferAmt = dist.transferAccount || 0;
    const eagleAmt    = dist.americanEagle   || 0;
    const investAmt   = dist.investing       || 0;
    const totalDist   = round2(transferAmt + holdAmt + eagleAmt + investAmt);
    const netRemaining = round2(surplus - totalDist);
    const netClass     = netRemaining >= 0 ? 'text-green' : 'text-red';

    return '<div style="border-top:2px solid var(--border);margin-top:14px;padding-top:12px">' +
      '<div class="section-title" style="margin-bottom:8px;font-size:0.8rem">&#128260; SoFi Auto-Distribution</div>' +
      '<div class="text-xs text-secondary" style="margin-bottom:10px">Set these amounts in your SoFi vault rules so the distribution happens automatically when your paycheck arrives.</div>' +

      '<div style="display:grid;grid-template-columns:1fr auto;gap:6px 10px;align-items:center">' +

        // Transfer Account
        '<label class="text-sm">Transfer Account (CC buffer)</label>' +
        '<input type="number" class="dist-input" data-dist="transferAccount" data-check="' + num + '" data-key="' + key + '" ' +
          'value="' + transferAmt.toFixed(2) + '" min="0" step="0.01" inputmode="decimal" ' +
          'style="width:90px;padding:4px 8px;text-align:right" />' +

        // Hold (subscriptions) — auto-calculated
        '<div>' +
          '<div class="text-sm">Hold / Subscriptions</div>' +
          (subTotal > 0
            ? '<div class="text-xs text-cyan">Auto: ' + subs.filter(function(s) { return !s.paid && s.addToPaycheck; }).length + ' sub(s) queued</div>'
            : '<div class="text-xs text-secondary">No subs queued — enter manually</div>') +
        '</div>' +
        '<input type="number" class="dist-input" data-dist="hold" data-check="' + num + '" data-key="' + key + '" ' +
          'value="' + holdAmt.toFixed(2) + '" min="0" step="0.01" inputmode="decimal" ' +
          'style="width:90px;padding:4px 8px;text-align:right" />' +

        // American Eagle
        '<label class="text-sm">Transfer to American Eagle</label>' +
        '<input type="number" class="dist-input" data-dist="americanEagle" data-check="' + num + '" data-key="' + key + '" ' +
          'value="' + eagleAmt.toFixed(2) + '" min="0" step="0.01" inputmode="decimal" ' +
          'style="width:90px;padding:4px 8px;text-align:right" />' +

        // Investing
        '<label class="text-sm">Investing</label>' +
        '<input type="number" class="dist-input" data-dist="investing" data-check="' + num + '" data-key="' + key + '" ' +
          'value="' + investAmt.toFixed(2) + '" min="0" step="0.01" inputmode="decimal" ' +
          'style="width:90px;padding:4px 8px;text-align:right" />' +

      '</div>' +

      '<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:8px">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
          '<span class="text-xs text-secondary">Total distributed</span>' +
          '<span class="font-mono text-sm">&#8722; ' + fmt(totalDist) + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between">' +
          '<span class="text-sm font-bold ' + netClass + '">Net in checking</span>' +
          '<span class="font-mono font-bold text-sm ' + netClass + '">' + fmt(netRemaining) + '</span>' +
        '</div>' +
      '</div>' +

      '<button class="btn btn--secondary btn--sm btn--full mt-8" data-action="save-distributions" data-check="' + num + '" data-key="' + key + '">' +
        'Save Distribution Plan' +
      '</button>' +

      buildSurplusAllocator(state, key, num, surplus) +

    '</div>';
  }

  // ── Surplus Allocation by Percentage ─────────────────────
  // Mirrors the "Extra Pay" section in the Paycheck Planner sheet.
  // Lets you assign % of surplus to specific vaults (Car Savings, Emergency, etc.)
  function buildSurplusAllocator(state, key, num, surplus) {
    if (surplus <= 0) return '';
    var cats    = (state.yearlyCategories || []).filter(function(c) { return c.annualGoal > 0; });
    if (!cats.length) return '';
    var saved   = ((state.paychecks || {})[key] || {})[num] || {};
    var allocs  = saved.surplusAlloc || {};
    var totalPct = 0;

    var rows = cats.map(function(cat) {
      var pct    = Number(allocs[cat.id] || 0);
      totalPct  += pct;
      var dollar = round2(surplus * pct / 100);
      return (
        '<div style="display:grid;grid-template-columns:1fr 60px 70px;gap:6px;align-items:center;margin-bottom:4px">' +
          '<span class="text-sm">' + esc(cat.name) + '</span>' +
          '<input type="number" class="surplus-pct" min="0" max="100" step="1" inputmode="numeric" ' +
            'data-catid="' + cat.id + '" data-check="' + num + '" data-key="' + key + '" ' +
            'value="' + pct + '" style="padding:3px 6px;text-align:right;width:100%" />' +
          '<span class="font-mono text-xs text-cyan">' + (dollar > 0 ? fmt(dollar) : '—') + '</span>' +
        '</div>'
      );
    }).join('');

    var remaining = round2(surplus * (1 - totalPct / 100));
    var remClass  = remaining < 0 ? 'text-red' : 'text-green';

    return (
      '<div style="border-top:1px solid var(--border);margin-top:12px;padding-top:10px">' +
        '<div class="section-title" style="font-size:0.8rem;margin-bottom:4px">📊 Surplus Allocation</div>' +
        '<div class="text-xs text-secondary" style="margin-bottom:8px">' +
          'Surplus: <strong class="text-cyan">' + fmt(surplus) + '</strong> — assign % to vaults' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 60px 70px;gap:4px;margin-bottom:6px">' +
          '<span class="text-xs text-secondary font-bold">Category</span>' +
          '<span class="text-xs text-secondary font-bold" style="text-align:right">%</span>' +
          '<span class="text-xs text-secondary font-bold" style="text-align:right">Amount</span>' +
        '</div>' +
        rows +
        '<div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:6px;margin-top:6px">' +
          '<span class="text-xs text-secondary">Unallocated surplus</span>' +
          '<span class="font-mono text-xs ' + remClass + '">' + fmt(remaining) + '</span>' +
        '</div>' +
        '<button class="btn btn--secondary btn--sm btn--full mt-8" data-action="save-surplus-alloc" data-check="' + num + '" data-key="' + key + '">' +
          'Save Surplus Plan' +
        '</button>' +
      '</div>'
    );
  }

  // ── Paycheck notes section ───────────────────────────────
  function buildNotesSection(state, key, num) {
    var noteKey = key + '-' + num;
    var notes   = (state.paycheckNotes && state.paycheckNotes[noteKey]) || '';
    return '<div class="paycheck-notes-section">' +
      '<div class="paycheck-notes-label">Notes / Reminders</div>' +
      '<textarea class="paycheck-notes-input" ' +
        'data-action="save-paycheck-note" data-note-key="' + noteKey + '" ' +
        'placeholder="e.g. Rent due, car payment, upcoming expense...">' +
        esc(notes) +
      '</textarea>' +
    '</div>';
  }

  // ── Monthly totals card ───────────────────────────────────
  function renderMonthTotals(plan, count) {
    let income = 0, allocated = 0;
    for (let i = 1; i <= count; i++) {
      const c = plan[i] || {};
      income    += Number(c.amount) || 0;
      allocated += sumExpenses(c);
    }
    const net = income - allocated;
    const nc  = net >= 0 ? 'green' : 'red';

    return '<div class="card" style="background:var(--bg-tertiary)">' +
      '<div class="section-title">Monthly Totals</div>' +
      '<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<span class="text-secondary">Total Income</span>' +
        '<span class="font-mono font-bold text-cyan">' + fmt(income) + '</span>' +
      '</div>' +
      '<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<span class="text-secondary">Total Allocated</span>' +
        '<span class="font-mono font-bold">' + fmt(allocated) + '</span>' +
      '</div>' +
      '<div class="flex-between" style="padding:8px 0">' +
        '<span class="text-' + nc + ' font-bold">' + (net >= 0 ? 'Net Surplus' : 'Net Deficit') + '</span>' +
        '<span class="font-mono font-bold text-' + nc + '">' + fmt(Math.abs(net)) + '</span>' +
      '</div>' +
    '</div>';
  }

  // ── Events ────────────────────────────────────────────────
  function wireEvents(container, state) {
    container.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'prev-month') {
        _month--; if (_month < 1) { _month = 12; _year--; }
        App.refreshCurrentTab(); return;
      }
      if (action === 'next-month') {
        _month++; if (_month > 12) { _month = 1; _year++; }
        App.refreshCurrentTab(); return;
      }
      if (action === 'save-check') {
        saveCheck(container, parseInt(btn.dataset.check, 10), btn.dataset.key); return;
      }
      if (action === 'add-custom') {
        addCustomItem(container, parseInt(btn.dataset.check, 10), btn.dataset.key); return;
      }
      if (action === 'del-custom') {
        deleteCustomItem(parseInt(btn.dataset.check, 10), parseInt(btn.dataset.idx, 10)); return;
      }
      if (action === 'save-weekly-budgets') {
        saveWeeklyBudgets(container); return;
      }
      if (action === 'add-upcoming') {
        addUpcomingExpense(container); return;
      }
      if (action === 'toggle-upcoming-applied') {
        toggleUpcomingApplied(parseInt(btn.dataset.idx, 10), btn.checked); return;
      }
      if (action === 'del-upcoming') {
        deleteUpcoming(parseInt(btn.dataset.idx, 10)); return;
      }
      if (action === 'save-distributions') {
        saveDistributions(container, parseInt(btn.dataset.check, 10), btn.dataset.key); return;
      }
      if (action === 'save-surplus-alloc') {
        var checkNum = parseInt(btn.dataset.check, 10);
        var key      = btn.dataset.key;
        var inputs   = container.querySelectorAll('.surplus-pct[data-check="' + checkNum + '"]');
        var allocs   = {};
        inputs.forEach(function(inp) { allocs[inp.dataset.catid] = parseFloat(inp.value) || 0; });
        var ns = App.Storage.cloneState(App.getState());
        if (!ns.paychecks) ns.paychecks = {};
        if (!ns.paychecks[key]) ns.paychecks[key] = {};
        if (!ns.paychecks[key][checkNum]) ns.paychecks[key][checkNum] = {};
        ns.paychecks[key][checkNum].surplusAlloc = allocs;
        App.setState(ns);
        App.showToast('Surplus plan saved ✓', 'success');
        return;
      }
    });

    // Paycheck notes — auto-save on blur
    container.addEventListener('blur', function(e) {
      const ta = e.target.closest('[data-action="save-paycheck-note"]');
      if (!ta) return;
      const noteKey = ta.dataset.noteKey;
      const text    = ta.value.trim();
      const ns      = App.Storage.cloneState(App.getState());
      if (!ns.paycheckNotes) ns.paycheckNotes = {};
      if (text) {
        ns.paycheckNotes[noteKey] = text;
      } else {
        delete ns.paycheckNotes[noteKey];
      }
      App.setState(ns);
    }, true); // capture phase so blur bubbles up

    // Weekly budget inputs also need change handler for live preview
    container.addEventListener('change', function(e) {
      if (e.target.classList.contains('weekly-budget-input')) {
        // Live update just recalculates the display — full save on button click
      }
    });
  }

  // ── Action handlers ───────────────────────────────────────
  function saveCheck(container, num, key) {
    const ns = App.Storage.cloneState(App.getState());
    if (!ns.paychecks)      ns.paychecks = {};
    if (!ns.paychecks[key]) ns.paychecks[key] = {};

    const paydates = App.Storage.getPaydaysInMonth(ns.income.paydayDates || [], _year, _month);
    const existing = ns.paychecks[key][num] || buildDefaultCheck(ns, num, paydates);

    const amtEl  = container.querySelector('.check-amount[data-check="' + num + '"]');
    const amount = amtEl ? (parseFloat(amtEl.value) || 0) : existing.amount;

    const categories = (existing.categories || []).map(function(cat, idx) {
      const aEl = container.querySelector('.inline-amt[data-check="' + num + '"][data-idx="' + idx + '"][data-field="cat-amount"]');
      const lEl = container.querySelector('.lock-chk[data-check="' + num + '"][data-idx="' + idx + '"]');
      return Object.assign({}, cat, {
        amount: aEl ? (parseFloat(aEl.value) || 0) : cat.amount,
        locked: lEl ? lEl.checked : cat.locked
      });
    });

    ns.paychecks[key][num] = Object.assign({}, existing, { amount: amount, categories: categories });
    App.setState(ns);
    App.showToast('Paycheck ' + num + ' saved ✓', 'success');
    App.refreshCurrentTab();
  }


  function saveDistributions(container, num, key) {
    const ns = App.Storage.cloneState(App.getState());
    if (!ns.paychecks)      ns.paychecks = {};
    if (!ns.paychecks[key]) ns.paychecks[key] = {};

    const paydates = App.Storage.getPaydaysInMonth(ns.income.paydayDates || [], _year, _month);
    if (!ns.paychecks[key][num]) ns.paychecks[key][num] = buildDefaultCheck(ns, num, paydates);

    const dist = {};
    const card = container.querySelector('[data-check-card="' + num + '"]') || container;
    card.querySelectorAll('.dist-input').forEach(function(inp) {
      dist[inp.dataset.dist] = parseFloat(inp.value) || 0;
    });
    ns.paychecks[key][num].distributions = dist;
    App.setState(ns);
    App.showToast('Distribution plan saved ✓', 'success');
    App.refreshCurrentTab();
  }

  function addCustomItem(container, num, key) {
    const nameEl = container.querySelector('.custom-name[data-check="' + num + '"]');
    const amtEl  = container.querySelector('.custom-amt[data-check="' + num + '"]');
    const name   = nameEl ? nameEl.value.trim() : '';
    const amount = amtEl  ? (parseFloat(amtEl.value) || 0) : 0;
    if (!name) { App.showToast('Item name required.', 'error'); return; }

    const ns = App.Storage.cloneState(App.getState());
    if (!ns.paychecks)      ns.paychecks = {};
    if (!ns.paychecks[key]) ns.paychecks[key] = {};
    const paydates = App.Storage.getPaydaysInMonth(ns.income.paydayDates || [], _year, _month);
    if (!ns.paychecks[key][num]) ns.paychecks[key][num] = buildDefaultCheck(ns, num, paydates);
    if (!ns.paychecks[key][num].customItems) ns.paychecks[key][num].customItems = [];
    ns.paychecks[key][num].customItems.push({ id: App.Storage.generateId(), name: name, amount: amount });
    App.setState(ns);
    App.refreshCurrentTab();
    App.showToast('"' + name + '" added ✓', 'success');
  }

  function deleteCustomItem(checkNum, idx) {
    const ns  = App.Storage.cloneState(App.getState());
    const key = mkKey(_year, _month);
    if (ns.paychecks && ns.paychecks[key] && ns.paychecks[key][checkNum] &&
        ns.paychecks[key][checkNum].customItems) {
      ns.paychecks[key][checkNum].customItems.splice(idx, 1);
      App.setState(ns);
      App.refreshCurrentTab();
    }
  }

  function saveWeeklyBudgets(container) {
    const inputs = container.querySelectorAll('.weekly-budget-input');
    if (!inputs.length) return;
    const ns = App.Storage.cloneState(App.getState());
    inputs.forEach(function(inp) {
      const catId = inp.dataset.catId;
      const val   = parseFloat(inp.value);
      if (!catId || isNaN(val)) return;
      const idx = ns.yearlyCategories.findIndex(function(c) { return c.id === catId; });
      if (idx !== -1) ns.yearlyCategories[idx].weeklyBudget = val;
    });
    App.setState(ns);
    App.showToast('Weekly budgets saved ✓', 'success');
    App.refreshCurrentTab();
  }

  function addUpcomingExpense(container) {
    const monthEl = container.querySelector('#ue-month');
    const amtEl   = container.querySelector('#ue-amount');
    const payeeEl = container.querySelector('#ue-payee');
    const noteEl  = container.querySelector('#ue-note');
    const month   = monthEl  ? monthEl.value.trim()         : '';
    const amount  = amtEl    ? (parseFloat(amtEl.value) || 0) : 0;
    const payee   = payeeEl  ? payeeEl.value.trim()          : '';
    const note    = noteEl   ? noteEl.value.trim()           : '';
    if (!payee)  { App.showToast('Enter a payee/description', 'error'); return; }
    if (!month)  { App.showToast('Enter a month', 'error'); return; }
    if (!amount) { App.showToast('Enter an amount', 'error'); return; }

    const ns = App.Storage.cloneState(App.getState());
    if (!ns.upcomingExpenses) ns.upcomingExpenses = [];
    ns.upcomingExpenses.push({
      id: App.Storage.generateId(),
      month: month, payee: payee, amount: amount,
      note: note, applied: false, paycheckNum: 1
    });
    App.setState(ns);
    App.showToast('"' + payee + '" added ✓', 'success');
    App.refreshCurrentTab();
  }

  function toggleUpcomingApplied(idx, checked) {
    var ns = App.Storage.cloneState(App.getState());
    if (ns.upcomingExpenses && ns.upcomingExpenses[idx] !== undefined) {
      ns.upcomingExpenses[idx].applied = !!checked;
      App.setState(ns);
      App.refreshCurrentTab();
    }
  }

  function deleteUpcoming(idx) {
    var ns = App.Storage.cloneState(App.getState());
    if (ns.upcomingExpenses) {
      ns.upcomingExpenses.splice(idx, 1);
      App.setState(ns);
      App.showToast('Expense removed', 'success');
      App.refreshCurrentTab();
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  function sumExpenses(check) {
    var cats   = (check.categories  || []).reduce(function(s, c) { return s + (Number(c.amount) || 0); }, 0);
    var fixed  = (check.fixed       || []).reduce(function(s, f) { return s + (Number(f.amount) || 0); }, 0);
    var custom = (check.customItems || []).reduce(function(s, i) { return s + (Number(i.amount) || 0); }, 0);
    return cats + fixed + custom;
  }

  function mkKey(y, m)  { return y + '-' + String(m).padStart(2, '0'); }
  function round2(n)    { return Math.round(n * 100) / 100; }
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  App.Paychecks = { render };

})(window.App = window.App || {});
