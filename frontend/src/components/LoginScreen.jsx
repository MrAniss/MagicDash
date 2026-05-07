import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-bg-page">
      {/* Decorative gradient blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #7C3AED 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #EC4899 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-72 w-72 rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, #06B6D4 0%, transparent 70%)' }}
      />

      <div className="relative w-full max-w-md bg-white/95 backdrop-blur border border-border rounded-card shadow-magic p-8">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/magicdash-logo.svg"
            alt="MagicDash"
            style={{ height: '48px', width: 'auto' }}
          />
          <span className="mt-3 text-navy-muted text-sm">Acquisition performance, plug & play.</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-navy-muted mb-1" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-bg-page text-navy text-sm px-3 py-2.5 rounded-inner border border-border focus:border-magic-violet focus:ring-2 focus:ring-magic-violet/20 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-navy-muted mb-1" htmlFor="password">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-bg-page text-navy text-sm px-3 py-2.5 rounded-inner border border-border focus:border-magic-violet focus:ring-2 focus:ring-magic-violet/20 outline-none transition"
            />
          </div>

          {error && (
            <div className="text-xs text-danger bg-danger-bg border border-danger rounded-inner px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-magic-gradient text-white text-sm font-semibold px-4 py-2.5 rounded-inner hover:opacity-95 disabled:opacity-60 transition shadow-magic"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-navy-muted">
          Made with <span className="text-magic-fuchsia">♥</span> · MagicDash
        </p>
      </div>
    </div>
  );
}
