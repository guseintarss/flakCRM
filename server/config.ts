import { resolve } from 'node:path';

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

const host = env('HOST', '127.0.0.1');
const port = Number(env('PORT', '3001'));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT=${process.env.PORT} некорректен.`);
}

const dataDir = resolve(env('DATA_DIR', './data'));
const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  host,
  port,
  dataDir,
  databasePath: resolve(env('DATABASE_PATH', './data/flakcrm.db')),
  registryPath: resolve(env('REGISTRY_PATH', resolve(dataDir, 'registry.db'))),
  tenantsDir: resolve(env('TENANTS_DIR', resolve(dataDir, 'tenants'))),
  workspaceName: env('WORKSPACE_NAME', 'flakCRM'),
  workspaceTimezone: env('WORKSPACE_TIMEZONE', 'Europe/Moscow'),
  baseCurrency: env('BASE_CURRENCY', 'RUB'),
  localUserName: env('LOCAL_USER_NAME', 'Владелец'),
  localUserEmail: env('LOCAL_USER_EMAIL', 'local@flakcrm.local'),
  // Демо-аккаунт с известным паролем не должен появляться в production по умолчанию.
  seedDemo: env('SEED_DEMO', isProduction ? 'false' : 'true') !== 'false',
  cookieSecure: env('COOKIE_SECURE', 'false') === 'true',
} as const;

export const WORKSPACE_ID = 1;
export const USER_ID = 1;
