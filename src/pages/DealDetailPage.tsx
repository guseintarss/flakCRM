import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useChangeDealStage, useDeal, useDeleteDeal, useUpdateDeal } from '@/api/queries';
import {
  AuditTrail,
  EntityActivities,
  EntityTasks,
  StageHistoryList,
} from '@/components/entity-sections';
import { DealForm, type DealFormValues } from '@/components/forms';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import {
  Button,
  DealStatusBadge,
  ErrorState,
  Field,
  FormError,
  LoadingBlock,
  Modal,
  PageHeader,
  Textarea,
  ConfirmDialog,
  cx,
} from '@/components/ui';
import { leadSourceLabels, serviceTypeLabels } from '@/i18n';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { errorMessage, usePageTitle } from '@/lib/hooks';
import { useAppMeta } from '@/lib/meta';
import { NotFoundPage } from './NotFoundPage';

export function DealDetailPage() {
  const params = useParams();
  const rawId = Number(params.id);
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  const meta = useAppMeta();
  const toast = useToast();
  const navigate = useNavigate();

  const query = useDeal(id);
  const update = useUpdateDeal(id ?? 0);
  const remove = useDeleteDeal();
  const changeStage = useChangeDealStage(id ?? undefined);

  const deal = query.data;

  usePageTitle(deal?.title ?? 'Сделка');

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<unknown>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [lostError, setLostError] = useState<unknown>(null);
  const [movingTo, setMovingTo] = useState<number | null>(null);

  if (!id) return <NotFoundPage />;

  if (query.isPending) {
    return (
      <div className="page">
        <PageHeader eyebrow="Сделки" title="Загрузка сделки…" />
        <div className="panel">
          <div className="panel-body">
            <LoadingBlock rows={6} />
          </div>
        </div>
      </div>
    );
  }

  if (query.isError || !deal) {
    return (
      <div className="page">
        <PageHeader
          eyebrow={<Link to="/deals">← Сделки</Link>}
          title="Сделка не найдена"
          subtitle="Возможно, запись удалена или ссылка устарела."
        />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const stages = meta.pipeline.stages;
  const isOpen = deal.status === 'open';

  const submitEdit = async (values: DealFormValues) => {
    const { stageId: _ignored, ...rest } = values;
    try {
      setEditError(null);
      await update.mutateAsync({ ...rest, version: deal.version });
      toast.push('Сделка обновлена', 'success');
      setEditOpen(false);
    } catch (error) {
      setEditError(error);
    }
  };

  const markWon = async () => {
    try {
      await update.mutateAsync({ version: deal.version, status: 'won' });
      toast.push('Сделка отмечена выигранной', 'success');
      setWonOpen(false);
    } catch (error) {
      toast.push(errorMessage(error), 'error');
      setWonOpen(false);
      void query.refetch();
    }
  };

  const markLost = async () => {
    if (!lostReason.trim()) return;
    try {
      setLostError(null);
      await update.mutateAsync({
        version: deal.version,
        status: 'lost',
        lostReason: lostReason.trim(),
      });
      toast.push('Сделка отмечена проигранной', 'success');
      setLostOpen(false);
      setLostReason('');
    } catch (error) {
      setLostError(error);
      void query.refetch();
    }
  };

  const reopen = async () => {
    try {
      await update.mutateAsync({ version: deal.version, status: 'open' });
      toast.push('Сделка возвращена в работу', 'success');
      setReopenOpen(false);
    } catch (error) {
      toast.push(errorMessage(error), 'error');
      setReopenOpen(false);
      void query.refetch();
    }
  };

  const moveToStage = async (stageId: number, stageName: string) => {
    if (!isOpen || stageId === deal.stage.id) return;
    setMovingTo(stageId);
    try {
      const result = await changeStage.mutateAsync({
        dealId: deal.id,
        stageId,
        version: deal.version,
      });
      if (result.changed) toast.push(`Стадия изменена: ${stageName}`, 'success');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
      void query.refetch();
    } finally {
      setMovingTo(null);
    }
  };

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(deal.id);
      toast.push('Сделка удалена', 'success');
      navigate('/deals');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
      setDeleteOpen(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <Link className="back-link" to="/deals">
            <Icon name="arrow-left" size={14} />
            Сделки
          </Link>
        }
        title={
          <>
            {deal.title}
            <DealStatusBadge status={deal.status} />
          </>
        }
        subtitle={
          <>
            {deal.company ? (
              <Link to={`/companies/${deal.company.id}`}>{deal.company.name}</Link>
            ) : (
              'Без компании'
            )}
            {deal.primaryContact ? (
              <>
                {' · '}
                <Link to={`/contacts/${deal.primaryContact.id}`}>
                  {deal.primaryContact.fullName}
                </Link>
              </>
            ) : null}
            {' · '}
            {serviceTypeLabels[deal.serviceType]}
          </>
        }
        actions={
          <>
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
          <section className="panel">
            <div className="panel-body deal-hero">
              <div className="deal-hero-top">
                <div>
                  <div className="deal-amount">{formatMoney(deal.amountMinor, deal.currency)}</div>
                  <div className="deal-amount-sub">
                    {serviceTypeLabels[deal.serviceType]}
                    {deal.source ? ` · ${leadSourceLabels[deal.source]}` : ''}
                    {' · '}версия {deal.version}
                  </div>
                </div>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  {isOpen ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="close"
                        onClick={() => {
                          setLostReason('');
                          setLostError(null);
                          setLostOpen(true);
                        }}
                      >
                        Проиграна
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        icon="check"
                        onClick={() => setWonOpen(true)}
                      >
                        Выиграна
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="arrow-left"
                      onClick={() => setReopenOpen(true)}
                    >
                      Вернуть в работу
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <div className="section-head" style={{ marginBottom: 8 }}>
                  <span className="section-title">Стадия</span>
                  <span className="muted small">
                    {deal.stage.probability}% вероятность · нажмите, чтобы перейти
                  </span>
                </div>
                <div className="stage-steps">
                  {stages.map((stage) => {
                    const current = stage.id === deal.stage.id;
                    const past = stage.position < deal.stage.position;
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        className={cx('stage-step', current && 'current', past && 'past')}
                        disabled={!isOpen || current || movingTo !== null}
                        onClick={() => void moveToStage(stage.id, stage.name)}
                        aria-current={current ? 'step' : undefined}
                      >
                        {current ? <Icon name="check" size={13} /> : null}
                        {stage.name}
                      </button>
                    );
                  })}
                </div>
                {!isOpen ? (
                  <div className="inline-note" style={{ marginTop: 10 }}>
                    <Icon name="note" size={14} />
                    <span>
                      Сделка закрыта. Стадии недоступны, пока вы не вернёте её в работу.
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <EntityActivities
            entityType="deal"
            entityId={deal.id}
            relatedLabel={deal.title}
          />
          <StageHistoryList dealId={deal.id} />
          <AuditTrail entityType="deal" entityId={deal.id} />
        </div>

        <aside className="detail-aside">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">
                <Icon name="note" size={16} />
                Детали
              </h2>
            </div>
            <div className="panel-body">
              <div className="info-list">
                <div className="info-row">
                  <span className="info-label">Компания</span>
                  <span className="info-value">
                    {deal.company ? (
                      <Link to={`/companies/${deal.company.id}`}>{deal.company.name}</Link>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Контакт</span>
                  <span className="info-value">
                    {deal.primaryContact ? (
                      <Link to={`/contacts/${deal.primaryContact.id}`}>
                        {deal.primaryContact.fullName}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Услуга</span>
                  <span className="info-value">{serviceTypeLabels[deal.serviceType]}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Источник</span>
                  <span className="info-value">
                    {deal.source ? leadSourceLabels[deal.source] : '—'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Ожидаемое закрытие</span>
                  <span className="info-value">{formatDate(deal.expectedCloseDate)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Закрыта</span>
                  <span className="info-value">{formatDateTime(deal.closedAt)}</span>
                </div>
                {deal.status === 'lost' ? (
                  <div className="info-row">
                    <span className="info-label">Причина проигрыша</span>
                    <span className="info-value">{deal.lostReason ?? '—'}</span>
                  </div>
                ) : null}
                <div className="info-row">
                  <span className="info-label">Владелец</span>
                  <span className="info-value">{deal.owner.name}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Обновлена</span>
                  <span className="info-value">{formatDateTime(deal.updatedAt)}</span>
                </div>
              </div>
            </div>
          </section>

          <EntityTasks entityType="deal" entityId={deal.id} relatedLabel={deal.title} />
        </aside>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Редактировать сделку"
        description={`Версия ${deal.version}. При конфликте изменения не будут перезаписаны.`}
        size="lg"
      >
        <DealForm
          initial={deal}
          onSubmit={submitEdit}
          submitting={update.isPending}
          error={editError}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      <Modal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Почему сделка проиграна?"
        description="Причина сохранится в истории и поможет разобрать отказы позже."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLostOpen(false)} disabled={update.isPending}>
              Отмена
            </Button>
            <Button
              variant="danger"
              onClick={() => void markLost()}
              loading={update.isPending}
              disabled={!lostReason.trim()}
            >
              Отметить проигранной
            </Button>
          </>
        }
      >
        <div className="stack-sm">
          <FormError error={lostError} />
          <Field label="Причина" htmlFor="lost-reason" required>
            <Textarea
              id="lost-reason"
              value={lostReason}
              onChange={(event) => setLostReason(event.target.value)}
              placeholder="Например: выбрали подрядчика с меньшим бюджетом"
              rows={3}
              maxLength={500}
              data-autofocus
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={wonOpen}
        onClose={() => setWonOpen(false)}
        onConfirm={() => void markWon()}
        title="Отметить сделку выигранной?"
        message="Сумма и дата закрытия зафиксируются в отчётах, сделка уйдёт из открытой воронки."
        confirmLabel="Выиграна"
        tone="primary"
        busy={update.isPending}
      />

      <ConfirmDialog
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        onConfirm={() => void reopen()}
        title="Вернуть сделку в работу?"
        message="Дата закрытия и причина проигрыша будут очищены. Стадию можно будет менять снова."
        confirmLabel="Вернуть в работу"
        tone="primary"
        busy={update.isPending}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
        title="Удалить сделку?"
        message={`«${deal.title}» и связанные с ней активности и задачи будут скрыты. Действие попадёт в аудит.`}
        busy={remove.isPending}
      />
    </div>
  );
}
