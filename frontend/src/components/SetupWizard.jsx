import { useState } from 'react';
import { API_URL } from '../utils/api';

const SOURCE_OPTIONS = [
  { key: 'googleAds',     label: 'Google Ads',         note: 'Search, PMax, Shopping, Display' },
  { key: 'bingAds',       label: 'Microsoft Ads',      note: 'Bing search & shopping (à venir)' , disabled: true },
  { key: 'meta',          label: 'Meta Ads',           note: 'Facebook & Instagram' },
  { key: 'tiktok',        label: 'TikTok Ads',         note: 'À venir', disabled: true },
  { key: 'ga4',           label: 'Google Analytics 4', note: 'Sessions, conversions, funnel' },
  { key: 'merchantCenter',label: 'Merchant Center',    note: 'Catalogue produit, scoring shopping' },
  { key: 'feedMonitor',   label: 'Feed Monitor',       note: 'Snapshots quotidiens du flux MC' },
];

function StepShell({ title, subtitle, children }) {
  return (
    <div className="w-full max-w-xl">
      <h2 className="text-2xl font-bold text-navy mb-1">{title}</h2>
      {subtitle && <p className="text-sm text-navy-muted mb-6">{subtitle}</p>}
      {children}
    </div>
  );
}

function PathChoice({ onPick }) {
  return (
    <StepShell
      title="Bienvenue sur MagicDash"
      subtitle="Premier lancement détecté. Choisissez votre mode."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => onPick('demo')}
          className="group relative overflow-hidden rounded-card border border-border bg-white p-6 text-left shadow-card hover:shadow-magic transition"
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition bg-magic-gradient" />
          <div className="relative">
            <div className="text-3xl mb-3">✨</div>
            <h3 className="font-bold text-navy text-lg mb-1">Mode Démo</h3>
            <p className="text-sm text-navy-muted">
              Données synthétiques pré-générées. Rien à configurer. Idéal pour explorer ou présenter MagicDash.
            </p>
            <div className="mt-4 inline-flex items-center text-xs font-semibold text-magic-violet">
              Démarrer en démo →
            </div>
          </div>
        </button>

        <button
          onClick={() => onPick('real')}
          className="group relative overflow-hidden rounded-card border border-border bg-white p-6 text-left shadow-card hover:shadow-magic transition"
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition bg-magic-gradient" />
          <div className="relative">
            <div className="text-3xl mb-3">🔧</div>
            <h3 className="font-bold text-navy text-lg mb-1">Connecter mes données</h3>
            <p className="text-sm text-navy-muted">
              Connecte tes vrais comptes Google&nbsp;Ads, GA4, Meta, Merchant Center.
            </p>
            <div className="mt-4 inline-flex items-center text-xs font-semibold text-magic-violet">
              Configurer →
            </div>
          </div>
        </button>
      </div>
    </StepShell>
  );
}

function DemoStep({ onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/setup/init-demo`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Activation échouée');
      setResult(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <StepShell
        title="Démo prête ✨"
        subtitle="MagicDash tourne avec des données synthétiques."
      >
        <div className="rounded-card border border-border bg-bg-card2 p-6 mb-6">
          <p className="text-sm text-navy mb-3">Identifiants de connexion :</p>
          <div className="font-mono text-sm bg-white border border-border rounded-inner p-3 mb-2">
            <div><span className="text-navy-muted">email&nbsp;&nbsp;&nbsp;:</span> {result.adminEmail}</div>
            <div><span className="text-navy-muted">password:</span> {result.adminPassword}</div>
          </div>
          <p className="text-xs text-navy-muted">
            Tu peux changer ces identifiants plus tard via <code className="bg-bg-page px-1 rounded">node backend/scripts/addUser.js</code>
          </p>
        </div>
        <button
          onClick={onDone}
          className="w-full bg-magic-gradient text-white text-sm font-semibold px-4 py-3 rounded-inner hover:opacity-95 transition shadow-magic"
        >
          Continuer vers le dashboard
        </button>
      </StepShell>
    );
  }

  return (
    <StepShell
      title="Activer le mode démo"
      subtitle="MagicDash va générer un environnement complet avec données synthétiques."
    >
      <ul className="space-y-2 text-sm text-navy mb-6">
        <li>✅ 4 marques démo (Acme Beauty, Acme Health, Acme Pharma, Acme Wellness)</li>
        <li>✅ 5 marchés (FR, UK, DE, IT, ES)</li>
        <li>✅ 2 ans d'historique avec saisonnalité réaliste</li>
        <li>✅ Toutes les vues fonctionnelles (Paid Search, Social, Analytics, Shopping)</li>
        <li>✅ Compte admin créé automatiquement</li>
      </ul>

      {error && (
        <div className="text-sm text-danger bg-danger-bg border border-danger rounded-inner px-4 py-2 mb-4">
          {error}
        </div>
      )}

      <button
        onClick={activate}
        disabled={busy}
        className="w-full bg-magic-gradient text-white text-sm font-semibold px-4 py-3 rounded-inner hover:opacity-95 disabled:opacity-60 transition shadow-magic"
      >
        {busy ? 'Activation…' : 'Activer le mode démo'}
      </button>
    </StepShell>
  );
}

function RealStep({ onBack }) {
  const [sources, setSources] = useState({ googleAds: true, ga4: true, meta: false, merchantCenter: false, feedMonitor: false });
  const [submitted, setSubmitted] = useState(false);

  function toggle(key) {
    setSources(s => ({ ...s, [key]: !s[key] }));
  }

  if (submitted) {
    return (
      <StepShell
        title="Configuration manuelle requise"
        subtitle="MagicDash 1.0 — la configuration OAuth automatique arrive bientôt."
      >
        <div className="rounded-card border border-border bg-bg-card2 p-6 mb-6 text-sm">
          <p className="text-navy font-semibold mb-2">Pour connecter tes vraies données :</p>
          <ol className="space-y-2 text-navy-muted list-decimal list-inside">
            <li>Édite <code className="bg-white px-1 rounded text-navy">backend/.env</code> (modèle dans <code className="bg-white px-1 rounded text-navy">backend/.env.example</code>)</li>
            <li>Renseigne <code className="bg-white px-1 rounded text-navy">JWT_SECRET</code> + tes credentials Google/Meta</li>
            <li>Crée un user admin&nbsp;: <code className="bg-white px-1 rounded text-navy">node backend/scripts/addUser.js admin@example.com motdepasse</code></li>
            <li>Relance MagicDash et connecte-toi via le bouton OAuth Google dans le header</li>
          </ol>
        </div>
        <p className="text-xs text-navy-muted mb-4">
          Sources sélectionnées (mémorisées dans la prochaine version) :{' '}
          {Object.entries(sources).filter(([, v]) => v).map(([k]) => k).join(', ') || 'aucune'}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 bg-white border border-border-strong text-navy text-sm font-medium px-4 py-2.5 rounded-inner hover:bg-bg-page transition"
          >
            ← Retour
          </button>
          <a
            href="/README.md"
            className="flex-1 text-center bg-magic-gradient text-white text-sm font-semibold px-4 py-2.5 rounded-inner hover:opacity-95 transition"
          >
            Voir la doc
          </a>
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell
      title="Quelles données veux-tu connecter ?"
      subtitle="Tu pourras en ajouter ou en retirer plus tard."
    >
      <div className="space-y-2 mb-6">
        {SOURCE_OPTIONS.map(opt => (
          <label
            key={opt.key}
            className={`flex items-center gap-3 p-3 rounded-inner border transition cursor-pointer ${
              opt.disabled
                ? 'border-border bg-bg-page text-navy-muted cursor-not-allowed opacity-60'
                : sources[opt.key]
                  ? 'border-magic-violet bg-bg-card2'
                  : 'border-border bg-white hover:border-magic-violet/40'
            }`}
          >
            <input
              type="checkbox"
              checked={!!sources[opt.key]}
              disabled={opt.disabled}
              onChange={() => !opt.disabled && toggle(opt.key)}
              className="h-4 w-4 accent-magic-violet"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-navy">{opt.label}</div>
              <div className="text-xs text-navy-muted">{opt.note}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 bg-white border border-border-strong text-navy text-sm font-medium px-4 py-2.5 rounded-inner hover:bg-bg-page transition"
        >
          ← Retour
        </button>
        <button
          onClick={() => setSubmitted(true)}
          className="flex-1 bg-magic-gradient text-white text-sm font-semibold px-4 py-2.5 rounded-inner hover:opacity-95 transition shadow-magic"
        >
          Continuer
        </button>
      </div>
    </StepShell>
  );
}

export default function SetupWizard({ onComplete }) {
  const [path, setPath] = useState(null); // null | 'demo' | 'real'

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-bg-page">
      {/* Decorative gradient blobs (same as login) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, #7C3AED 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, #EC4899 0%, transparent 70%)' }}
      />

      <div className="relative w-full max-w-3xl bg-white/95 backdrop-blur border border-border rounded-card shadow-magic p-8 md:p-10">
        <div className="flex items-center justify-center mb-8">
          <img
            src="/magicdash-logo.svg"
            alt="MagicDash"
            style={{ height: '44px', width: 'auto' }}
          />
        </div>

        <div className="flex justify-center">
          {path === null && <PathChoice onPick={setPath} />}
          {path === 'demo' && <DemoStep onDone={onComplete} />}
          {path === 'real' && <RealStep onBack={() => setPath(null)} />}
        </div>
      </div>
    </div>
  );
}
