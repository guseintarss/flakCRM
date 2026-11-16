export function todayInTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return value.toISOString().slice(0, 10);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function startOfQuarter(date: string): string {
  const [year, month] = date.split('-').map(Number);
  const quarterStart = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(quarterStart).padStart(2, '0')}-01`;
}

export function startOfYear(date: string): string {
  return `${date.slice(0, 4)}-01-01`;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function recentMonths(count: number, today: string): string[] {
  const [year, month] = today.split('-').map(Number);
  const result: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const value = new Date(Date.UTC(year, month - 1 - index, 1, 12, 0, 0));
    result.push(value.toISOString().slice(0, 7));
  }
  return result;
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** Converts a calendar date in a time zone to the UTC instant at its start/end. */
export function localDateToUtc(date: string, timeZone: string, endOfDay = false): string {
  const [year, month, day] = date.split('-').map(Number);
  const hours = endOfDay ? 23 : 0;
  const minutes = endOfDay ? 59 : 0;
  const seconds = endOfDay ? 59 : 0;
  const millis = endOfDay ? 999 : 0;
  const wallClock = Date.UTC(year, month - 1, day, hours, minutes, seconds, millis);
  let instant = wallClock;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    instant = wallClock - timeZoneOffsetMs(new Date(instant), timeZone);
  }
  return new Date(instant).toISOString();
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
