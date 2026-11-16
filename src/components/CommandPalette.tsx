import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EntityType } from '@shared/types';
import { useGlobalSearch } from '@/api/queries';
import { entityTypeLabels } from '@/i18n';
import { entityPath, useDebounced } from '@/lib/hooks';
import { cx } from './ui';
import { Icon, type IconName } from './Icon';

interface PaletteItem {
  type: EntityType;
  id: number;
  label: string;
  sub: string;
}

const icons: Record<EntityType, IconName> = {
  company: 'building',
  contact: 'user',
  lead: 'leads',
  deal: 'deals',
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query, 220);
  const search = useGlobalSearch(debounced);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [debounced]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const groups = useMemo(() => {
    const data = search.data;
    if (!data) return [] as Array<{ type: EntityType; label: string; items: PaletteItem[] }>;
    return [
      {
        type: 'company' as const,
        label: 'Компании',
        items: data.companies.items.map((item) => ({
          type: 'company' as const,
          id: item.id,
          label: item.name,
          sub: [item.domain, item.industry].filter(Boolean).join(' · ') || 'Компания',
        })),
      },
      {
        type: 'contact' as const,
        label: 'Контакты',
        items: data.contacts.items.map((item) => ({
          type: 'contact' as const,
          id: item.id,
          label: item.fullName,
          sub: [item.email, item.company?.name].filter(Boolean).join(' · ') || 'Контакт',
        })),
      },
      {
        type: 'deal' as const,
        label: 'Сделки',
        items: data.deals.items.map((item) => ({
          type: 'deal' as const,
          id: item.id,
          label: item.title,
          sub: [item.company?.name, item.stage.name].filter(Boolean).join(' · '),
        })),
      },
      {
        type: 'lead' as const,
        label: 'Лиды',
        items: data.leads.items.map((item) => ({
          type: 'lead' as const,
          id: item.id,
          label: item.companyName,
          sub: item.contactName,
        })),
      },
    ].filter((group) => group.items.length > 0);
  }, [search.data]);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const showHint = debounced.trim().length < 2;

  const openItem = (item: PaletteItem) => {
    onClose();
    navigate(entityPath(item.type, item.id));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, Math.max(flat.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      if (flat[active]) {
        event.preventDefault();
        openItem(flat[active]);
      }
    }
  };

  if (!open) return null;

  return (
    <div
      className="command-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="command" role="dialog" aria-modal="true" aria-label="Поиск по CRM">
        <div className="command-input-wrap">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="command-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск компаний, контактов, сделок и лидов…"
            aria-label="Поиск по CRM"
            aria-controls="command-results"
            aria-activedescendant={flat[active] ? `command-item-${flat[active].type}-${flat[active].id}` : undefined}
          />
          <span className="kbd command-esc">Esc</span>
        </div>
        <div className="command-results" id="command-results" role="listbox">
          {showHint ? (
            <div className="command-empty">
              Начните вводить запрос — минимум 2 символа. Поиск идёт по названиям, доменам, email и
              заголовкам.
            </div>
          ) : search.isPending || search.isFetching ? (
            <div className="command-empty">Ищем по всей CRM…</div>
          ) : flat.length === 0 ? (
            <div className="command-empty">Ничего не найдено. Попробуйте другое название.</div>
          ) : (
            groups.map((group) => (
              <div key={group.type}>
                <div className="command-group-label">{group.label}</div>
                {group.items.map((item) => {
                  const index = flat.findIndex(
                    (candidate) => candidate.type === item.type && candidate.id === item.id,
                  );
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      id={`command-item-${item.type}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      className={cx('command-item', index === active && 'active')}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => openItem(item)}
                    >
                      <span className="command-item-icon">
                        <Icon name={icons[item.type]} size={16} />
                      </span>
                      <span className="command-item-main">
                        <span className="command-item-label">{item.label}</span>
                        <span className="command-item-sub">
                          {entityTypeLabels[item.type]} · {item.sub}
                        </span>
                      </span>
                      <Icon name="arrow-right" size={14} />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="command-foot">
          <span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> навигация
          </span>
          <span>
            <span className="kbd">Enter</span> открыть
          </span>
          <span>
            <span className="kbd">Esc</span> закрыть
          </span>
        </div>
      </div>
    </div>
  );
}
