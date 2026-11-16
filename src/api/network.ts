import type {
  LoginInput,
  NetworkTenant,
  RegisterInput,
  SessionInfo,
  SiteItemInput,
  SiteProfileInput,
  SiteStatusInput,
  TenantCreateInput,
} from '@shared/network';
import type {
  PublicSite,
  SiteAdminData,
  SiteItem,
  SiteRequest,
  SiteRequestInput,
  SiteRequestResult,
} from '@shared/site';
import { rootRequest } from './client';

const json = (value: unknown): string => JSON.stringify(value);

export const networkApi = {
  me: () => rootRequest<SessionInfo>('/api/auth/me'),
  login: (input: LoginInput) =>
    rootRequest<SessionInfo>('/api/auth/login', { method: 'POST', body: json(input) }),
  register: (input: RegisterInput) =>
    rootRequest<SessionInfo>('/api/auth/register', { method: 'POST', body: json(input) }),
  logout: () =>
    rootRequest<void>('/api/auth/logout', { method: 'POST', body: '{}' }),
  switchTenant: (tenantId: number) =>
    rootRequest<SessionInfo>('/api/auth/switch', {
      method: 'POST',
      body: json({ tenantId }),
    }),
  createTenant: (input: TenantCreateInput) =>
    rootRequest<NetworkTenant>('/api/auth/tenants', { method: 'POST', body: json(input) }),

  site: () => rootRequest<SiteAdminData>('/api/network/site'),
  saveSite: (input: SiteProfileInput) =>
    rootRequest<SiteAdminData>('/api/network/site', { method: 'PUT', body: json(input) }),
  publish: (isPublished: boolean) =>
    rootRequest<SiteAdminData['site']>('/api/network/site/publish', {
      method: 'POST',
      body: json({ isPublished }),
    }),
  createItem: (input: SiteItemInput) =>
    rootRequest<SiteItem>('/api/network/site/items', { method: 'POST', body: json(input) }),
  updateItem: (id: number, input: Partial<SiteItemInput>) =>
    rootRequest<SiteItem>(`/api/network/site/items/${id}`, {
      method: 'PATCH',
      body: json(input),
    }),
  deleteItem: (id: number) =>
    rootRequest<void>(`/api/network/site/items/${id}`, { method: 'DELETE' }),
  requests: () => rootRequest<SiteRequest[]>('/api/network/requests'),
  updateRequest: (id: number, input: SiteStatusInput) =>
    rootRequest<SiteRequest>(`/api/network/requests/${id}`, {
      method: 'PATCH',
      body: json(input),
    }),

  publicSite: (slug: string) =>
    rootRequest<PublicSite>(`/api/public/sites/${encodeURIComponent(slug)}`),
  createPublicRequest: (slug: string, input: SiteRequestInput) =>
    rootRequest<SiteRequestResult>(
      `/api/public/sites/${encodeURIComponent(slug)}/requests`,
      { method: 'POST', body: json(input) },
    ),
};
