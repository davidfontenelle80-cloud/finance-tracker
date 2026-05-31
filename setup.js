/* ══════════════════════════════════════════════════════════════
   SETUP.JS — The Brain
   Renders and manages the Setup tab. Everything else reads
   config from the state this tab produces.

   Sections:
     1. Personal Info
     2. Income Structure
     3. Month Structure (4 vs 5 paycheck auto-detection)
     4. Yearly Budget Categories (CRUD)
     5. Fixed Monthly Expenses (CRUD)
     6. Accounts — Bank, Vaults, Credit Cards (CRUD)
     7. App Settings (theme info, currency, import/export)

   Also exports renderSettings() for the Settings tab.
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  var t = function(k) { return App.Lang ? App.Lang.t(k) : k; };

  // Shorthand references (set after App.Storage is loaded)
  const S  = () => App.Storage;
  const fmt = (n) => S().formatCurrency(n);

  // ── Month names ───────────────────────────────────────────
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTH_FULL = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

  // ── Main render ───────────────────────────────────────────
  // Called by app.js router when Setup tab is shown.
  function render(state, container) {
    container.innerHTML = `
      <h1 class="section-title" style="margin-bottom:20px;font-size:0.75rem;">
        ⚙️ Setup — The Brain
      </h1>

      ${renderPersonalInfo(state)}
      ${renderIncomeStructure(state)}
      ${renderMonthStructure(state)}
      ${renderYearlyCategories(state)}
      ${renderFixedExpenses(state)}
      ${renderAccounts(state)}
    `;

    wireSetupEvents(container, state);
  }

  // ── Section 1: Personal Info ──────────────────────────────
  function renderPersonalInfo(state) {
    const u = state.user;
    return `
      <details class="card" open>
        <summary>
          <div>
            <div class="card-title">👤 Personal Info</div>
            <div class="card-subtitle">Your name and partner name</div>
          </div>
        </summary>
        <div>
          <div class="form-row">
            <div class="form-group">
              <label for="si-name">Your Name</label>
              <input type="text" id="si-name" value="${esc(u.name)}" placeholder="David" />
            </div>
            <div class="form-group">
              <label for="si-partner">Partner Name</label>
              <input type="text" id="si-partner" value="${esc(u.partnerName)}" placeholder="Yamel" />
            </div>
          </div>
          <button class="btn btn--primary btn--sm" data-action="save-personal">Save</button>
        </div>
      </details>
    `;
  }

  // ── Section 2: Income Structure ───────────────────────────
  function renderIncomeStructure(state) {
    const inc = state.income;
    const freqOptions = ['biweekly','weekly','semimonthly','monthly']
      .map(f => `<option value="${f}" ${inc.frequency === f ? 'selected' : ''}>${freqLabel(f)}</option>`)
      .join('');

    const paycheckCount = inc.paydayDates ? inc.paydayDates.length : 0;

    return `
      <details class="card">
        <summary>
          <div>
            <div class="card-title">💵 Income Structure</div>
            <div class="card-subtitle">${freqLabel(inc.frequency)} · ${paycheckCount} paychecks in ${new Date().getFullYear()}</div>
          </div>
        </summary>
        <div>
          <div class="form-row">
            <div class="form-group">
              <label for="si-freq">Pay Frequency</label>
              <select id="si-freq">${freqOptions}</select>
            </div>
            <div class="form-group">
              <label for="si-amount">Paycheck Amount ($)</label>
              <input type="number" id="si-amount" value="${inc.defaultPaycheckAmount}" min="0" step="0.01" inputmode="decimal" />
            </div>
          </div>
          <div class="form-group">
            <label for="si-firstpayday">First Payday of Year</label>
            <input type="date" id="si-firstpayday" value="${inc.firstPaydayOfYear}" />
          </div>
          <div class="stat-block" id="si-paycount-display">
            <div class="stat-block__label">Paychecks This Year</div>
            <div class="stat-block__value stat-block__value--cyan">${paycheckCount}</div>
          </div>

          <div class="divider"></div>

          <!-- Optional partner income -->
          <div class="toggle-row">
            <div>
              <div class="toggle-label">Partner Income</div>
              <div class="toggle-sub">Track ${esc(state.user.partnerName)}'s paychecks too</div>
            </div>
            <input type="checkbox" id="si-partner-enabled" ${inc.partnerEnabled ? 'checked' : ''} />
          </div>

          <div id="si-partner-fields" style="${inc.partnerEnabled ? '' : 'display:none'}">
            <div class="form-row mt-12">
              <div class="form-group">
                <label for="si-pfreq">Partner Frequency</label>
                <select id="si-pfreq">
                  ${['biweekly','weekly','semimonthly','monthly']
                    .map(f => `<option value="${f}" ${inc.partnerFrequency === f ? 'selected' : ''}>${freqLabel(f)}</option>`)
                    .join('')}
                </select>
              </div>
              <div class="form-group">
                <label for="si-pamount">Partner Amount ($)</label>
                <input type="number" id="si-pamount" value="${inc.partnerPaycheckAmount}" min="0" step="0.01" inputmode="decimal" />
              </div>
            </div>
            <div class="form-group">
              <label for="si-pfirstpayday">Partner First Payday</label>
              <input type="date" id="si-pfirstpayday" value="${inc.partnerFirstPayday}" />
            </div>
          </div>

          <button class="btn btn--primary btn--sm mt-12" data-action="save-income">Save Income</button>
        </div>
      </details>
    `;
  }

  // ── Section 3: Month Structure ────────────────────────────
  // Auto-detects 4 vs 5 paycheck months from payday dates.
  // User can override any month. Overrides are stored separately.
  function renderMonthStructure(state) {
    const year = new Date().getFullYear();
    const counts = S().getMonthPaycheckCounts(
      state.income.paydayDates,
      state.monthOverrides,
      year
    );

    const cells = counts.map(m => {
      const overrideClass = m.isOverride ? 'month-cell--override' : '';
      const countClass    = m.count === 3 ? 'month-cell__count--3' : 'month-cell__count--2';
      const tooltip       = m.isOverride
        ? `title="Overridden (auto: ${m.autoCount})"`
        : `title="Click to override"`;
      return `
        <div class="month-cell ${overrideClass}" data-action="override-month"
             data-month="${m.month}" data-year="${year}" ${tooltip}>
          <span class="month-cell__name">${MONTHS[m.month - 1]}</span>
          <span class="month-cell__count ${countClass}">${m.count}</span>
          ${m.isOverride ? '<span class="text-xs text-amber">override</span>' : ''}
        </div>
      `;
    }).join('');

    const threeCheckMonths = counts.filter(m => m.count === 3)
      .map(m => MONTH_FULL[m.month - 1]).join(', ') || 'None';

    return `
      <details class="card">
        <summary>
          <div>
            <div class="card-title">📅 Month Structure</div>
            <div class="card-subtitle">5-paycheck months: ${threeCheckMonths}</div>
          </div>
        </summary>
        <div>
          <p class="text-secondary text-sm mb-8">
            Counts are auto-calculated from your payday dates.
            Tap any month to override. Magenta = 3-paycheck month.
          </p>
          <div class="month-grid">${cells}</div>
          <p class="text-xs text-dim mt-8">Overridden months shown in amber. Override resets if you change your first payday.</p>
        </div>
      </details>
    `;
  }

  // ── Section 4: Yearly Budget Categories ──────────────────
  // User defines annual goal per category.
  // App divides by paychecks per year for per-paycheck amount.
  function renderYearlyCategories(state) {
    const cats = state.yearlyCategories || [];
    const ppy  = state.income.paychecksPerYear || 26;

    const rows = cats.map(c => {
      const perCheck = c.annualGoal / ppy;
      return `
        <tr data-cat-id="${c.id}">
          <td class="font-bold">${esc(c.name)}</td>
          <td class="text-right font-mono">${fmt(c.annualGoal)}</td>
          <td class="text-right font-mono text-cyan">${fmt(perCheck)}</td>
          <td class="text-right">
            <div class="flex-gap-8" style="justify-content:flex-end">
              <button class="btn btn--secondary btn--sm" data-action="edit-category" data-id="${c.id}">Edit</button>
              <button class="btn btn--danger btn--sm"    data-action="delete-category" data-id="${c.id}">✕</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const totalAnnual  = cats.reduce((s, c) => s + (Number(c.annualGoal) || 0), 0);
    const totalPerCheck = totalAnnual / ppy;

    return `
      <details class="card">
        <summary>
          <div>
            <div class="card-title">🎯 Yearly Budget Categories</div>
            <div class="card-subtitle">${cats.length} categories · ${fmt(totalAnnual)}/yr · ${fmt(totalPerCheck)}/check</div>
          </div>
        </summary>
        <div>
          <table class="data-table mb-8">
            <thead>
              <tr>
                <th>Category</th>
                <th class="text-right">Annual Goal</th>
                <th class="text-right">Per Check</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="cat-table-body">
              ${rows}
            </tbody>
            <tfoot>
              <tr>
                <td class="font-bold text-secondary text-xs">TOTAL</td>
                <td class="text-right font-bold text-cyan font-mono">${fmt(totalAnnual)}</td>
                <td class="text-right font-bold text-cyan font-mono">${fmt(totalPerCheck)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          <!-- Inline add form -->
          <div class="card" style="background:var(--bg-tertiary);margin-top:8px;">
            <div class="section-title">Add Category</div>
            <div class="form-row">
              <div class="form-group">
                <label for="cat-new-name">Category Name</label>
                <input type="text" id="cat-new-name" placeholder="e.g. Auto Insurance" enterkeyhint="next" />
              </div>
              <div class="form-group">
                <label for="cat-new-goal">Annual Goal ($)</label>
                <input type="number" id="cat-new-goal" placeholder="0.00" min="0" step="0.01" inputmode="decimal" />
              </div>
            </div>
            <div class="form-row" style="margin-top:4px">
              <div class="form-group">
                <label for="cat-new-weekly">$/week <span class="text-dim" style="font-size:0.75rem">(optional)</span></label>
                <input type="number" id="cat-new-weekly" placeholder="e.g. 200" min="0" step="1" inputmode="numeric" />
              </div>
              <div class="form-group">
                <label for="cat-new-weekday">Count by</label>
                <select id="cat-new-weekday">
                  <option value="">— None —</option>
                  <option value="saturday">Saturdays</option>
                  <option value="sunday">Sundays</option>
                </select>
              </div>
            </div>
            <button class="btn btn--primary btn--sm" data-action="add-category">+ Add Category</button>
          </div>
        </div>
      </details>
    `;
  }

  // ── Section 5: Fixed Monthly Expenses ────────────────────
  // Recurring bills that hit every month no matter what.
  function renderFixedExpenses(state) {
    const items = state.fixedMonthlyExpenses || [];

    const rows = items.map(item => {
      const checkLabel = item.paycheckAssign === 1 ? '1st check' : '2nd check';
      return `
        <div class="list-item" data-fixed-id="${item.id}">
          <div style="flex:1">
            <div class="font-bold">${esc(item.name)}</div>
            <div class="text-xs text-secondary">
              ${fmt(item.amount)}/mo · ${checkLabel} · effective ${item.effectiveDate}
            </div>
          </div>
          <div class="list-item__actions">
            <button class="btn btn--secondary btn--sm" data-action="edit-fixed" data-id="${item.id}">Edit</button>
            <button class="btn btn--danger btn--sm"    data-action="delete-fixed" data-id="${item.id}">✕</button>
          </div>
        </div>
      `;
    }).join('');

    const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

    return `
      <details class="card">
        <summary>
          <div>
            <div class="card-title">📋 Fixed Monthly Expenses</div>
            <div class="card-subtitle">${items.length} items · ${fmt(total)}/mo total</div>
          </div>
        </summary>
        <div>
          <div id="fixed-list">${rows || '<p class="text-secondary text-sm">No fixed expenses yet.</p>'}</div>

          <div class="divider"></div>

          <!-- Inline add form -->
          <div class="section-title">Add Fixed Expense</div>
          <div class="form-row">
            <div class="form-group">
              <label for="fx-new-name">Expense Name</label>
              <input type="text" id="fx-new-name" placeholder="e.g. Internet" />
            </div>
            <div class="form-group">
              <label for="fx-new-amount">Monthly Amount ($)</label>
              <input type="number" id="fx-new-amount" placeholder="0.00" min="0" step="0.01" inputmode="decimal" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="fx-new-date">Effective Date</label>
              <input type="date" id="fx-new-date" value="${S().toISODate(new Date())}" />
            </div>
            <div class="form-group">
              <label for="fx-new-check">Assign to Paycheck</label>
              <select id="fx-new-check">
                <option value="1">1st paycheck</option>
                <option value="2">2nd paycheck</option>
              </select>
            </div>
          </div>
          <button class="btn btn--primary btn--sm" data-action="add-fixed">+ Add Expense</button>
        </div>
      </details>
    `;
  }

  // ── Section 6: Accounts ───────────────────────────────────
  // Three sub-sections: Bank, Vaults, Credit Cards
  function renderAccounts(state) {
    const accts = state.accounts || { bank: [], vaults: [], cards: [] };

    // ── Bank accounts
    const bankRows = (accts.bank || []).map(a => `
      <div class="list-item" data-bank-id="${a.id}">
        <div style="flex:1">
          <div class="font-bold">${esc(a.name)} ${a.isTransferAccount ? '<span class="badge badge--cyan">Transfer</span>' : ''}</div>
          <div class="font-mono text-cyan">${fmt(a.balance)}</div>
        </div>
        <div class="list-item__actions">
          <button class="btn btn--secondary btn--sm" data-action="edit-bank" data-id="${a.id}">Edit</button>
          <button class="btn btn--danger btn--sm"    data-action="delete-bank" data-id="${a.id}">✕</button>
        </div>
      </div>
    `).join('');

    const bankTotal = (accts.bank || []).reduce((s, a) => s + (Number(a.balance) || 0), 0);

    // ── Vaults
    const vaultRows = (accts.vaults || []).map(v => `
      <div class="list-item" data-vault-id="${v.id}">
        <div style="flex:1">
          <div class="font-bold">${esc(v.name)}</div>
          <div class="font-mono text-cyan">${fmt(v.balance)}</div>
        </div>
        <div class="list-item__actions">
          <button class="btn btn--secondary btn--sm" data-action="edit-vault" data-id="${v.id}">Edit</button>
          <button class="btn btn--danger btn--sm"    data-action="delete-vault" data-id="${v.id}">✕</button>
        </div>
      </div>
    `).join('');

    const vaultTotal = (accts.vaults || []).reduce((s, v) => s + (Number(v.balance) || 0), 0);

    // ── Credit cards
    const cardRows = (accts.cards || []).map(c => {
      const pct  = c.limit > 0 ? Math.min(100, (c.balance / c.limit) * 100) : 0;
      const color = pct > 75 ? 'red' : pct > 40 ? 'amber' : 'green';
      return `
        <div class="list-item" data-card-id="${c.id}">
          <div style="flex:1">
            <div class="font-bold">${esc(c.name)}</div>
            <div class="flex-between mt-4">
              <span class="font-mono text-sm">${fmt(c.balance)} <span class="text-secondary">of</span> ${fmt(c.limit)}</span>
              <span class="text-${color} text-sm font-bold">${pct.toFixed(0)}%</span>
            </div>
            <div class="progress-bar mt-4">
              <div class="progress-bar__fill progress-bar__fill--${color}" style="width:${pct.toFixed(1)}%"></div>
            </div>
          </div>
          <div class="list-item__actions">
            <button class="btn btn--secondary btn--sm" data-action="edit-card" data-id="${c.id}">Edit</button>
            <button class="btn btn--danger btn--sm"    data-action="delete-card" data-id="${c.id}">✕</button>
          </div>
        </div>
      `;
    }).join('');

    const cardTotal = (accts.cards || []).reduce((s, c) => s + (Number(c.balance) || 0), 0);

    return `
      <details class="card">
        <summary>
          <div>
            <div class="card-title">🏦 Accounts</div>
            <div class="card-subtitle">
              ${(accts.bank||[]).length} bank · ${(accts.vaults||[]).length} vaults · ${(accts.cards||[]).length} cards
            </div>
          </div>
        </summary>
        <div>

          <!-- Bank accounts -->
          <div class="section-title">Bank Accounts</div>
          <div id="bank-list">${bankRows || '<p class="text-secondary text-sm">No bank accounts yet.</p>'}</div>
          <div class="flex-between mt-8 mb-8">
            <span class="text-secondary text-sm">Total Cash</span>
            <span class="font-mono font-bold text-cyan">${fmt(bankTotal)}</span>
          </div>
          <button class="btn btn--secondary btn--sm mb-16" data-action="add-bank">+ Add Bank Account</button>

          <div class="divider"></div>

          <!-- Vaults -->
          <div class="section-title">Vaults (Envelopes)</div>
          <div id="vault-list">${vaultRows || '<p class="text-secondary text-sm">No vaults yet.</p>'}</div>
          <div class="flex-between mt-8 mb-8">
            <span class="text-secondary text-sm">Total Vaults</span>
            <span class="font-mono font-bold text-cyan">${fmt(vaultTotal)}</span>
          </div>
          <button class="btn btn--secondary btn--sm mb-16" data-action="add-vault">+ Add Vault</button>

          <div class="divider"></div>

          <!-- Credit cards -->
          <div class="section-title">Credit Cards</div>
          <div id="card-list">${cardRows || '<p class="text-secondary text-sm">No credit cards yet.</p>'}</div>
          <div class="flex-between mt-8 mb-8">
            <span class="text-secondary text-sm">Total Card Debt</span>
            <span class="font-mono font-bold text-red">${fmt(cardTotal)}</span>
          </div>
          <button class="btn btn--secondary btn--sm" data-action="add-card">+ Add Credit Card</button>

        </div>
      </details>
    `;
  }

  // ── Settings Tab ──────────────────────────────────────────
  // Separate from Setup — rendered in the Settings tab pane.
  // ── Apply theme ──────────────────────────────────────────
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark-neon' : 'light');
    } else {
      root.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark-neon');
    }
  }

  function renderSettings(state, container) {
    container.innerHTML = `
      <h1 class="section-title" style="margin-bottom:20px;">⚙️ Settings</h1>

      <div class="card">
        <div class="card-title">👤 Account</div>
        <div class="text-secondary text-sm mt-8">Signed in as <strong>${esc(state.user.name)}</strong></div>
        <div class="text-secondary text-sm">Partner: <strong>${esc(state.user.partnerName)}</strong></div>
      </div>

      <div class="card">
        <div class="card-title mb-8">💾 Data Management</div>

        <div class="flex-col gap-8">
          <button class="btn btn--primary" data-action="export-json">⬇ Export JSON Backup</button>
          <label class="btn btn--secondary" style="cursor:pointer;">
            ⬆ Import JSON Backup
            <input type="file" id="import-file-input" accept=".json" class="hidden" />
          </label>
        </div>

        <div class="divider"></div>

        <div style="background:rgba(0,240,255,0.06);border:1px solid rgba(0,240,255,0.2);border-radius:8px;padding:10px 12px;margin-bottom:10px">
          <div class="text-sm font-bold" style="color:var(--neon-cyan);margin-bottom:4px">📱 Using on Multiple Devices?</div>
          <div class="text-xs text-secondary">
            1. Tap <strong>Export JSON Backup</strong> on this device<br>
            2. Save the file to <strong>OneDrive</strong> or <strong>Google Drive</strong><br>
            3. On the other device, open the app → Settings → Import JSON Backup<br>
            4. Pick the file from your cloud drive<br><br>
            Repeat whenever you make major changes.
          </div>
        </div>

        <div class="text-xs text-secondary">
          <strong>Export:</strong> Downloads all your data as a .json file — your accounts, vaults, goals, transactions, everything.<br><br>
          <strong>Import:</strong> Replaces ALL current data with the backup file. Cannot be undone — export first.
        </div>
      </div>

      <div class="card">
        <div class="card-title mb-8">🎨 ${t('set.theme')}</div>
        <div class="theme-toggle-row">
          <span class="text-secondary text-sm">Appearance</span>
          <div class="theme-segment" id="theme-segment">
            <button class="theme-seg-btn" data-theme="dark-neon">🌙 ${t('set.dark')}</button>
            <button class="theme-seg-btn" data-theme="light">☀️ ${t('set.light')}</button>
            <button class="theme-seg-btn" data-theme="system">⚙️ ${t('set.system')}</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title mb-12">🌐 ${t('set.language')}</div>
        <div style="display:flex;gap:10px">
          <button class="btn ${(state.settings && state.settings.lang) === 'es' ? 'btn--secondary' : 'btn--primary'}" 
            data-action="set-lang" data-lang="en" style="flex:1">
            🇺🇸 ${t('set.english')}
          </button>
          <button class="btn ${(state.settings && state.settings.lang) === 'es' ? 'btn--primary' : 'btn--secondary'}" 
            data-action="set-lang" data-lang="es" style="flex:1">
            🇵🇷 ${t('set.spanish')}
          </button>
        </div>
        <div class="text-xs text-secondary mt-8">
          ${(state.settings && state.settings.lang) === 'es' 
            ? 'Idioma actual: <strong>Espanol</strong>' 
            : 'Current language: <strong>English</strong>'}
        </div>
      </div>

      <div class="card">
        <div class="card-title mb-8">🎯 Goal Completion</div>
        <div class="text-secondary text-sm mb-12">When a yearly goal vault is fully funded, redirect future paycheck allocations to:</div>
        <select id="goal-redirect-sel" class="form-control">
          <option value="skip"     ${(state.settings.goalCompletionRedirect||'skip')==='skip'     ? 'selected':''}>⏭ Skip — keep money in Transfer Account</option>
          <option value="next"     ${(state.settings.goalCompletionRedirect||'skip')==='next'     ? 'selected':''}>➡ Next underfunded goal</option>
          <option value="slush"    ${(state.settings.goalCompletionRedirect||'skip')==='slush'    ? 'selected':''}>🪣 Slush fund vault</option>
        </select>
        <button class="btn btn--primary mt-12" data-action="save-goal-redirect">Save Preference</button>
      </div>


      <div class="card">
        <div class="card-title mb-8">📸 Claude API Key</div>
        <p class="text-secondary text-xs mb-12">
          Required for the Screenshot Balance Updater. Paste or upload a bank screenshot
          and the app will auto-detect balances and update your accounts.<br><br>
          Get a free key at <strong>console.anthropic.com</strong>
        </p>
        <input
          type="password"
          id="claude-api-key-input"
          class="form-control mb-8"
          placeholder="sk-ant-api03-..."
          value="${(state.settings && state.settings.claudeApiKey) || ''}"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="btn btn--primary btn--full" data-action="save-claude-key">Save API Key</button>
        <div class="text-xs text-secondary mt-8">Key is stored locally on your device only.</div>
      </div>

      <div class="card" id="weekly-items-card">
        <!-- Weekly Budget Items section rendered by App.WeeklyItems.render() -->
      </div>

      <div class="card" id="budget-rules-card">
        <!-- Budget Rules section rendered by App.BudgetRules.render() -->
      </div>

      <div class="card">
        <div class="card-title mb-8">🔄 App Update</div>
        <p class="text-secondary text-xs mb-12">
          If labels show raw keys (like "xfr.payCards") or features look outdated,
          the app has a stale cache. Tap below to force a full refresh.
        </p>
        <button class="btn btn--primary btn--full" data-action="force-update">🔄 Force Update Now</button>
        <div class="text-xs text-secondary mt-8">Clears all caches, unregisters the service worker, and reloads fresh.</div>
      </div>

      <div class="card">
        <div class="card-title mb-8">🗑 Danger Zone</div>
        <button class="btn btn--danger btn--full" data-action="clear-all-data">Clear All Data</button>
        <div class="text-secondary text-xs mt-8">Permanently deletes all data. You will be asked to confirm twice.</div>
      </div>

      <div class="text-center text-dim text-xs mt-16" style="padding-bottom:8px;">
        Finance Tracker v1.0 · Built for David & Yamel
      </div>
    `;

    wireSettingsEvents(container, state);
    // Render Budget Rules section
    var brCard = container.querySelector('#budget-rules-card');
    var wiCard = container.querySelector('#weekly-items-card');
    if (wiCard && App.WeeklyItems) App.WeeklyItems.render(state, wiCard);
    if (brCard && App.BudgetRules) App.BudgetRules.render(state, brCard);
  }

  // ── Event Wiring — Setup Tab ──────────────────────────────
  function wireSetupEvents(container, state) {
    container.addEventListener('click', (e) => {
      const btn    = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      switch (action) {
        // ── Personal info ──────────────────────────────────
        case 'save-personal': {
          const name    = container.querySelector('#si-name').value.trim();
          const partner = container.querySelector('#si-partner').value.trim();
          if (!name) { App.showToast('Name cannot be empty.', 'error'); return; }
          const ns = App.getState();
          ns.user.name        = name;
          ns.user.partnerName = partner;
          App.setState(ns);
          App.showToast('Personal info saved ✓', 'success');
          break;
        }

        // ── Income structure ───────────────────────────────
        case 'save-income': {
          const freq       = container.querySelector('#si-freq').value;
          const amount     = parseFloat(container.querySelector('#si-amount').value) || 0;
          const firstPay   = container.querySelector('#si-firstpayday').value;
          const pEnabled   = container.querySelector('#si-partner-enabled').checked;
          const pFreq      = container.querySelector('#si-pfreq') ? container.querySelector('#si-pfreq').value : 'biweekly';
          const pAmount    = parseFloat(container.querySelector('#si-pamount') ? container.querySelector('#si-pamount').value : 0) || 0;
          const pFirstPay  = container.querySelector('#si-pfirstpayday') ? container.querySelector('#si-pfirstpayday').value : '';

          if (!firstPay) { App.showToast('First payday date is required.', 'error'); return; }

          const year      = new Date().getFullYear();
          const newDates  = S().calculatePaydayDates(firstPay, freq, year);
          const ppy       = newDates.length || 26;

          const ns = App.getState();
          ns.income = {
            ...ns.income,
            frequency:             freq,
            defaultPaycheckAmount: amount,
            firstPaydayOfYear:     firstPay,
            paychecksPerYear:      ppy,
            paydayDates:           newDates,
            partnerEnabled:        pEnabled,
            partnerFrequency:      pFreq,
            partnerPaycheckAmount: pAmount,
            partnerFirstPayday:    pFirstPay
          };
          // When payday dates change, clear month overrides (they may be stale)
          ns.monthOverrides = {};
          App.setState(ns);

          // Refresh entire Setup tab so month grid and category per-check amounts update
          App.refreshCurrentTab();
          App.showToast(`Income saved · ${ppy} paychecks in ${year} ✓`, 'success');
          break;
        }

        // ── Month override ─────────────────────────────────
        case 'override-month': {
          const month = parseInt(btn.dataset.month, 10);
          const year  = parseInt(btn.dataset.year, 10);
          const key   = `${year}-${String(month).padStart(2, '0')}`;
          const ns    = App.getState();

          if (ns.monthOverrides[key]) {
            // Toggle override off (revert to auto)
            delete ns.monthOverrides[key];
            App.setState(ns);
            App.refreshCurrentTab();
            App.showToast(`${MONTH_FULL[month-1]} reset to auto ✓`, 'info');
          } else {
            // Show picker: 2 or 3
            openMonthOverrideModal(month, year, ns, key);
          }
          break;
        }

        // ── Yearly categories ──────────────────────────────
        case 'add-category': {
          const name = container.querySelector('#cat-new-name').value.trim();
          const goal      = parseFloat(container.querySelector('#cat-new-goal').value) || 0;
          const weeklyRaw = container.querySelector('#cat-new-weekly') ? container.querySelector('#cat-new-weekly').value.trim() : '';
          const weeklyDay = container.querySelector('#cat-new-weekday') ? container.querySelector('#cat-new-weekday').value : '';
          if (!name) { App.showToast('Category name is required.', 'error'); return; }
          const ns = App.getState();
          ns.yearlyCategories.push({ id: S().generateId(), name, annualGoal: goal });
          App.setState(ns);
          App.refreshCurrentTab();
          App.showToast(`"${name}" added ✓`, 'success');
          break;
        }

        case 'edit-category': {
          const id  = btn.dataset.id;
          const ns  = App.getState();
          const cat = ns.yearlyCategories.find(c => c.id === id);
          if (!cat) return;
          openCategoryEditModal(cat, ns);
          break;
        }

        case 'delete-category': {
          const id  = btn.dataset.id;
          const ns  = App.getState();
          const cat = ns.yearlyCategories.find(c => c.id === id);
          if (!cat) return;
          if (!confirm(`Delete category "${cat.name}"? This cannot be undone.`)) return;
          ns.yearlyCategories = ns.yearlyCategories.filter(c => c.id !== id);
          App.setState(ns);
          App.refreshCurrentTab();
          App.showToast(`"${cat.name}" deleted.`, 'info');
          break;
        }

        // ── Fixed expenses ─────────────────────────────────
        case 'add-fixed': {
          const name   = container.querySelector('#fx-new-name').value.trim();
          const amount = parseFloat(container.querySelector('#fx-new-amount').value) || 0;
          const date   = container.querySelector('#fx-new-date').value;
          const check  = parseInt(container.querySelector('#fx-new-check').value, 10);
          if (!name) { App.showToast('Expense name is required.', 'error'); return; }
          // effectiveDate is optional — default to today if blank
          const ns = App.getState();
          ns.fixedMonthlyExpenses.push({
            id: S().generateId(), name, amount, effectiveDate: date || S().toISODate(new Date()), paycheckAssign: check
          });
          App.setState(ns);
          App.refreshCurrentTab();
          App.showToast(`"${name}" added ✓`, 'success');
          break;
        }

        case 'edit-fixed': {
          const id   = btn.dataset.id;
          const ns   = App.getState();
          const item = ns.fixedMonthlyExpenses.find(x => x.id === id);
          if (!item) return;
          openFixedEditModal(item, ns);
          break;
        }

        case 'delete-fixed': {
          const id   = btn.dataset.id;
          const ns   = App.getState();
          const item = ns.fixedMonthlyExpenses.find(x => x.id === id);
          if (!item) return;
          if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
          ns.fixedMonthlyExpenses = ns.fixedMonthlyExpenses.filter(x => x.id !== id);
          App.setState(ns);
          App.refreshCurrentTab();
          App.showToast(`"${item.name}" deleted.`, 'info');
          break;
        }

        // ── Bank accounts ──────────────────────────────────
        case 'add-bank':
          openBankModal(null, App.getState());
          break;
        case 'edit-bank': {
          const id = btn.dataset.id;
          const ns = App.getState();
          const a  = ns.accounts.bank.find(x => x.id === id);
          if (a) openBankModal(a, ns);
          break;
        }
        case 'delete-bank': {
          const id = btn.dataset.id;
          const ns = App.getState();
          const a  = ns.accounts.bank.find(x => x.id === id);
          if (!a) return;
          if (!confirm(`Delete account "${a.name}"?`)) return;
          ns.accounts.bank = ns.accounts.bank.filter(x => x.id !== id);
          App.setState(ns);
          App.refreshCurrentTab();
          App.showToast(`"${a.name}" deleted.`, 'info');
          break;
        }

        // ── Vaults ────────────────────────────────────────
        case 'add-vault':
          openVaultModal(null, App.getState());
          break;
        case 'edit-vault': {
          const id = btn.dataset.id;
          const ns = App.getState();
          const v  = ns.accounts.vaults.find(x => x.id === id);
          if (v) openVaultModal(v, ns);
          break;
        }
        case 'delete-vault': {
          const id = btn.dataset.id;
          const ns = App.getState();
          const v  = ns.accounts.vaults.find(x => x.id === id);
          if (!v) return;
          if (!confirm(`Delete vault "${v.name}"?`)) return;
          ns.accounts.vaults = ns.accounts.vaults.filter(x => x.id !== id);
          App.setState(ns);
          App.refreshCurrentTab();
          App.showToast(`"${v.name}" deleted.`, 'info');
          break;
        }

        // ── Credit cards ───────────────────────────────────
        case 'add-card':
          openCardModal(null, App.getState());
          break;
        case 'edit-card': {
          const id = btn.dataset.id;
          const ns = App.getState();
          const c  = ns.accounts.cards.find(x => x.id === id);
          if (c) openCardModal(c, ns);
          break;
        }
        case 'delete-card': {
          const id = btn.dataset.id;
          const ns = App.getState();
          const c  = ns.accounts.cards.find(x => x.id === id);
          if (!c) return;
          if (!confirm(`Delete card "${c.name}"?`)) return;
          ns.accounts.cards = ns.accounts.cards.filter(x => x.id !== id);
          App.setState(ns);
          App.refreshCurrentTab();
          App.showToast(`"${c.name}" deleted.`, 'info');
          break;
        }
      }
    });

    // Toggle partner income fields
    const partnerCb = container.querySelector('#si-partner-enabled');
    if (partnerCb) {
      partnerCb.addEventListener('change', () => {
        const fields = container.querySelector('#si-partner-fields');
        if (fields) fields.style.display = partnerCb.checked ? '' : 'none';
      });
    }
  }

  // ── Event Wiring — Settings Tab ───────────────────────────
  function wireSettingsEvents(container, state) {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      switch (btn.dataset.action) {
        case 'set-lang': {
        const lang = btn.dataset.lang;
        if (App.Lang) {
          App.Lang.setLang(lang);
          const ns = App.Storage.cloneState(App.getState());
          if (!ns.settings) ns.settings = {};
          ns.settings.lang = lang;
          App.setState(ns);
          if (App.refreshCurrentTab) App.refreshCurrentTab();
        }
        break;
      }
      case 'export-json':
          S().exportJSON(App.getState());
          App.showToast('Backup downloaded ✓', 'success');
          break;

        case 'force-update': {
          App.showToast('Clearing cache and reloading…', 'info');
          setTimeout(async function() {
            // 1. Unregister all service workers
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map(r => r.unregister()));
            }
            // 2. Clear all caches
            if ('caches' in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map(k => caches.delete(k)));
            }
            // 3. Hard reload
            window.location.reload(true);
          }, 500);
          break;
        }

        case 'clear-all-data':
          if (!confirm('Delete ALL data? This cannot be undone.')) return;
          if (!confirm('Are you sure? All categories, transactions, accounts, and investments will be deleted.')) return;
          localStorage.removeItem('financeApp_v1');
          localStorage.removeItem('financeApp_activeTab');
          App.showToast('Data cleared. Reloading…', 'info');
          setTimeout(() => location.reload(), 1200);
          break;

        case 'save-claude-key': {
          const keyInput = container.querySelector('#claude-api-key-input');
          if (!keyInput) return;
          const ns = App.getState();
          if (!ns.settings) ns.settings = {};
          ns.settings.claudeApiKey = keyInput.value.trim();
          App.setState(ns);
          App.showToast(ns.settings.claudeApiKey ? 'API key saved ✓' : 'API key cleared', 'success');
          break;
        }

        case 'save-goal-redirect': {
          const sel = container.querySelector('#goal-redirect-sel');
          if (!sel) return;
          const ns = App.getState();
          if (!ns.settings) ns.settings = {};
          ns.settings.goalCompletionRedirect = sel.value;
          App.setState(ns);
          App.showToast('Goal redirect preference saved ✓', 'success');
          break;
        }

        case 'set-theme': {
          // handled by segment button listener below
          break;
        }
      }
    });

    // Theme segment buttons
    const themeSeg = container.querySelector('#theme-segment');
    if (themeSeg) {
      themeSeg.addEventListener('click', (e) => {
        const btn = e.target.closest('.theme-seg-btn');
        if (!btn) return;
        const theme = btn.dataset.theme;
        if (!theme) return;
        App.Setup.applyTheme(theme);
        try { localStorage.setItem('financeApp_theme', theme); } catch (_) {}
        // Update active state on buttons
        themeSeg.querySelectorAll('.theme-seg-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.theme === theme);
        });
        App.showToast('Theme updated ✓', 'success');
      });
      // Mark current theme active
      try {
        const cur = localStorage.getItem('financeApp_theme') || 'dark-neon';
        themeSeg.querySelectorAll('.theme-seg-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.theme === cur);
        });
      } catch (_) {}
    }

    // File import
    const fileInput = container.querySelector('#import-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!confirm('This will replace ALL your current data with the backup. Continue?')) {
          fileInput.value = '';
          return;
        }
        S().importJSON(file)
          .then(data => {
            S().saveState(data);
            App.showToast('Import successful. Reloading…', 'success');
            setTimeout(() => location.reload(), 1200);
          })
          .catch(err => {
            App.showToast('Import failed: ' + err.message, 'error');
            fileInput.value = '';
          });
      });
    }
  }

  // ── Modals ────────────────────────────────────────────────
  // Simple modal helpers. Open/close via backdrop + modal-box.

  function openModal(html, onSubmit) {
    const backdrop = document.getElementById('modal-backdrop');
    const content  = document.getElementById('modal-content');
    content.innerHTML = html;
    backdrop.classList.remove('hidden');
    backdrop.setAttribute('aria-hidden', 'false');

    // Wire close button
    const closeBtn = content.querySelector('[data-action="modal-close"]');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // Wire submit button
    const submitBtn = content.querySelector('[data-action="modal-submit"]');
    if (submitBtn) submitBtn.addEventListener('click', () => onSubmit(content));

    // Close on backdrop click
    backdrop.addEventListener('click', function handler(e) {
      if (e.target === backdrop) { closeModal(); backdrop.removeEventListener('click', handler); }
    });

    // Focus first input
    const firstInput = content.querySelector('input, select');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function closeModal() {
    const backdrop = document.getElementById('modal-backdrop');
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
    document.getElementById('modal-content').innerHTML = '';
  }

  // Month override modal
  function openMonthOverrideModal(month, year, ns, key) {
    openModal(`
      <div class="modal-header">
        <div class="modal-title">Override — ${MONTH_FULL[month-1]} ${year}</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      <p class="text-secondary text-sm mb-16">How many paychecks in this month?</p>
      <div class="flex-gap-8">
        <button class="btn btn--secondary btn--full" data-action="modal-submit" data-count="2">2 Paychecks</button>
        <button class="btn btn--primary btn--full"   data-action="modal-submit" data-count="3">3 Paychecks</button>
      </div>
    `, (content) => {
      const clickedBtn = content.querySelector('[data-action="modal-submit"]:focus') ||
                         content.querySelector('[data-action="modal-submit"]');
      // Check which button was clicked
    });

    // Override wiring — each button sets directly
    const btns = document.querySelectorAll('#modal-content [data-action="modal-submit"]');
    btns.forEach(b => {
      b.addEventListener('click', () => {
        const count = parseInt(b.dataset.count, 10);
        const fresh = App.getState();
        fresh.monthOverrides[key] = { paycheckCount: count };
        App.setState(fresh);
        closeModal();
        App.refreshCurrentTab();
        App.showToast(`${MONTH_FULL[month-1]} set to ${count} paychecks ✓`, 'success');
      });
    });
  }

  // Category edit modal
  function openCategoryEditModal(cat, ns) {
    const hasWeekly = cat.weeklyBudget !== null && cat.weeklyBudget !== undefined;
    openModal(`
      <div class="modal-header">
        <div class="modal-title">Edit Category</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      <div class="form-group">
        <label for="m-cat-name">Category Name</label>
        <input type="text" id="m-cat-name" value="${esc(cat.name)}" enterkeyhint="next" />
      </div>
      <div class="form-group">
        <label for="m-cat-goal">Annual Goal ($)</label>
        <input type="number" id="m-cat-goal" value="${cat.annualGoal}" min="0" step="0.01" inputmode="decimal" />
      </div>
      <div style="border-top:1px solid var(--border);margin:14px 0 12px;padding-top:12px">
        <div class="text-sm font-bold" style="margin-bottom:4px">📅 Weekly Budget <span class="text-dim" style="font-weight:400;font-size:0.78rem">(optional — for Food & Gas)</span></div>
        <div class="text-xs text-secondary" style="margin-bottom:10px">If set, the Planner multiplies this by how many matching days fall in the month — auto-adjusts for 5-week months.</div>
        <div class="form-row">
          <div class="form-group">
            <label>$/week</label>
            <input type="number" id="m-cat-weekly" value="${hasWeekly ? cat.weeklyBudget : ''}" placeholder="e.g. 200" min="0" step="1" inputmode="numeric" />
          </div>
          <div class="form-group">
            <label>Count by</label>
            <select id="m-cat-weekday">
              <option value="" ${!cat.weeklyDay ? 'selected' : ''}>— None —</option>
              <option value="saturday" ${cat.weeklyDay === 'saturday' ? 'selected' : ''}>Saturdays (Gas)</option>
              <option value="sunday" ${cat.weeklyDay === 'sunday' ? 'selected' : ''}>Sundays (Food)</option>
            </select>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px;padding:8px 10px;background:rgba(251,191,36,0.08);border-radius:8px;border:1px solid rgba(251,191,36,0.25)">
          <input type="checkbox" id="m-cat-5week" ${cat.fiveWeekBonus ? 'checked' : ''} style="width:16px;height:16px;flex-shrink:0" />
          <div>
            <div class="text-sm font-bold" style="color:var(--neon-amber)">🗓️ 5-Week Month Bonus</div>
            <div class="text-xs text-secondary">When this month has a 3rd paycheck, automatically add one extra week's allocation to this category.</div>
          </div>
        </div>
      </div>
      <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Save Changes</button>
    `, (content) => {
      const name      = content.querySelector('#m-cat-name').value.trim();
      const goal      = parseFloat(content.querySelector('#m-cat-goal').value) || 0;
      const weekly    = content.querySelector('#m-cat-weekly').value.trim();
      const weeklyDay = content.querySelector('#m-cat-weekday').value;
      if (!name) { App.showToast('Name required.', 'error'); return; }
      const fresh = App.getState();
      const idx   = fresh.yearlyCategories.findIndex(c => c.id === cat.id);
      if (idx !== -1) {
        fresh.yearlyCategories[idx].name        = name;
        fresh.yearlyCategories[idx].annualGoal  = goal;
        fresh.yearlyCategories[idx].weeklyBudget  = weekly !== '' ? (parseFloat(weekly) || 0) : null;
        fresh.yearlyCategories[idx].weeklyDay     = weeklyDay || null;
        fresh.yearlyCategories[idx].fiveWeekBonus = !!content.querySelector('#m-cat-5week').checked;
      }
      App.setState(fresh);
      closeModal();
      App.refreshCurrentTab();
      App.showToast(`"${name}" updated ✓`, 'success');
    });
  }

  // Fixed expense edit modal
  function openFixedEditModal(item, ns) {
    openModal(`
      <div class="modal-header">
        <div class="modal-title">Edit Fixed Expense</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      <div class="form-group">
        <label for="m-fx-name">Name</label>
        <input type="text" id="m-fx-name" value="${esc(item.name)}" />
      </div>
      <div class="form-group">
        <label for="m-fx-amount">Monthly Amount ($)</label>
        <input type="number" id="m-fx-amount" value="${item.amount}" min="0" step="0.01" inputmode="decimal" />
      </div>
      <div class="form-group">
        <label for="m-fx-date">Effective Date</label>
        <input type="date" id="m-fx-date" value="${item.effectiveDate}" />
      </div>
      <div class="form-group">
        <label for="m-fx-check">Assign to Paycheck</label>
        <select id="m-fx-check">
          <option value="1" ${item.paycheckAssign === 1 ? 'selected' : ''}>1st paycheck</option>
          <option value="2" ${item.paycheckAssign === 2 ? 'selected' : ''}>2nd paycheck</option>
        </select>
      </div>
      <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">Save Changes</button>
    `, (content) => {
      const name   = content.querySelector('#m-fx-name').value.trim();
      const amount = parseFloat(content.querySelector('#m-fx-amount').value) || 0;
      const date   = content.querySelector('#m-fx-date').value;
      const check  = parseInt(content.querySelector('#m-fx-check').value, 10);
      if (!name) { App.showToast('Name required.', 'error'); return; }
      const fresh = App.getState();
      const idx   = fresh.fixedMonthlyExpenses.findIndex(x => x.id === item.id);
      if (idx !== -1) Object.assign(fresh.fixedMonthlyExpenses[idx], { name, amount, effectiveDate: date, paycheckAssign: check });
      App.setState(fresh);
      closeModal();
      App.refreshCurrentTab();
      App.showToast(`"${name}" updated ✓`, 'success');
    });
  }

  // Bank account modal
  function openBankModal(existing, ns) {
    const isNew = !existing;
    openModal(`
      <div class="modal-header">
        <div class="modal-title">${isNew ? 'Add' : 'Edit'} Bank Account</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      <div class="form-group">
        <label for="m-bank-name">Account Name</label>
        <input type="text" id="m-bank-name" value="${existing ? esc(existing.name) : ''}" placeholder="e.g. SoFi Checking" />
      </div>
      <div class="form-group">
        <label for="m-bank-bal">Current Balance ($)</label>
        <input type="number" id="m-bank-bal" value="${existing ? existing.balance : 0}" min="0" step="0.01" inputmode="decimal" />
      </div>
      <div class="form-group">
        <label for="m-bank-tier">Liquidity Tier</label>
        <select id="m-bank-tier">
          <option value="immediate" ${existing && existing.liquidityTier === 'immediate' ? 'selected' : ''}>💵 Immediate (checking)</option>
          <option value="short"     ${existing && existing.liquidityTier === 'short'     ? 'selected' : ''}>🏦 Available (savings)</option>
          <option value="locked"    ${existing && existing.liquidityTier === 'locked'    ? 'selected' : ''}>🔒 Locked (retirement)</option>
        </select>
      </div>
      <div class="toggle-row">
        <div class="toggle-label">Transfer Account</div>
        <input type="checkbox" id="m-bank-transfer" ${existing && existing.isTransferAccount ? 'checked' : ''} />
      </div>
      <div class="text-secondary text-xs mb-12">Mark the account used to pay off credit cards. Used for safety net calculations.</div>
      <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">${isNew ? 'Add Account' : 'Save Changes'}</button>
    `, (content) => {
      const name     = content.querySelector('#m-bank-name').value.trim();
      const balance  = parseFloat(content.querySelector('#m-bank-bal').value) || 0;
      const isXfer   = content.querySelector('#m-bank-transfer').checked;
      const tier     = content.querySelector('#m-bank-tier').value || 'immediate';
      if (!name) { App.showToast('Account name required.', 'error'); return; }
      const fresh = App.getState();
      if (isNew) {
        if (isXfer) fresh.accounts.bank.forEach(a => a.isTransferAccount = false);
        fresh.accounts.bank.push({ id: S().generateId(), name, balance, isTransferAccount: isXfer, liquidityTier: tier });
      } else {
        const idx = fresh.accounts.bank.findIndex(a => a.id === existing.id);
        if (idx !== -1) {
          if (isXfer) fresh.accounts.bank.forEach(a => a.isTransferAccount = false);
          Object.assign(fresh.accounts.bank[idx], { name, balance, isTransferAccount: isXfer, liquidityTier: tier });
        }
      }
      App.setState(fresh);
      closeModal();
      App.refreshCurrentTab();
      App.showToast(`"${name}" ${isNew ? 'added' : 'updated'} ✓`, 'success');
    });
  }

  // Vault modal
  function openVaultModal(existing, ns) {
    const isNew = !existing;
    openModal(`
      <div class="modal-header">
        <div class="modal-title">${isNew ? 'Add' : 'Edit'} Vault</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      <div class="form-group">
        <label for="m-vault-name">Vault Name</label>
        <input type="text" id="m-vault-name" value="${existing ? esc(existing.name) : ''}" placeholder="e.g. Gasoline" />
      </div>
      <div class="form-group">
        <label for="m-vault-bal">Current Balance ($)</label>
        <input type="number" id="m-vault-bal" value="${existing ? existing.balance : 0}" min="0" step="0.01" inputmode="decimal" />
      </div>
      <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">${isNew ? 'Add Vault' : 'Save Changes'}</button>
    `, (content) => {
      const name    = content.querySelector('#m-vault-name').value.trim();
      const balance = parseFloat(content.querySelector('#m-vault-bal').value) || 0;
      if (!name) { App.showToast('Vault name required.', 'error'); return; }
      const fresh = App.getState();
      if (isNew) {
        fresh.accounts.vaults.push({ id: S().generateId(), name, balance });
      } else {
        const idx = fresh.accounts.vaults.findIndex(v => v.id === existing.id);
        if (idx !== -1) Object.assign(fresh.accounts.vaults[idx], { name, balance });
      }
      App.setState(fresh);
      closeModal();
      App.refreshCurrentTab();
      App.showToast(`"${name}" ${isNew ? 'added' : 'updated'} ✓`, 'success');
    });
  }

  // Credit card modal
  function openCardModal(existing, ns) {
    const isNew = !existing;
    openModal(`
      <div class="modal-header">
        <div class="modal-title">${isNew ? 'Add' : 'Edit'} Credit Card</div>
        <button class="btn btn--icon btn--secondary" data-action="modal-close">✕</button>
      </div>
      <div class="form-group">
        <label for="m-card-name">Card Name</label>
        <input type="text" id="m-card-name" value="${existing ? esc(existing.name) : ''}" placeholder="e.g. Chase Flex" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="m-card-limit">Credit Limit ($)</label>
          <input type="number" id="m-card-limit" value="${existing ? existing.limit : 0}" min="0" step="1" inputmode="numeric" />
        </div>
        <div class="form-group">
          <label for="m-card-bal">Current Balance ($)</label>
          <input type="number" id="m-card-bal" value="${existing ? existing.balance : 0}" min="0" step="0.01" inputmode="decimal" />
        </div>
      </div>
      <button class="btn btn--primary btn--full mt-8" data-action="modal-submit">${isNew ? 'Add Card' : 'Save Changes'}</button>
    `, (content) => {
      const name    = content.querySelector('#m-card-name').value.trim();
      const limit   = parseFloat(content.querySelector('#m-card-limit').value) || 0;
      const balance = parseFloat(content.querySelector('#m-card-bal').value) || 0;
      if (!name) { App.showToast('Card name required.', 'error'); return; }
      const fresh = App.getState();
      if (isNew) {
        fresh.accounts.cards.push({ id: S().generateId(), name, limit, balance });
      } else {
        const idx = fresh.accounts.cards.findIndex(c => c.id === existing.id);
        if (idx !== -1) Object.assign(fresh.accounts.cards[idx], { name, limit, balance });
      }
      App.setState(fresh);
      closeModal();
      App.refreshCurrentTab();
      App.showToast(`"${name}" ${isNew ? 'added' : 'updated'} ✓`, 'success');
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  // HTML-escape to prevent XSS from user-entered data
  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function freqLabel(f) {
    return { biweekly: 'Bi-weekly', weekly: 'Weekly', semimonthly: 'Semi-monthly', monthly: 'Monthly' }[f] || f;
  }

  // ── Public API ────────────────────────────────────────────
  App.Setup = { render, renderSettings, applyTheme };

})(window.App = window.App || {});

/* ── BUDGET RULES (appended module) ─────────────────────────────
   Renders inside Settings tab. Wired by wireSettingsEvents().
   Two rule types:
     fixed → flat $ per paycheck
     goal  → (targetAmount - vaultBalance) / paychecksLeft
   paycheck assignment: '1' | '2' | 'both'
──────────────────────────────────────────────────────────────── */
(function(_App) {

  var BR = _App.BudgetRules = {};

  function t(k) { return _App.Lang ? _App.Lang.t(k) : k; }
  var fmt = function(n) { return _App.Storage.formatCurrency(n); };
  var esc = function(s) { return String(s||'').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };

  function paychecksLeft(targetDate, paydayDates) {
    if (!targetDate || !paydayDates) return 0;
    var today = new Date(); today.setHours(0,0,0,0);
    var end   = new Date(targetDate + 'T12:00:00');
    return (paydayDates || []).filter(function(d) {
      var pd = new Date(d + 'T12:00:00');
      return pd >= today && pd <= end;
    }).length;
  }

  function calcPerPaycheck(rule, state) {
    if (rule.type === 'fixed') return Number(rule.amount) || 0;
    var vault = ((state.accounts||{}).vaults||[]).find(function(v) { return v.id === rule.vaultId; });
    var bal   = vault ? (Number(vault.balance)||0) : 0;
    var need  = Math.max(0, (Number(rule.targetAmount)||0) - bal);
    var left  = paychecksLeft(rule.targetDate, (state.income||{}).paydayDates);
    if (!left) return need;
    return Math.round((need / left) * 100) / 100;
  }

  BR.render = function(state, container) {
    var rules  = state.budgetRules || [];
    var vaults = ((state.accounts||{}).vaults||[]);

    var rows = rules.map(function(r) {
      var perCheck = calcPerPaycheck(r, state);
      var vault    = vaults.find(function(v){return v.id===r.vaultId;});
      var bal      = vault ? (Number(vault.balance)||0) : 0;
      var left     = r.type==='goal' ? paychecksLeft(r.targetDate, (state.income||{}).paydayDates) : null;
      var pchLabel = r.paycheck==='1' ? 'Check 1' : r.paycheck==='2' ? 'Check 2' : 'Both';
      var detail   = r.type==='goal'
        ? '<span class="text-xs text-secondary">Goal: ' + fmt(r.targetAmount||0) + ' · Bal: ' + fmt(bal) + ' · ' + (left||0) + ' checks left</span>'
        : '<span class="text-xs text-secondary">Fixed · ' + pchLabel + '</span>';
      return '<div class="br-row" data-id="' + esc(r.id) + '">' +
        '<div class="br-row__left">' +
          '<span class="br-row__name text-sm font-bold">' + esc(r.name) + '</span>' +
          detail +
        '</div>' +
        '<div class="br-row__right">' +
          '<span class="br-row__amt text-cyan font-mono">' + fmt(perCheck) + '/check</span>' +
          '<span class="br-row__tag text-xs" style="background:rgba(0,240,255,.1);color:var(--neon-cyan);border-radius:4px;padding:2px 6px;">' + pchLabel + '</span>' +
          '<button class="btn btn--secondary btn--sm" data-br-action="edit" data-id="' + esc(r.id) + '">✏️</button>' +
          '<button class="btn btn--danger btn--sm" data-br-action="delete" data-id="' + esc(r.id) + '">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    var vaultOptions = vaults.map(function(v) {
      return '<option value="' + esc(v.id) + '">' + esc(v.name) + ' (' + fmt(v.balance) + ')</option>';
    }).join('');

    container.innerHTML =
      '<div class="section-title mb-8">📋 Budget Rules</div>' +
      '<p class="text-xs text-secondary mb-12">Line items pulled from every paycheck. Fixed = flat amount. Goal = auto-calculated from vault balance and target date.</p>' +
      (rules.length ? '<div id="br-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">' + rows + '</div>'
                    : '<div class="text-secondary text-sm mb-12">No rules yet. Add one below.</div>') +

      '<div class="card" style="border:1px solid rgba(0,240,255,.15)">' +
        '<div class="card-title mb-12" id="br-form-title">➕ Add Budget Rule</div>' +
        '<input type="hidden" id="br-edit-id" value="">' +

        '<div class="form-group">' +
          '<label class="text-xs text-secondary">Name (e.g. Car Insurance, Slush Fund)</label>' +
          '<input id="br-name" type="text" class="form-control" placeholder="Rule name" />' +
        '</div>' +

        '<div class="form-group">' +
          '<label class="text-xs text-secondary">Type</label>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn--primary br-type-btn" data-type="fixed" id="br-type-fixed" style="flex:1">💵 Fixed Amount</button>' +
            '<button class="btn btn--secondary br-type-btn" data-type="goal" id="br-type-goal" style="flex:1">🎯 Goal by Date</button>' +
          '</div>' +
        '</div>' +

        '<div id="br-fixed-fields">' +
          '<div class="form-group">' +
            '<label class="text-xs text-secondary">Amount per Paycheck ($)</label>' +
            '<input id="br-amount" type="number" min="0" step="0.01" class="form-control" placeholder="0.00" inputmode="decimal" />' +
          '</div>' +
        '</div>' +

        '<div id="br-goal-fields" style="display:none">' +
          '<div class="form-group">' +
            '<label class="text-xs text-secondary">Linked Vault (to read current balance)</label>' +
            '<select id="br-vault" class="form-control"><option value="">— No vault —</option>' + vaultOptions + '</select>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="text-xs text-secondary">Target Amount ($)</label>' +
            '<input id="br-target" type="number" min="0" step="0.01" class="form-control" placeholder="0.00" inputmode="decimal" />' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="text-xs text-secondary">Target Date</label>' +
            '<input id="br-date" type="date" class="form-control" />' +
          '</div>' +
          '<div id="br-calc-preview" class="text-xs" style="color:var(--neon-cyan);padding:6px 0;min-height:20px"></div>' +
        '</div>' +

        '<div class="form-group">' +
          '<label class="text-xs text-secondary">Apply to which paycheck?</label>' +
          '<select id="br-paycheck" class="form-control">' +
            '<option value="1">Paycheck 1 (1st of month)</option>' +
            '<option value="2">Paycheck 2 (2nd of month)</option>' +
            '<option value="both">Both paychecks</option>' +
          '</select>' +
        '</div>' +

        '<div style="display:flex;gap:8px;margin-top:4px">' +
          '<button class="btn btn--secondary" id="br-cancel-btn" style="flex:1;display:none">Cancel</button>' +
          '<button class="btn btn--primary" id="br-save-btn" style="flex:1">Save Rule</button>' +
        '</div>' +
      '</div>';

    wireBudgetRules(container, state);
  };

  function wireBudgetRules(container, state) {
    var _type = 'fixed';

    function setType(t) {
      _type = t;
      container.querySelector('#br-fixed-fields').style.display = t==='fixed' ? '' : 'none';
      container.querySelector('#br-goal-fields').style.display  = t==='goal'  ? '' : 'none';
      container.querySelector('#br-type-fixed').className = 'btn ' + (t==='fixed' ? 'btn--primary' : 'btn--secondary') + ' br-type-btn';
      container.querySelector('#br-type-goal').className  = 'btn ' + (t==='goal'  ? 'btn--primary' : 'btn--secondary') + ' br-type-btn';
    }

    function updateCalcPreview() {
      var prev = container.querySelector('#br-calc-preview');
      if (!prev) return;
      var vault    = ((state.accounts||{}).vaults||[]).find(function(v){return v.id===container.querySelector('#br-vault').value;});
      var bal      = vault ? (Number(vault.balance)||0) : 0;
      var target   = parseFloat(container.querySelector('#br-target').value) || 0;
      var dateVal  = container.querySelector('#br-date').value;
      var left     = dateVal ? paychecksLeft(dateVal, (state.income||{}).paydayDates) : 0;
      var need     = Math.max(0, target - bal);
      var perCheck = left ? Math.round((need/left)*100)/100 : need;
      prev.textContent = dateVal
        ? 'Vault balance: ' + fmt(bal) + ' · Need: ' + fmt(need) + ' · ' + left + ' paychecks left → ' + fmt(perCheck) + '/check'
        : 'Enter a target date to calculate.';
    }

    function resetForm() {
      container.querySelector('#br-edit-id').value = '';
      container.querySelector('#br-name').value    = '';
      container.querySelector('#br-amount').value  = '';
      container.querySelector('#br-target').value  = '';
      container.querySelector('#br-date').value    = '';
      container.querySelector('#br-vault').value   = '';
      container.querySelector('#br-paycheck').value= '1';
      container.querySelector('#br-form-title').textContent = '➕ Add Budget Rule';
      container.querySelector('#br-cancel-btn').style.display = 'none';
      setType('fixed');
    }

    function loadRule(id) {
      var rule = ((_App.getState()||{}).budgetRules||[]).find(function(r){return r.id===id;});
      if (!rule) return;
      container.querySelector('#br-edit-id').value  = rule.id;
      container.querySelector('#br-name').value     = rule.name || '';
      container.querySelector('#br-amount').value   = rule.amount || '';
      container.querySelector('#br-target').value   = rule.targetAmount || '';
      container.querySelector('#br-date').value     = rule.targetDate   || '';
      container.querySelector('#br-vault').value    = rule.vaultId      || '';
      container.querySelector('#br-paycheck').value = rule.paycheck     || '1';
      container.querySelector('#br-form-title').textContent = '✏️ Edit Rule';
      container.querySelector('#br-cancel-btn').style.display = '';
      setType(rule.type || 'fixed');
      if (rule.type==='goal') updateCalcPreview();
    }

    // Type toggle buttons
    container.addEventListener('click', function(e) {
      var tb = e.target.closest('.br-type-btn');
      if (tb) { setType(tb.dataset.type); return; }

      var action = (e.target.closest('[data-br-action]')||{}).dataset;
      if (!action || !action.brAction) return;
      if (action.brAction === 'edit')   { loadRule(action.id); return; }
      if (action.brAction === 'delete') {
        if (!confirm('Remove this budget rule?')) return;
        var ns = _App.Storage.cloneState(_App.getState());
        ns.budgetRules = (ns.budgetRules||[]).filter(function(r){return r.id!==action.id;});
        _App.setState(ns);
        _App.showToast('Rule removed', 'success');
        _App.refreshCurrentTab();
        return;
      }
    });

    // Live preview for goal fields
    ['br-target','br-date','br-vault'].forEach(function(id) {
      var el = container.querySelector('#'+id);
      if (el) el.addEventListener('input', updateCalcPreview);
    });

    // Cancel button
    container.querySelector('#br-cancel-btn').addEventListener('click', resetForm);

    // Save button
    container.querySelector('#br-save-btn').addEventListener('click', function() {
      var name = (container.querySelector('#br-name').value||'').trim();
      if (!name) { _App.showToast('Enter a rule name', 'error'); return; }

      var editId = container.querySelector('#br-edit-id').value;
      var rule = {
        id:           editId || _App.Storage.generateId(),
        name:         name,
        type:         _type,
        paycheck:     container.querySelector('#br-paycheck').value || '1',
        amount:       parseFloat(container.querySelector('#br-amount').value) || 0,
        targetAmount: parseFloat(container.querySelector('#br-target').value) || 0,
        targetDate:   container.querySelector('#br-date').value || '',
        vaultId:      container.querySelector('#br-vault').value || '',
        active:       true
      };

      if (_type==='goal' && !rule.targetDate) { _App.showToast('Enter a target date', 'error'); return; }
      if (_type==='goal' && !rule.targetAmount) { _App.showToast('Enter a target amount', 'error'); return; }
      if (_type==='fixed' && !rule.amount) { _App.showToast('Enter an amount', 'error'); return; }

      var ns = _App.Storage.cloneState(_App.getState());
      if (!ns.budgetRules) ns.budgetRules = [];
      if (editId) {
        var idx = ns.budgetRules.findIndex(function(r){return r.id===editId;});
        if (idx !== -1) ns.budgetRules[idx] = rule;
        else ns.budgetRules.push(rule);
      } else {
        ns.budgetRules.push(rule);
      }
      _App.setState(ns);
      _App.showToast((editId ? 'Rule updated' : 'Rule added') + ' ✓', 'success');
      _App.refreshCurrentTab();
    });
  }

})(window.App = window.App || {});

/* ── WEEKLY BUDGET ITEMS (appended module) ───────────────────────
   User-defined recurring per-paycheck line items.
   Renders inside Settings tab. Displayed in Planner tab.
   { id, name, amount, weeklyDay, paycheck: '1'|'2'|'both' }
────────────────────────────────────────────────────────────────── */
(function(_App) {

  var WI = _App.WeeklyItems = {};
  var t   = function(k) { return _App.Lang ? _App.Lang.t(k) : k; };
  var fmt = function(n) { return _App.Storage.formatCurrency(n); };
  var esc = function(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

  WI.render = function(state, container) {
    var items = state.weeklyItems || [];

    var rows = items.map(function(w) {
      var pchLabel = w.paycheck === '1' ? 'Check 1' : w.paycheck === '2' ? 'Check 2' : 'Both';
      var dayLabel = w.weeklyDay ? (w.weeklyDay.charAt(0).toUpperCase() + w.weeklyDay.slice(1)) : '';
      var detail = '<span class="text-xs text-secondary">' + pchLabel + (dayLabel ? ' · ' + dayLabel + 's' : '') + '</span>';
      return '<div class="br-row" data-id="' + esc(w.id) + '">' +
        '<div class="br-row__left">' +
          '<span class="br-row__name text-sm font-bold">' + esc(w.name) + '</span>' +
          detail +
        '</div>' +
        '<div class="br-row__right">' +
          '<span class="br-row__amt text-cyan font-mono">' + fmt(w.amount) + '/check</span>' +
          '<button class="btn btn--secondary btn--sm" data-wi-action="edit" data-id="' + esc(w.id) + '">✏️</button>' +
          '<button class="btn btn--danger btn--sm" data-wi-action="delete" data-id="' + esc(w.id) + '">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    var dayOptions = DAYS.map(function(d) {
      return '<option value="' + d + '">' + d.charAt(0).toUpperCase() + d.slice(1) + 's</option>';
    }).join('');

    container.innerHTML =
      '<div class="section-title mb-8">📅 ' + t('wi.title') + '</div>' +
      '<p class="text-xs text-secondary mb-12">' + t('wi.subtitle') + '</p>' +
      (items.length
        ? '<div id="wi-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">' + rows + '</div>'
        : '<div class="text-secondary text-sm mb-12">' + t('wi.noItems') + '</div>') +

      '<div class="card" style="border:1px solid rgba(100,220,100,.18)">' +
        '<div class="card-title mb-12" id="wi-form-title">' + t('wi.addTitle') + '</div>' +
        '<input type="hidden" id="wi-edit-id" value="">' +

        '<div class="form-group">' +
          '<label class="text-xs text-secondary">' + t('wi.name') + '</label>' +
          '<input id="wi-name" type="text" class="form-control" placeholder="e.g. Car Insurance" />' +
        '</div>' +

        '<div class="form-group">' +
          '<label class="text-xs text-secondary">' + t('wi.amount') + '</label>' +
          '<input id="wi-amount" type="number" min="0" step="0.01" class="form-control" placeholder="0.00" inputmode="decimal" />' +
        '</div>' +

        '<div class="form-group">' +
          '<label class="text-xs text-secondary">' + t('wi.dayLabel') + '</label>' +
          '<select id="wi-day" class="form-control">' +
            '<option value="">' + t('wi.dayNone') + '</option>' +
            dayOptions +
          '</select>' +
        '</div>' +

        '<div class="form-group">' +
          '<label class="text-xs text-secondary">' + t('wi.paycheck') + '</label>' +
          '<select id="wi-paycheck" class="form-control">' +
            '<option value="1">Paycheck 1 (1st of month)</option>' +
            '<option value="2">Paycheck 2 (2nd of month)</option>' +
            '<option value="both">Both paychecks</option>' +
          '</select>' +
        '</div>' +

        '<div style="display:flex;gap:8px;margin-top:4px">' +
          '<button class="btn btn--secondary" id="wi-cancel-btn" style="flex:1;display:none">' + t('wi.cancelBtn') + '</button>' +
          '<button class="btn btn--primary" id="wi-save-btn" style="flex:1;background:rgba(100,220,100,.2);border-color:#6ddc6d;color:#6ddc6d">' + t('wi.saveBtn') + '</button>' +
        '</div>' +
      '</div>';

    wireWeeklyItems(container);
  };

  function wireWeeklyItems(container) {
    function resetForm() {
      container.querySelector('#wi-edit-id').value   = '';
      container.querySelector('#wi-name').value      = '';
      container.querySelector('#wi-amount').value    = '';
      container.querySelector('#wi-day').value       = '';
      container.querySelector('#wi-paycheck').value  = '1';
      container.querySelector('#wi-form-title').textContent = t('wi.addTitle');
      container.querySelector('#wi-cancel-btn').style.display = 'none';
    }

    function loadItem(id) {
      var item = ((_App.getState() || {}).weeklyItems || []).find(function(w) { return w.id === id; });
      if (!item) return;
      container.querySelector('#wi-edit-id').value  = item.id;
      container.querySelector('#wi-name').value     = item.name    || '';
      container.querySelector('#wi-amount').value   = item.amount  || '';
      container.querySelector('#wi-day').value      = item.weeklyDay || '';
      container.querySelector('#wi-paycheck').value = item.paycheck || '1';
      container.querySelector('#wi-form-title').textContent = t('wi.editTitle');
      container.querySelector('#wi-cancel-btn').style.display = '';
    }

    container.addEventListener('click', function(e) {
      var action = (e.target.closest('[data-wi-action]') || {}).dataset;
      if (!action || !action.wiAction) return;

      if (action.wiAction === 'edit') { loadItem(action.id); return; }

      if (action.wiAction === 'delete') {
        if (!confirm(t('wi.confirmDel'))) return;
        var ns = _App.Storage.cloneState(_App.getState());
        ns.weeklyItems = (ns.weeklyItems || []).filter(function(w) { return w.id !== action.id; });
        _App.setState(ns);
        _App.showToast(t('wi.removedOk'), 'success');
        _App.refreshCurrentTab();
        return;
      }
    });

    container.querySelector('#wi-cancel-btn').addEventListener('click', resetForm);

    container.querySelector('#wi-save-btn').addEventListener('click', function() {
      var name   = (container.querySelector('#wi-name').value || '').trim();
      var amount = parseFloat(container.querySelector('#wi-amount').value) || 0;
      if (!name)   { _App.showToast(t('wi.name') + ' required', 'error'); return; }
      if (!amount) { _App.showToast(t('wi.amount') + ' required', 'error'); return; }

      var editId = container.querySelector('#wi-edit-id').value;
      var item = {
        id:        editId || _App.Storage.generateId(),
        name:      name,
        amount:    amount,
        weeklyDay: container.querySelector('#wi-day').value || '',
        paycheck:  container.querySelector('#wi-paycheck').value || '1'
      };

      var ns = _App.Storage.cloneState(_App.getState());
      if (!ns.weeklyItems) ns.weeklyItems = [];
      if (editId) {
        var idx = ns.weeklyItems.findIndex(function(w) { return w.id === editId; });
        if (idx !== -1) ns.weeklyItems[idx] = item;
        else ns.weeklyItems.push(item);
      } else {
        ns.weeklyItems.push(item);
      }
      _App.setState(ns);
      _App.showToast(t('wi.savedOk'), 'success');
      _App.refreshCurrentTab();
    });
  }

})(window.App = window.App || {});
