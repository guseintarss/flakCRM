import type { z } from 'zod';
import { nowIso, type Db } from '../db';
import { ApiError, pageMeta, pagination } from '../http';
import { mapTask } from '../mappers';
import type { PageResult, Task } from '../../shared/types';
import { todayInTimeZone } from '../lib/dates';
import { entityExists, getWorkspace } from './entities';
import { diffFields, writeAudit } from './audit';
import type { taskCreateSchema, taskUpdateSchema, tasksQuerySchema } from '../schemas';

type Row = Record<string, unknown>;
type ListQuery = z.infer<typeof tasksQuerySchema>;
type CreateInput = z.infer<typeof taskCreateSchema>;
type UpdateInput = z.infer<typeof taskUpdateSchema>;

const TASK_SELECT = `
  SELECT t.id, t.title, t.description, t.due_date AS dueDate, t.priority, t.status,
    t.completed_at AS completedAt, t.entity_type AS entityType, t.entity_id AS entityId,
    t.created_at AS createdAt, t.updated_at AS updatedAt,
    u.id AS assigneeId, u.name AS assigneeName, u.email AS assigneeEmail,
    CASE t.entity_type
      WHEN 'company' THEN (SELECT name FROM company WHERE id = t.entity_id)
      WHEN 'contact' THEN (
        SELECT TRIM(first_name || ' ' || COALESCE(last_name, '')) FROM contact WHERE id = t.entity_id
      )
      WHEN 'lead' THEN (
        SELECT company_name || ' · ' || contact_name FROM lead WHERE id = t.entity_id
      )
      WHEN 'deal' THEN (SELECT title FROM deal WHERE id = t.entity_id)
    END AS relatedLabel
  FROM task t
  JOIN app_user u ON u.id = t.assignee_id
`;

function today(db: Db): string {
  return todayInTimeZone(getWorkspace(db).timezone);
}

function assertRelated(db: Db, type: 'company' | 'contact' | 'lead' | 'deal', id: number): void {
  if (!entityExists(db, type, id)) {
    throw new ApiError(404, 'NOT_FOUND', 'Связанная запись не найдена.');
  }
}

export function listTasks(db: Db, query: ListQuery): PageResult<Task> {
  const now = today(db);
  const clauses = ['t.workspace_id = 1', 't.deleted_at IS NULL'];
  const params: (string | number | null)[] = [];
  if (query.status !== 'all') {
    clauses.push('t.status = ?');
    params.push(query.status);
  }
  if (query.priority) {
    clauses.push('t.priority = ?');
    params.push(query.priority);
  }
  if (query.overdue === 'true') {
    clauses.push("t.status = 'open'", 't.due_date < ?');
    params.push(now);
  } else if (query.overdue === 'false') {
    clauses.push('t.due_date >= ?');
    params.push(now);
  }
  if (query.dueFrom) {
    clauses.push('t.due_date >= ?');
    params.push(query.dueFrom);
  }
  if (query.dueTo) {
    clauses.push('t.due_date <= ?');
    params.push(query.dueTo);
  }
  if (query.entityType && query.entityId) {
    assertRelated(db, query.entityType, query.entityId);
    clauses.push('t.entity_type = ?', 't.entity_id = ?');
    params.push(query.entityType, query.entityId);
  }
  const where = clauses.join(' AND ');
  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS total FROM task t WHERE ${where}`).get(...params) as Row).total,
  );
  const { limit, offset } = pagination(query);
  const ordering =
    query.sort === 'createdAt'
      ? 't.created_at ASC, t.id ASC'
      : query.sort === '-createdAt'
        ? 't.created_at DESC, t.id DESC'
        : `t.due_date ${query.sort === '-dueDate' ? 'DESC' : 'ASC'}, t.id ${
            query.sort === '-dueDate' ? 'DESC' : 'ASC'
          }`;
  const rows = db
    .prepare(
      `${TASK_SELECT} WHERE ${where}
       ORDER BY ${ordering}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Row[];
  return {
    data: rows.map((row) => mapTask(row, now)),
    page: pageMeta(total, query.page, query.pageSize),
  };
}

function getTaskRow(db: Db, id: number): Row {
  const row = db
    .prepare('SELECT * FROM task WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL')
    .get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Задача не найдена.');
  return row;
}

export function getTask(db: Db, id: number): Task {
  getTaskRow(db, id);
  const row = db
    .prepare(`${TASK_SELECT} WHERE t.id = ? AND t.workspace_id = 1 AND t.deleted_at IS NULL`)
    .get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Задача не найдена.');
  return mapTask(row, today(db));
}

export function createTask(db: Db, input: CreateInput): Task {
  assertRelated(db, input.relatedTo.type, input.relatedTo.id);
  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO task
        (workspace_id, title, description, due_date, priority, status, assignee_id,
         entity_type, entity_id, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, 'open', 1, ?, ?, ?, ?)`,
    )
    .run(
      input.title,
      input.description ?? null,
      input.dueDate,
      input.priority ?? 'medium',
      input.relatedTo.type,
      input.relatedTo.id,
      timestamp,
      timestamp,
    );
  const id = Number(result.lastInsertRowid);
  writeAudit(db, { entityType: 'task', entityId: id, action: 'create' });
  return getTask(db, id);
}

export function updateTask(db: Db, id: number, input: UpdateInput): Task {
  const before = getTaskRow(db, id);
  const currentStatus = String(before.status) as Task['status'];
  const nextStatus = input.status ?? currentStatus;
  const next = {
    title: input.title ?? String(before.title),
    description:
      input.description === undefined ? (before.description as string | null) : input.description,
    dueDate: input.dueDate ?? String(before.due_date),
    priority: input.priority ?? String(before.priority),
    status: nextStatus,
    completedAt:
      nextStatus === 'done'
        ? currentStatus === 'done'
          ? (before.completed_at as string | null)
          : nowIso()
        : null,
  };
  const timestamp = nowIso();
  db.prepare(
    `UPDATE task SET title = ?, description = ?, due_date = ?, priority = ?, status = ?,
      completed_at = ?, updated_at = ?
     WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL`,
  ).run(
    next.title,
    next.description,
    next.dueDate,
    next.priority,
    next.status,
    next.completedAt,
    timestamp,
    id,
  );
  const changes = diffFields(
    before,
    {
      title: next.title,
      dueDate: next.dueDate,
      priority: next.priority,
      status: next.status,
    },
    [
      ['title', 'title'],
      ['dueDate', 'due_date'],
      ['priority', 'priority'],
      ['status', 'status'],
    ],
  );
  if (changes.length) {
    writeAudit(db, { entityType: 'task', entityId: id, action: 'update', changes });
  }
  return getTask(db, id);
}

export function deleteTask(db: Db, id: number): void {
  const row = getTaskRow(db, id);
  const timestamp = nowIso();
  db.prepare(
    'UPDATE task SET deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = 1',
  ).run(timestamp, timestamp, id);
  writeAudit(db, {
    entityType: 'task',
    entityId: id,
    action: 'delete',
    metadata: { snapshot: { title: String(row.title) } },
  });
}
