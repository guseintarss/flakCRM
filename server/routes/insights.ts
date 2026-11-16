import { Router } from 'express';
import { methodNotAllowed, parseQuery, route } from '../http';
import type { Db } from '../db';
import { auditQuerySchema, dashboardQuerySchema, searchQuerySchema } from '../schemas';
import { getDashboard } from '../services/dashboard';
import { search } from '../services/search';
import { listAuditEvents } from '../services/audit';

export function insightsRouter(db: Db): Router {
  const router = Router();

  router.get(
    '/dashboard',
    route((req, res) => {
      res.json(getDashboard(db, parseQuery(dashboardQuerySchema, req.query)));
    }),
  );
  router.all('/dashboard', methodNotAllowed);

  router.get(
    '/search',
    route((req, res) => {
      const query = parseQuery(searchQuerySchema, req.query);
      res.json(search(db, query.q, query.limit));
    }),
  );
  router.all('/search', methodNotAllowed);

  router.get(
    '/audit-events',
    route((req, res) => {
      res.json(listAuditEvents(db, parseQuery(auditQuerySchema, req.query)));
    }),
  );
  router.all('/audit-events', methodNotAllowed);

  return router;
}
