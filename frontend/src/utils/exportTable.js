/**
 * Export table data as CSV download or TSV copy (for Google Sheets paste)
 */

function rowsToMatrix(columns, rows) {
  const headers = columns.map(c => c.label ?? c.key);
  const body = rows.map(row =>
    columns.map(col => {
      const val = row[col.key];
      if (val == null) return '';
      // Pourcentages : diviser par 100 pour Excel (2,5% → 0,025)
      if (typeof val === 'number' && col.isPct) return val / 100;
      if (typeof val === 'number') return val;
      return String(val);
    })
  );
  return [headers, ...body];
}

export function downloadCsv(columns, rows, filename = 'export.csv') {
  const matrix = rowsToMatrix(columns, rows);
  const csv = matrix
    .map(row =>
      row.map(cell => {
        // Nombres : décimale en virgule pour Excel FR
        if (typeof cell === 'number') return String(cell).replace('.', ',');
        const s = String(cell);
        // Guillemets si la cellule contient ; " ou retour à la ligne
        return /[;"'\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(';') // séparateur point-virgule pour Excel FR
    )
    .join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyTsv(columns, rows) {
  const matrix = rowsToMatrix(columns, rows);
  const tsv = matrix.map(row => row.join('\t')).join('\n');
  await navigator.clipboard.writeText(tsv);
}
