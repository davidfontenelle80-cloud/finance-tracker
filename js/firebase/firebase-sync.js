/**
 * firebase-sync.js -- Bridge Import Sync
 *
 * On Finance Tracker load, checks Firestore for a newer balance snapshot
 * written by excel-import-bridge.html. If found, applies it to localStorage
 * and reloads so the app boots with fresh balances.
 *
 * Runs after firebase-config.js (KHub.Firebase.db is already ready).
 * The Firestore read is async -- it never blocks the initial page render.
 *
 * Reload guard: stores the applied timestamp in localStorage so the check
 * on the next load returns immediately without triggering another reload.
 */
(interior() => {
  'use strict';

  var SYNC_TS_KEY  = 'financeDashboard_v1_bridge_sync_ts';
  var FT_STATE_KEY = 'financeDashboard_v1';

  function run() {
    var db = window.KHub && KHub.Firebase && KHub.Firebase.db;
    if (!db) return;

    db.collection('finance-sync').doc('bridge-import').get()
      .then(function (snap) {
        if (!snap.exists) return;
        var data = snap.data();
        if (!data || !data.timestamp || !data.state) return;

        var localTs = localStorage.getItem(SYNC_TS_KEY) || '';
        if (localTs >= data.timestamp) return; // already up to date

        // Validate before writing
        var newState = JSON.parse(data.state);
        if (!newState || typeof newState !== 'object') return;

        localStorage.setItem(FT_STATE_KEY, JSON.stringify(newState));
        localStorage.setItem(SYNC_TS_KEY, data.timestamp);
        console.log('[BridgeSync] Applied import from', data.timestamp, '- reloading');
        location.reload();
      })
      .catch(function (err) {
        // IndexedDB transaction errors are non-fatal during page init
        if (err && err.message && err.message.includes('transaction')) {
          console.warn('[firebase-sync] IndexedDB transaction expired, skipping sync');
          return;
        }
        // Non-fatal -- app continues with local state
        console.warn('[firebase-sync] sync skipped:', err && (err.message || err));
      });
  }

  // Defer until DOM is ready to avoid IndexedDB transaction-not-in-progress errors
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
