import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ExportButtons from './ExportButtons';

export default function DrilldownTable({
  data,
  columns,
  drilldownQueryFn,
  drilldownColumns,
  drilldownKey,
  isLoading,
  maxHeight = '600px',
  exportProps = null,
}) {
  const [openRow, setOpenRow] = useState(null);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const handleRowClick = (key) => {
    setOpenRow((prev) => (prev === key ? null : key));
  };

  const handleSort = (key) => {
    if (sortCol === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(key);
      setSortDir('desc');
    }
  };

  if (isLoading) {
    return <div className="p-4 text-center text-sm text-navy-muted">Chargement...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="p-4 text-center text-sm text-navy-muted">Aucune donnee</div>;
  }

  const sortedData = !sortCol
    ? data
    : [...data].sort((a, b) => {
        const va = a[sortCol] ?? 0;
        const vb = b[sortCol] ?? 0;
        const modifier = sortDir === 'asc' ? 1 : -1;

        if (typeof va === 'string') {
          return va.localeCompare(vb) * modifier;
        }
        return (va - vb) * modifier;
      });

  return (
    <div className="overflow-hidden border border-border rounded-card shadow-sm bg-white">
      {exportProps && (
        <div className="px-4 py-2.5 border-b border-border flex justify-end">
          <ExportButtons {...exportProps} />
        </div>
      )}
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight }}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-white shadow-sm">
            <tr className="border-b border-border bg-bg-page/80 backdrop-blur-sm">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`px-3 py-3 text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] cursor-pointer hover:text-navy select-none transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  onClick={() => handleSort(col.key)}
                >
                  <div
                    className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : 'justify-start'}`}
                  >
                    {col.label}
                    {sortCol === col.key && (
                      <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => {
              const rowKey = row[drilldownKey];
              const isOpen = openRow === rowKey;

              return (
                <React.Fragment key={idx}>
                  <tr
                    className={`border-b border-border/50 hover:bg-navy/5 cursor-pointer transition-colors ${isOpen ? 'bg-bg-page' : idx % 2 === 1 ? 'bg-bg-zebra' : 'bg-white'}`}
                    onClick={() => handleRowClick(rowKey)}
                  >
                    {columns.map((col, i) => (
                      <td
                        key={i}
                        className={`px-3 py-3 text-[13px] ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'} text-navy`}
                      >
                        {i === 0 && (
                          <span className="inline-block w-4 mr-1 text-[10px] text-navy-muted">
                            {isOpen ? '▼' : '▶'}
                          </span>
                        )}
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={columns.length} className="p-0 border-b border-border">
                        <div className="bg-bg-page/50 p-4 shadow-inner">
                          <DrilldownContent
                            rowKey={rowKey}
                            queryFn={() => drilldownQueryFn(rowKey)}
                            columns={drilldownColumns}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DrilldownContent({ rowKey, queryFn, columns }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['drilldown', rowKey],
    queryFn,
    enabled: !!rowKey,
  });

  const handleSort = (key) => {
    if (sortCol === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(key);
      setSortDir('desc');
    }
  };

  if (isLoading)
    return (
      <div className="py-8 text-center text-xs text-navy-muted italic">
        Chargement des details...
      </div>
    );
  if (isError)
    return (
      <div className="py-8 text-center text-xs text-danger font-medium">Erreur de chargement</div>
    );
  if (!data || data.length === 0)
    return <div className="py-8 text-center text-xs text-navy-muted">Aucun detail</div>;

  const sortedData = !sortCol
    ? data
    : [...data].sort((a, b) => {
        const va = a[sortCol] ?? 0;
        const vb = b[sortCol] ?? 0;
        const modifier = sortDir === 'asc' ? 1 : -1;

        if (typeof va === 'string') {
          return va.localeCompare(vb) * modifier;
        }
        return (va - vb) * modifier;
      });

  return (
    <div className="overflow-hidden rounded border border-border shadow-sm bg-white">
      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-white shadow-sm">
            <tr className="border-b border-border bg-bg-page/50">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`px-3 py-3 text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] cursor-pointer hover:text-navy select-none ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  onClick={() => handleSort(col.key)}
                >
                  <div
                    className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : 'justify-start'}`}
                  >
                    {col.label}
                    {sortCol === col.key && (
                      <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => (
              <tr
                key={idx}
                className={`border-b border-border/50 hover:bg-navy/5 transition-colors ${idx % 2 === 1 ? 'bg-bg-zebra' : 'bg-white'}`}
              >
                {columns.map((col, i) => (
                  <td
                    key={i}
                    className={`px-3 py-3 text-[13px] ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'} text-navy`}
                  >
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
