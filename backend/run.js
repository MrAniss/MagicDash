// Wrapper that runs server.js and auto-restarts it on exit code 42 (used by /api/system/reboot).
// Any other exit code propagates and stops the wrapper.
//
// Use this entry point in production-style launchers (e.g. start_dashboard.vbs)
// where there's no `node --watch` or nodemon to handle restarts.
//
//   node run.js   ← instead of `node server.js`

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESTART_EXIT_CODE = 42;

function start() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (code === RESTART_EXIT_CODE) {
      console.log('[run.js] Restarting server...');
      setTimeout(start, 300);
    } else {
      console.log(`[run.js] Server exited (code=${code}, signal=${signal}). Stopping wrapper.`);
      process.exit(code ?? 0);
    }
  });

  // Forward termination signals so Ctrl+C cleanly kills the child.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => child.kill(sig));
  }
}

start();
