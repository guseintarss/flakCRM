import { Router } from 'express';
import type { Db } from '../db';
import { ApiError, parse, parseId, route } from '../http';
import type { SiteAdminData } from '../../shared/site';
import { getSession } from './auth';
import { getTenantBySlug, updateTenantIdentity } from './registry';
import type { TenantStore } from './tenant';
import { syncTenantIdentity } from './tenant';
import {
  createSiteItem,
  deleteSiteItem,
  getSiteConfig,
  listSiteItems,
  listSiteRequests,
  setSitePublished,
  updateSiteConfig,
  updateSiteItem,
  updateSiteRequestStatus,
} from './site';
import {
  siteItemCreateSchema,
  siteItemUpdateSchema,
  siteProfileSchema,
  sitePublishSchema,
  siteRequestStatusSchema,
} from './schemas';

export function builderRouter(registry: Db, store: TenantStore): Router {
  const router = Router();

  router.get(
    '/site',
    route((_req, res) => {
      const session = getSession(res);
      res.json({
        site: getSiteConfig(store.db, session.tenant),
        items: listSiteItems(store.db),
      } satisfies SiteAdminData);
    }),
  );

  router.put(
    '/site',
    route((req, res) => {
      const session = getSession(res);
      const input = parse(siteProfileSchema, req.body);
      const taken = getTenantBySlug(registry, input.slug);
      if (taken && taken.id !== session.tenant.id) {
        throw new ApiError(409, 'SLUG_TAKEN', 'Этот адрес сайта уже занят.');
      }
      const tenant = updateTenantIdentity(registry, session.tenant.id, {
        slug: input.slug,
        name: input.name,
        vertical: session.tenant.vertical,
      });
      syncTenantIdentity(store.db, tenant, session.account);
      updateSiteConfig(store.db, tenant, {
        name: input.name,
        tagline: input.tagline ?? null,
        description: input.description ?? null,
        city: input.city ?? null,
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ? input.email : null,
        workingHours: input.workingHours ?? null,
        brandColor: input.brandColor,
        coverUrl: input.coverUrl ?? null,
      });
      res.json({
        site: getSiteConfig(store.db, tenant),
        items: listSiteItems(store.db),
      } satisfies SiteAdminData);
    }),
  );

  router.post(
    '/site/items',
    route((req, res) => {
      const session = getSession(res);
      const input = parse(siteItemCreateSchema, req.body);
      const item = createSiteItem(store.db, session.tenant, {
        name: input.name,
        description: input.description ?? null,
        priceMinor: input.priceMinor ?? null,
        durationMin: input.durationMin ?? null,
        capacity: input.capacity ?? null,
        imageUrl: input.imageUrl ?? null,
        isActive: input.isActive ?? true,
        position: input.position ?? listSiteItems(store.db).length + 1,
      });
      res.status(201).location(`/api/network/site/items/${item.id}`).json(item);
    }),
  );

  router.patch(
    '/site/items/:id',
    route((req, res) => {
      const id = parseId(req.params.id);
      res.json(updateSiteItem(store.db, id, parse(siteItemUpdateSchema, req.body)));
    }),
  );

  router.delete(
    '/site/items/:id',
    route((req, res) => {
      deleteSiteItem(store.db, parseId(req.params.id));
      res.status(204).end();
    }),
  );

  router.post(
    '/site/publish',
    route((req, res) => {
      const session = getSession(res);
      const input = parse(sitePublishSchema, req.body);
      res.json(setSitePublished(store.db, session.tenant, input.isPublished));
    }),
  );

  router.get(
    '/requests',
    route((_req, res) => {
      res.json(listSiteRequests(store.db));
    }),
  );

  router.patch(
    '/requests/:id',
    route((req, res) => {
      const id = parseId(req.params.id);
      const input = parse(siteRequestStatusSchema, req.body);
      res.json(updateSiteRequestStatus(store.db, id, input.status));
    }),
  );

  router.all('/site', (_req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается для этого маршрута.'));
  });
  router.all('/site/items', (_req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается для этого маршрута.'));
  });
  router.all('/site/items/:id', (_req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается для этого маршрута.'));
  });
  router.all('/site/publish', (_req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается для этого маршрута.'));
  });
  router.all('/requests', (_req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается для этого маршрута.'));
  });
  router.all('/requests/:id', (_req, _res, next) => {
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается для этого маршрута.'));
  });

  return router;
}
