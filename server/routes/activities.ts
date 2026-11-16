import { Router } from 'express';
import { methodNotAllowed, parse, parseId, parseQuery, route } from '../http';
import type { Db } from '../db';
import { activitiesQuerySchema, activityCreateSchema, activityUpdateSchema } from '../schemas';
import {
  createActivity,
  deleteActivity,
  getActivity,
  listActivities,
  updateActivity,
} from '../services/activities';

export function activitiesRouter(db: Db): Router {
  const router = Router();

  router.get(
    '/activities',
    route((req, res) => {
      res.json(listActivities(db, parseQuery(activitiesQuerySchema, req.query)));
    }),
  );
  router.post(
    '/activities',
    route((req, res) => {
      const activity = createActivity(db, parse(activityCreateSchema, req.body));
      res.status(201).location(`/api/v1/activities/${activity.id}`).json(activity);
    }),
  );
  router.all('/activities', methodNotAllowed);

  router.get(
    '/activities/:id',
    route((req, res) => {
      res.json(getActivity(db, parseId(req.params.id)));
    }),
  );
  router.patch(
    '/activities/:id',
    route((req, res) => {
      const id = parseId(req.params.id);
      res.json(updateActivity(db, id, parse(activityUpdateSchema, req.body)));
    }),
  );
  router.delete(
    '/activities/:id',
    route((req, res) => {
      deleteActivity(db, parseId(req.params.id));
      res.status(204).end();
    }),
  );
  router.all('/activities/:id', methodNotAllowed);

  return router;
}
