import type { Db } from '../db';
import type { Vertical } from '../../shared/site';
import {
  addMembership,
  createTenantRecord,
  uniqueTenantSlug,
  type Account,
  type Tenant,
} from './registry';
import { newTenantDatabasePath, syncTenantIdentity, type TenantStore } from './tenant';
import { ensureSiteConfig } from './site';

/**
 * Создаёт бизнес: запись в реестре, отдельную базу CRM и настройки сайта.
 * Если база не инициализировалась, запись реестра удаляется, чтобы не
 * оставлять бизнес без рабочего пространства.
 */
export function provisionTenant(
  registry: Db,
  store: TenantStore,
  tenantsDir: string,
  owner: Account,
  input: { name: string; vertical: Vertical; slug?: string },
): Tenant {
  const slug = uniqueTenantSlug(registry, input.slug ?? input.name);
  const tenant = createTenantRecord(registry, {
    slug,
    name: input.name,
    vertical: input.vertical,
    dbPath: newTenantDatabasePath(tenantsDir),
  });

  try {
    const db = store.open(tenant);
    ensureSiteConfig(db, tenant);
    syncTenantIdentity(db, tenant, owner);
    addMembership(registry, tenant.id, owner.id);
    return tenant;
  } catch (error) {
    registry.prepare('DELETE FROM tenant WHERE id = ?').run(tenant.id);
    throw error;
  }
}
