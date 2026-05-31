/* ══════════════════════════════════════════════════════════════
   NEXT-YEAR-PLANNER.JS — Paycheck-by-Paycheck Plan for 2027
   Pre-loads from current year categories as starting point.
   Add, edit, remove line items freely.
   Same layout as Planner but for the next fiscal year.
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  var t = function (k) { return App.Lang ? App.Lang.t(k) : k; };

  var NEXT_YEAR = 2027;

  // ── Helpers ───────────────────────────────────────────────
  function getPlan(state) {
    var plan = state.nextYearPlan;
    if (!plan || !plan.categories || plan.categories.length === 0) {
      plan = buildDefaultPlan(state);
    }
    return plan;
  }

  function buildDefaultPlan(state) {
    var cats = (state.yearlyCategories || []).map(function (c) {
      var perCheck = 0;
      if (c.weeklyBudget) {
        perCheck = parseFloat(c.weeklyBudget) * 2;
      } else if (c.annualGoal) {
        perCheck = parseFloat(c.annualGoal) / 26;
      }
      return { id: c.id, name: c.name, amount: Math.round(perCheck * 100) / 100, color: c.color || '' };
    });
    var fixed = (state.fixedMonthlyExpenses || []).map(function (e) {
      var perCheck = parseFloat(e.amount) / 2;
      return { id: e.id, name: e.name + ' (fixed)', amount: Math.round(perCheck * 100) / 100, color: '' };
    });
    return { year: NEXT_YEAR, categories: cats.concat(fixed), customItems: {} };
  }

  function fmt(n) {
    return '$' + (parseFloat(n) || 0).toFixed(2);
  }

  // ── Render ────────────────────────────────────────────────
  function render(state, container) {
    var plan       = getPlan(state);
    var cats       = plan.categories || [];
    var baseAmount = (state.income && state.income.defaultPaycheckAmount) || 3000;
    var paydates   = App.Storage.calculatePaydayDates(
      state.income && state.income.paydayDates && state.income.paydayDates[0],
      state.income && state.income.frequency,
      NEXT_YEAR
    ) || [];

    var allocated = cats.reduce(function (s, c) { return s + (parseFloat(c.amount) || 0); }, 0);
    var surplus   = baseAmount - allocated;

    var html = '';

    // Header
    html += '<div class="section-card" style="margin-bottom:12px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
    html += '<h2 class="section-title" style="margin:0">&#128203; ' + t('nyp.title') + ' ' + NEXT_YEAR + '</h2>';
    html += '<div style="display:flex;gap:8px">';
    html += '<button class="btn btn--ghost btn--sm" data-action="nyp-reset" style="font-size:0.75rem">' + t('nyp.resetFromCurrent') + '</button>';
    html += '</div></div>';

    // Paycheck amount input
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">';
    html += '<span style="font-size:0.85rem">' + t('nyp.paycheckAmt') + '</span>';
    html += '<input type="number" id="nyp-base-amt" class="input" min="0" step="50" value="' + baseAmount + '" style="width:100px;padding:4px 8px">';
    html += '</div>';

    // Summary bar
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:4px">';
    html += '<span style="background:var(--surface-2);border-radius:6px;padding:5px 10px;font-size:0.8rem">';
    html += '&#128181; ' + t('nyp.allocated') + ': <strong>' + fmt(allocated) + '</strong></span>';
    html += '<span style="background:var(--surface-2);border-radius:6px;padding:5px 10px;font-size:0.8rem;color:' + (surplus >= 0 ? 'var(--neon-cyan)' : 'var(--neon-pink)') + '">';
    html += '&#9878; ' + t('nyp.surplus') + ': <strong>' + (surplus >= 0 ? '+' : '') + fmt(surplus) + '</strong></span>';
    html += '<span style="background:var(--surface-2);border-radius:6px;padding:5px 10px;font-size:0.8rem">';
    html += '&#128197; ' + t('nyp.paychecks') + ': <strong>' + paydates.length + '</strong></span>';
    html += '</div>';

    html += '</div>';

    // Line items table
    html += '<div class="section-card">';
    html += '<h3 style="font-size:0.9rem;margin-bottom:10px;color:var(--text-secondary)">' + t('nyp.lineItems') + '</h3>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.85rem">';
    html += '<thead><tr style="border-bottom:1px solid var(--border)">';
    html += '<th style="text-align:left;padding:5px 8px">' + t('nyp.category') + '</th>';
    html += '<th style="text-align:right;padding:5px 8px">' + t('nyp.perCheck') + '</th>';
    html += '<th style="text-align:right;padding:5px 8px">' + t('nyp.annual') + '</th>';
    html += '<th style="padding:5px 8px;width:36px"></th>';
    html += '</tr></thead><tbody>';

    cats.forEach(function (cat, ci) {
      var amt = parseFloat(cat.amount) || 0;
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">';
      html += '<td style="padding:4px 8px">';
      if (cat.color) html += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + cat.color + ';margin-right:6px"></span>';
      html += cat.name;
      html += '</td>';
      html += '<td style="padding:2px 8px;text-align:right">';
      html += '<input type="number" class="nyp-cat-amt" data-cat-idx="' + ci + '" ';
      html += 'value="' + amt + '" step="0.01" min="0" ';
      html += 'style="width:84px;text-align:right;background:transparent;border:1px solid transparent;';
      html += 'border-radius:4px;padding:3px 5px;color:inherit;font-size:0.85rem">';
      html += '</td>';
      html += '<td style="padding:4px 8px;text-align:right;color:var(--text-secondary);font-size:0.8rem">$' + (amt * 26).toFixed(0) + '</td>';
      html += '<td style="padding:4px 8px;text-align:center">';
      html += '<button class="btn btn--ghost" style="font-size:0.7rem;padding:0 4px;color:var(--text-secondary);opacity:0.6" data-action="nyp-del-cat" data-cat-idx="' + ci + '">&#10005;</button>';
      html += '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';

    // Add row
    html += '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">';
    html += '<input id="nyp-new-name" class="input" type="text" placeholder="' + t('nyp.newLineName') + '" style="flex:1;min-width:120px">';
    html += '<input id="nyp-new-amt" class="input" type="number" placeholder="$ / check" step="0.01" min="0" style="width:96px">';
    html += '<button class="btn btn--primary btn--sm" data-action="nyp-add-cat">+ ' + t('add') + '</button>';
    html += '</div>';

    // Annual summary
    if (paydates.length > 0) {
      html += '<div style="margin-top:16px;padding:10px 12px;background:rgba(0,240,255,0.04);border:1px solid rgba(0,240,255,0.15);border-radius:8px;font-size:0.82rem">';
      html += '<strong>' + NEXT_YEAR + ' ' + t('nyp.annualSummary') + '</strong><br>';
      html += '<span class="text-secondary">' + t('nyp.paychecks') + ': ' + paydates.length + ' &nbsp;|&nbsp; ';
      html += t('nyp.totalIncome') + ': $' + (baseAmount * paydates.length).toLocaleString() + ' &nbsp;|&nbsp; ';
      html += t('nyp.totalAllocated') + ': $' + (allocated * paydates.length).toLocaleString() + ' &nbsp;|&nbsp; ';
      html += t('nyp.totalSurplus') + ': <span style="color:' + (surplus >= 0 ? 'var(--neon-cyan)' : 'var(--neon-pink)') + '">$' + (surplus * paydates.length).toLocaleString() + '</span>';
      html += '</span></div>';
    }

    html += '</div>';

    container.innerHTML = html;
    wireEvents(container, state, cats, plan);
  }

  // ── Wire Events ───────────────────────────────────────────
  function wireEvents(container, state, cats, plan) {
    // Paycheck amount
    var baseInp = document.getElementById('nyp-base-amt');
    if (baseInp) {
      baseInp.addEventListener('blur', function () {
        var val = parseFloat(baseInp.value) || 3000;
        var s   = App.Storage.cloneState(App.getState());
        s.income = s.income || {};
        s.income.defaultPaycheckAmount = val;
        App.setState(s);
        render(App.getState(), container);
      });
    }

    // Category amount inputs
    container.querySelectorAll('.nyp-cat-amt').forEach(function (inp) {
      inp.addEventListener('focus', function () { inp.style.border = '1px solid var(--neon-cyan)'; });
      inp.addEventListener('blur', function () {
        inp.style.border = '1px solid transparent';
        var ci  = parseInt(inp.dataset.catIdx, 10);
        var val = parseFloat(inp.value) || 0;
        var s   = App.Storage.cloneState(App.getState());
        var p   = s.nextYearPlan || buildDefaultPlan(s);
        p.categories[ci].amount = val;
        s.nextYearPlan = p;
        App.setState(s);
        render(App.getState(), container);
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var next = container.querySelector('.nyp-cat-amt[data-cat-idx="' + (parseInt(inp.dataset.catIdx, 10) + 1) + '"]');
          if (next) next.focus(); else inp.blur();
        }
      });
    });

    // Add line item
    var addBtn = container.querySelector('[data-action="nyp-add-cat"]');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var name = (document.getElementById('nyp-new-name').value || '').trim();
        var amt  = parseFloat(document.getElementById('nyp-new-amt').value) || 0;
        if (!name) { App.showToast(App.Lang.t('nyp.nameRequired'), 'error'); return; }
        var s = App.Storage.cloneState(App.getState());
        var p = s.nextYearPlan || buildDefaultPlan(s);
        p.categories.push({ id: 'nyp-' + Date.now(), name: name, amount: amt, color: '' });
        s.nextYearPlan = p;
        App.setState(s);
        render(App.getState(), container);
      });
    }

    // Delete line item
    container.querySelectorAll('[data-action="nyp-del-cat"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ci = parseInt(btn.dataset.catIdx, 10);
        var s  = App.Storage.cloneState(App.getState());
        var p  = s.nextYearPlan || buildDefaultPlan(s);
        p.categories.splice(ci, 1);
        s.nextYearPlan = p;
        App.setState(s);
        render(App.getState(), container);
      });
    });

    // Reset from current year
    var resetBtn = container.querySelector('[data-action="nyp-reset"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        var s      = App.Storage.cloneState(App.getState());
        s.nextYearPlan = buildDefaultPlan(s);
        App.setState(s);
        render(App.getState(), container);
        App.showToast(App.Lang.t('nyp.resetDone'), 'success');
      });
    }
  }

  App.NextYearPlanner = { render: render };

})(window.App = window.App || {});
