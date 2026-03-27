import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = path.join(__dirname, 'tokens.json');
const SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/content',
];
const REDIRECT_URI = 'http://localhost:3001/auth/callback';

let oauth2Client = null;

export function getOAuth2Client() {
  if (!oauth2Client) {
    oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      REDIRECT_URI
    );

    const tokens = loadTokens();
    if (tokens) {
      oauth2Client.setCredentials(tokens);
    }

    oauth2Client.on('tokens', (newTokens) => {
      const existing = loadTokens() || {};
      const merged = { ...existing, ...newTokens };
      saveTokens(merged);
      oauth2Client.setCredentials(merged);
    });
  }
  return oauth2Client;
}

export function isAuthenticated() {
  const tokens = loadTokens();
  return !!(tokens && tokens.access_token);
}

export function getAuthUrl() {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function handleCallback(code) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  saveTokens(tokens);
  return tokens;
}

export async function getValidAccessToken() {
  const client = getOAuth2Client();
  const tokens = loadTokens();
  if (!tokens || !tokens.access_token) {
    throw new Error('NOT_AUTHENTICATED');
  }

  client.setCredentials(tokens);

  // Force refresh if token is expired or about to expire
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60_000) {
    const { credentials } = await client.refreshAccessToken();
    saveTokens(credentials);
    return credentials.access_token;
  }

  return tokens.access_token;
}

function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_PATH)) {
      return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return null;
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

export function authRouter(app) {
  app.get('/auth/login', (_req, res) => {
    const url = getAuthUrl();
    res.redirect(url);
  });

  app.get('/auth/callback', async (req, res) => {
    try {
      const { code } = req.query;
      if (!code) return res.status(400).json({ error: 'Missing code parameter' });
      await handleCallback(code);
      res.redirect('http://localhost:5173?auth=success');
    } catch (err) {
      console.error('OAuth callback error:', err);
      res.redirect('http://localhost:5173?auth=error');
    }
  });

  app.get('/auth/status', (_req, res) => {
    res.json({ authenticated: isAuthenticated() });
  });

  app.post('/auth/logout', (_req, res) => {
    try {
      if (fs.existsSync(TOKENS_PATH)) fs.unlinkSync(TOKENS_PATH);
      oauth2Client = null;
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
