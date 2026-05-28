/* ══════════════════════════════════════════════════════════════
   PAYCHECKS.JS — Paycheck Planner + Forecast
   Tab 2: Shows paycheck cards for the selected month.
   Each card pulls allocations from yearly goals + fixed expenses.
   Handles 4 vs 5 paycheck months automatically.
   User can lock per-category amounts for a specific month.
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  const fmt = (n) => App.Storage.formatCurrency(n);

  // Which month the user is currently viewing (module-level, survives re-renders)
  let _year  = new Date().getFullYear();
  let _month = new Date().getMonth() + 1; // 1-indexed

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

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
      <!-- Month navigator -->
      <div class="flex-between mb-16">
        <button class="btn btn--secondary btn--sm" data-action="prev-month">‹</button>
        <div style="text-align:center">
          <div class="card-title" style="font-size:1.1rem">${MONTH_NAMES[_month - 1]} ${_year}</div>
          <div class="text-secondary text-xs mt-4">
            ${count} paycheck${count !== 1 ? 's' : ''} this month
            ${override ? '<span class="badge badge--amber" style="margin-left:6px">overridden</span>' : ''}
          </div>
        </div>
        <button class="btn btn--secondary btn--sm" data-action="next-month">›</button>
      </div>

      ${cards}
      ${renderMonthTotals(plan, count)}
    `;
  }

  // ── Get or build plan ─────────────────────────────────────
  // Loads saved plan for the month, or builds defaults from Setup config.
  // When loaded, merges any new categories added since the plan was saved.
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

  // Build a single default paycheck: yearly categories + fixed expenses for this check slot
  function buildDefaultCheck(state, checkNum, paydates) {
    const ppy = state.income.paychecksPerYear || 26;

    const categories = (state.yearlyCategories || []).map(cat => ({
      categoryId: cat.id,
      name:       cat.name,
      amount:     round2(cat.annualGoal / ppy),
      locked:     false
    }));

    // Fixed expenses belong to whichever paycheck they're assigned to
    const fixed = (state.fixedMonthlyExpenses || [])
      .filter(fx => (fx.paycheckAssign || 1) === checkNum)
      .map(fx => ({
        fixedId: fx.id,
        name:    fx.name,
        amount:  fx.amount
      }));

    return {
      amount:      state.income.defaultPaycheckAmount || 0,
      categories,
      fixed,
      customItems: []
    };
  }

  // When loading a saved plan, append any categories added to Setup after the plan was saved
  function mergeMissingCategories(state, savedPlan, count) {
    const ppy = state.income.paychecksPerYear || 26;
    for (let i = 1; i <= count; i++) {
      if (!savedPlan[i]) {
        savedPlan[i] = buildDefaultCheck(state, i, []);
        continue;
      }
      if (!savedPlan[i].categories) savedPlan[i].categories = [];
      (state.yearlyCategories || []).forEach(cat => {
        const exists = savedPlan[i].categories.some(c => c.categoryId === cat.id);
        if (!exists) {
          savedPlan[i].categories.push({
            categoryId: cat.id,
            name:       cat.name,
            amount:     round2(cat.annualGoal / ppy),
            locked:     false
          });
        }
      });
    }
    return savedPlan;
  }

  // ── Paycheck card ─────────────────────────────────────────
  function renderCard(state, plan, num, paydate, key, totalCount) {
    const check    = plan[num] || buildDefaultCheck(state, num, []);
    const cats     = check.categories  || [];
    const fixed    = check.fixed       || [];
    const custom   = check.customItems || [];
    const allocated = sumExpenses(check);
    const surplus   = (check.amount || 0) - allocated;
    const sc        = surplus >= 0 ? 'green' : 'red';
    const sl        = surplus >= 0 ? 'Surplus' : 'Deficit';

    const catRows = cats.map((c, idx) => `
      <tr>
        <td class="text-sm">${esc(c.name)}</td>
        <td>
          <input type="number" class="inline-amt"
                 data-check="${num}" data-idx="${idx}" data-field="cat-amount"
                 value="${c.amount.toFixed(2)}" min="0" step="0.01"
                 style="width:90px;padding:4px 8px;min-height:32px" />
        </td>
        <td style="text-align:center">
          <input type="checkbox" class="lock-chk"
                 data-check="${num}" data-idx="${idx}"
                 ${c.locked ? 'checked' : ''}
                 title="${c.locked ? 'Locked for this month' : 'Click to lock'}" />
        </td>
      </tr>`).join('');

    const fixedRows = fixed.map(f => `
      <tr>
        <td class="text-sm">${esc(f.name)} <span class="badge badge--cyan" style="font-size:0.58rem">fixed</span></td>
        <td class="font-mono text-sm">${fmt(f.amount)}</td>
        <td style="text-align:center;color:var(--text-dim)">🔒</td>
      </tr>`).join('');

    const customRows = custom.map((item, idx) => `
      <tr>
        <td class="text-sm">${esc(item.name)} <span class="badge badge--magenta" style="font-size:0.58rem">custom</span></td>
        <td class="font-mono text-sm">${fmt(item.amount)}</td>
        <td style="text-align:center">
          <button class="btn btn--danger btn--sm" style="min-height:28px;padding:0 8px"
                  data-action="del-custom" data-check="${num}" data-idx="${idx}">✕</button>
        </td>
      </tr>`).join('');

    const datelabel = paydate ? `<span class="text-secondary text-xs"> · ${paydate}</span>` : '';

    return `
      <details class="card card--glow-cyan" open data-check-card="${num}">
        <summary>
          <div>
            <div class="card-title">Paycheck ${num} of ${totalCount}${datelabel}</div>
            <div class="flex-gap-8 mt-4">
              <span class="font-mono text-cyan text-sm">${fmt(check.amount)}</span>
              <span class="text-dim">·</span>
              <span class="text-${sc} text-sm font-bold">${sl}: ${fmt(Math.abs(surplus))}</span>
            </div>
          </div>
        </summary>

        <div>
          <div class="form-group">
            <label>Paycheck Amount ($)</label>
            <input type="number" class="check-amount" data-check="${num}"
                   value="${check.amount}" min="0" step="0.01" />
          </div>

          <table class="data-table" style="margin:10px 0 4px">
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount</th>
                <th style="width:44px;text-align:center" title="Lock amount for this month">Lock</th>
              </tr>
            </thead>
            <tbody>
              ${catRows}
              ${fixedRows}
              ${customRows}
            </tbody>
            <tfoot>
              <tr style="border-top:1px solid var(--border)">
                <td class="text-xs text-secondary font-bold">ALLOCATED</td>
                <td class="font-mono font-bold">${fmt(allocated)}</td>
                <td></td>
              </tr>
              <tr>
                <td class="text-xs text-${sc} font-bold">${sl.toUpperCase()}</td>
                <td class="font-mono font-bold text-${sc}">${fmt(Math.abs(surplus))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          <!-- Custom item add row -->
          <div style="display:flex;gap:8px;align-items:flex-end;margin-top:12px">
            <div style="flex:1">
              <label class="text-xs text-secondary">Custom Item</label>
              <input type="text" class="custom-name" data-check="${num}" placeholder="Name" />
            </div>
            <div style="width:90px">
              <label class="text-xs text-secondary">Amount</label>
              <input type="number" class="custom-amt" data-check="${num}" placeholder="0" min="0" step="0.01" />
            </div>
            <button class="btn btn--secondary btn--sm" data-action="add-custom" data-check="${num}" data-key="${key}">+</button>
          </div>

          <button class="btn btn--primary btn--sm btn--full mt-12"
                  data-action="save-check" data-check="${num}" data-key="${key}">
            Save Paycheck ${num}
          </button>
        </div>
      </details>`;
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

    return `
      <div class="card" style="background:var(--bg-tertiary)">
        <div class="section-title">Monthly Totals</div>
        <div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)">
          <span class="text-secondary">Total Income</span>
          <span class="font-mono font-bold text-cyan">${fmt(income)}</span>
        </div>
        <div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)">
          <span class="text-secondary">Total Allocated</span>
          <span class="font-mono font-bold">${fmt(allocated)}</span>
        </div>
        <div class="flex-between" style="padding:8px 0">
          <span class="text-${nc} font-bold">${net >= 0 ? 'Net Surplus' : 'Net Deficit'}</span>
          <span class="font-mono font-bold text-${nc}">${fmt(Math.abs(net))}</span>
        </div>
      </div>`;
  }

  // ── Events ────────────────────────────────────────────────
  function wireEvents(container, state) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action } = btn.dataset;

      if (action === 'prev-month') {
        _month--;
        if (_month < 1) { _month = 12; _year--; }
        App.refreshCurrentTab();
        return;
      }
      if (action === 'next-month') {
        _month++;
        if (_month > 12) { _month = 1; _year++; }
        App.refreshCurrentTab();
        return;
      }
      if (action === 'save-check') {
        saveCheck(container, parseInt(btn.dataset.check, 10), btn.dataset.key);
        return;
      }
      if (action === 'add-custom') {
        addCustomItem(container, parseInt(btn.dataset.check, 10), btn.dataset.key);
        return;
      }
      if (action === 'del-custom') {
        deleteCustomItem(parseInt(btn.dataset.check, 10), parseInt(btn.dataset.idx, 10));
        return;
      }
    });
  }

  // Read all DOM inputs for a paycheck card and save to state
  function saveCheck(container, num, key) {
    const ns = App.getState();
    if (!ns.paychecks)     ns.paychecks = {};
    if (!ns.paychecks[key]) ns.paychecks[key] = {};

    // Get existing or default check
    const paydates = App.Storage.getPaydaysInMonth(ns.income.paydayDates || [], _year, _month);
    const count    = Object.keys(ns.paychecks[key]).length || paydates.length || 2;
    const existing = ns.paychecks[key][num] || buildDefaultCheck(ns, num, paydates);

    // Paycheck amount
    const amtEl   = container.querySelector(`.check-amount[data-check="${num}"]`);
    const amount  = amtEl ? (parseFloat(amtEl.value) || 0) : existing.amount;

    // Category allocations — read each inline input
    const categories = (existing.categories || []).map((cat, idx) => {
      const aEl = container.querySelector(`.inline-amt[data-check="${num}"][data-idx="${idx}"][data-field="cat-amount"]`);
      const lEl = container.querySelector(`.lock-chk[data-check="${num}"][data-idx="${idx}"]`);
      return {
        ...cat,
        amount: aEl ? (parseFloat(aEl.value) || 0) : cat.amount,
        locked: lEl ? lEl.checked : cat.locked
      };
    });

    ns.paychecks[key][num] = { ...existing, amount, categories };
    App.setState(ns);
    App.showToast(`Paycheck ${num} saved ✓`, 'success');
    App.refreshCurrentTab();
  }

  function addCustomItem(container, num, key) {
    const nameEl = container.querySelector(`.custom-name[data-check="${num}"]`);
    const amtEl  = container.querySelector(`.custom-amt[data-check="${num}"]`);
    const name   = nameEl ? nameEl.value.trim() : '';
    const amount = amtEl  ? (parseFloat(amtEl.value) || 0) : 0;
    if (!name) { App.showToast('Item name required.', 'error'); return; }

    const ns = App.getState();
    if (!ns.paychecks)      ns.paychecks = {};
    if (!ns.paychecks[key]) ns.paychecks[key] = {};
    const paydates = App.Storage.getPaydaysInMonth(ns.income.paydayDates || [], _year, _month);
    if (!ns.paychecks[key][num]) ns.paychecks[key][num] = buildDefaultCheck(ns, num, paydates);
    if (!ns.paychecks[key][num].customItems) ns.paychecks[key][num].customItems = [];
    ns.paychecks[key][num].customItems.push({ id: App.Storage.generateId(), name, amount });
    App.setState(ns);
    App.refreshCurrentTab();
    App.showToast(`"${name}" added ✓`, 'success');
  }

  function deleteCustomItem(checkNum, idx) {
    const ns  = App.getState();
    const key = mkKey(_year, _month);
    if (ns.paychecks?.[key]?.[checkNum]?.customItems) {
      ns.paychecks[key][checkNum].customItems.splice(idx, 1);
      App.setState(ns);
      App.refreshCurrentTab();
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  function sumExpenses(check) {
    const cats   = (check.categories  || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const fixed  = (check.fixed       || []).reduce((s, f) => s + (Number(f.amount) || 0), 0);
    const custom = (check.customItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
    return cats + fixed + custom;
  }

  function mkKey(y, m) { return `${y}-${String(m).padStart(2, '0')}`; }
  function round2(n)   { return Math.round(n * 100) / 100; }
  function esc(s)      { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  App.Paychecks = { render };

})(window.App = window.App || {});
