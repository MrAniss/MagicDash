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
    <div className="min-h-screen flex items-center justify-center bg-bg-page px-4">
      <div className="w-full max-w-sm bg-white border border-border rounded-card shadow-card p-8">
        <div className="flex flex-col items-center mb-6">
          <img
            src="https://hygie31.com/wp-content/uploads/2024/07/dhygietal-LOGOTYPE-fond-blanc-1024x422.png"
            alt="Dhygietal"
            style={{ height: '40px', width: 'auto' }}
          />
          <span className="mt-2 text-navy-muted text-sm">Acquisition Dashboard</span>
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
              className="w-full bg-bg-page text-navy text-sm px-3 py-2 rounded-inner border border-border focus:border-navy outline-none"
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
              className="w-full bg-bg-page text-navy text-sm px-3 py-2 rounded-inner border border-border focus:border-navy outline-none"
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
            className="w-full bg-navy text-white text-sm font-medium px-4 py-2 rounded-inner hover:bg-navy-light disabled:opacity-60 transition-colors"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
