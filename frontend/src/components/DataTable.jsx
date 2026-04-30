import { useState } from 'react';
import { downloadCsv, copyTsv } from '../utils/exportTable';
import ExportButtons from './ExportButtons';

// Shared visual styles for the dashboard's main tables.
// Use this for any "card + sticky header + sortable + zebra + navy hover" table.
//
// Column shape:
//   { key, label, align: 'left'|'right', format?, isDelta?, invert?, colorCode?, render?(row, formatted) }
//
// Props:
//   title             — section header (string or node)
//   data              — array of row objects
//   columns           — column definitions (above)
//   isLoading         — show skeleton when true
//   defaultSort       — column key to sort by initially
//   defaultSortDir    — 'asc' | 'desc' (default 'desc')
//   exportFilename    — if provided, render ExportButtons next to the title
//   toolbarExtra      — additional node rendered to the right of ExportButtons
//   rowKey            — fn(row, i) => key (default: index)
//   maxHeight         — scroll container max height (default '480px')
//   emptyLabel        — text shown when data is empty (default "Aucune donnée")
function defaultRoasColor(roas) {
  if (roas >= 4.0) return 'text-success';
  if (roas >= 2.5) return 'text-warning';
  return 'text-danger';
}

function deltaColor(value) {
  if (value > 0) return 'text-success';
  if (value < 0) return 'text-danger';
  return 'text-navy-muted';
}

function Skeleton() {
  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="skeleton h-4 w-40 mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton h-8 w-full mb-2" />
      ))}
    </div>
  );
}

export default function DataTable({
  title,
  data,
  columns,
  isLoading,
  defaultSort,
  defaultSortDir = 'desc',
  exportFilename,
  toolbarExtra,
  rowKey,
  maxHeight = '480px',
  emptyLabel = 'Aucune donnée',
  roasColor = defaultRoasColor,
}) {
  const [sortCol, setSortCol] = useState(defaultSort ?? null);
  const [sortDir, setSortDir] = useState(defaultSortDir);
  const [copied, setCopied] = useState(false);

  if (isLoading || !data) return <Skeleton />;

  function handleSort(col) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  const sorted = !sortCol
    ? data
    : [...data].sort((a, b) => {
        const va = a[sortCol] ?? 0;
        const vb = b[sortCol] ?? 0;
        if (typeof va === 'string')
          return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortDir === 'asc' ? va - vb : vb - va;
      });

  const showToolbar = exportFilename || toolbarExtra || title;

  return (
    <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
      {showToolbar && (
        <div className="px-6 py-5 pb-3 flex items-center justify-between gap-3">
          {title && <h3 className="text-lg font-semibold text-navy">{title}</h3>}
          <div className="flex items-center gap-2 ml-auto">
            {exportFilename && (
              <ExportButtons
                onCsv={() => downloadCsv(columns, sorted, exportFilename)}
                onSheets={async () => {
                  await copyTsv(columns, sorted);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                copied={copied}
              />
            )}
            {toolbarExtra}
          </div>
        </div>
      )}
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-bg-page border-b-2 border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-3 py-3 text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] cursor-pointer hover:text-navy transition-colors select-none whitespace-nowrap bg-bg-page ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {col.label}
                  {sortCol === col.key && (
                    <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row, i) : i}
                className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${i % 2 === 1 ? 'bg-bg-zebra' : ''}`}
              >
                {columns.map((col) => {
                  const val = row[col.key];
                  const formatted = col.format ? col.format(val) : val;
                  let cls = `px-3 py-3 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`;
                  if (col.colorCode)
                    cls += ' font-medium ' + roasColor(val) + ' group-hover:text-white';
                  else if (col.isDelta)
                    cls +=
                      ' text-xs font-medium ' +
                      (col.invert ? deltaColor(-val) : deltaColor(val)) +
                      ' group-hover:text-white';
                  else if (col.bold) cls += ' font-medium text-navy group-hover:text-white';
                  else cls += ' text-navy group-hover:text-white';
                  return (
                    <td key={col.key} className={cls}>
                      {col.render ? col.render(row, formatted) : formatted}
                    </td>
                  );
                })}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-navy-muted">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
