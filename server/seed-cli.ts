import { config } from './config';
import { DEMO_EMAIL, DEMO_PASSWORD, seedNetworkDemo } from './network/demo';
import { openRegistry } from './network/registry';
import { createTenantStore } from './network/tenant';

const registry = openRegistry(config.registryPath);
const store = createTenantStore(config.tenantsDir);

try {
  await seedNetworkDemo(registry, store, config.tenantsDir);
  const tenants = registry.prepare('SELECT COUNT(*) AS total FROM tenant').get() as {
    total?: number;
  };
  const accounts = registry.prepare('SELECT COUNT(*) AS total FROM account').get() as {
    total?: number;
  };
  console.log(`Реестр: ${config.registryPath}`);
  console.log(`Базы бизнесов: ${config.tenantsDir}`);
  console.log(`Бизнесов: ${Number(tenants.total ?? 0)}, аккаунтов: ${Number(accounts.total ?? 0)}`);
  console.log(`Демо-вход: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
} finally {
  store.close();
  registry.close();
}
