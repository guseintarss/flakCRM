import type { Db } from '../db';
import { ApiError } from '../http';
import type { EntityType, Stage, UserRef } from '../../shared/types';

type Row = Record<string, unknown>;

export function getUser(db: Db): UserRef {
  const row = db.prepare('SELECT id, name, email FROM app_user WHERE id = 1').get() as
    | Row
    | undefined;
  if (!row) throw new ApiError(500, 'INTERNAL_ERROR', 'Локальный пользователь не создан.');
  return { id: Number(row.id), name: String(row.name), email: String(row.email) };
}

export function getWorkspace(db: Db): {
  id: number;
  name: string;
  baseCurrency: string;
  timezone: string;
} {
  const row = db.prepare('SELECT * FROM workspace WHERE id = 1').get() as Row | undefined;
  if (!row) throw new ApiError(500, 'INTERNAL_ERROR', 'Workspace не создан.');
  return {
    id: Number(row.id),
    name: String(row.name),
    baseCurrency: String(row.base_currency),
    timezone: String(row.timezone),
  };
}

export function getPipeline(db: Db): { id: number; name: string; stages: Stage[] } {
  const pipeline = db
    .prepare('SELECT id, name FROM pipeline WHERE workspace_id = 1 AND is_default = 1')
    .get() as Row | undefined;
  if (!pipeline) throw new ApiError(500, 'INTERNAL_ERROR', 'Воронка не создана.');
  const stages = db
    .prepare(
      `SELECT id, name, position, probability
       FROM stage WHERE pipeline_id = ? ORDER BY position ASC, id ASC`,
    )
    .all(Number(pipeline.id)) as Row[];
  return {
    id: Number(pipeline.id),
    name: String(pipeline.name),
    stages: stages.map((stage) => ({
      id: Number(stage.id),
      name: String(stage.name),
      position: Number(stage.position),
      probability: Number(stage.probability),
    })),
  };
}

export function getDefaultStage(db: Db): Stage {
  const pipeline = getPipeline(db);
  const stage = pipeline.stages[0];
  if (!stage) throw new ApiError(500, 'INTERNAL_ERROR', 'В воронке нет стадий.');
  return stage;
}

export function getStage(db: Db, stageId: number): Stage {
  const row = db
    .prepare(
      `SELECT s.id, s.name, s.position, s.probability, s.pipeline_id AS pipelineId
       FROM stage s WHERE s.id = ?`,
    )
    .get(stageId) as Row | undefined;
  if (!row) throw new ApiError(422, 'INVALID_STAGE', 'Стадия не найдена.', { field: 'stageId' });
  return {
    id: Number(row.id),
    name: String(row.name),
    position: Number(row.position),
    probability: Number(row.probability),
  };
}

export function assertStageInPipeline(db: Db, stageId: number, pipelineId: number): Stage {
  const stage = getStage(db, stageId);
  const row = db.prepare('SELECT pipeline_id AS pipelineId FROM stage WHERE id = ?').get(stageId) as
    | Row
    | undefined;
  if (!row || Number(row.pipelineId) !== pipelineId) {
    throw new ApiError(422, 'INVALID_STAGE', 'Стадия не принадлежит воронке сделки.', {
      field: 'stageId',
    });
  }
  return stage;
}

const tableByType: Record<EntityType, string> = {
  company: 'company',
  contact: 'contact',
  lead: 'lead',
  deal: 'deal',
};

export function entityExists(db: Db, type: EntityType, id: number): boolean {
  const table = tableByType[type];
  const row = db
    .prepare(`SELECT 1 AS found FROM ${table} WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL`)
    .get(id) as Row | undefined;
  return Boolean(row);
}

export function assertEntity(db: Db, type: EntityType, id: number): void {
  if (!entityExists(db, type, id)) {
    throw new ApiError(422, 'INVALID_REFERENCE', 'Связанная запись не найдена.', {
      entityType: type,
      entityId: id,
    });
  }
}

export function entityLabel(db: Db, type: EntityType, id: number): string {
  const row = db
    .prepare(
      `SELECT CASE ? 
        WHEN 'company' THEN (SELECT name FROM company WHERE id = ?)
        WHEN 'contact' THEN (SELECT TRIM(first_name || ' ' || COALESCE(last_name, '')) FROM contact WHERE id = ?)
        WHEN 'lead' THEN (SELECT company_name || ' · ' || contact_name FROM lead WHERE id = ?)
        WHEN 'deal' THEN (SELECT title FROM deal WHERE id = ?)
      END AS label`,
    )
    .get(type, id, id, id, id) as Row | undefined;
  return row?.label == null ? '' : String(row.label);
}

export function getCompanyRow(db: Db, id: number): Row {
  const row = db
    .prepare('SELECT * FROM company WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL')
    .get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Компания не найдена.');
  return row;
}

export function getContactRow(db: Db, id: number): Row {
  const row = db
    .prepare('SELECT * FROM contact WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL')
    .get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Контакт не найден.');
  return row;
}

export function getDealRow(db: Db, id: number): Row {
  const row = db
    .prepare('SELECT * FROM deal WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL')
    .get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Сделка не найдена.');
  return row;
}

export function getLeadRow(db: Db, id: number): Row {
  const row = db
    .prepare('SELECT * FROM lead WHERE id = ? AND workspace_id = 1 AND deleted_at IS NULL')
    .get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Лид не найден.');
  return row;
}

export function cascadeChildren(db: Db, type: EntityType, id: number, timestamp: string): void {
  db.prepare(
    `UPDATE activity SET deleted_at = ?, updated_at = ?
     WHERE workspace_id = 1 AND entity_type = ? AND entity_id = ? AND deleted_at IS NULL`,
  ).run(timestamp, timestamp, type, id);
  db.prepare(
    `UPDATE task SET deleted_at = ?, updated_at = ?
     WHERE workspace_id = 1 AND entity_type = ? AND entity_id = ? AND deleted_at IS NULL`,
  ).run(timestamp, timestamp, type, id);
}

export function likeParam(value: string): string {
  const escaped = value.replace(/[\\%_]/g, (match) => `\\${match}`);
  return `%${escaped.toLowerCase()}%`;
}
