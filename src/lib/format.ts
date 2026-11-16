const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'short' });

export function formatMoney(minor: number | null | undefined, currency: string): string {
  if (minor == null) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

export function formatCompactMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(minor / 100);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export function toMinor(value: string): number {
  const normalized = value.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function toMajorInput(minor: number | null | undefined): string {
  if (minor == null) return '';
  return (minor / 100).toFixed(2).replace(/\.00$/, '');
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

export function formatMonth(value: string): string {
  const date = new Date(`${value}-01T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  const month = monthFormatter.format(date).replace('.', '');
  return `${month} ${String(date.getUTCFullYear()).slice(2)}`;
}

export function formatRelative(value: string | null | undefined, today: string): string {
  if (!value) return '—';
  const date = value.slice(0, 10);
  if (date === today) return 'сегодня';
  const diff = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000);
  if (diff === 1) return 'вчера';
  if (diff === -1) return 'завтра';
  if (diff > 1 && diff <= 6) return `${diff} дн. назад`;
  if (diff < -1 && diff >= -6) return `через ${Math.abs(diff)} дн.`;
  return formatDate(value);
}

export function formatDueDate(value: string, today: string): string {
  if (value < today) {
    const diff = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${value}T12:00:00Z`)) / 86_400_000);
    return `просрочено на ${diff} ${pluralRu(diff, 'день', 'дня', 'дней')}`;
  }
  if (value === today) return 'сегодня';
  return formatRelative(value, today);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function startOfQuarter(value: string): string {
  const [year, month] = value.split('-').map(Number);
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(startMonth).padStart(2, '0')}-01`;
}

export function startOfYear(value: string): string {
  return `${value.slice(0, 4)}-01-01`;
}
