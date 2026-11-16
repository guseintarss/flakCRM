import { Router } from 'express';
import type { Response } from 'express';
import type { Db } from '../db';
import { methodNotAllowed, parseQuery, route } from '../http';
import { toCsv } from '../lib/csv';
import { todayInTimeZone } from '../lib/dates';
import { formatMinor } from '../lib/money';
import {
  activitiesQuerySchema,
  companiesQuerySchema,
  contactsQuerySchema,
  dealsQuerySchema,
  leadsQuerySchema,
  tasksQuerySchema,
} from '../schemas';
import { getWorkspace } from '../services/entities';
import { listCompanies } from '../services/companies';
import { listContacts } from '../services/contacts';
import { listLeadsForExport } from '../services/leads';
import { listDealsForExport } from '../services/deals';
import { listActivities } from '../services/activities';
import { listTasks } from '../services/tasks';

const EXPORT_LIMIT = 100_000;

function sendCsv(
  res: Response,
  entity: string,
  timeZone: string,
  headers: string[],
  rows: unknown[][],
): void {
  const date = todayInTimeZone(timeZone);
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${entity}-${date}.csv"`);
  res.send(toCsv(headers, rows));
}

function prepare<T>(data: T[], res: Response): T[] {
  if (data.length > EXPORT_LIMIT) {
    res.setHeader('X-Export-Truncated', 'true');
    return data.slice(0, EXPORT_LIMIT);
  }
  return data;
}

export function exportsRouter(db: Db): Router {
  const router = Router();
  const timeZone = () => getWorkspace(db).timezone;

  router.get(
    '/export/companies.csv',
    route((req, res) => {
      const query = parseQuery(companiesQuerySchema, req.query);
      const result = listCompanies(db, { ...query, page: 1, pageSize: EXPORT_LIMIT + 1 });
      const rows = prepare(result.data, res);
      sendCsv(
        res,
        'companies',
        timeZone(),
        ['id', 'name', 'domain', 'industry', 'size', 'stack', 'tags', 'createdAt', 'updatedAt'],
        rows.map((item) => [
          item.id,
          item.name,
          item.domain,
          item.industry,
          item.size,
          item.stack.join('; '),
          item.tags.join('; '),
          item.createdAt,
          item.updatedAt,
        ]),
      );
    }),
  );

  router.get(
    '/export/contacts.csv',
    route((req, res) => {
      const query = parseQuery(contactsQuerySchema, req.query);
      const result = listContacts(db, { ...query, page: 1, pageSize: EXPORT_LIMIT + 1 });
      const rows = prepare(result.data, res);
      sendCsv(
        res,
        'contacts',
        timeZone(),
        ['id', 'firstName', 'lastName', 'email', 'phone', 'jobTitle', 'company', 'tags', 'createdAt', 'updatedAt'],
        rows.map((item) => [
          item.id,
          item.firstName,
          item.lastName,
          item.email,
          item.phone,
          item.jobTitle,
          item.company?.name ?? '',
          item.tags.join('; '),
          item.createdAt,
          item.updatedAt,
        ]),
      );
    }),
  );

  router.get(
    '/export/leads.csv',
    route((req, res) => {
      const query = parseQuery(leadsQuerySchema, req.query);
      const rows = prepare(
        listLeadsForExport(db, { ...query, page: 1, pageSize: EXPORT_LIMIT + 1 }, EXPORT_LIMIT + 1),
        res,
      );
      sendCsv(
        res,
        'leads',
        timeZone(),
        [
          'id',
          'companyName',
          'contactName',
          'email',
          'phone',
          'source',
          'serviceType',
          'status',
          'estimatedAmount',
          'currency',
          'convertedCompanyId',
          'convertedContactId',
          'convertedDealId',
          'convertedAt',
          'createdAt',
          'updatedAt',
        ],
        rows.map((item) => [
          item.id,
          item.companyName,
          item.contactName,
          item.email,
          item.phone,
          item.source,
          item.serviceType,
          item.status,
          formatMinor(item.estimatedAmountMinor),
          item.currency,
          item.convertedCompanyId,
          item.convertedContactId,
          item.convertedDealId,
          item.convertedAt,
          item.createdAt,
          item.updatedAt,
        ]),
      );
    }),
  );

  router.get(
    '/export/deals.csv',
    route((req, res) => {
      const query = parseQuery(dealsQuerySchema, req.query);
      const rows = prepare(
        listDealsForExport(db, { ...query, page: 1, pageSize: EXPORT_LIMIT + 1 }, EXPORT_LIMIT + 1),
        res,
      );
      sendCsv(
        res,
        'deals',
        timeZone(),
        [
          'id',
          'title',
          'company',
          'primaryContact',
          'stage',
          'status',
          'amount',
          'currency',
          'serviceType',
          'source',
          'expectedCloseDate',
          'closedAt',
          'lostReason',
          'createdAt',
          'updatedAt',
        ],
        rows.map((item) => [
          item.id,
          item.title,
          item.company?.name ?? '',
          item.primaryContact?.fullName ?? '',
          item.stage.name,
          item.status,
          formatMinor(item.amountMinor),
          item.currency,
          item.serviceType,
          item.source,
          item.expectedCloseDate,
          item.closedAt,
          item.lostReason,
          item.createdAt,
          item.updatedAt,
        ]),
      );
    }),
  );

  router.get(
    '/export/tasks.csv',
    route((req, res) => {
      const parsed = parseQuery(tasksQuerySchema, req.query);
      const status = req.query.status === undefined ? ('all' as const) : parsed.status;
      const result = listTasks(db, {
        ...parsed,
        status,
        page: 1,
        pageSize: EXPORT_LIMIT + 1,
      });
      const rows = prepare(result.data, res);
      sendCsv(
        res,
        'tasks',
        timeZone(),
        ['id', 'title', 'status', 'priority', 'dueDate', 'completedAt', 'relatedToType', 'relatedToId', 'createdAt', 'updatedAt'],
        rows.map((item) => [
          item.id,
          item.title,
          item.status,
          item.priority,
          item.dueDate,
          item.completedAt,
          item.relatedTo.type,
          item.relatedTo.id,
          item.createdAt,
          item.updatedAt,
        ]),
      );
    }),
  );

  router.get(
    '/export/activities.csv',
    route((req, res) => {
      const query = parseQuery(activitiesQuerySchema, req.query);
      const result = listActivities(db, { ...query, page: 1, pageSize: EXPORT_LIMIT + 1 });
      const rows = prepare(result.data, res);
      sendCsv(
        res,
        'activities',
        timeZone(),
        ['id', 'type', 'subject', 'relatedToType', 'relatedToId', 'occurredAt', 'createdAt', 'updatedAt'],
        rows.map((item) => [
          item.id,
          item.type,
          item.subject,
          item.relatedTo.type,
          item.relatedTo.id,
          item.occurredAt,
          item.createdAt,
          item.updatedAt,
        ]),
      );
    }),
  );

  router.all('/export/*splat', methodNotAllowed);

  return router;
}
