import { useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  Activity,
  CompanyRef,
  ContactRef,
  EntityType,
  Task,
} from '@shared/types';
import {
  useActivities,
  useAuditEvents,
  useCreateActivity,
  useCreateDeal,
  useCreateTask,
  useDealStageHistory,
  useDeals,
  useDeleteActivity,
  useDeleteTask,
  useTasks,
  useToggleTask,
  useUpdateActivity,
  useUpdateTask,
} from '@/api/queries';
import { useToast } from './Toast';
import { activityTypeLabels } from '@/i18n';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from '@/lib/format';
import { errorMessage } from '@/lib/hooks';
import {
  ActivityForm,
  DealForm,
  TaskForm,
  type ActivityFormValues,
  type DealFormValues,
  type TaskFormValues,
} from './forms';
import { Icon } from './Icon';
import { TaskRow } from './TaskRow';
import {
  Badge,
  Button,
  ConfirmDialog,
  DealStatusBadge,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Modal,
  Pagination,
} from './ui';

const activityIcons = {
  call: 'phone',
  email: 'mail',
  meeting: 'calendar',
  note: 'note',
} as const;

export function ActivityTimelineItem({
  activity,
  onEdit,
  onDelete,
}: {
  activity: Activity;
  onEdit?: (activity: Activity) => void;
  onDelete?: (activity: Activity) => void;
}) {
  return (
    <div className="timeline-item">
      <div className="timeline-rail">
        <div className={`timeline-icon ${activity.type}`}>
          <Icon name={activityIcons[activity.type]} size={14} />
        </div>
      </div>
      <div className="timeline-body">
        <div className="timeline-head">
          <div style={{ minWidth: 0 }}>
            <div className="timeline-title">{activity.subject}</div>
            <div className="timeline-meta">
              <span>{activityTypeLabels[activity.type]}</span>
              <span>·</span>
              <span>{formatDateTime(activity.occurredAt)}</span>
              <span>·</span>
              <Link to={`/${activity.relatedTo.type === 'company' ? 'companies' : activity.relatedTo.type === 'contact' ? 'contacts' : activity.relatedTo.type === 'lead' ? 'leads' : 'deals'}/${activity.relatedTo.id}`}>
                {activity.relatedLabel}
              </Link>
            </div>
          </div>
          {onEdit || onDelete ? (
            <div className="timeline-actions">
              {onEdit ? (
                <button
                  type="button"
                  className="icon-action"
                  onClick={() => onEdit(activity)}
                  aria-label="Редактировать активность"
                >
                  <Icon name="edit" size={14} />
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  className="icon-action danger"
                  onClick={() => onDelete(activity)}
                  aria-label="Удалить активность"
                >
                  <Icon name="trash" size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {activity.body ? <div className="timeline-text">{activity.body}</div> : null}
      </div>
    </div>
  );
}

export function EntityActivities({
  entityType,
  entityId,
  relatedLabel,
  title = 'Активности',
  pageSize = 5,
}: {
  entityType: EntityType;
  entityId: number;
  relatedLabel: string;
  title?: string;
  pageSize?: number;
}) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);
  const [formError, setFormError] = useState<unknown>(null);

  const query = useActivities({ entityType, entityId, page, pageSize, sort: '-occurredAt' });
  const create = useCreateActivity();
  const update = useUpdateActivity(editing?.id ?? 0);
  const remove = useDeleteActivity();

  const closeForm = () => {
    setFormMode(null);
    setEditing(null);
    setFormError(null);
  };

  const submit = async (values: ActivityFormValues) => {
    try {
      setFormError(null);
      if (editing) {
        await update.mutateAsync({
          type: values.type,
          subject: values.subject,
          body: values.body,
          occurredAt: values.occurredAt,
        });
        toast.push('Активность обновлена', 'success');
      } else {
        await create.mutateAsync(values);
        toast.push('Активность добавлена', 'success');
      }
      closeForm();
    } catch (error) {
      setFormError(error);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.push('Активность удалена', 'success');
      setDeleting(null);
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  const activities = query.data?.data ?? [];

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">
          <Icon name="activities" size={16} />
          {title}
          {query.data ? <span className="muted small">· {query.data.page.total}</span> : null}
        </h2>
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          onClick={() => {
            setEditing(null);
            setFormError(null);
            setFormMode('create');
          }}
        >
          Добавить
        </Button>
      </div>
      <div className="panel-body">
        {query.isPending ? (
          <LoadingBlock rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : activities.length === 0 ? (
          <EmptyState
            icon="activities"
            title="Пока нет активностей"
            text="Зафиксируйте звонок, письмо или встречу, чтобы не потерять контекст."
          />
        ) : (
          <div className="timeline">
            {activities.map((activity) => (
              <ActivityTimelineItem
                key={activity.id}
                activity={activity}
                onEdit={(item) => {
                  setEditing(item);
                  setFormError(null);
                  setFormMode('edit');
                }}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}
      </div>
      {query.data && query.data.page.totalPages > 1 ? (
        <Pagination
          page={query.data.page.page}
          totalPages={query.data.page.totalPages}
          total={query.data.page.total}
          onChange={setPage}
        />
      ) : null}

      <Modal
        open={formMode !== null}
        onClose={closeForm}
        title={editing ? 'Редактировать активность' : 'Новая активность'}
        description={relatedLabel}
      >
        {formMode !== null ? (
          <ActivityForm
            initial={editing}
            fixedRelated={{ type: entityType, id: entityId, label: relatedLabel }}
            onSubmit={submit}
            submitting={create.isPending || update.isPending}
            error={formError}
            onCancel={closeForm}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        busy={remove.isPending}
        title="Удалить активность?"
        message={
          deleting
            ? `«${deleting.subject}» будет скрыта из карточки. Действие записывается в аудит.`
            : ''
        }
      />
    </section>
  );
}

export function EntityTasks({
  entityType,
  entityId,
  relatedLabel,
}: {
  entityType: EntityType;
  entityId: number;
  relatedLabel: string;
}) {
  const toast = useToast();
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [formError, setFormError] = useState<unknown>(null);

  const query = useTasks({ entityType, entityId, status: 'all', pageSize: 50, sort: 'dueDate' });
  const create = useCreateTask();
  const update = useUpdateTask(editing?.id ?? 0);
  const toggle = useToggleTask();
  const remove = useDeleteTask();

  const closeForm = () => {
    setFormMode(null);
    setEditing(null);
    setFormError(null);
  };

  const submit = async (values: TaskFormValues) => {
    try {
      setFormError(null);
      if (editing) {
        await update.mutateAsync({
          title: values.title,
          description: values.description,
          dueDate: values.dueDate,
          priority: values.priority,
        });
        toast.push('Задача обновлена', 'success');
      } else {
        await create.mutateAsync(values);
        toast.push('Задача создана', 'success');
      }
      closeForm();
    } catch (error) {
      setFormError(error);
    }
  };

  const handleToggle = async (task: Task) => {
    try {
      await toggle.mutateAsync({ id: task.id, status: task.status === 'open' ? 'done' : 'open' });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.push('Задача удалена', 'success');
      setDeleting(null);
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  const tasks = query.data?.data ?? [];
  const openCount = tasks.filter((task) => task.status === 'open').length;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">
          <Icon name="tasks" size={16} />
          Задачи
          {query.data ? <span className="muted small">· открытых {openCount}</span> : null}
        </h2>
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          onClick={() => {
            setEditing(null);
            setFormError(null);
            setFormMode('create');
          }}
        >
          Добавить
        </Button>
      </div>
      {query.isPending ? (
        <div className="panel-body">
          <LoadingBlock rows={2} />
        </div>
      ) : query.isError ? (
        <div className="panel-body">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon="tasks"
          title="Задач нет"
          text="Поставьте следующий шаг, чтобы карточка не зависла."
        />
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={(item) => void handleToggle(item)}
              onEdit={(item) => {
                setEditing(item);
                setFormError(null);
                setFormMode('edit');
              }}
              onDelete={setDeleting}
              busy={toggle.isPending || remove.isPending}
            />
          ))}
        </div>
      )}

      <Modal
        open={formMode !== null}
        onClose={closeForm}
        title={editing ? 'Редактировать задачу' : 'Новая задача'}
        description={relatedLabel}
      >
        {formMode !== null ? (
          <TaskForm
            initial={editing}
            fixedRelated={{ type: entityType, id: entityId, label: relatedLabel }}
            onSubmit={submit}
            submitting={create.isPending || update.isPending}
            error={formError}
            onCancel={closeForm}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        busy={remove.isPending}
        title="Удалить задачу?"
        message={deleting ? `«${deleting.title}» будет скрыта. Действие записывается в аудит.` : ''}
      />
    </section>
  );
}

const auditActionLabels: Record<string, string> = {
  create: 'Создано',
  update: 'Изменено',
  delete: 'Удалено',
  convert: 'Конвертация',
  stage_change: 'Смена стадии',
};

const fieldLabels: Record<string, string> = {
  name: 'название',
  firstName: 'имя',
  lastName: 'фамилия',
  fullName: 'имя',
  domain: 'домен',
  industry: 'отрасль',
  size: 'размер',
  location: 'город',
  telegram: 'Telegram',
  linkedin: 'LinkedIn',
  stack: 'стек',
  tags: 'теги',
  notes: 'заметки',
  email: 'email',
  phone: 'телефон',
  jobTitle: 'должность',
  companyId: 'компания',
  contactName: 'контакт',
  companyName: 'компания',
  source: 'источник',
  serviceType: 'услуга',
  status: 'статус',
  title: 'название',
  amountMinor: 'сумма',
  currency: 'валюта',
  expectedCloseDate: 'ожидаемое закрытие',
  priority: 'приоритет',
  dueDate: 'срок',
  type: 'тип',
  subject: 'тема',
  occurredAt: 'время',
  lostReason: 'причина проигрыша',
  stageId: 'стадия',
  version: 'версия',
};

function formatAuditValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function AuditTrail({
  entityType,
  entityId,
  title = 'История изменений',
}: {
  entityType: EntityType | 'activity' | 'task';
  entityId: number;
  title?: string;
}) {
  const query = useAuditEvents(entityType, entityId);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">
          <Icon name="clock" size={16} />
          {title}
          {query.data ? <span className="muted small">· {query.data.page.total}</span> : null}
        </h2>
      </div>
      <div className="panel-body">
        {query.isPending ? (
          <LoadingBlock rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (query.data?.data.length ?? 0) === 0 ? (
          <div className="muted small">Изменений пока не было.</div>
        ) : (
          <div className="audit-list">
            {query.data?.data.map((event) => (
              <div className="audit-item" key={event.id}>
                <div className="audit-icon">
                  <Icon
                    name={event.action === 'delete' ? 'trash' : event.action === 'create' ? 'plus' : 'edit'}
                    size={13}
                  />
                </div>
                <div className="audit-body">
                  <div className="audit-head">
                    <span className="audit-actor">{event.actor.name}</span>
                    <Badge tone={event.action === 'delete' ? 'red' : event.action === 'create' ? 'green' : 'neutral'}>
                      {auditActionLabels[event.action] ?? event.action}
                    </Badge>
                    <span className="audit-time">{formatDateTime(event.createdAt)}</span>
                  </div>
                  {event.changes.length ? (
                    <div className="audit-changes">
                      {event.changes.slice(0, 6).map((change, index) => (
                        <div className="audit-change" key={`${change.field}-${index}`}>
                          <span className="audit-field">{fieldLabels[change.field] ?? change.field}:</span>
                          {change.from !== null ? <span className="audit-from">{formatAuditValue(change.from)}</span> : null}
                          <Icon name="arrow-right" size={11} />
                          <span className="audit-to">{formatAuditValue(change.to)}</span>
                        </div>
                      ))}
                      {event.changes.length > 6 ? (
                        <span className="muted">и ещё {event.changes.length - 6}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {event.action === 'convert' && event.metadata ? (
                    <div className="audit-changes muted">
                      Созданы связанные компания, контакт и сделка.
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function StageHistoryList({ dealId }: { dealId: number }) {
  const query = useDealStageHistory(dealId);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">
          <Icon name="deals" size={16} />
          История стадий
          {query.data ? <span className="muted small">· {query.data.page.total}</span> : null}
        </h2>
      </div>
      <div className="panel-body">
        {query.isPending ? (
          <LoadingBlock rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (query.data?.data.length ?? 0) === 0 ? (
          <div className="muted small">Переходов ещё не было.</div>
        ) : (
          <div className="history-list">
            {query.data?.data.map((entry) => (
              <div className="history-item" key={entry.id}>
                <div className="history-dot-wrap">
                  <span className="history-dot" />
                </div>
                <div className="history-body">
                  <div className="history-title">
                    {entry.fromStage ? `${entry.fromStage.name} → ` : 'Создание → '}
                    {entry.toStage.name}
                  </div>
                  {entry.note ? <div className="history-note">{entry.note}</div> : null}
                  <div className="history-meta">
                    {entry.changedBy.name} · {formatDateTime(entry.changedAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function DealsPanel({
  companyId,
  contactId,
  defaultCompany,
  defaultContact,
  title = 'Сделки',
}: {
  companyId?: number;
  contactId?: number;
  defaultCompany?: CompanyRef | null;
  defaultContact?: ContactRef | null;
  title?: string;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);
  const query = useDeals({
    ...(companyId ? { companyId } : {}),
    ...(contactId ? { primaryContactId: contactId } : {}),
    pageSize: 10,
    sort: '-updatedAt',
  });
  const create = useCreateDeal();

  const submit = async (values: DealFormValues) => {
    try {
      setFormError(null);
      await create.mutateAsync(values);
      toast.push('Сделка создана', 'success');
      setCreating(false);
    } catch (error) {
      setFormError(error);
    }
  };

  const deals = query.data?.data ?? [];

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">
          <Icon name="deals" size={16} />
          {title}
          {query.data ? <span className="muted small">· {query.data.page.total}</span> : null}
        </h2>
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          onClick={() => {
            setFormError(null);
            setCreating(true);
          }}
        >
          Сделка
        </Button>
      </div>
      <div className="panel-body flush">
        {query.isPending ? (
          <div className="panel-body">
            <LoadingBlock rows={2} />
          </div>
        ) : query.isError ? (
          <div className="panel-body">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : deals.length === 0 ? (
          <EmptyState
            icon="deals"
            title="Сделок пока нет"
            text="Создайте сделку, чтобы отслеживать сумму, стадию и следующий шаг."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Сделка</th>
                  <th>Стадия</th>
                  <th>Статус</th>
                  <th className="num">Сумма</th>
                  <th>Закрытие</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => (
                  <tr key={deal.id}>
                    <td>
                      <Link className="cell-link" to={`/deals/${deal.id}`}>
                        {deal.title}
                      </Link>
                      {!companyId && deal.company ? (
                        <div className="cell-sub">{deal.company.name}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className="tag">{deal.stage.name}</span>
                    </td>
                    <td>
                      <DealStatusBadge status={deal.status} />
                    </td>
                    <td className="num">{formatMoney(deal.amountMinor, deal.currency)}</td>
                    <td className="muted nowrap">{formatDate(deal.expectedCloseDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Новая сделка"
        description={defaultCompany ? defaultCompany.name : undefined}
        size="lg"
      >
        {creating ? (
          <DealForm
            defaultCompany={defaultCompany}
            defaultContact={defaultContact}
            onSubmit={submit}
            submitting={create.isPending}
            error={formError}
            onCancel={() => setCreating(false)}
          />
        ) : null}
      </Modal>
    </section>
  );
}
