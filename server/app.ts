import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import type { Db } from './db';
import {
  apiNotFound,
  errorHandler,
  unsupportedMediaType,
} from './http';
import { companiesRouter } from './routes/companies';
import { contactsRouter } from './routes/contacts';
import { leadsRouter } from './routes/leads';
import { dealsRouter } from './routes/deals';
import { activitiesRouter } from './routes/activities';
import { tasksRouter } from './routes/tasks';
import { insightsRouter } from './routes/insights';
import { exportsRouter } from './routes/exports';
import { metaRouter } from './routes/meta';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version?: string };
const APP_VERSION = packageJson.version ?? '0.1.0';

export interface AppOptions {
  serveStatic?: boolean;
  staticDir?: string;
}

export function applyBaseMiddleware(app: Express): void {
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  app.use(express.json({ limit: '1mb', strict: true }));
}

export function mountStatic(app: Express, options: AppOptions = {}): void {
  const serveStatic = options.serveStatic ?? process.env.NODE_ENV === 'production';
  if (!serveStatic) return;
  const staticDir = options.staticDir ?? fileURLToPath(new URL('../dist', import.meta.url));
  app.use(
    express.static(staticDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${resolve(staticDir)}/assets/`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.get(/.*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(resolve(staticDir, 'index.html'));
  });
}

export function createApp(db: Db, options: AppOptions = {}): Express {
  const app = express();
  applyBaseMiddleware(app);

  app.get('/api/health', (_req, res) => {
    try {
      db.prepare('SELECT 1 AS ok').get();
      res.json({
        status: 'ok',
        db: 'ok',
        version: APP_VERSION,
        uptimeSeconds: Math.round(process.uptime()),
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        db: 'error',
        version: APP_VERSION,
        uptimeSeconds: Math.round(process.uptime()),
      });
    }
  });

  app.use('/api/v1', unsupportedMediaType);
  app.use('/api/v1', metaRouter(db));
  app.use('/api/v1', companiesRouter(db));
  app.use('/api/v1', contactsRouter(db));
  app.use('/api/v1', leadsRouter(db));
  app.use('/api/v1', dealsRouter(db));
  app.use('/api/v1', activitiesRouter(db));
  app.use('/api/v1', tasksRouter(db));
  app.use('/api/v1', insightsRouter(db));
  app.use('/api/v1', exportsRouter(db));
  app.use('/api', apiNotFound);

  mountStatic(app, options);
  app.use(errorHandler);
  return app;
}
