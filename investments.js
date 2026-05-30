/* ══════════════════════════════════════════════════════════════
   INVESTMENTS.JS — Holdings + Roth Contribution Tracker
   Tab 6: View/edit investment accounts.
   CRITICAL: Add/edit/delete holdings by unique ID — no other
   holding is affected by changes to a single one.
   Manual price entry only (no live API).
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  var t = function(k) { return App.Lang ? App.Lang.t(k) : k; };

  const fmt = (n) => App.Storage.formatCurrency(n);

  // Which account tab is active (module-level)
  let _activeAccountIdx = 0;

  // ── Entry point ───────────────────────────────────────────
  function render(state, container) {
    container.innerHTML = buildHtml(state);
    wireEvents(container, state);
  }

  // ── HTML ──────────────────────────────────────────────────
  function buildHtml(state) {
    const inv      = state.investments || { accounts: [] };
    const accounts = inv.accounts || [];

    if (!accounts.length) {
      return `<div class="stub-container">
        <div class="stub-icon">📈</div>
        <h2>No Investment Accounts</h2>
        <p>Investment accounts are pre-configured with your Roth IRA holdings. If you see this, re-load the app.</p>
      </div>`;
    }

    // Clamp active index
    if (_activeAccountIdx >= accounts.length) _activeAccountIdx = 0;
    const acct = accounts[_activeAccountIdx];

    // Account selector tabs
    const acctTabs = accounts.map((a, i) => `
      <button class="tab-btn ${i === _activeAccountIdx ? 'active' : ''}"
              data-action="switch-account" data-idx="${i}"
              style="font-size:0.75rem;min-width:auto;padding:0 14px">
        ${esc(a.name)}
      </button>`).join('');

    return `
      <!-- Portfolio summary (all accounts) -->
      ${renderPortfolioSummary(accounts)}

      <!-- Contribution progress (all accounts) -->
      ${renderContributions(accounts)}

      <!-- Account selector -->
      <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--card-radius);display:flex;overflow-x:auto;margin-bottom:16px;scrollbar-width:none">
        ${acctTabs}
        <button class="tab-btn" data-action="add-account"
                style="font-size:0.75rem;min-width:auto;padding:0 14px;color:var(--neon-cyan)">
          + Account
        </button>
      </div>

      <!-- Selected account -->
      ${renderAccount(acct)}
    `;
  }


  // ── Portfolio summary across all accounts ─────────────────
  function renderPortfolioSummary(accounts) {
    const totalValue  = accounts.reduce((s, a) => {
      return s + (a.holdings || []).reduce((hs, h) => hs + round2((h.shares||0)*(h.price||0)), 0);
    }, 0);
    const totalGoal   = accounts.reduce((s, a) => s + (Number(a.annualGoal) || 0), 0);
    const totalContrib = accounts.reduce((s, a) => s + (Number(a.ytdContribution) || 0), 0);
    const remaining   = Math.max(0, totalGoal - totalContrib);

    const acctRows = accounts.map(a => {
      const val = (a.holdings || []).reduce((s, h) => s + round2((h.shares||0)*(h.price||0)), 0);
      const pct = totalValue > 0 ? (val / totalValue * 100).toFixed(1) : '0.0';
      return `<div class="flex-between" style="padding:5px 0;border-bottom:1px solid var(--border)">
        <span class="text-sm">${esc(a.name)}</span>
        <div style="text-align:right">
          <span class="font-mono text-cyan text-sm">${fmt(val)}</span>
          <span class="text-xs text-secondary" style="margin-left:6px">${pct}%</span>
        </div>
      </div>`;
    }).join('');

    return `
      <div class="card" style="margin-bottom:4px">
        <div class="flex-between mb-8">
          <div class="card-title">📊 Portfolio Total</div>
          <div class="font-mono font-heavy text-cyan" style="font-size:1.2rem">${fmt(totalValue)}</div>
        </div>
        ${acctRows}
        <div class="flex-between mt-8" style="padding-top:8px;border-top:1px solid var(--border)">
          <span class="text-xs text-secondary">2026 IRA remaining</span>
          <span class="font-mono text-sm text-amber">${fmt(remaining)}</span>
        </div>
      </div>`;
  }

  // ── Contribution progress ─────────────────────────────────
  function renderContributions(accounts) {
    const items = accounts.map(a => {
      const pct   = a.annualGoal > 0 ? Math.min(100, (a.ytdContribution / a.annualGoal) * 100) : 0;
      const color = pct >= 100 ? 'green' : pct >= 50 ? 'cyan' : 'amber';
      return `
        <div style="margin-bottom:12px">
          <div class="flex-between mb-4">
            <span class="text-sm font-bold">${esc(a.name)}</span>
            <span class="font-mono text-sm">
              <span class="text-${color}">${fmt(a.ytdContribution)}</span>
              <span class="text-secondary"> / ${fmt(a.annualGoal)}</span>
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar__fill--${color}" style="width:${pct.toFixed(1)}%"></div>
          </div>
          <div class="flex-between mt-4">
            <span class="text-xs text-secondary">${pct.toFixed(0)}% of annual goal</span>
            <span class="text-xs text-secondary">Remaining: ${fmt(Math.max(0, a.annualGoal - a.ytdContribution))}</span>
          </div>
        </div>`;
    }).join('');

    const totalContrib = accounts.reduce((s, a) => s + (Number(a.ytdContribution) || 0), 0);
    const totalGoal    = accounts.reduce((s, a) => s + (Number(a.annualGoal) || 0), 0);

    return `
      <details class="card card--glow-magenta" open>
        <summary>
          <div>
            <div class="card-title">💰 Contributions YTD</div>
            <div class="card-subtitle">${fmt(totalContrib)} of ${fmt(totalGoal)} combined</div>
          </div>
        </summary>
        <div>${items}</div>
      </details>`;
  }

  // ── Single account view ───────────────────────────────────
  function renderAccount(acct) {
    const holdings = acct.holdings || [];

    // Calculate values
    const holdingsWithCalc = holdings.map(h => ({
      ...h,
      value:      round2((h.shares || 0) * (h.price || 0)),
      actualPct:  0  // filled below
    }));
    const totalValue = holdingsWithCalc.reduce((s, h) => s + h.value, 0);
    holdingsWithCalc.forEach(h => {
      h.actualPct = totalValue > 0 ? round2((h.value / totalValue) * 100) : 0;
    });

    const rows = holdingsWithCalc.map(h => {
      const drift      = round2(h.actualPct - (h.targetPct || 0));
      const driftClass = Math.abs(drift) < 2 ? 'text-green'
                       : Math.abs(drift) < 5 ? 'text-amber'
                       : 'text-red';
      return `
        <tr>
          <td class="font-bold font-mono">${esc(h.ticker)}</td>
          <td class="text-right font-mono">${(h.shares || 0).toFixed(4)}</td>
          <td class="text-right">
            <input type="number" class="price-input" data-id="${h.id}"
                   value="${h.price || 0}" min="0" step="0.01" inputmode="decimal" style="width:80px;padding:4px 8px;min-height:32px;text-align:right" />
          </td>
          <td class="text-right font-mono text-cyan">${fmt(h.value)}</td>
          <td class="text-right">${(h.targetPct || 0).toFixed(0)}%</td>
          <td class="text-right font-mono ${driftClass}">
            ${h.actualPct.toFixed(1)}%
            <span class="text-xs">(${drift >= 0 ? '+' : ''}${drift.toFixed(1)})</span>
          </td>
          <td>
            <div style="display:flex;gap:4px">
              <button class="btn btn--secondary btn--sm btn--icon" data-action="edit-holding"
                      data-acct-idx="${_activeAccountIdx}" data-id="${h.id}" title="Edit">✎</button>
              <button class="btn btn--danger btn--sm btn--icon"    data-action="del-holding"
                      data-acct-idx="${_activeAccountIdx}" data-id="${h.id}" title="Delete">✕</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card">
        <div class="flex-between mb-12">
          <div>
            <div class="card-title">${esc(acct.name)}</div>
            <div class="card-subtitle">${holdings.length} holdings · ${fmt(totalValue)} total</div>
          </div>
          <button class="btn btn--secondary btn--sm" data-action="edit-contribution"
                  data-acct-idx="${_activeAccountIdx}">
            + Contribution
          </button>
        </div>

        ${holdings.length ? `
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th style="text-align:right">Shares</th>
                  <th style="text-align:right">Price</th>
                  <th style="text-align:right">Value</th>
                  <th style="text-align:right">Target%</th>
                  <th style="text-align:right">Actual%</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr>
                  <td colspan="3" class="font-bold text-secondary text-xs">TOTAL</td>
                  <td class="font-mono font-bold text-cyan text-right">${fmt(totalValue)}</td>
                  <td class="font-mono text-right text-secondary">
                    ${holdingsWithCalc.reduce((s,h) => s + (h.targetPct||0), 0).toFixed(0)}%
                  </td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <button class="btn btn--secondary btn--sm mt-12" data-action="update-prices"
                  data-acct-idx="${_activeAccountIdx}">
            Save Prices
          </button>
        ` : '<p class="text-secondary text-sm">No holdings yet. Add one below.</p>'}

        <button class="btn btn--primary btn--sm mt-12" data-action="add-holding"
                data-acct-idx="${_activeAccountIdx}">
          + Add Holding
        </button>

        ${totalValue > 0 ? renderRebalance(holdingsWithCalc, totalValue) : ''}

        ${renderContribLog(acct)}
      </div>`;
  }


  // ── Rebalance calculator ──────────────────────────────────
  // Shows how much $ to buy/sell per holding to reach target %.
  function renderRebalance(holdings, totalValue) {
    const hasTargets = holdings.some(h => (h.targetPct || 0) > 0);
    if (!hasTargets) return '';

    const rows = holdings.map(h => {
      const targetVal  = round2(totalValue * (h.targetPct || 0) / 100);
      const diff       = round2(targetVal - h.value);
      const diffClass  = diff > 50 ? 'text-green' : diff < -50 ? 'text-red' : 'text-secondary';
      const action     = diff > 50 ? '▲ Buy' : diff < -50 ? '▼ Sell' : '✓ Hold';
      const actionCls  = diff > 50 ? 'text-green' : diff < -50 ? 'text-red' : 'text-dim';
      return `<tr>
        <td class="font-mono font-bold">${esc(h.ticker)}</td>
        <td class="text-right text-dim">${(h.targetPct||0).toFixed(0)}%</td>
        <td class="text-right font-mono text-dim">${fmt(targetVal)}</td>
        <td class="text-right font-mono">${fmt(h.value)}</td>
        <td class="text-right font-mono font-bold ${diffClass}">${diff >= 0 ? '+' : ''}${fmt(diff)}</td>
        <td class="text-center text-sm ${actionCls}">${action}</td>
      </tr>`;
    }).join('');

    return `
      <details style="margin-top:16px">
        <summary style="cursor:pointer;padding:8px 0;font-size:0.85rem;font-weight:700;color:var(--text-dim);list-style:none;-webkit-appearance:none">
          ⚖ Rebalance Calculator ▾
        </summary>
        <div style="overflow-x:auto;margin-top:8px">
          <table class="data-table">
            <thead><tr>
              <th>Ticker</th>
              <th style="text-align:right">Target%</th>
              <th style="text-align:right">Target $</th>
              <th style="text-align:right">Current $</th>
              <th style="text-align:right">+/− $</th>
              <th style="text-align:center">Action</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="text-xs text-secondary" style="margin-top:6px">±$50 tolerance shown as Hold.</p>
        </div>
      </details>`;
  }

  // ── Contribution log ──────────────────────────────────────
  function renderContribLog(acct) {
    const log = (acct.contributionLog || []).slice().reverse(); // newest first
    if (!log.length) {
      return `<details style="margin-top:16px">
        <summary style="cursor:pointer;padding:8px 0;font-size:0.85rem;font-weight:700;color:var(--text-dim);list-style:none;-webkit-appearance:none">
          📋 Contribution Log ▾
        </summary>
        <p class="text-secondary text-sm" style="margin-top:8px">No contributions logged yet. Use "+ Contribution" to record one.</p>
      </details>`;
    }

    // Running total (oldest first for calc, then reverse for display)
    const oldest = (acct.contributionLog || []).slice();
    let running = 0;
    const withRunning = oldest.map(entry => {
      running += entry.amount;
      return { ...entry, running };
    }).reverse(); // newest first for display

    const limit = acct.annualGoal || 7000;
    const rows  = withRunning.map(e => {
      const remaining = Math.max(0, limit - e.running);
      return `<tr>
        <td class="text-xs text-secondary">${e.date}</td>
        <td class="font-mono text-right text-green text-sm">+${fmt(e.amount)}</td>
        <td class="font-mono text-right text-sm">${fmt(e.running)}</td>
        <td class="font-mono text-right text-sm ${remaining === 0 ? 'text-green' : 'text-amber'}">${fmt(remaining)}</td>
      </tr>`;
    }).join('');

    return `
      <details style="margin-top:16px">
        <summary style="cursor:pointer;padding:8px 0;font-size:0.85rem;font-weight:700;color:var(--text-dim);list-style:none;-webkit-appearance:none">
          📋 Contribution Log (${log.length}) ▾
        </summary>
        <div style="overflow-x:auto;margin-top:8px">
          <table class="data-table">
            <thead><tr>
              <th>Date</th>
              <th style="text-align:right">Amount</th>
              <th style="text-align:right">Running Total</th>
              <th style="text-align:right">Remaining</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>`;
  }

  // ── Modal helpers ─────────────────────────────────────────
  function openModal(html, onSubmit) {
    const bd = document.getElementById('modal-backdrop');
    const mc = document.getElementById('modal-content');
    mc.innerHTML = html;
    bd.classList.remove('hidden');
    bd.setAttribute('aria-hidden', 'false');
    mc.querySelector('[data-action="modal-close"]')?.addEventListener('click', closeModal);
    mc.querySelector('[data-action="modal-submit"]')?.addEventListener('click', () => onSubmit(mc));
    bd.addEventListener('click', function h(e) { if (e.target === bd) { closeModal(); bd.removeEventListener('click', h); } });
    const fi = mc.querySelector('input');
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
      const { action, acctIdx, id } = btn.dataset;
      const aIdx = parseInt(acctIdx ?? _activeAccountIdx, 10);

      switch (action) {

        case 'switch-account':
          _activeAccountIdx = parseInt(btn.dataset.idx, 10);
          App.refreshCurrentTab();
          break;

        case 'add-holding':
          openHoldingModal(null, aIdx);
          break;

        case 'edit-holding': {
          const ns = App.getState();
          const h  = ns.investments.accounts[aIdx]?.holdings.find(x => x.id === id);
          if (h) openHoldingModal(h, aIdx);
          break;
        }

        case 'del-holding': {
          if (!confirm('Delete this holding?')) break;
          const ns = App.getState();
          const a  = ns.investments.accounts[aIdx];
          if (a) a.holdings = a.holdings.filter(h => h.id !== id);
          App.setState(ns);
          App.refreshCurrentTab();
          App.showToast('Holding deleted.', 'info');
          break;
        }

        case 'update-prices': {
          // Read all price inputs for current account and save
          const ns    = App.getState();
          const acct  = ns.investments.accounts[aIdx];
          if (!acct) break;
          container.querySelectorAll('.price-input').forEach(inp => {
            const hId  = inp.dataset.id;
            const hidx = acct.holdings.findIndex(h => h.id === hId);
            if (hidx !== -1) acct.holdings[hidx].price = parseFloat(inp.value) || 0;
          });
          App.setState(ns);
          App.showToast('Prices saved ✓', 'success');
          App.refreshCurrentTab();
          break;
        }

        case 'edit-contribution':
          openContribModal(aIdx);
          break;

        case 'add-account':
          openAddAccountModal();
          break;
      }
    });
  }

  function openHoldingModal(existing, acctIdx) {
    const isNew = !existing;
    openModal(`
      <div class="modal-header">
        <div class="modal-title">${isNew ? 'Add' : 'Edit'} Holding</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Ticker</label>
          <input type="text" id="m-ticker" enterkeyhint="next" autocapitalize="characters" autocorrect="off" value="${existing ? esc(existing.ticker) : ''}" placeholder="VOO" style="text-transform:uppercase" />
        </div>
        <div class="form-group">
          <label>Shares</label>
          <input type="number" id="m-shares" value="${existing ? existing.shares : 0}" min="0" step="0.0001" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Current Price ($)</label>
          <input type="number" id="m-price" value="${existing ? existing.price : 0}" min="0" step="0.01" inputmode="decimal" />
        </div>
        <div class="form-group">
          <label>Target % <span class="text-dim">(of account)</span></label>
          <input type="number" id="m-target" value="${existing ? existing.targetPct : 0}" min="0" max="100" step="1" inputmode="numeric" />
        </div>
      </div>
      <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">
        ${isNew ? 'Add Holding' : 'Save Changes'}
      </button>
    `, mc => {
      const ticker  = mc.querySelector('#m-ticker').value.trim().toUpperCase();
      const shares  = parseFloat(mc.querySelector('#m-shares').value) || 0;
      const price   = parseFloat(mc.querySelector('#m-price').value)  || 0;
      const target  = parseFloat(mc.querySelector('#m-target').value) || 0;
      if (!ticker) { App.showToast('Ticker required.', 'error'); return; }

      const ns   = App.getState();
      const acct = ns.investments.accounts[acctIdx];
      if (!acct) { App.showToast('Account not found.', 'error'); return; }

      if (isNew) {
        acct.holdings.push({ id: App.Storage.generateId(), ticker, shares, price, targetPct: target });
      } else {
        const idx = acct.holdings.findIndex(h => h.id === existing.id);
        if (idx !== -1) Object.assign(acct.holdings[idx], { ticker, shares, price, targetPct: target });
      }
      App.setState(ns);
      closeModal();
      App.refreshCurrentTab();
      App.showToast(`${ticker} ${isNew ? 'added' : 'updated'} ✓`, 'success');
    });
  }

  function openContribModal(acctIdx) {
    const acct = App.getState().investments.accounts[acctIdx];
    if (!acct) return;
    openModal(`
      <div class="modal-header">
        <div class="modal-title">Contribution — ${esc(acct.name)}</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      <p class="text-secondary text-sm mb-12">
        YTD contributions: <strong>${fmt(acct.ytdContribution)}</strong> of ${fmt(acct.annualGoal)}
      </p>
      <div class="form-row">
        <div class="form-group">
          <label>Add Contribution ($)</label>
          <input type="number" id="m-contrib" value="0" min="0" step="0.01" inputmode="decimal" />
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="m-contrib-date" value="" />
        </div>
      </div>
      <div class="form-group">
        <label>Override YTD Total ($) <span class="text-dim">(optional)</span></label>
        <input type="number" id="m-ytd" placeholder="${acct.ytdContribution}" min="0" step="0.01" inputmode="decimal" />
      </div>
      <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Save</button>
    `, mc => {
      const add      = parseFloat(mc.querySelector('#m-contrib').value) || 0;
      const date     = mc.querySelector('#m-contrib-date').value || App.Storage.toISODate(new Date());
      const override = mc.querySelector('#m-ytd').value.trim();
      const ns       = App.getState();
      const a        = ns.investments.accounts[acctIdx];
      if (!a) return;
      if (!a.contributionLog) a.contributionLog = [];
      if (override !== '') {
        a.ytdContribution = parseFloat(override) || 0;
      } else if (add > 0) {
        a.ytdContribution = (a.ytdContribution || 0) + add;
        a.contributionLog.push({ date, amount: add, id: App.Storage.generateId() });
      }
      App.setState(ns);
      closeModal();
      App.refreshCurrentTab();
      App.showToast('Contribution saved ✓', 'success');
    });
  }

  function openAddAccountModal() {
    openModal(`
      <div class="modal-header">
        <div class="modal-title">Add Investment Account</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      <div class="form-group">
        <label>Account Name</label>
        <input type="text" id="m-acct-name" enterkeyhint="next" placeholder="e.g. Taxable Brokerage" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Annual Contribution Goal ($)</label>
          <input type="number" id="m-acct-goal" value="0" min="0" step="1" inputmode="numeric" />
        </div>
        <div class="form-group">
          <label>YTD Contributions ($)</label>
          <input type="number" id="m-acct-ytd" value="0" min="0" step="0.01" inputmode="decimal" />
        </div>
      </div>
      <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Add Account</button>
    `, mc => {
      const name = mc.querySelector('#m-acct-name').value.trim();
      const goal = parseFloat(mc.querySelector('#m-acct-goal').value) || 0;
      const ytd  = parseFloat(mc.querySelector('#m-acct-ytd').value)  || 0;
      if (!name) { App.showToast('Account name required.', 'error'); return; }
      const ns = App.getState();
      if (!ns.investments)          ns.investments = { accounts: [] };
      if (!ns.investments.accounts) ns.investments.accounts = [];
      ns.investments.accounts.push({ id: App.Storage.generateId(), name, holdings: [], ytdContribution: ytd, annualGoal: goal });
      _activeAccountIdx = ns.investments.accounts.length - 1;
      App.setState(ns);
      closeModal();
      App.refreshCurrentTab();
      App.showToast(`"${name}" added ✓`, 'success');
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  function round2(n)  { return Math.round(n * 100) / 100; }
  function esc(s)     { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  App.Investments = { render };

})(window.App = window.App || {});
