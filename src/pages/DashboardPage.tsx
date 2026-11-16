import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Currency, Task } from '@shared/types';
import { useDashboard, useToggleTask } from '@/api/queries';
import { ActivityTimelineItem } from '@/components/entity-sections';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Select,
} from '@/components/ui';
import {
  addDays,
  formatCompactMoney,
  formatDate,
  formatDueDate,
  formatMoney,
  formatMonth,
  formatPercent,
  pluralRu,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from '@/lib/format';
import { errorMessage, usePageTitle } from '@/lib/hooks';
import { useAppMeta } from '@/lib/meta';

type Preset = 'month' | 'quarter' | 'year' | '30d';

const presets: Array<{ id: Preset; label: string }> = [
  { id: 'month', label: 'Этот месяц' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'year', label: 'Год' },
  { id: '30d', label: '30 дней' },
];

export function DashboardPage() {
  const meta = useAppMeta();
  usePageTitle('Обзор');
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>('month');
  const [currency, setCurrency] = useState<Currency>(meta.workspace.baseCurrency);

  const from =
    preset === 'month'
      ? startOfMonth(meta.today)
      : preset === 'quarter'
        ? startOfQuarter(meta.today)
        : preset === 'year'
          ? startOfYear(meta.today)
          : addDays(meta.today, -29);

  const query = useDashboard({ from, to: meta.today, currency });
  const toggleTask = useToggleTask();

  const handleToggle = async (task: Task) => {
    try {
      await toggleTask.mutateAsync({
        id: task.id,
        status: task.status === 'open' ? 'done' : 'open',
      });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  const data = query.data;
  const currencies = data?.availableCurrencies ?? [meta.workspace.baseCurrency];
  const trendMax = data
    ? Math.max(1, ...data.trend.flatMap((point) => [point.wonMinor, point.lostMinor]))
    : 1;

  return (
    <div className="page">
      <PageHeader
        eyebrow={meta.workspace.name}
        title="Обзор"
        subtitle={
          <>
            {formatDate(from)} — {formatDate(meta.today)} · продажи в валюте {currency} ·{' '}
            {meta.workspace.timezone}
          </>
        }
        actions={
          <>
            <div className="segmented" role="group" aria-label="Период дашборда">
              {presets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={preset === item.id ? 'active' : undefined}
                  onClick={() => setPreset(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Select
              aria-label="Валюта дашборда"
              style={{ width: 96 }}
              value={currency}
              onChange={(event) => setCurrency(event.target.value as Currency)}
            >
              {currencies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </>
        }
      />

      {query.isPending ? (
        <div className="stack">
          <div className="kpi-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="kpi" key={index}>
                <div className="skeleton skeleton-line" style={{ width: '55%' }} />
                <div className="skeleton" style={{ height: 27, width: '72%' }} />
                <div className="skeleton skeleton-line" style={{ width: '60%' }} />
              </div>
            ))}
          </div>
          <div className="dashboard-grid">
            <div className="panel">
              <div className="panel-head">
                <div className="skeleton skeleton-line" style={{ width: 160 }} />
              </div>
              <div className="panel-body">
                <LoadingBlock rows={5} />
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <div className="skeleton skeleton-line" style={{ width: 110 }} />
              </div>
              <div className="panel-body">
                <LoadingBlock rows={4} />
              </div>
            </div>
          </div>
        </div>
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-head">
                <Icon name="target" size={15} />
                Открытый пайплайн
              </div>
              <div className="kpi-value">
                {formatCompactMoney(data.pipeline.amountMinor, data.currency)}
              </div>
              <div className="kpi-foot">
                {data.pipeline.dealCount}{' '}
                {pluralRu(data.pipeline.dealCount, 'сделка', 'сделки', 'сделок')} в работе
              </div>
            </div>
            <div className="kpi kpi-cyan">
              <div className="kpi-head">
                <Icon name="spark" size={15} />
                Взвешенный прогноз
              </div>
              <div className="kpi-value">
                {formatCompactMoney(data.pipeline.weightedAmountMinor, data.currency)}
              </div>
              <div className="kpi-foot">
                {data.pipeline.amountMinor > 0
                  ? `${formatPercent(
                      data.pipeline.weightedAmountMinor / data.pipeline.amountMinor,
                    )} от суммы пайплайна`
                  : 'Пока нет открытых сделок'}
              </div>
            </div>
            <div className="kpi kpi-green">
              <div className="kpi-head">
                <Icon name="check" size={15} />
                Выиграно за период
              </div>
              <div className="kpi-value">
                {formatCompactMoney(data.won.amountMinor, data.currency)}
              </div>
              <div className="kpi-foot">
                {data.won.dealCount}{' '}
                {pluralRu(data.won.dealCount, 'сделка', 'сделки', 'сделок')} · средний чек{' '}
                {formatCompactMoney(data.won.averageAmountMinor, data.currency)}
              </div>
            </div>
            <div className="kpi kpi-amber">
              <div className="kpi-head">
                <Icon name="chart" size={15} />
                Win rate
              </div>
              <div className="kpi-value">{formatPercent(data.winRate)}</div>
              <div className="kpi-foot">
                Проиграно {data.lost.dealCount} на{' '}
                {formatCompactMoney(data.lost.amountMinor, data.currency)}
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="stack">
              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">
                    <Icon name="deals" size={16} />
                    Пайплайн по стадиям
                  </h2>
                  <Link className="small" to="/deals">
                    Открыть сделки →
                  </Link>
                </div>
                <div className="panel-body">
                  {data.pipeline.dealCount === 0 ? (
                    <EmptyState
                      icon="deals"
                      title="Открытых сделок нет"
                      text="Создайте сделку — она сразу появится в воронке и в прогнозе."
                      action={
                        <Link className="btn btn-primary btn-sm" to="/deals">
                          Перейти к сделкам
                        </Link>
                      }
                    />
                  ) : (
                    <div className="bars">
                      {data.pipeline.stages.map((item) => {
                        const width =
                          data.pipeline.amountMinor > 0
                            ? Math.round((item.amountMinor / data.pipeline.amountMinor) * 100)
                            : 0;
                        return (
                          <div className="bar-row" key={item.stage.id}>
                            <div className="bar-label">
                              <span className="bar-label-name">{item.stage.name}</span>
                              <span className="bar-label-count">
                                {item.dealCount}{' '}
                                {pluralRu(item.dealCount, 'сделка', 'сделки', 'сделок')} ·{' '}
                                {item.stage.probability}%
                              </span>
                            </div>
                            <div className="bar-track" aria-hidden="true">
                              <div className="bar-fill" style={{ width: `${width}%` }} />
                            </div>
                            <div className="bar-value">
                              {formatCompactMoney(item.amountMinor, data.currency)}
                              <small>
                                прогноз {formatCompactMoney(item.weightedAmountMinor, data.currency)}
                              </small>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">
                    <Icon name="chart" size={16} />
                    Закрытия за 6 месяцев
                  </h2>
                  <div className="legend">
                    <span className="legend-item">
                      <span className="legend-dot won" /> выиграно
                    </span>
                    <span className="legend-item">
                      <span className="legend-dot lost" /> проиграно
                    </span>
                  </div>
                </div>
                <div className="panel-body">
                  <div className="trend">
                    {data.trend.map((point) => (
                      <div
                        className="trend-col"
                        key={point.month}
                        role="img"
                        aria-label={`${formatMonth(point.month)}: выиграно ${formatMoney(
                          point.wonMinor,
                          data.currency,
                        )}, проиграно ${formatMoney(point.lostMinor, data.currency)}`}
                        title={`${formatMonth(point.month)}\nВыиграно: ${formatMoney(
                          point.wonMinor,
                          data.currency,
                        )}\nПроиграно: ${formatMoney(point.lostMinor, data.currency)}`}
                      >
                        <div className="trend-bars">
                          <div
                            className="trend-bar won"
                            style={{
                              height: `${Math.max(2, Math.round((point.wonMinor / trendMax) * 100))}%`,
                            }}
                          />
                          <div
                            className="trend-bar lost"
                            style={{
                              height: `${Math.max(2, Math.round((point.lostMinor / trendMax) * 100))}%`,
                            }}
                          />
                        </div>
                        <div className="trend-month">{formatMonth(point.month)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">
                    <Icon name="activities" size={16} />
                    Последние активности
                  </h2>
                  <Link className="small" to="/activities">
                    Все активности →
                  </Link>
                </div>
                <div className="panel-body">
                  {data.recentActivities.length === 0 ? (
                    <EmptyState
                      icon="activities"
                      title="Активностей пока нет"
                      text="Звонки, письма и встречи будут собираться здесь в единый timeline."
                    />
                  ) : (
                    <div className="timeline">
                      {data.recentActivities.map((activity) => (
                        <ActivityTimelineItem key={activity.id} activity={activity} />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="dash-side">
              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">
                    <Icon name="tasks" size={16} />
                    Задачи
                  </h2>
                  <Link className="small" to="/tasks">
                    Все →
                  </Link>
                </div>
                <div className="panel-body">
                  <div className="row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
                    <Badge tone="neutral">{data.tasks.openCount} открытых</Badge>
                    <Badge tone={data.tasks.overdueCount > 0 ? 'red' : 'neutral'}>
                      {data.tasks.overdueCount} просрочено
                    </Badge>
                    <Badge tone={data.tasks.dueTodayCount > 0 ? 'amber' : 'neutral'}>
                      {data.tasks.dueTodayCount} сегодня
                    </Badge>
                  </div>
                  {data.tasks.upcoming.length === 0 ? (
                    <div className="muted small" style={{ padding: '10px 0' }}>
                      На ближайшие 7 дней задач нет.
                    </div>
                  ) : (
                    <div>
                      {data.tasks.upcoming.map((task) => (
                        <label
                          className={`task-mini ${task.status === 'done' ? 'done' : ''}`}
                          key={task.id}
                        >
                          <input
                            type="checkbox"
                            className="task-mini-check"
                            checked={task.status === 'done'}
                            onChange={() => void handleToggle(task)}
                            disabled={toggleTask.isPending}
                            aria-label={
                              task.status === 'done'
                                ? 'Вернуть задачу в работу'
                                : 'Отметить задачу выполненной'
                            }
                          />
                          <span className="task-mini-body">
                            <span className="task-mini-title">{task.title}</span>
                            <span className="task-mini-meta">
                              {formatDueDate(task.dueDate, meta.today)} · {task.relatedLabel}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <Link className="btn btn-secondary btn-sm btn-block" to="/tasks">
                      Открыть задачи
                    </Link>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">
                    <Icon name="spark" size={16} />
                    Быстрый старт
                  </h2>
                </div>
                <div className="panel-body">
                  <div className="stack-sm">
                    <Link className="btn btn-secondary btn-block" to="/leads">
                      <Icon name="leads" size={15} />
                      Обработать лиды
                    </Link>
                    <Link className="btn btn-secondary btn-block" to="/companies">
                      <Icon name="building" size={15} />
                      Компании и контакты
                    </Link>
                    <Link className="btn btn-secondary btn-block" to="/activities">
                      <Icon name="activities" size={15} />
                      Зафиксировать активность
                    </Link>
                  </div>
                  <div className="inline-note" style={{ marginTop: 12 }}>
                    <Icon name="note" size={14} />
                    <span>
                      Ctrl/Cmd + K открывает поиск по всей базе. Данные каждого бизнеса хранятся
                      отдельно и доступны только его команде.
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
