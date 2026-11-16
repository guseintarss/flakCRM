import { Router } from 'express';
import { methodNotAllowed, parse, parseId, parseQuery, route } from '../http';
import type { Db } from '../db';
import {
  convertLeadSchema,
  duplicateLeadQuerySchema,
  leadCreateSchema,
  leadsQuerySchema,
  leadUpdateSchema,
} from '../schemas';
import {
  checkLeadEmail,
  convertLead,
  createLead,
  deleteLead,
  getLead,
  listLeads,
  updateLead,
} from '../services/leads';

export function leadsRouter(db: Db): Router {
  const router = Router();

  router.get(
    '/leads',
    route((req, res) => {
      res.json(listLeads(db, parseQuery(leadsQuerySchema, req.query)));
    }),
  );
  router.post(
    '/leads',
    route((req, res) => {
      const lead = createLead(db, parse(leadCreateSchema, req.body));
      res.status(201).location(`/api/v1/leads/${lead.id}`).json(lead);
    }),
  );
  router.all('/leads', methodNotAllowed);

  router.get(
    '/leads/duplicates',
    route((req, res) => {
      const query = parseQuery(duplicateLeadQuerySchema, req.query);
      res.json(checkLeadEmail(db, query.email));
    }),
  );

  router.get(
    '/leads/:id',
    route((req, res) => {
      res.json(getLead(db, parseId(req.params.id)));
    }),
  );
  router.patch(
    '/leads/:id',
    route((req, res) => {
      const id = parseId(req.params.id);
      res.json(updateLead(db, id, parse(leadUpdateSchema, req.body)));
    }),
  );
  router.delete(
    '/leads/:id',
    route((req, res) => {
      deleteLead(db, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  router.post(
    '/leads/:id/convert',
    route((req, res) => {
      const id = parseId(req.params.id);
      const body = req.body == null || (typeof req.body === 'object' && !Object.keys(req.body).length)
        ? {}
        : req.body;
      res.json(convertLead(db, id, parse(convertLeadSchema, body)));
    }),
  );
  router.all('/leads/:id/convert', methodNotAllowed);
  router.all('/leads/:id', methodNotAllowed);

  return router;
}
