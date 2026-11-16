import { readFileSync } from 'node:fs';
import express, { type Express } from 'express';
import { applyBaseMiddleware, mountStatic } from '../app';
import type { Db } from '../db';
import { apiNotFound, errorHandler, unsupportedMediaType } from '../http';
import { authRouter, requireSession } from './auth';
import { builderRouter } from './builder';
import { publicRouter } from './public';
import { openRegistry } from './registry';
import { createTenantStore, type TenantStore } from './tenant';
import { companiesRouter } from '../routes/companies';
import { contactsRouter } from '../routes/contacts';
import { leadsRouter } from '../routes/leads';
import { dealsRouter } from '../routes/deals';
import { activitiesRouter } from '../routes/activities';
import { tasksRouter } from '../routes/tasks';
import { insightsRouter } from '../routes/insights';
import { exportsRouter } from '../routes/exports';
import { metaRouter } from '../routes/meta';

const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version?: string };
const APP_VERSION = packageJson.version ?? '0.1.0';

export interface NetworkAppOptions {
  registryPath: string;
  tenantsDir: string;
  serveStatic?: boolean;
  staticDir?: string;
  cookieSecure?: boolean;
}

export interface NetworkApp {
  app: Express;
  registry: Db;
  store: TenantStore;
  close(): void;
}

export function createNetworkApp(options: NetworkAppOptions): NetworkApp {
  const registry = openRegistry(options.registryPath);
  const store = createTenantStore(options.tenantsDir);
  const app = express();
  applyBaseMiddleware(app);

  app.get('/api/health', (_req, res) => {
    try {
      registry.prepare('SELECT 1 AS ok').get();
      const tenants = registry.prepare('SELECT COUNT(*) AS total FROM tenant').get() as {
        total?: number;
      };
      res.json({
        status: 'ok',
        db: 'ok',
        mode: 'network',
        tenants: Number(tenants.total ?? 0),
        version: APP_VERSION,
        uptimeSeconds: Math.round(process.uptime()),
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        db: 'error',
        mode: 'network',
        version: APP_VERSION,
        uptimeSeconds: Math.round(process.uptime()),
      });
    }
  });

  app.use(
    ['/api/auth', '/api/public', '/api/network', '/api/v1'],
    unsupportedMediaType,
  );

  app.use(
    '/api/auth',
    authRouter({
      registry,
      store,
      tenantsDir: options.tenantsDir,
      cookieSecure: options.cookieSecure ?? false,
    }),
  );
  app.use('/api/public', publicRouter(registry, store));

  const authenticated = requireSession(registry, store);
  app.use('/api/network', authenticated, builderRouter(registry, store));

  app.use('/api/v1', authenticated, metaRouter(store.db));
  app.use('/api/v1', authenticated, companiesRouter(store.db));
  app.use('/api/v1', authenticated, contactsRouter(store.db));
  app.use('/api/v1', authenticated, leadsRouter(store.db));
  app.use('/api/v1', authenticated, dealsRouter(store.db));
  app.use('/api/v1', authenticated, activitiesRouter(store.db));
  app.use('/api/v1', authenticated, tasksRouter(store.db));
  app.use('/api/v1', authenticated, insightsRouter(store.db));
  app.use('/api/v1', authenticated, exportsRouter(store.db));

  app.use('/api', apiNotFound);
  mountStatic(app, options);
  app.use(errorHandler);

  return {
    app,
    registry,
    store,
    close() {
      store.close();
      registry.close();
    },
  };
}
