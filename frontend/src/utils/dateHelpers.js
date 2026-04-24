import { format, subDays, startOfMonth, startOfQuarter, startOfYear, parseISO, getISOWeek, startOfISOWeek, endOfISOWeek, setISOWeek, getYear } from 'date-fns';

export function fmt(date) {
  return format(date, 'yyyy-MM-dd');
}

export function getLastCompleteWeek() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const lastSunday = new Date(today);
  lastSunday.setDate(today.getDate() - (dayOfWeek === 0 ? 7 : dayOfWeek));
  const lastMonday = new Date(lastSunday);
  lastMonday.setDate(lastSunday.getDate() - 6);
  return {
    from: fmt(lastMonday),
    to: fmt(lastSunday)
  };
}

export function getSameISOWeekPreviousYear(from) {
  const weekNum = getISOWeek(parseISO(from));
  const prevYearMon = startOfISOWeek(
    setISOWeek(new Date(getYear(parseISO(from)) - 1, 6, 1), weekNum)
  );
  return {
    from: fmt(prevYearMon),
    to: fmt(endOfISOWeek(prevYearMon))
  };
}

export function getPresetRange(preset) {
  const today = new Date();
  switch (preset) {
    case 'yesterday':
      return { from: fmt(subDays(today, 1)), to: fmt(subDays(today, 1)) };
    case 'last_month': {
      const firstOfThisMonth = startOfMonth(today);
      const lastMonth = subDays(firstOfThisMonth, 1);
      return { from: fmt(startOfMonth(lastMonth)), to: fmt(lastMonth) };
    }
    case 'last_week':
      return getLastCompleteWeek();
    case '7d':
      return { from: fmt(subDays(today, 6)), to: fmt(today) };
    case '30d':
      return { from: fmt(subDays(today, 29)), to: fmt(today) };
    case 'MTD':
      return { from: fmt(startOfMonth(today)), to: fmt(today) };
    case 'WTD': {
      const mon = startOfISOWeek(today);
      const yesterday = subDays(today, 1);
      // If today is Monday, yesterday is Sunday (prev week), so WTD is empty or just yesterday.
      // We'll return from Monday to yesterday.
      return { from: fmt(mon), to: fmt(yesterday) };
    }
    case 'QTD':
      return { from: fmt(startOfQuarter(today)), to: fmt(today) };
    case 'YTD':
      return { from: fmt(startOfYear(today)), to: fmt(today) };
    default:
      return getLastCompleteWeek();
  }
}

export function getCurrentMonth() {
  return format(new Date(), 'yyyy-MM');
}

export function formatDisplayDate(dateStr) {
  const d = new Date(dateStr);
  return format(d, 'dd MMM yyyy');
}
