import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ConvertLeadInput, LeadInput } from '@shared/types';
import {
  useConvertLead,
  useDeleteLead,
  useLead,
  useUpdateLead,
} from '@/api/queries';
import {
  AuditTrail,
  EntityActivities,
  EntityTasks,
} from '@/components/entity-sections';
import { ConvertLeadForm, LeadForm } from '@/components/forms';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Field,
  FormError,
  LeadStatusBadge,
  LoadingBlock,
  Modal,
  PageHeader,
  Textarea,
} from '@/components/ui';
import {
  leadSourceLabels,
  leadStatusLabels,
  serviceTypeLabels,
} from '@/i18n';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { errorMessage, usePageTitle } from '@/lib/hooks';
import { NotFoundPage } from './NotFoundPage';

export function LeadDetailPage() {
  const params = useParams();
  const rawId = Number(params.id);
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  const toast = useToast();
  const navigate = useNavigate();

  const query = useLead(id);
  const update = useUpdateLead(id ?? 0);
  const convert = useConvertLead(id ?? 0);
  const remove = useDeleteLead();
  const lead = query.data;

  usePageTitle(lead?.companyName ?? 'Лид');

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<unknown>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState<unknown>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertError, setConvertError] = useState<unknown>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!id) return <NotFoundPage />;

  if (query.isPending) {
    return (
      <div className="page">
        <PageHeader eyebrow="Лиды" title="Загрузка лида…" />
        <div className="panel">
          <div className="panel-body">
            <LoadingBlock rows={6} />
          </div>
        </div>
      </div>
    );
  }

  if (query.isError || !lead) {
    return (
      <div className="page">
        <PageHeader
          eyebrow={<Link to="/leads">← Лиды</Link>}
          title="Лид не найден"
          subtitle="Возможно, запись удалена или ссылка устарела."
        />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const converted = lead.status === 'converted';
  const canConvert = !converted && lead.status !== 'disqualified';

  const submitEdit = async (input: LeadInput) => {
    try {
      setEditError(null);
      await update.mutateAsync(input);
      toast.push('Лид обновлён', 'success');
      setEditOpen(false);
    } catch (error) {
      setEditError(error);
    }
  };

  const saveNotes = async () => {
    try {
      setNotesError(null);
      await update.mutateAsync({ notes: notes.trim() || null });
      toast.push('Заметки сохранены', 'success');
      setNotesOpen(false);
    } catch (error) {
      setNotesError(error);
    }
  };

  const submitConvert = async (input: ConvertLeadInput) => {
    try {
      setConvertError(null);
      const result = await convert.mutateAsync(input);
      toast.push(
        result.alreadyConverted
          ? 'Лид уже был конвертирован — дубли не созданы'
          : 'Лид конвертирован в компанию, контакт и сделку',
        'success',
      );
      setConvertOpen(false);
    } catch (error) {
      setConvertError(error);
    }
  };

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(lead.id);
      toast.push('Лид удалён', 'success');
      navigate('/leads');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
      setDeleteOpen(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <Link className="back-link" to="/leads">
            <Icon name="arrow-left" size={14} />
            Лиды
          </Link>
        }
        title={
          <>
            {lead.companyName}
            <LeadStatusBadge status={lead.status} />
          </>
        }
        subtitle={
          <>
            {lead.contactName}
            {lead.email ? ` · ${lead.email}` : ''}
            {lead.phone ? ` · ${lead.phone}` : ''}
          </>
        }
        actions={
          <>
            {converted ? (
              <Button
                variant="secondary"
                size="sm"
                icon="edit"
                onClick={() => {
                  setNotes(lead.notes ?? '');
                  setNotesError(null);
                  setNotesOpen(true);
                }}
              >
                Заметки
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                icon="edit"
                onClick={() => {
                  setEditError(null);
                  setEditOpen(true);
                }}
              >
                Редактировать
              </Button>
            )}
            {canConvert ? (
              <Button
                variant="primary"
                size="sm"
                icon="leads"
                onClick={() => {
                  setConvertError(null);
                  setConvertOpen(true);
                }}
              >
                Конвертировать
              </Button>
            ) : null}
            <Button
              variant="danger-ghost"
              size="sm"
              icon="trash"
              onClick={() => setDeleteOpen(true)}
            >
              Удалить
            </Button>
          </>
        }
      />

      <div className="detail-layout">
        <div className="detail-main">
          {converted ? (
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">
                  <Icon name="check" size={16} />
                  Лид конвертирован
                </h2>
                <span className="muted small">{formatDateTime(lead.convertedAt)}</span>
              </div>
              <div className="panel-body">
                <div className="lead-conversion">
                  <div className="lead-conversion-title">
                    <Icon name="check" size={15} />
                    Созданные записи
                  </div>
                  <div className="lead-conversion-links">
                    {lead.convertedCompanyId ? (
                      <Link
                        className="conversion-link"
                        to={`/companies/${lead.convertedCompanyId}`}
                      >
                        <Icon name="building" size={14} />
                        Компания
                      </Link>
                    ) : null}
                    {lead.convertedContactId ? (
                      <Link
                        className="conversion-link"
                        to={`/contacts/${lead.convertedContactId}`}
                      >
                        <Icon name="user" size={14} />
                        Контакт
                      </Link>
                    ) : null}
                    {lead.convertedDealId ? (
                      <Link
                        className="conversion-link"
                        to={`/deals/${lead.convertedDealId}`}
                      >
                        <Icon name="deals" size={14} />
                        Сделка
                      </Link>
                    ) : null}
                  </div>
                  <div className="muted small">
                    Повторная конвертация безопасна: связанные записи не дублируются.
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">
                <Icon name="note" size={16} />
                Заметки
              </h2>
              <span className="muted small">{lead.owner.name}</span>
            </div>
            <div className="panel-body">
              {lead.notes ? (
                <div className="notes">{lead.notes}</div>
              ) : (
                <div className="notes empty-notes">Заметок пока нет.</div>
              )}
            </div>
          </section>

          <EntityActivities
            entityType="lead"
            entityId={lead.id}
            relatedLabel={`${lead.companyName} · ${lead.contactName}`}
          />
          <AuditTrail entityType="lead" entityId={lead.id} />
        </div>

        <aside className="detail-aside">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">
                <Icon name="leads" size={16} />
                Карточка лида
              </h2>
            </div>
            <div className="panel-body">
              <div className="info-list">
                <div className="info-row">
                  <span className="info-label">Статус</span>
                  <span className="info-value">{leadStatusLabels[lead.status]}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Источник</span>
                  <span className="info-value">{leadSourceLabels[lead.source]}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Услуга</span>
                  <span className="info-value">
                    {lead.serviceType ? serviceTypeLabels[lead.serviceType] : '—'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Оценка бюджета</span>
                  <span className="info-value">
                    {formatMoney(lead.estimatedAmountMinor, lead.currency)}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Email</span>
                  <span className="info-value">
                    {lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : '—'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Телефон</span>
                  <span className="info-value">
                    {lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : '—'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Владелец</span>
                  <span className="info-value">{lead.owner.name}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Создан</span>
                  <span className="info-value">{formatDate(lead.createdAt)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Обновлён</span>
                  <span className="info-value">{formatDate(lead.updatedAt)}</span>
                </div>
              </div>
            </div>
          </section>

          <EntityTasks
            entityType="lead"
            entityId={lead.id}
            relatedLabel={`${lead.companyName} · ${lead.contactName}`}
          />
        </aside>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Редактировать лид"
        size="lg"
      >
        <LeadForm
          initial={lead}
          onSubmit={submitEdit}
          submitting={update.isPending}
          error={editError}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      <Modal
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        title="Заметки лида"
        description="Конвертированный лид можно менять только в заметках."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNotesOpen(false)} disabled={update.isPending}>
              Отмена
            </Button>
            <Button variant="primary" onClick={() => void saveNotes()} loading={update.isPending}>
              Сохранить
            </Button>
          </>
        }
      >
        <div className="stack-sm">
          <FormError error={notesError} />
          <Field label="Заметки" htmlFor="lead-notes">
            <Textarea
              id="lead-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={5}
              maxLength={10_000}
              data-autofocus
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        title="Конвертировать лид"
        description={`${lead.companyName} · ${lead.contactName}`}
        size="lg"
      >
        {convertOpen ? (
          <ConvertLeadForm
            lead={lead}
            onSubmit={submitConvert}
            submitting={convert.isPending}
            error={convertError}
            onCancel={() => setConvertOpen(false)}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
        title="Удалить лид?"
        message={`«${lead.companyName} · ${lead.contactName}» будет скрыт. Связанные активности и задачи тоже скроются.`}
        busy={remove.isPending}
      />
    </div>
  );
}
