import type { z } from 'zod';
import type { Db } from '../db';
import type { Dashboard, DashboardStage, DashboardTrendPoint } from '../../shared/types';
import { ApiError } from '../http';
import {
  addDays,
  localDateToUtc,
  monthKey,
  recentMonths,
  startOfMonth,
  todayInTimeZone,
} from '../lib/dates';
import type {
  activitiesQuerySchema,
  dashboardQuerySchema,
  tasksQuerySchema,
} from '../schemas';
import { getPipeline, getWorkspace } from './entities';
import { listActivities } from './activities';
import { listTasks } from './tasks';

type Row = Record<string, unknown>;
type Query = z.infer<typeof dashboardQuerySchema>;

export function getDashboard(db: Db, query: Query): Dashboard {
  const workspace = getWorkspace(db);
  const today = todayInTimeZone(workspace.timezone);
  const from = query.from ?? startOfMonth(today);
  const to = query.to ?? today;
  if (from > to) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Начало периода больше конца.');
  }
  const days = Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000,
  );
  if (days > 366) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Период не может быть больше 366 дней.');
  }

  const currency = query.currency ?? (workspace.baseCurrency as Dashboard['currency']);
  const fromUtc = localDateToUtc(from, workspace.timezone, false);
  const toUtc = localDateToUtc(to, workspace.timezone, true);
  const pipeline = getPipeline(db);

  const stageRows = db
    .prepare(
      `SELECT d.stage_id AS stageId, COUNT(*) AS dealCount,
        COALESCE(SUM(d.amount_minor), 0) AS amountMinor,
        COALESCE(ROUND(SUM(d.amount_minor * s.probability / 100.0)), 0) AS weightedAmountMinor
       FROM deal d JOIN stage s ON s.id = d.stage_id
       WHERE d.workspace_id = 1 AND d.deleted_at IS NULL AND d.status = 'open'
         AND d.currency = ?
       GROUP BY d.stage_id`,
    )
    .all(currency) as Row[];
  const byStage = new Map(
    stageRows.map((row) => [
      Number(row.stageId),
      {
        dealCount: Number(row.dealCount),
        amountMinor: Number(row.amountMinor),
        weightedAmountMinor: Number(row.weightedAmountMinor),
      },
    ]),
  );
  const stages: DashboardStage[] = pipeline.stages.map((stage) => ({
    stage,
    ...(byStage.get(stage.id) ?? { dealCount: 0, amountMinor: 0, weightedAmountMinor: 0 }),
  }));
  const pipelineSummary = stages.reduce(
    (acc, item) => ({
      dealCount: acc.dealCount + item.dealCount,
      amountMinor: acc.amountMinor + item.amountMinor,
      weightedAmountMinor: acc.weightedAmountMinor + item.weightedAmountMinor,
    }),
    { dealCount: 0, amountMinor: 0, weightedAmountMinor: 0 },
  );

  const won = db
    .prepare(
      `SELECT COUNT(*) AS dealCount, COALESCE(SUM(amount_minor), 0) AS amountMinor
       FROM deal WHERE workspace_id = 1 AND deleted_at IS NULL AND status = 'won'
         AND currency = ? AND closed_at >= ? AND closed_at <= ?`,
    )
    .get(currency, fromUtc, toUtc) as Row;
  const lost = db
    .prepare(
      `SELECT COUNT(*) AS dealCount, COALESCE(SUM(amount_minor), 0) AS amountMinor
       FROM deal WHERE workspace_id = 1 AND deleted_at IS NULL AND status = 'lost'
         AND currency = ? AND closed_at >= ? AND closed_at <= ?`,
    )
    .get(currency, fromUtc, toUtc) as Row;
  const wonCount = Number(won.dealCount);
  const lostCount = Number(lost.dealCount);
  const wonAmount = Number(won.amountMinor);
  const lostAmount = Number(lost.amountMinor);

  const taskCounts = db
    .prepare(
      `SELECT
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS openCount,
        SUM(CASE WHEN status = 'open' AND due_date < ? THEN 1 ELSE 0 END) AS overdueCount,
        SUM(CASE WHEN status = 'open' AND due_date = ? THEN 1 ELSE 0 END) AS dueTodayCount
       FROM task WHERE workspace_id = 1 AND deleted_at IS NULL`,
    )
    .get(today, today) as Row;
  const upcomingQuery: z.infer<typeof tasksQuerySchema> = {
    page: 1,
    pageSize: 5,
    status: 'open',
    dueFrom: today,
    dueTo: addDays(today, 7),
    sort: 'dueDate',
  };
  const upcoming = listTasks(db, upcomingQuery).data;

  const activitiesQuery: z.infer<typeof activitiesQuerySchema> = {
    page: 1,
    pageSize: 10,
    sort: '-occurredAt',
  };
  const recentActivities = listActivities(db, activitiesQuery).data;

  const currencies = new Set<string>([workspace.baseCurrency]);
  for (const row of db
    .prepare('SELECT DISTINCT currency FROM deal WHERE workspace_id = 1 AND deleted_at IS NULL')
    .all() as Row[]) {
    currencies.add(String(row.currency));
  }

  const trend = buildTrend(db, currency, today, workspace.timezone);

  return {
    period: { from, to, timezone: workspace.timezone },
    currency,
    availableCurrencies: [...currencies] as Dashboard['availableCurrencies'],
    pipeline: { ...pipelineSummary, stages },
    won: {
      dealCount: wonCount,
      amountMinor: wonAmount,
      averageAmountMinor: wonCount ? Math.round(wonAmount / wonCount) : 0,
    },
    lost: { dealCount: lostCount, amountMinor: lostAmount },
    winRate: wonCount + lostCount > 0 ? wonCount / (wonCount + lostCount) : null,
    tasks: {
      openCount: Number(taskCounts.openCount ?? 0),
      overdueCount: Number(taskCounts.overdueCount ?? 0),
      dueTodayCount: Number(taskCounts.dueTodayCount ?? 0),
      upcoming,
    },
    recentActivities,
    trend,
  };
}

function buildTrend(
  db: Db,
  currency: Dashboard['currency'],
  today: string,
  timeZone: string,
): DashboardTrendPoint[] {
  const months = recentMonths(6, today);
  const startMonth = months[0];
  const startUtc = localDateToUtc(`${startMonth}-01`, timeZone, false);
  const rows = db
    .prepare(
      `SELECT status, amount_minor AS amountMinor, closed_at AS closedAt
       FROM deal WHERE workspace_id = 1 AND deleted_at IS NULL
         AND status IN ('won', 'lost') AND currency = ? AND closed_at >= ?`,
    )
    .all(currency, startUtc) as Row[];
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  });
  const byMonth = new Map<string, { wonMinor: number; lostMinor: number }>();
  for (const row of rows) {
    if (!row.closedAt) continue;
    const key = formatter.format(new Date(String(row.closedAt)));
    const point = byMonth.get(key) ?? { wonMinor: 0, lostMinor: 0 };
    if (row.status === 'won') point.wonMinor += Number(row.amountMinor);
    else point.lostMinor += Number(row.amountMinor);
    byMonth.set(key, point);
  }
  return months.map((month) => ({
    month,
    ...(byMonth.get(month) ?? { wonMinor: 0, lostMinor: 0 }),
  }));
}

export function availableCurrenciesForDeals(db: Db): string[] {
  return (db
    .prepare('SELECT DISTINCT currency FROM deal WHERE workspace_id = 1 AND deleted_at IS NULL')
    .all() as Row[]).map((row) => String(row.currency));
}

export function daysInPeriod(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function monthOf(date: string): string {
  return monthKey(date);
}
