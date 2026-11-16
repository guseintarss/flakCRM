import { useEffect, useState } from 'react';
import type { EntityType } from '@shared/types';

export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function usePageTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} — flakCRM` : 'flakCRM — IT sales workspace';
    return () => {
      document.title = 'flakCRM — IT sales workspace';
    };
  }, [title]);
}

export function entityPath(type: EntityType, id: number): string {
  switch (type) {
    case 'company':
      return `/companies/${id}`;
    case 'contact':
      return `/contacts/${id}`;
    case 'lead':
      return `/leads/${id}`;
    case 'deal':
      return `/deals/${id}`;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Не удалось выполнить запрос.';
}
