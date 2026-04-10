import { useState, useRef, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { API_URL } from '../utils/api';

// ─── Constants ─────────────────────────────────────────

const BRAND_OPTIONS = [
  { key: 'auto', label: 'Auto-détecté' },
  { key: 'Cocooncenter', label: 'Cocooncenter' },
  { key: 'Pascal Coste Shopping', label: 'Pascal Coste' },
  { key: 'Parapharmacie Lafayette', label: 'Para. Lafayette' },
];

const MARKET_OPTIONS = [
  { key: 'auto', label: 'Auto-détecté' },
  { key: 'FR', label: 'France' },
  { key: 'DE', label: 'Allemagne' },
  { key: 'UK', label: 'Royaume-Uni' },
  { key: 'ES', label: 'Espagne' },
  { key: 'IT', label: 'Italie' },
  { key: 'BE', label: 'Belgique' },
  { key: 'NL', label: 'Pays-Bas' },
  { key: 'AT', label: 'Autriche' },
  { key: 'PT', label: 'Portugal' },
  { key: 'PL', label: 'Pologne' },
  { key: 'SE', label: 'Suède' },
  { key: 'NO', label: 'Norvège' },
  { key: 'FI', label: 'Finlande' },
  { key: 'IE', label: 'Irlande' },
  { key: 'RO', label: 'Roumanie' },
  { key: 'SA', label: 'Arabie Saoudite' },
  { key: 'CA', label: 'Canada' },
  { key: 'AU', label: 'Australie' },
  { key: 'US', label: 'États-Unis' },
];

const SUGGESTED_QUESTIONS = [
  'Quel est le ROAS de la semaine dernière ?',
  'Compare le revenue GA4 vs Google Ads sur la France',
  'Quels sont les 5 marchés les plus rentables ce mois-ci ?',
  "Y'a-t-il un décrochage de trafic récent sur un marché ?",
];

const CHART_COLORS = ['#1B2B4B', '#00B87A', '#F5A623', '#E8524A', '#6366f1', '#06b6d4'];

const STORAGE_KEY = 'assistant_history_v1';
const MAX_HISTORY = 20;

// ─── Persistence ───────────────────────────────────────

function loadHistory() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [];
}

function saveHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  } catch { /* ignore */ }
}

// ─── Sub-components ────────────────────────────────────

function SourceBadge({ source }) {
  if (!source) return null;
  if (source === 'google_ads')
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Google Ads</span>;
  if (source === 'ga4')
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">GA4</span>;
  if (source === 'both')
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Google Ads + GA4</span>;
  return null;
}

function DataTable({ data }) {
  if (!data?.length) return null;
  const columns = Object.keys(data[0]);

  return (
    <div className="mt-3 overflow-x-auto rounded-inner border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-bg-page border-b border-border">
            {columns.map(col => (
              <th key={col} className="px-3 py-2 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.05em] whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
              {columns.map(col => (
                <td key={col} className="px-3 py-2 text-navy whitespace-nowrap">
                  {row[col] != null ? String(row[col]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssistantChart({ chart }) {
  if (!chart || chart.type === 'none' || !chart.series?.length || !chart.x?.length) return null;

  const chartData = chart.x.map((label, i) => {
    const entry = { label };
    chart.series.forEach(s => {
      entry[s.name] = typeof s.data[i] === 'number' ? s.data[i] : 0;
    });
    return entry;
  });

  return (
    <div className="mt-4 h-52">
      <ResponsiveContainer width="100%" height="100%">
        {chart.type === 'line' ? (
          <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF4" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8A9BB0' }} />
            <YAxis tick={{ fontSize: 10, fill: '#8A9BB0' }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {chart.series.map((s, i) => (
              <Line key={s.name} type="monotone" dataKey={s.name}
                stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF4" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8A9BB0' }} />
            <YAxis tick={{ fontSize: 10, fill: '#8A9BB0' }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {chart.series.map((s, i) => (
              <Bar key={s.name} dataKey={s.name}
                fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function DebugAccordion({ source_used, query_debug, explanation, accounts_queried, execution_time_ms }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border border-border rounded-inner overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 text-left text-[11px] text-navy-muted font-medium hover:bg-bg-page flex items-center justify-between"
      >
        <span>Mode debug {execution_time_ms ? `— ${execution_time_ms}ms` : ''}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 bg-bg-page border-t border-border text-[11px]">
          {source_used && (
            <p className="mt-2 text-navy-muted">
              <span className="font-medium text-navy">Source :</span> {source_used}
            </p>
          )}
          {explanation && (
            <p className="text-navy-muted">
              <span className="font-medium text-navy">Explication :</span> {explanation}
            </p>
          )}
          {accounts_queried?.length > 0 && (
            <p className="text-navy-muted">
              <span className="font-medium text-navy">Comptes :</span> {accounts_queried.join(', ')}
            </p>
          )}
          {query_debug && (
            <div>
              <p className="font-medium text-navy mb-1">Requête générée :</p>
              <pre className="text-[10px] text-navy-muted bg-white border border-border rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                {typeof query_debug === 'string' ? query_debug : JSON.stringify(query_debug, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 150, 300].map(delay => (
        <div
          key={delay}
          className="w-2 h-2 bg-navy-muted rounded-full animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ msg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[72%]">
          <p className="text-[10px] text-navy-muted text-right mb-1">Toi — {msg.time}</p>
          <div className="bg-navy text-white rounded-[16px] rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
            {msg.content}
          </div>
        </div>
      </div>
    );
  }

  const { answer, data, chart, source_used, query_debug, explanation, accounts_queried, error, execution_time_ms, isLoading } = msg;

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[88%] w-full">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[10px] text-navy-muted">Assistant — {msg.time}</p>
          {!isLoading && source_used && <SourceBadge source={source_used} />}
        </div>
        <div className="bg-white border border-border rounded-[16px] rounded-tl-sm px-4 py-3 shadow-card">
          {isLoading ? (
            <div className="flex items-center gap-3 py-1">
              <TypingDots />
              <span className="text-xs text-navy-muted">Analyse en cours...</span>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-start gap-1.5 mb-2 p-2 rounded bg-danger-bg border border-danger/20">
                  <svg className="w-3.5 h-3.5 text-danger mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[11px] text-danger">{error}</p>
                </div>
              )}
              <p className="text-sm text-navy leading-relaxed whitespace-pre-line">{answer}</p>
              {data?.length > 0 && <DataTable data={data} />}
              {chart?.type !== 'none' && <AssistantChart chart={chart} />}
              {(query_debug || explanation || source_used) && (
                <DebugAccordion
                  source_used={source_used}
                  query_debug={query_debug}
                  explanation={explanation}
                  accounts_queried={accounts_queried}
                  execution_time_ms={execution_time_ms}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────

export default function AssistantView() {
  const [messages, setMessages] = useState(loadHistory);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [brand, setBrand] = useState('auto');
  const [market, setMarket] = useState('auto');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    saveHistory(messages.filter(m => !m.isLoading));
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendQuestion(question) {
    if (!question.trim() || isLoading) return;

    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const userMsg = { role: 'user', content: question, time };
    const loadingMsg = { role: 'assistant', isLoading: true, time };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setIsLoading(true);

    const context = {};
    if (brand !== 'auto') context.brand = brand;
    if (market !== 'auto') context.market = market;

    try {
      const res = await fetch(`${API_URL}/api/assistant/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', time, ...data }]);
    } catch (err) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        {
          role: 'assistant',
          time,
          answer: 'Erreur de connexion au serveur. Vérifie que le backend est démarré.',
          data: [],
          chart: { type: 'none', x: [], series: [] },
          error: err.message,
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendQuestion(input);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(input);
    }
  }

  function clearHistory() {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 130px)' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-navy">Assistant Data</h2>
          <p className="text-xs text-navy-muted mt-0.5">
            Pose tes questions en français — Google Ads &amp; GA4
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-xs text-navy-muted hover:text-danger px-3 py-1.5 rounded-inner border border-border hover:border-danger transition-colors"
          >
            Effacer l'historique
          </button>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto bg-bg-page rounded-card border border-border p-4 mb-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 bg-navy/8 rounded-full flex items-center justify-center mb-5 border border-border">
              <svg className="w-7 h-7 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-navy mb-1">Essaie par exemple :</p>
            <p className="text-xs text-navy-muted mb-4">Clique sur une suggestion ou tape ta propre question</p>
            <div className="space-y-2 w-full max-w-lg">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendQuestion(q)}
                  className="w-full text-left px-4 py-3 rounded-inner bg-white border border-border text-xs text-navy hover:border-navy hover:shadow-card transition-all shadow-card"
                >
                  "{q}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="bg-white rounded-card border border-border shadow-card p-3 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2.5">
          <select
            value={brand}
            onChange={e => setBrand(e.target.value)}
            className="bg-bg-page border border-border rounded-inner px-2.5 py-1.5 text-xs text-navy focus:border-navy outline-none"
          >
            {BRAND_OPTIONS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <select
            value={market}
            onChange={e => setMarket(e.target.value)}
            className="bg-bg-page border border-border rounded-inner px-2.5 py-1.5 text-xs text-navy focus:border-navy outline-none"
          >
            {MARKET_OPTIONS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <span className="text-[10px] text-navy-muted italic">
            Optionnel — Gemini surpasse ces filtres si la question est explicite
          </span>
        </div>
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pose ta question en français... (Entrée pour envoyer, Shift+Entrée pour nouvelle ligne)"
            rows={2}
            className="flex-1 bg-bg-page border border-border rounded-inner px-3 py-2 text-sm text-navy placeholder:text-navy-muted focus:border-navy outline-none resize-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 bg-navy text-white text-sm font-medium rounded-inner hover:bg-navy-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            {isLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
            Envoyer
          </button>
        </form>
      </div>
    </div>
  );
}
