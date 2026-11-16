import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { DealStatus, LeadStatus, TaskPriority, TaskStatus } from '@shared/types';
import { ApiError } from '@/api/client';
import {
  dealStatusLabels,
  leadStatusLabels,
  taskPriorityLabels,
  taskStatusLabels,
} from '@/i18n';
import { errorMessage } from '@/lib/hooks';
import { initials } from '@/lib/format';
import { Icon, type IconName } from './Icon';

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md'): string {
  return cx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: IconName;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonClass(variant, size), className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('input', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('textarea', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('select', className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('field', className)}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="req" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.body.classList.add('modal-open');
    const timer = window.setTimeout(() => {
      const target = panel?.querySelector<HTMLElement>(
        '[data-autofocus], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
      );
      target?.focus();
    }, 40);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.classList.remove('modal-open');
      window.clearTimeout(timer);
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cx('modal', size !== 'md' && `modal-${size}`)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-head">
          <div>
            <h2 className="modal-title" id={titleId}>
              {title}
            </h2>
            {description ? <div className="modal-description">{description}</div> : null}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Удалить',
  busy = false,
  tone = 'danger',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  tone?: 'danger' | 'primary';
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-text">{message}</div>
    </Modal>
  );
}

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
}: {
  tone?: 'neutral' | 'indigo' | 'green' | 'red' | 'amber' | 'cyan' | 'violet';
  dot?: boolean;
  children: ReactNode;
}) {
  return <span className={cx('badge', `badge-${tone}`, dot && 'badge-dot')}>{children}</span>;
}

export function DealStatusBadge({ status }: { status: DealStatus }) {
  return (
    <Badge tone={status === 'won' ? 'green' : status === 'lost' ? 'red' : 'indigo'} dot>
      {dealStatusLabels[status]}
    </Badge>
  );
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const tone =
    status === 'converted'
      ? 'green'
      : status === 'disqualified'
        ? 'red'
        : status === 'qualified'
          ? 'cyan'
          : status === 'contacted'
            ? 'amber'
            : 'indigo';
  return (
    <Badge tone={tone} dot>
      {leadStatusLabels[status]}
    </Badge>
  );
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const tone = priority === 'high' ? 'red' : priority === 'medium' ? 'amber' : 'neutral';
  return <Badge tone={tone}>{taskPriorityLabels[priority]}</Badge>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge tone={status === 'done' ? 'green' : 'neutral'} dot>
      {taskStatusLabels[status]}
    </Badge>
  );
}

export function Avatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md';
}) {
  return <span className={cx('avatar', size === 'sm' && 'sm')}>{initials(name)}</span>;
}

export function TagList({
  values,
  tone = 'tag',
}: {
  values: string[];
  tone?: 'tag' | 'tech';
}) {
  if (!values.length) return <span className="muted">—</span>;
  return (
    <div className="chip-list">
      {values.map((value) => (
        <span className={cx('tag', tone === 'tech' && 'tech')} key={value}>
          {value}
        </span>
      ))}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  icon = 'search',
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={22} />
      </div>
      <div className="empty-title">{title}</div>
      {text ? <div className="empty-text">{text}</div> : null}
      {action ? <div className="empty-actions">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div className="errorstate" role="alert">
      <div className="errorstate-icon">
        <Icon name="alert" size={18} />
      </div>
      <div style={{ flex: 1 }}>
        <div className="errorstate-title">Не удалось загрузить данные</div>
        <div className="errorstate-text">{errorMessage(error)}</div>
        {requestId ? (
          <div className="errorstate-text mono" style={{ marginTop: 4, opacity: 0.7 }}>
            request {requestId.slice(0, 8)}
          </div>
        ) : null}
      </div>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Повторить
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-lines" aria-label="Загрузка" role="status">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="skeleton skeleton-line"
          style={{ width: `${[96, 84, 72, 90, 65][index % 5]}%` }}
        />
      ))}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
  disabled = false,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  const pages = Math.max(1, totalPages);
  const visible = Array.from({ length: pages }, (_, index) => index + 1).filter(
    (candidate) =>
      candidate === 1 || candidate === pages || Math.abs(candidate - page) <= 1,
  );
  return (
    <nav className="pagination" aria-label="Пагинация">
      <div>
        Всего: <strong>{total}</strong>
      </div>
      <div className="pagination-controls">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={disabled || page <= 1}
          aria-label="Предыдущая страница"
        >
          <Icon name="chevron-left" size={14} />
        </button>
        {visible.map((candidate, index) => {
          const previous = visible[index - 1];
          const gap = previous != null && candidate - previous > 1;
          return (
            <span key={candidate} style={{ display: 'contents' }}>
              {gap ? <span className="muted small">…</span> : null}
              <button
                type="button"
                className={candidate === page ? 'current' : undefined}
                onClick={() => onChange(candidate)}
                disabled={disabled}
                aria-current={candidate === page ? 'page' : undefined}
                aria-label={`Страница ${candidate}`}
              >
                {candidate}
              </button>
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={disabled || page >= pages}
          aria-label="Следующая страница"
        >
          <Icon name="chevron-right" size={14} />
        </button>
      </div>
    </nav>
  );
}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  let existingPath: string | null = null;
  let existingId: number | null = null;
  if (error instanceof ApiError) {
    const details = error.details as { existingId?: unknown } | undefined;
    if (typeof details?.existingId === 'number') {
      existingId = details.existingId;
      if (error.code === 'DUPLICATE_COMPANY') existingPath = `/companies/${existingId}`;
      else if (error.code === 'DUPLICATE_CONTACT') existingPath = `/contacts/${existingId}`;
      else if (error.code === 'DUPLICATE_LEAD') existingPath = `/leads/${existingId}`;
    }
  }
  return (
    <div className="form-error" role="alert">
      <Icon name="alert" size={16} />
      <div>
        {errorMessage(error)}
        {existingPath && existingId ? (
          <>
            {' '}
            <Link to={existingPath}>Открыть существующую запись</Link>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Загрузка" role="status" />;
}
