import { useState } from 'react';
import type { Task } from '@shared/types';
import { downloadCsv } from '@/api/client';
import {
  useCreateTask,
  useDeleteTask,
  useTasks,
  useToggleTask,
  useUpdateTask,
} from '@/api/queries';
import { TaskForm, type TaskFormValues } from '@/components/forms';
import { TaskRow } from '@/components/TaskRow';
import { useToast } from '@/components/Toast';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Select,
} from '@/components/ui';
import { formatDate, pluralRu } from '@/lib/format';
import { errorMessage, usePageTitle } from '@/lib/hooks';
import { useAppMeta } from '@/lib/meta';

type StatusFilter = 'open' | 'done' | 'all';

export function TasksPage() {
  const meta = useAppMeta();
  usePageTitle('Задачи');
  const toast = useToast();

  const [status, setStatus] = useState<StatusFilter>('open');
  const [priority, setPriority] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [sort, setSort] = useState<'dueDate' | '-dueDate' | '-createdAt'>('dueDate');
  const [page, setPage] = useState(1);

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [formError, setFormError] = useState<unknown>(null);

  const query = useTasks({
    status,
    priority: priority || undefined,
    overdue: overdue ? 'true' : undefined,
    sort,
    page,
    pageSize: 25,
  });
  const create = useCreateTask();
  const update = useUpdateTask(editing?.id ?? 0);
  const toggle = useToggleTask();
  const remove = useDeleteTask();
  const data = query.data;

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

  return (
    <div className="page">
      <PageHeader
        eyebrow="Работа"
        title="Задачи"
        subtitle={
          data
            ? `${data.page.total} ${pluralRu(
                data.page.total,
                'задача',
                'задачи',
                'задач',
              )} по выбранному фильтру · сегодня ${formatDate(meta.today)}`
            : 'Следующие шаги по сделкам и контактам'
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={() =>
                downloadCsv('tasks', {
                  status,
                  priority: priority || undefined,
                  overdue: overdue ? 'true' : undefined,
                  sort,
                })
              }
            >
              CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="plus"
              onClick={() => {
                setEditing(null);
                setFormError(null);
                setFormMode('create');
              }}
            >
              Новая задача
            </Button>
          </>
        }
      />

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Статус задач">
          <button
            type="button"
            className={status === 'open' ? 'active' : undefined}
            onClick={() => {
              setStatus('open');
              setPage(1);
            }}
          >
            Открытые
          </button>
          <button
            type="button"
            className={status === 'done' ? 'active' : undefined}
            onClick={() => {
              setStatus('done');
              setOverdue(false);
              setPage(1);
            }}
          >
            Выполненные
          </button>
          <button
            type="button"
            className={status === 'all' ? 'active' : undefined}
            onClick={() => {
              setStatus('all');
              setOverdue(false);
              setPage(1);
            }}
          >
            Все
          </button>
        </div>
        <Select
          aria-label="Приоритет задач"
          value={priority}
          onChange={(event) => {
            setPriority(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Любой приоритет</option>
          <option value="high">Высокий</option>
          <option value="medium">Средний</option>
          <option value="low">Низкий</option>
        </Select>
        <Select
          aria-label="Сортировка задач"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as typeof sort);
            setPage(1);
          }}
        >
          <option value="dueDate">Срок ↑</option>
          <option value="-dueDate">Срок ↓</option>
          <option value="-createdAt">Сначала новые</option>
        </Select>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={overdue}
            disabled={status !== 'open'}
            onChange={(event) => {
              setOverdue(event.target.checked);
              setPage(1);
            }}
          />
          <span>Только просроченные</span>
        </label>
      </div>

      {query.isPending ? (
        <div className="panel">
          <div className="panel-body">
            <LoadingBlock rows={7} />
          </div>
        </div>
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <section className="panel">
          {data.data.length === 0 ? (
            <EmptyState
              icon="tasks"
              title={status === 'done' ? 'Выполненных задач нет' : 'Задач нет'}
              text={
                status === 'done'
                  ? 'Отмечайте задачи выполненными, чтобы видеть здесь историю.'
                  : 'Поставьте следующий шаг по сделке или контакту — он появится в этом списке.'
              }
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon="plus"
                  onClick={() => {
                    setEditing(null);
                    setFormError(null);
                    setFormMode('create');
                  }}
                >
                  Новая задача
                </Button>
              }
            />
          ) : (
            <div className="task-list">
              {data.data.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  showRelated
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
          {data.page.totalPages > 1 ? (
            <Pagination
              page={data.page.page}
              totalPages={data.page.totalPages}
              total={data.page.total}
              onChange={setPage}
              disabled={query.isFetching}
            />
          ) : null}
        </section>
      )}

      <Modal
        open={formMode !== null}
        onClose={closeForm}
        title={editing ? 'Редактировать задачу' : 'Новая задача'}
        description={editing ? editing.relatedLabel : 'Привяжите задачу к записи CRM'}
        size="lg"
      >
        {formMode !== null ? (
          <TaskForm
            initial={editing}
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
        title="Удалить задачу?"
        message={deleting ? `«${deleting.title}» будет скрыта. Действие записывается в аудит.` : ''}
        busy={remove.isPending}
      />
    </div>
  );
}
