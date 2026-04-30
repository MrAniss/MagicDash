
export function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysBetween(from, to) {
  return Math.max(1, Math.round((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1);
}

export function r2(v) {
  return Math.round(v * 100) / 100;
}

export function pctChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

export function getISOWeek(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

export function getComparisonDates(from, to, compareTo = 'previous_period') {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const diffMs = toDate - fromDate;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (compareTo === 'previous_year') {
    const compFrom = new Date(fromDate);
    compFrom.setFullYear(compFrom.getFullYear() - 1);
    const compTo = new Date(toDate);
    compTo.setFullYear(compTo.getFullYear() - 1);
    return { compFrom: fmtDate(compFrom), compTo: fmtDate(compTo) };
  }

  // Special logic for Weekend (Sat-Sun) -> shift by 7 days
  // Sat is 6, Sun is 0. diffDays for 2 days is 1.
  if (fromDate.getDay() === 6 && toDate.getDay() === 0 && diffDays === 1) {
    const compFrom = new Date(fromDate);
    compFrom.setDate(compFrom.getDate() - 7);
    const compTo = new Date(toDate);
    compTo.setDate(compTo.getDate() - 7);
    return { compFrom: fmtDate(compFrom), compTo: fmtDate(compTo) };
  }

  // Default: previous contiguous period
  const compTo = new Date(fromDate);
  compTo.setDate(compTo.getDate() - 1);
  const compFrom = new Date(compTo);
  compFrom.setDate(compFrom.getDate() - diffDays);
  return { compFrom: fmtDate(compFrom), compTo: fmtDate(compTo) };
}
