import { config } from './config';
import { createNetworkApp } from './network/app';
import { DEMO_EMAIL, DEMO_PASSWORD, seedNetworkDemo } from './network/demo';

const network = createNetworkApp({
  registryPath: config.registryPath,
  tenantsDir: config.tenantsDir,
  cookieSecure: config.cookieSecure,
});

if (config.seedDemo) {
  await seedNetworkDemo(network.registry, network.store, config.tenantsDir);
}

const server = network.app.listen(config.port, config.host, () => {
  console.log(`flakCRM запущен: http://${config.host}:${config.port}`);
  console.log(`Реестр бизнесов: ${config.registryPath}`);
  console.log(`Базы бизнесов: ${config.tenantsDir}`);
  if (config.seedDemo) {
    console.log(`Демо-вход: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }
});

server.on('error', (error) => {
  console.error('Не удалось запустить сервер:', error);
  network.close();
  process.exit(1);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Получен ${signal}, останавливаю сервер...`);
  server.close(() => {
    network.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
