/* ══════════════════════════════════════════════════════════════
   APP.JS — Router & Bootstrap
   Boots the app: loads state, wires tab nav, routes to renderers.
   Must load last (after storage.js, setup.js).

   Public API (used by other modules):
     App.getState()          → current state object (read-only ref)
     App.setState(newState)  → save + persist new state
     App.showToast(msg,type) → bottom toast notification
     App.showTab(name)       → switch to a named tab
     App.refreshCurrentTab() → re-render the active tab in place
══════════════════════════════════════════════════════════════ */

(function (App) {
  'use strict';

  // ── In-memory state ───────────────────────────────────────
  // Single source of truth. All modules read via App.getState().
  // All writes go through App.setState() so every save persists.
  let _state = null;
  let _activeTab = 'setup';

  // ── Tab registry ──────────────────────────────────────────
  // Each entry maps a tab name to a render function.
  // render() receives (state, containerElement).
  // Phase 2 and 3 slots use renderStub() until those files ship.
  const TABS = {
    setup: () => {
      App.Setup.render(_state, el('tab-setup'));
    },
    planner: () => {
      if (App.Paychecks) {
        App.Paychecks.render(_state, el('tab-planner'));
      } else {
        renderStub('tab-planner', 'Paycheck Planner', 'Phase 2',
          'Set up your income and categories in Setup first, then come back here.');
      }
    },
    tracker: () => {
      if (App.Tracker) {
        App.Tracker.render(_state, el('tab-tracker'));
      } else {
        renderStub('tab-tracker', 'Paycheck Tracker', 'Phase 2',
          'Tracks all 26 pay periods, planned vs actual.');
      }
    },
    entry: () => {
      if (App.Entry) {
        App.Entry.render(_state, el('tab-entry'));
      } else {
        renderStub('tab-entry', 'Data Entry', 'Phase 2',
          'Log transactions here. They cascade to every other tab.');
      }
    },
    accounts: () => {
      if (App.Accounts) {
        App.Accounts.render(_state, el('tab-accounts'));
      } else {
        renderStub('tab-accounts', 'Accounts', 'Phase 2',
          'Vaults, bank accounts, and credit cards with the safety-net warning.');
      }
    },
    investments: () => {
      if (App.Investments) {
        App.Investments.render(_state, el('tab-investments'));
      } else {
        renderStub('tab-investments', 'Investments', 'Phase 3',
          'Track your Roth IRA holdings and YTD contributions.');
      }
    },
    dashboard: () => {
      if (App.Dashboard) {
        App.Dashboard.render(_state, el('tab-dashboard'));
      } else {
        renderStub('tab-dashboard', 'Dashboard', 'Phase 3',
          'Net worth tracker and 12-month charts.');
      }
    },
    settings: () => {
      App.Setup.renderSettings(_state, el('tab-settings'));
    }
  };

  // ── Stub renderer ─────────────────────────────────────────
  // Shown for tabs that aren't built yet.
  function renderStub(id, title, phase, detail) {
    el(id).innerHTML = `
      <div class="stub-container">
        <div class="stub-icon">🚧</div>
        <h2>${title}</h2>
        <p>${detail || ''}</p>
        <p class="text-dim text-xs" style="margin-top:8px;">Coming in ${phase}</p>
      </div>
    `;
  }

  // ── Tab switching ─────────────────────────────────────────
  function showTab(name) {
    if (!TABS[name]) {
      console.warn('[App] Unknown tab:', name);
      return;
    }

    // Update nav button states
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const isActive = btn.dataset.tab === name;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Show the right pane, hide others
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${name}`);
    });

    _activeTab = name;

    // Render the tab content
    try {
      TABS[name]();
    } catch (err) {
      console.error(`[App] Error rendering tab "${name}":`, err);
      el(`tab-${name}`).innerHTML = `
        <div class="stub-container">
          <div class="stub-icon">⚠️</div>
          <h2>Render Error</h2>
          <p class="text-red">${err.message}</p>
          <p class="text-dim text-xs">Check the console for details.</p>
        </div>
      `;
    }

    // Remember last active tab across page reloads
    try { localStorage.setItem('financeApp_activeTab', name); } catch (_) {}

    // Scroll pane to top
    const pane = el(`tab-${name}`);
    if (pane) pane.scrollTop = 0;
  }

  // ── Toast ─────────────────────────────────────────────────
  // type: 'success' | 'error' | 'info'
  let _toastTimer = null;
  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    // Clear any pending hide
    if (_toastTimer) clearTimeout(_toastTimer);

    toast.textContent = message;
    toast.className   = `toast toast--${type} toast--visible`;

    _toastTimer = setTimeout(() => {
      toast.classList.remove('toast--visible');
    }, 3000);
  }

  // ── Public state API ──────────────────────────────────────
  // Modules must NOT mutate _state directly. Always call setState()
  // so the data is persisted to localStorage on every change.
  App.getState = () => _state;

  App.setState = (newState) => {
    _state = newState;
    App.Storage.saveState(_state);
  };

  App.showToast        = showToast;
  App.showTab          = showTab;
  App.refreshCurrentTab = () => showTab(_activeTab);

  // ── Helpers ───────────────────────────────────────────────
  function el(id) {
    return document.getElementById(id);
  }

  // ── Bootstrap ─────────────────────────────────────────────
  function initApp() {
    // 1. Load persisted state (or defaults on first launch)
    _state = App.Storage.loadState();

    // 2. Wire tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });

    // 3. Restore last viewed tab, defaulting to setup
    const lastTab = (() => {
      try { return localStorage.getItem('financeApp_activeTab') || 'setup'; }
      catch (_) { return 'setup'; }
    })();

    showTab(lastTab);

    // 4. Register service worker for PWA/offline (Phase 3 will add sw.js)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {
        // sw.js doesn't exist yet in Phase 1 — that's fine, silently skip
      });
    }

    console.log('[App] Finance Tracker v1.0 — Phase 1 loaded.');
    console.log('[App] State:', _state);
  }

  // Boot when DOM is ready
  document.addEventListener('DOMContentLoaded', initApp);

})(window.App = window.App || {});
