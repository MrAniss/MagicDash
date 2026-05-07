import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_PATH = path.join(__dirname, 'users.json');

const JWT_EXPIRES_IN = '7d';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET missing or too short in .env (need >=16 chars)');
  }
  return secret;
}

function loadUsers() {
  try {
    if (fs.existsSync(USERS_PATH)) {
      return JSON.parse(fs.readFileSync(USERS_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to read users.json:', err.message);
  }
  return [];
}

function findUser(email) {
  const users = loadUsers();
  const normalized = String(email || '').trim().toLowerCase();
  return users.find(u => u.email.toLowerCase() === normalized) || null;
}

export function userAuthRouter(app) {
  app.post('/auth/user-login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe requis' });
      }

      const user = findUser(email);
      if (!user) {
        return res.status(401).json({ error: 'Identifiants invalides' });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'Identifiants invalides' });
      }

      const token = jwt.sign(
        { sub: user.email, name: user.name || user.email },
        getJwtSecret(),
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.json({
        token,
        user: { email: user.email, name: user.name || user.email },
      });
    } catch (err) {
      console.error('user-login error:', err.message);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  app.get('/auth/user-me', requireUser, (req, res) => {
    res.json({ user: req.user });
  });
}

export function requireUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'NOT_AUTHENTICATED' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = { email: payload.sub, name: payload.name };
    next();
  } catch {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}
