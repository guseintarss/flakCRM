import { Router } from 'express';
import { CURRENCIES, COMPANY_SIZES, SERVICE_TYPES, LEAD_SOURCES, LEAD_STATUSES, DEAL_STATUSES, ACTIVITY_TYPES, TASK_STATUSES, TASK_PRIORITIES, ENTITY_TYPES } from '../../shared/constants';
import type { Meta } from '../../shared/types';
import type { Db } from '../db';
import { todayInTimeZone } from '../lib/dates';
import { route } from '../http';
import { getPipeline, getUser, getWorkspace } from '../services/entities';

export function metaRouter(db: Db): Router {
  const router = Router();
  router.get(
    '/meta',
    route((_req, res) => {
      const workspace = getWorkspace(db);
      const meta: Meta = {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          baseCurrency: workspace.baseCurrency as Meta['workspace']['baseCurrency'],
          timezone: workspace.timezone,
        },
        currentUser: getUser(db),
        pipeline: getPipeline(db),
        enums: {
          companySizes: [...COMPANY_SIZES],
          serviceTypes: [...SERVICE_TYPES],
          leadSources: [...LEAD_SOURCES],
          leadStatuses: [...LEAD_STATUSES],
          dealStatuses: [...DEAL_STATUSES],
          activityTypes: [...ACTIVITY_TYPES],
          taskStatuses: [...TASK_STATUSES],
          taskPriorities: [...TASK_PRIORITIES],
          entityTypes: [...ENTITY_TYPES],
        },
        currencies: [...CURRENCIES],
        today: todayInTimeZone(workspace.timezone),
      };
      res.json(meta);
    }),
  );
  return router;
}
