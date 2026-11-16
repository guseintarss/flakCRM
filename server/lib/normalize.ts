import { domainToASCII } from 'node:url';
import { PUBLIC_EMAIL_DOMAINS } from '../../shared/constants';

export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeText(value: string): string {
  return collapseSpaces(value.normalize('NFKC')).toLocaleLowerCase('ru-RU');
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const at = normalized.indexOf('@');
  if (at <= 0 || at === normalized.length - 1 || normalized.indexOf('@', at + 1) !== -1) {
    return null;
  }
  if (normalized.length > 254) return null;
  return normalized;
}

export function normalizeDomain(
  value: string | null | undefined,
  options: { allowPublic?: boolean } = {},
): string | null {
  if (value == null) return null;
  let input = value.trim().toLowerCase();
  if (!input) return null;
  if (!input.includes('://')) input = `https://${input}`;

  let host: string;
  try {
    host = new URL(input).hostname;
  } catch {
    return null;
  }

  host = host.replace(/\.$/, '').replace(/^www\./, '');
  const ascii = domainToASCII(host);
  if (!ascii || !ascii.includes('.')) return null;
  if (!options.allowPublic && PUBLIC_EMAIL_DOMAINS.has(ascii)) return null;
  return ascii;
}

export function emailDomain(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const domain = normalized.slice(normalized.indexOf('@') + 1);
  return PUBLIC_EMAIL_DOMAINS.has(domain) ? null : domain;
}

export function normalizeTags(tags: string[] | null | undefined): string[] {
  if (!tags) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = collapseSpaces(String(raw)).toLocaleLowerCase('ru-RU');
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= 20) break;
  }
  return result;
}

export function normalizeStack(stack: string[] | null | undefined): string[] {
  if (!stack) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of stack) {
    const item = collapseSpaces(String(raw));
    const key = item.toLocaleLowerCase('ru-RU');
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= 20) break;
  }
  return result;
}

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function fullName(firstName: string, lastName: string | null): string {
  return collapseSpaces(`${firstName} ${lastName ?? ''}`);
}

export function buildSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => part.normalize('NFKC').toLocaleLowerCase('ru-RU'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitName(value: string): { firstName: string; lastName: string | null } {
  const normalized = collapseSpaces(value);
  if (!normalized) return { firstName: '', lastName: null };
  const [first, ...rest] = normalized.split(' ');
  return { firstName: first, lastName: rest.length ? rest.join(' ') : null };
}
