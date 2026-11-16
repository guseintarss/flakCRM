import { Router } from 'express';
import { methodNotAllowed, parse, parseId, parseQuery, route } from '../http';
import type { Db } from '../db';
import { taskCreateSchema, tasksQuerySchema, taskUpdateSchema } from '../schemas';
import { createTask, deleteTask, getTask, listTasks, updateTask } from '../services/tasks';

export function tasksRouter(db: Db): Router {
  const router = Router();

  router.get(
    '/tasks',
    route((req, res) => {
      res.json(listTasks(db, parseQuery(tasksQuerySchema, req.query)));
    }),
  );
  router.post(
    '/tasks',
    route((req, res) => {
      const task = createTask(db, parse(taskCreateSchema, req.body));
      res.status(201).location(`/api/v1/tasks/${task.id}`).json(task);
    }),
  );
  router.all('/tasks', methodNotAllowed);

  router.get(
    '/tasks/:id',
    route((req, res) => {
      res.json(getTask(db, parseId(req.params.id)));
    }),
  );
  router.patch(
    '/tasks/:id',
    route((req, res) => {
      const id = parseId(req.params.id);
      res.json(updateTask(db, id, parse(taskUpdateSchema, req.body)));
    }),
  );
  router.delete(
    '/tasks/:id',
    route((req, res) => {
      deleteTask(db, parseId(req.params.id));
      res.status(204).end();
    }),
  );
  router.all('/tasks/:id', methodNotAllowed);

  return router;
}
