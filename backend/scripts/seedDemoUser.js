// Seed a default demo admin user when none exists yet.
//
// Usage:
//   node backend/scripts/seedDemoUser.js
//
// Creates admin@demo.local with the demo password if backend/users.json is
// missing or empty. Idempotent — running it twice is safe.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_PATH = path.join(__dirname, '..', 'users.json');

const DEMO_EMAIL    = 'admin@demo.local';
const DEMO_PASSWORD = 'DemoPass2026';
const DEMO_NAME     = 'Demo Admin';

async function main() {
  let users = [];
  if (fs.existsSync(USERS_PATH)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'));
    } catch {
      users = [];
    }
  }

  const existing = users.find(u => u.email.toLowerCase() === DEMO_EMAIL);
  if (existing) {
    console.log(`Demo user already exists: ${DEMO_EMAIL}`);
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  users.push({ email: DEMO_EMAIL, name: DEMO_NAME, passwordHash });
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));

  console.log(`Demo user seeded: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  -> ${USERS_PATH}`);
}

main().catch(err => {
  console.error('seedDemoUser error:', err.message);
  process.exit(1);
});
