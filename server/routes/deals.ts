import { Router } from 'express';
import { methodNotAllowed, parse, parseId, parseQuery, route } from '../http';
import type { Db } from '../db';
import {
  boardQuerySchema,
  dealCreateSchema,
  dealStageChangeSchema,
  dealsQuerySchema,
  dealUpdateSchema,
  paginationSchema,
} from '../schemas';
import {
  changeDealStage,
  createDeal,
  deleteDeal,
  getDeal,
  getDealBoard,
  getDealStageHistory,
  listDeals,
  updateDeal,
} from '../services/deals';

export function dealsRouter(db: Db): Router {
  const router = Router();

  router.get(
    '/deals',
    route((req, res) => {
      res.json(listDeals(db, parseQuery(dealsQuerySchema, req.query)));
    }),
  );
  router.post(
    '/deals',
    route((req, res) => {
      const deal = createDeal(db, parse(dealCreateSchema, req.body));
      res.status(201).location(`/api/v1/deals/${deal.id}`).json(deal);
    }),
  );
  router.all('/deals', methodNotAllowed);

  router.get(
    '/deals/board',
    route((req, res) => {
      res.json(getDealBoard(db, parseQuery(boardQuerySchema, req.query)));
    }),
  );
  router.all('/deals/board', methodNotAllowed);

  router.get(
    '/deals/:id/stage-history',
    route((req, res) => {
      const id = parseId(req.params.id);
      const query = parseQuery(paginationSchema, req.query);
      res.json(getDealStageHistory(db, id, query.page, query.pageSize));
    }),
  );
  router.all('/deals/:id/stage-history', methodNotAllowed);

  router.post(
    '/deals/:id/stage',
    route((req, res) => {
      const id = parseId(req.params.id);
      res.json(changeDealStage(db, id, parse(dealStageChangeSchema, req.body)));
    }),
  );
  router.all('/deals/:id/stage', methodNotAllowed);

  router.get(
    '/deals/:id',
    route((req, res) => {
      res.json(getDeal(db, parseId(req.params.id)));
    }),
  );
  router.patch(
    '/deals/:id',
    route((req, res) => {
      const id = parseId(req.params.id);
      res.json(updateDeal(db, id, parse(dealUpdateSchema, req.body)));
    }),
  );
  router.delete(
    '/deals/:id',
    route((req, res) => {
      deleteDeal(db, parseId(req.params.id));
      res.status(204).end();
    }),
  );
  router.all('/deals/:id', methodNotAllowed);

  return router;
}
