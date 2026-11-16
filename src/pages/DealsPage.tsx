import { useState, type KeyboardEvent, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { DealCard, DealStatus } from '@shared/types';
import { downloadCsv } from '@/api/client';
import { useChangeDealStage, useCreateDeal, useDealBoard, useDeals } from '@/api/queries';
import { DealForm, type DealFormValues } from '@/components/forms';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import {
  Button,
  DealStatusBadge,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Select,
  cx,
} from '@/components/ui';
import {
  formatDate,
  formatMoney,
  pluralRu,
} from '@/lib/format';
import { errorMessage, useDebounced, usePageTitle } from '@/lib/hooks';
import { useAppMeta } from '@/lib/meta';
import { serviceTypeLabels } from '@/i18n';

type View = 'board' | 'table';
type TableStatus = DealStatus | 'all';

export function DealsPage() {
  const meta = useAppMeta();
  usePageTitle('Сделки');
  const toast = useToast();
  const navigate = useNavigate();

  const [view, setView] = useState<View>('board');
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 250);
  const [serviceType, setServiceType] = useState('');
  const [currency, setCurrency] = useState(meta.workspace.baseCurrency);
  const [status, setStatus] = useState<TableStatus>('open');
  const [sort, setSort] = useState('-updatedAt');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);

  const [dragging, setDragging] = useState<{
    deal: DealCard;
    stageId: number;
  } | null>(null);
  const [dragOverStage, setDragOverStage] = useState<number | null>(null);

  const commonFilters = {
    q: debouncedQ.trim() || undefined,
    serviceType: serviceType || undefined,
  };

  const boardQuery = useDealBoard({
    ...commonFilters,
    currency,
    limitPerStage: 100,
  });
  const tableQuery = useDeals({
    ...commonFilters,
    status,
    sort,
    page,
    pageSize: 25,
  });
  const create = useCreateDeal();
  const changeStage = useChangeDealStage();

  const board = boardQuery.data;
  const table = tableQuery.data;

  const moveDeal = async (
    deal: Pick<DealCard, 'id' | 'title' | 'version'>,
    fromStageId: number,
    toStageId: number,
    toStageName: string,
  ) => {
    if (fromStageId === toStageId) return;
    try {
      await changeStage.mutateAsync({
        dealId: deal.id,
        stageId: toStageId,
        version: deal.version,
      });
      toast.push(`«${deal.title}» → ${toStageName}`, 'success');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, stageId: number, stageName: string) => {
    event.preventDefault();
    setDragOverStage(null);
    const current = dragging;
    setDragging(null);
    if (!current) return;
    void moveDeal(current.deal, current.stageId, stageId, stageName);
  };

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    deal: DealCard,
    stageId: number,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate(`/deals/${deal.id}`);
      return;
    }
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || !board) {
      return;
    }
    event.preventDefault();
    const index = board.stages.findIndex((item) => item.stage.id === stageId);
    const next = board.stages[index + (event.key === 'ArrowRight' ? 1 : -1)];
    if (next) void moveDeal(deal, stageId, next.stage.id, next.stage.name);
  };

  const submitCreate = async (values: DealFormValues) => {
    try {
      setCreateError(null);
      const deal = await create.mutateAsync(values);
      toast.push('Сделка создана', 'success');
      setCreating(false);
      navigate(`/deals/${deal.id}`);
    } catch (error) {
      setCreateError(error);
    }
  };

  const boardTotal = board?.stages.reduce(
    (acc, item) => ({
      count: acc.count + item.dealCount,
      amount: acc.amount + item.amountMinor,
    }),
    { count: 0, amount: 0 },
  );

  const exportParams = {
    q: debouncedQ.trim() || undefined,
    serviceType: serviceType || undefined,
    ...(view === 'board'
      ? { status: 'open', currency }
      : { status, sort }),
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Продажи"
        title="Сделки"
        subtitle={
          view === 'board'
            ? board
              ? `${boardTotal?.count ?? 0} ${pluralRu(
                  boardTotal?.count ?? 0,
                  'сделка',
                  'сделки',
                  'сделок',
                )} в работе · ${formatMoney(boardTotal?.amount ?? 0, board.currency)}`
              : 'Воронка открытых сделок'
            : table
              ? `${table.page.total} ${pluralRu(
                  table.page.total,
                  'сделка',
                  'сделки',
                  'сделок',
                )} по выбранным фильтрам`
              : 'Список сделок'
        }
        actions={
          <>
            <div className="view-toggle" role="group" aria-label="Вид списка сделок">
              <button
                type="button"
                className={view === 'board' ? 'active' : undefined}
                onClick={() => setView('board')}
              >
                <Icon name="dashboard" size={14} />
                Канбан
              </button>
              <button
                type="button"
                className={view === 'table' ? 'active' : undefined}
                onClick={() => setView('table')}
              >
                <Icon name="filter" size={14} />
                Таблица
              </button>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={() => downloadCsv('deals', exportParams)}
            >
              CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="plus"
              onClick={() => {
                setCreateError(null);
                setCreating(true);
              }}
            >
              Новая сделка
            </Button>
          </>
        }
      />

      <div className="toolbar">
        <div className="search-field">
          <Icon name="search" size={16} />
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Сделка или компания"
            aria-label="Поиск сделок"
          />
        </div>
        <Select
          aria-label="Услуга"
          value={serviceType}
          onChange={(event) => {
            setServiceType(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Все услуги</option>
          {meta.enums.serviceTypes.map((item) => (
            <option value={item} key={item}>
              {serviceTypeLabels[item]}
            </option>
          ))}
        </Select>
        {view === 'board' ? (
          <Select
            aria-label="Валюта воронки"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as typeof currency)}
          >
            {meta.currencies.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </Select>
        ) : (
          <>
            <Select
              aria-label="Статус сделки"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as TableStatus);
                setPage(1);
              }}
            >
              <option value="all">Все статусы</option>
              <option value="open">В работе</option>
              <option value="won">Выиграны</option>
              <option value="lost">Проиграны</option>
            </Select>
            <Select
              aria-label="Сортировка сделок"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
            >
              <option value="-updatedAt">Сначала обновлённые</option>
              <option value="updatedAt">Сначала давние</option>
              <option value="-amountMinor">Сумма ↓</option>
              <option value="amountMinor">Сумма ↑</option>
              <option value="expectedCloseDate">Закрытие ↑</option>
              <option value="-expectedCloseDate">Закрытие ↓</option>
            </Select>
          </>
        )}
      </div>

      {view === 'board' ? (
        boardQuery.isPending ? (
          <div className="panel">
            <div className="panel-body">
              <LoadingBlock rows={8} />
            </div>
          </div>
        ) : boardQuery.isError || !board ? (
          <ErrorState error={boardQuery.error} onRetry={() => void boardQuery.refetch()} />
        ) : (
          <>
            <div className="row-between">
              <span className="board-hint">
                Перетащите карточку между колонками. С клавиатуры: Alt + ←/→ на карточке.
              </span>
              {board.truncated ? (
                <span className="badge badge-amber">
                  Показаны не все карточки стадии
                </span>
              ) : null}
            </div>
            <div className="board-scroll">
              <div className="board">
                {board.stages.map((column) => (
                  <div
                    className={cx(
                      'board-col',
                      dragOverStage === column.stage.id && 'drag-over',
                    )}
                    key={column.stage.id}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setDragOverStage(column.stage.id);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setDragOverStage(null);
                      }
                    }}
                    onDrop={(event) =>
                      handleDrop(event, column.stage.id, column.stage.name)
                    }
                  >
                    <div className="board-head">
                      <div className="board-head-top">
                        <div className="board-stage">
                          <span className="board-stage-dot" />
                          <span className="board-stage-name">{column.stage.name}</span>
                        </div>
                        <span className="board-count">
                          {column.dealCount} · {column.stage.probability}%
                        </span>
                      </div>
                      <div className="board-sum">
                        {formatMoney(column.amountMinor, board.currency)}
                      </div>
                    </div>
                    <div className="board-cards">
                      {column.deals.length === 0 ? (
                        <div className="board-empty">
                          <Icon name="deals" size={20} />
                          <span>Нет сделок</span>
                          <span>Перетащите карточку сюда</span>
                        </div>
                      ) : (
                        column.deals.map((deal) => (
                          <div
                            key={deal.id}
                            className={cx(
                              'deal-card',
                              dragging?.deal.id === deal.id && 'dragging',
                            )}
                            role="link"
                            tabIndex={0}
                            draggable
                            aria-label={`${deal.title}. ${formatMoney(
                              deal.amountMinor,
                              deal.currency,
                            )}. Alt со стрелками меняет стадию, Enter открывает.`}
                            onClick={() => navigate(`/deals/${deal.id}`)}
                            onKeyDown={(event) =>
                              handleCardKeyDown(event, deal, column.stage.id)
                            }
                            onDragStart={(event) => {
                              setDragging({ deal, stageId: column.stage.id });
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', String(deal.id));
                            }}
                            onDragEnd={() => {
                              setDragging(null);
                              setDragOverStage(null);
                            }}
                          >
                            <div className="deal-card-title">{deal.title}</div>
                            <div className="deal-card-company">
                              {deal.company?.name ?? 'Без компании'}
                            </div>
                            <div className="deal-card-foot">
                              <span className="deal-card-amount">
                                {formatMoney(deal.amountMinor, deal.currency)}
                              </span>
                              <span className="deal-card-meta">
                                <Icon name="calendar" size={12} />
                                {formatDate(deal.expectedCloseDate)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="board-col-foot">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="plus"
                        className="btn-block"
                        onClick={() => {
                          setCreateError(null);
                          setCreating(true);
                        }}
                      >
                        Добавить
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )
      ) : tableQuery.isPending ? (
        <div className="panel">
          <div className="panel-body">
            <LoadingBlock rows={8} />
          </div>
        </div>
      ) : tableQuery.isError || !table ? (
        <ErrorState error={tableQuery.error} onRetry={() => void tableQuery.refetch()} />
      ) : (
        <section className="panel">
          <div className="panel-body flush">
            {table.data.length === 0 ? (
              <EmptyState
                icon="deals"
                title="Сделок не найдено"
                text="Измените фильтры или создайте первую сделку — она попадёт в воронку."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    icon="plus"
                    onClick={() => setCreating(true)}
                  >
                    Новая сделка
                  </Button>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Сделка</th>
                      <th>Компания</th>
                      <th>Стадия</th>
                      <th>Статус</th>
                      <th className="num">Сумма</th>
                      <th>Закрытие</th>
                      <th>Обновлена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.data.map((deal) => (
                      <tr key={deal.id}>
                        <td>
                          <div className="cell-main">
                            <Link className="cell-title" to={`/deals/${deal.id}`}>
                              {deal.title}
                            </Link>
                            <span className="cell-sub">
                              {serviceTypeLabels[deal.serviceType]}
                              {deal.primaryContact ? ` · ${deal.primaryContact.fullName}` : ''}
                            </span>
                          </div>
                        </td>
                        <td>
                          {deal.company ? (
                            <Link className="cell-link" to={`/companies/${deal.company.id}`}>
                              {deal.company.name}
                            </Link>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className="tag">{deal.stage.name}</span>
                        </td>
                        <td>
                          <DealStatusBadge status={deal.status} />
                        </td>
                        <td className="num">{formatMoney(deal.amountMinor, deal.currency)}</td>
                        <td className="muted nowrap">{formatDate(deal.expectedCloseDate)}</td>
                        <td className="muted nowrap">{formatDate(deal.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {table.page.totalPages > 1 ? (
            <Pagination
              page={table.page.page}
              totalPages={table.page.totalPages}
              total={table.page.total}
              onChange={setPage}
              disabled={tableQuery.isFetching}
            />
          ) : null}
        </section>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Новая сделка"
        description="Сделка появится в открытой воронке выбранной стадии."
        size="lg"
      >
        {creating ? (
          <DealForm
            onSubmit={submitCreate}
            submitting={create.isPending}
            error={createError}
            onCancel={() => setCreating(false)}
          />
        ) : null}
      </Modal>
    </div>
  );
}
