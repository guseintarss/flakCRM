import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { EntityType } from '@shared/types';
import { useCompanies, useGlobalSearch } from '@/api/queries';
import { entityTypeLabels, leadStatusLabels } from '@/i18n';
import { useDebounced } from '@/lib/hooks';
import { cx, Input } from './ui';
import { Icon, type IconName } from './Icon';

export interface CompanySelection {
  id: number;
  name: string;
  domain?: string | null;
}

export interface EntitySelection {
  type: EntityType;
  id: number;
  label: string;
}

function useCloseOnOutside(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, ref]);
}

export function CompanyCombobox({
  value,
  onChange,
  placeholder = 'Начните вводить название',
  disabled = false,
  id,
  autoFocus = false,
  invalid = false,
}: {
  value: CompanySelection | null;
  onChange: (value: CompanySelection | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(query, 220);
  const optionsQuery = useCompanies({
    q: debounced.trim() || undefined,
    pageSize: 8,
    sort: 'name',
  });
  const options = useMemo(
    () => (optionsQuery.data?.data ?? []).map((item) => ({ id: item.id, name: item.name, domain: item.domain })),
    [optionsQuery.data],
  );

  useCloseOnOutside(wrapRef, open, () => setOpen(false));

  useEffect(() => {
    setActive(0);
  }, [debounced, open]);

  const select = (option: CompanySelection) => {
    onChange(option);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => Math.min(current + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      if (open && options[active]) {
        event.preventDefault();
        select(options[active]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="combo" ref={wrapRef}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? `${id ?? 'company'}-listbox` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        className={invalid ? 'invalid' : undefined}
        placeholder={placeholder}
        disabled={disabled}
        value={query || value?.name || ''}
        onFocus={(event) => {
          setOpen(true);
          event.currentTarget.select();
        }}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          if (value) onChange(null);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {value && !disabled ? (
        <button
          type="button"
          className="combo-clear"
          aria-label="Очистить компанию"
          onClick={() => {
            onChange(null);
            setQuery('');
            setOpen(false);
          }}
        >
          <Icon name="close" size={13} />
        </button>
      ) : null}
      {open && !disabled ? (
        <div className="combo-menu" id={`${id ?? 'company'}-listbox`} role="listbox">
          {optionsQuery.isPending ? (
            <div className="combo-hint">Ищем компании…</div>
          ) : options.length === 0 ? (
            <div className="combo-empty">Компании не найдены</div>
          ) : (
            options.map((option, index) => (
              <button
                type="button"
                key={option.id}
                role="option"
                aria-selected={index === active}
                className={cx('combo-option', index === active && 'active')}
                onMouseEnter={() => setActive(index)}
                onClick={() => select(option)}
              >
                <span className="command-item-icon">
                  <Icon name="building" size={15} />
                </span>
                <span className="combo-option-main">
                  <span className="combo-option-label">{option.name}</span>
                  <span className="combo-option-sub">{option.domain ?? 'Без домена'}</span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

const entityIcons: Record<EntityType, IconName> = {
  company: 'building',
  contact: 'user',
  lead: 'leads',
  deal: 'deals',
};

export function EntityCombobox({
  value,
  onChange,
  placeholder = 'Компания, контакт, лид или сделка',
  id,
  autoFocus = false,
  invalid = false,
}: {
  value: EntitySelection | null;
  onChange: (value: EntitySelection | null) => void;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(query, 260);
  const search = useGlobalSearch(debounced);
  const data = search.data;

  const groups = useMemo(() => {
    if (!data) return [] as Array<{
      type: EntityType;
      label: string;
      options: Array<{ type: EntityType; id: number; label: string; sub: string }>;
    }>;
    return [
      {
        type: 'company' as const,
        label: 'Компании',
        options: data.companies.items.map((item) => ({
          type: 'company' as const,
          id: item.id,
          label: item.name,
          sub: item.domain ?? item.industry ?? 'Компания',
        })),
      },
      {
        type: 'contact' as const,
        label: 'Контакты',
        options: data.contacts.items.map((item) => ({
          type: 'contact' as const,
          id: item.id,
          label: item.fullName,
          sub: [item.email, item.company?.name].filter(Boolean).join(' · ') || 'Контакт',
        })),
      },
      {
        type: 'deal' as const,
        label: 'Сделки',
        options: data.deals.items.map((item) => ({
          type: 'deal' as const,
          id: item.id,
          label: item.title,
          sub: [item.company?.name, item.stage.name].filter(Boolean).join(' · '),
        })),
      },
      {
        type: 'lead' as const,
        label: 'Лиды',
        options: data.leads.items.map((item) => ({
          type: 'lead' as const,
          id: item.id,
          label: item.companyName,
          sub: `${item.contactName} · ${leadStatusLabels[item.status]}`,
        })),
      },
    ].filter((group) => group.options.length > 0);
  }, [data]);

  const flat = useMemo(() => groups.flatMap((group) => group.options), [groups]);

  useCloseOnOutside(wrapRef, open, () => setOpen(false));

  useEffect(() => {
    setActive(0);
  }, [debounced, open]);

  const select = (option: EntitySelection) => {
    onChange(option);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => Math.min(current + 1, Math.max(flat.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      if (open && flat[active]) {
        event.preventDefault();
        select(flat[active]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const showHint = debounced.trim().length < 2;

  return (
    <div className="combo" ref={wrapRef}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={open ? `${id ?? 'entity'}-listbox` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        className={invalid ? 'invalid' : undefined}
        placeholder={placeholder}
        value={query || value?.label || ''}
        onFocus={(event) => {
          setOpen(true);
          event.currentTarget.select();
        }}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          if (value) onChange(null);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {value ? (
        <button
          type="button"
          className="combo-clear"
          aria-label="Очистить связанную запись"
          onClick={() => {
            onChange(null);
            setQuery('');
            setOpen(false);
          }}
        >
          <Icon name="close" size={13} />
        </button>
      ) : null}
      {open ? (
        <div className="combo-menu" id={`${id ?? 'entity'}-listbox`} role="listbox">
          {showHint ? (
            <div className="combo-hint">Введите минимум 2 символа, чтобы найти запись.</div>
          ) : search.isPending || search.isFetching ? (
            <div className="combo-hint">Ищем по всей CRM…</div>
          ) : flat.length === 0 ? (
            <div className="combo-empty">Ничего не найдено</div>
          ) : (
            groups.map((group) => (
              <div key={group.type}>
                <div className="command-group-label">{group.label}</div>
                {group.options.map((option) => {
                  const index = flat.findIndex(
                    (candidate) => candidate.type === option.type && candidate.id === option.id,
                  );
                  return (
                    <button
                      type="button"
                      key={`${option.type}-${option.id}`}
                      role="option"
                      aria-selected={index === active}
                      className={cx('combo-option', index === active && 'active')}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => select(option)}
                    >
                      <span className="command-item-icon">
                        <Icon name={entityIcons[option.type]} size={15} />
                      </span>
                      <span className="combo-option-main">
                        <span className="combo-option-label">{option.label}</span>
                        <span className="combo-option-sub">
                          {entityTypeLabels[option.type]} · {option.sub}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
