// PM2 process configuration for the SEA Dashboard backend.
// Usage:
//   npm run pm:start     — start (or reload if already running)
//   npm run pm:logs      — tail combined stdout/stderr
//   npm run pm:status    — list all PM2-managed processes
//   npm run pm:restart   — restart the backend
//   npm run pm:stop      — stop the backend (process stays known to PM2)
//   npm run pm:delete    — fully remove from PM2
//
// Logs are written to backend/logs/. The dashboard's "reboot" endpoint
// (process.exit(42)) triggers PM2 auto-restart, same as before.

const path = require('path');

module.exports = {
  apps: [
    {
      name:        'sea-dashboard-backend',
      script:      'server.js',
      cwd:         path.join(__dirname, 'backend'),
      instances:   1,
      exec_mode:   'fork',
      autorestart: true,
      watch:       false,
      max_memory_restart: '1G',
      kill_timeout: 5000,

      env: {
        NODE_ENV: 'production',
      },

      out_file:        path.join(__dirname, 'backend', 'logs', 'out.log'),
      error_file:      path.join(__dirname, 'backend', 'logs', 'err.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:      true,
      time:            true,

      min_uptime:   '5s',
      max_restarts: 10,
    },
    {
      name:        'sea-dashboard-frontend',
      script:      'node_modules/vite/bin/vite.js',
      args:        '--host',
      cwd:         path.join(__dirname, 'frontend'),
      instances:   1,
      exec_mode:   'fork',
      autorestart: true,
      watch:       false,
      max_memory_restart: '512M',
      kill_timeout: 5000,

      out_file:        path.join(__dirname, 'frontend', 'logs', 'out.log'),
      error_file:      path.join(__dirname, 'frontend', 'logs', 'err.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:      true,
      time:            true,

      min_uptime:   '5s',
      max_restarts: 10,
    },
  ],
};
