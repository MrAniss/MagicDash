/**
 * Shared Export buttons for CSV download and TSV copy (for Google Sheets)
 */
export default function ExportButtons({ onCsv, onSheets, copied }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onCsv}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-inner bg-bg-page text-navy-muted hover:text-navy hover:bg-border transition-colors"
        title="Télécharger en CSV (Excel)"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <path d="M8 11L3 6h3V1h4v5h3L8 11z" fill="currentColor" />
          <path d="M1 13h14v2H1v-2z" fill="currentColor" />
        </svg>
        CSV
      </button>
      <button
        onClick={onSheets}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-inner bg-bg-page text-navy-muted hover:text-navy hover:bg-border transition-colors"
        title="Copier pour Google Sheets (Ctrl+V dans une cellule)"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <rect
            x="1"
            y="1"
            width="14"
            height="14"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
          <path d="M1 5h14M1 9h14M1 13h14M5 1v14M11 1v14" stroke="currentColor" strokeWidth="1" />
        </svg>
        {copied ? 'Copié !' : 'Sheets'}
      </button>
    </div>
  );
}
