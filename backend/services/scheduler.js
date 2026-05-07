// Cron scheduler — runs the daily Feed Monitor snapshot at 8h15 Paris over
// every brand × market in FEED_TARGETS. MC feeds are typically refreshed
// overnight; 8h gives them time to settle.

import cron from 'node-cron';
import { runAllSnapshots } from './feedSnapshotService.js';
import { isAuthenticated } from '../auth.js';

let task = null;

export function initScheduler() {
  if (task) return;

  task = cron.schedule('15 8 * * *', async () => {
    if (!isAuthenticated()) {
      console.log('Feed Monitor cron: skipped (not authenticated)');
      return;
    }
    try {
      await runAllSnapshots('auto');
    } catch (e) {
      console.error('Feed Monitor cron error:', e?.message);
    }
  }, { timezone: 'Europe/Paris' });

  console.log('Feed Monitor scheduler initialized — daily run at 08:15 Europe/Paris (all brands × markets)');
}

export function stopScheduler() {
  if (task) { task.stop(); task = null; }
}
