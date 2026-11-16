import { useState } from 'react';
import type { Activity, ActivityType } from '@shared/types';
import { downloadCsv } from '@/api/client';
import {
  useActivities,
  useCreateActivity,
  useDeleteActivity,
  useUpdateActivity,
} from '@/api/queries';
import { EntityCombobox, type EntitySelection } from '@/components/combobox';
import { ActivityTimelineItem } from '@/components/entity-sections';
import { ActivityForm, type ActivityFormValues } from '@/components/forms';
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
import { activityTypeLabels } from '@/i18n';
import { pluralRu } from '@/lib/format';
import { errorMessage, usePageTitle } from '@/lib/hooks';
import { useAppMeta } from '@/lib/meta';

const types: Array<{ id: '' | ActivityType; label: string }> = [
  { id: '', label: 'Все' },
  { id: 'call', label: 'Звонки' },
  { id: 'email', label: 'Письма' },
  { id: 'meeting', label: 'Встречи' },
  { id: 'note', label: 'Заметки' },
];

export function ActivitiesPage() {
  const meta = useAppMeta();
  usePageTitle('Активности');
  const toast = useToast();

  const [type, setType] = useState<'' | ActivityType>('');
  const [sort, setSort] = useState<'-occurredAt' | 'occurredAt'>('-occurredAt');
  const [related, setRelated] = useState<EntitySelection | null>(null);
  const [page, setPage] = useState(1);

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);
  const [formError, setFormError] = useState<unknown>(null);

  const query = useActivities({
    ...(type ? { type } : {}),
    ...(related ? { entityType: related.type, entityId: related.id } : {}),
    sort,
    page,
    pageSize: 25,
  });
  const create = useCreateActivity();
  const update = useUpdateActivity(editing?.id ?? 0);
  const remove = useDeleteActivity();
  const data = query.data;

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

  return (
    <div className="page">
      <PageHeader
        eyebrow="Работа"
        title="Активности"
        subtitle={
          data
            ? `${data.page.total} ${pluralRu(
                data.page.total,
                'активность',
                'активности',
                'активностей',
              )} · ${meta.workspace.name}`
            : 'Звонки, письма, встречи и заметки в одном timeline'
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={() =>
                downloadCsv('activities', {
                  ...(type ? { type } : {}),
                  ...(related ? { entityType: related.type, entityId: related.id } : {}),
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
              Новая активность
            </Button>
          </>
        }
      />

      <div className="toolbar">
        <div className="segmented activity-page-tabs" role="group" aria-label="Тип активности">
          {types.map((item) => (
            <button
              key={item.id || 'all'}
              type="button"
              className={type === item.id ? 'active' : undefined}
              onClick={() => {
                setType(item.id);
                setPage(1);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="toolbar-combo">
          <EntityCombobox
            value={related}
            onChange={(value) => {
              setRelated(value);
              setPage(1);
            }}
            placeholder="Все записи"
          />
        </div>
        <Select
          aria-label="Сортировка активностей"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as typeof sort);
            setPage(1);
          }}
        >
          <option value="-occurredAt">Сначала новые</option>
          <option value="occurredAt">Сначала старые</option>
        </Select>
        {related ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRelated(null);
              setPage(1);
            }}
          >
            Сбросить запись
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
        <div className="panel">
          <div className="panel-body">
            <LoadingBlock rows={8} />
          </div>
        </div>
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <section className="panel">
          <div className="panel-body">
            {data.data.length === 0 ? (
              <EmptyState
                icon="activities"
                title="Активностей не найдено"
                text="Зафиксируйте звонок, письмо или встречу — они появятся в timeline и карточках записей."
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
                    Новая активность
                  </Button>
                }
              />
            ) : (
              <div className="timeline">
                {data.data.map((activity) => (
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
        title={editing ? 'Редактировать активность' : 'Новая активность'}
        description={editing ? editing.relatedLabel : activityTypeLabels.note}
        size="lg"
      >
        {formMode !== null ? (
          <ActivityForm
            initial={editing}
            fixedRelated={
              editing
                ? {
                    type: editing.relatedTo.type,
                    id: editing.relatedTo.id,
                    label: editing.relatedLabel,
                  }
                : null
            }
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
        title="Удалить активность?"
        message={
          deleting
            ? `«${deleting.subject}» будет скрыта из карточки. Действие записывается в аудит.`
            : ''
        }
        busy={remove.isPending}
      />
    </div>
  );
}
