import { Router } from 'express';
import type { Db } from '../db';
import { ApiError, parse, route } from '../http';
import { getTenantBySlug } from './registry';
import type { TenantStore } from './tenant';
import { createSiteRequest, getPublicSite } from './site';
import { publicRequestSchema } from './schemas';

export function publicRouter(registry: Db, store: TenantStore): Router {
  const router = Router();

  router.get(
    '/sites/:slug',
    route((req, res) => {
      const tenant = getTenantBySlug(registry, String(req.params.slug));
      if (!tenant) throw new ApiError(404, 'NOT_FOUND', 'Сайт не найден.');
      store.run(tenant, null, () => {
        res.json(getPublicSite(store.current(), tenant));
      });
    }),
  );

  router.post(
    '/sites/:slug/requests',
    route((req, res) => {
      const tenant = getTenantBySlug(registry, String(req.params.slug));
      if (!tenant) throw new ApiError(404, 'NOT_FOUND', 'Сайт не найден.');
      const input = parse(publicRequestSchema, req.body);
      store.run(tenant, null, () => {
        res.status(201).json(createSiteRequest(store.current(), tenant, input));
      });
    }),
  );

  router.all('/sites/:slug', (_req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается для этого маршрута.'));
  });
  router.all('/sites/:slug/requests', (_req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается для этого маршрута.'));
  });

  return router;
}
