/**
 * Ajout / mise à jour d'un user dans backend/users.json
 *
 * Usage :
 *   node scripts/addUser.js <email> <password> [nom]
 *
 * Exemple :
 *   node scripts/addUser.js a.belmouaz@dhygietal.com "monMdpSecret" "Abel"
 *
 * Le mot de passe est hashé avec bcrypt avant d'être stocké.
 * users.json est gitignored — ne pas committer.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_PATH = path.join(__dirname, '..', 'users.json');

async function main() {
  const [, , email, password, name] = process.argv;

  if (!email || !password) {
    console.error('Usage: node scripts/addUser.js <email> <password> [name]');
    process.exit(1);
  }

  const users = fs.existsSync(USERS_PATH)
    ? JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'))
    : [];

  const passwordHash = await bcrypt.hash(password, 10);
  const normalized = email.trim().toLowerCase();

  const idx = users.findIndex(u => u.email.toLowerCase() === normalized);
  const entry = { email: normalized, name: name || normalized, passwordHash };

  if (idx >= 0) {
    users[idx] = entry;
    console.log(`✓ User mis à jour : ${normalized}`);
  } else {
    users.push(entry);
    console.log(`✓ User ajouté : ${normalized}`);
  }

  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
  console.log(`  → ${USERS_PATH}`);
}

main().catch(err => {
  console.error('Erreur:', err.message);
  process.exit(1);
});
