import type {
  Activity,
  ActivityInput,
  AuditEvent,
  Company,
  CompanyInput,
  CompanyListItem,
  Contact,
  ContactInput,
  ContactListItem,
  ConvertLeadInput,
  ConvertLeadResult,
  Dashboard,
  Deal,
  DealBoard,
  DealInput,
  DealListItem,
  Lead,
  LeadInput,
  LeadListItem,
  Meta,
  PageResult,
  SearchResults,
  StageHistoryEntry,
  Task,
  TaskInput,
} from '@shared/types';

const API_BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export function queryString(params: QueryParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}

export async function rootRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Сервер недоступен. Проверьте, что он запущен.');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const envelope = payload as
      | { error?: { code?: string; message?: string; details?: unknown; requestId?: string } }
      | null;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'INTERNAL_ERROR',
      envelope?.error?.message ?? `Ошибка запроса (${response.status}).`,
      envelope?.error?.details,
      envelope?.error?.requestId,
    );
  }

  return payload as T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return rootRequest<T>(`${API_BASE}${path}`, init);
}

function body(value: unknown): string {
  return JSON.stringify(value);
}

export const api = {
  meta: () => request<Meta>('/meta'),
  dashboard: (params: QueryParams) => request<Dashboard>(`/dashboard${queryString(params)}`),
  search: (q: string, limit = 5) =>
    request<SearchResults>(`/search${queryString({ q, limit })}`),

  companies: (params: QueryParams = {}) =>
    request<PageResult<CompanyListItem>>(`/companies${queryString(params)}`),
  company: (id: number) => request<Company>(`/companies/${id}`),
  createCompany: (input: CompanyInput) =>
    request<Company>('/companies', { method: 'POST', body: body(input) }),
  updateCompany: (id: number, input: Partial<CompanyInput>) =>
    request<Company>(`/companies/${id}`, { method: 'PATCH', body: body(input) }),
  deleteCompany: (id: number) =>
    request<void>(`/companies/${id}`, { method: 'DELETE' }),
  checkCompanyDomain: (domain: string) =>
    request<{
      input: string;
      normalizedDomain: string;
      duplicate: { id: number; name: string; domain: string | null } | null;
    }>(`/companies/duplicates${queryString({ domain })}`),

  contacts: (params: QueryParams = {}) =>
    request<PageResult<ContactListItem>>(`/contacts${queryString(params)}`),
  contact: (id: number) => request<Contact>(`/contacts/${id}`),
  createContact: (input: ContactInput) =>
    request<Contact>('/contacts', { method: 'POST', body: body(input) }),
  updateContact: (id: number, input: Partial<ContactInput>) =>
    request<Contact>(`/contacts/${id}`, { method: 'PATCH', body: body(input) }),
  deleteContact: (id: number) =>
    request<void>(`/contacts/${id}`, { method: 'DELETE' }),
  checkContactEmail: (email: string) =>
    request<{
      input: string;
      normalizedEmail: string;
      duplicate: { id: number; fullName: string; email: string | null } | null;
    }>(`/contacts/duplicates${queryString({ email })}`),

  leads: (params: QueryParams = {}) =>
    request<PageResult<LeadListItem>>(`/leads${queryString(params)}`),
  lead: (id: number) => request<Lead>(`/leads/${id}`),
  createLead: (input: LeadInput) =>
    request<Lead>('/leads', { method: 'POST', body: body(input) }),
  updateLead: (id: number, input: Partial<LeadInput>) =>
    request<Lead>(`/leads/${id}`, { method: 'PATCH', body: body(input) }),
  deleteLead: (id: number) => request<void>(`/leads/${id}`, { method: 'DELETE' }),
  convertLead: (id: number, input: ConvertLeadInput | null) =>
    request<ConvertLeadResult>(`/leads/${id}/convert`, {
      method: 'POST',
      ...(input ? { body: body(input) } : {}),
    }),

  deals: (params: QueryParams = {}) =>
    request<PageResult<DealListItem>>(`/deals${queryString(params)}`),
  deal: (id: number) => request<Deal>(`/deals/${id}`),
  dealBoard: (params: QueryParams = {}) =>
    request<DealBoard>(`/deals/board${queryString(params)}`),
  createDeal: (input: DealInput) =>
    request<Deal>('/deals', { method: 'POST', body: body(input) }),
  updateDeal: (id: number, input: Partial<DealInput> & { version: number; status?: string; lostReason?: string | null }) =>
    request<Deal>(`/deals/${id}`, { method: 'PATCH', body: body(input) }),
  deleteDeal: (id: number) => request<void>(`/deals/${id}`, { method: 'DELETE' }),
  changeDealStage: (id: number, input: { stageId: number; version: number; note?: string | null }) =>
    request<{ deal: Deal; changed: boolean }>(`/deals/${id}/stage`, {
      method: 'POST',
      body: body(input),
    }),
  dealStageHistory: (id: number, params: QueryParams = {}) =>
    request<PageResult<StageHistoryEntry>>(`/deals/${id}/stage-history${queryString(params)}`),

  activities: (params: QueryParams = {}) =>
    request<PageResult<Activity>>(`/activities${queryString(params)}`),
  activity: (id: number) => request<Activity>(`/activities/${id}`),
  createActivity: (input: ActivityInput) =>
    request<Activity>('/activities', { method: 'POST', body: body(input) }),
  updateActivity: (id: number, input: Partial<ActivityInput>) =>
    request<Activity>(`/activities/${id}`, { method: 'PATCH', body: body(input) }),
  deleteActivity: (id: number) =>
    request<void>(`/activities/${id}`, { method: 'DELETE' }),

  tasks: (params: QueryParams = {}) =>
    request<PageResult<Task>>(`/tasks${queryString(params)}`),
  task: (id: number) => request<Task>(`/tasks/${id}`),
  createTask: (input: TaskInput) =>
    request<Task>('/tasks', { method: 'POST', body: body(input) }),
  updateTask: (id: number, input: Partial<TaskInput> & { status?: string }) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: body(input) }),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  auditEvents: (entityType: string, entityId: number, params: QueryParams = {}) =>
    request<PageResult<AuditEvent>>(
      `/audit-events${queryString({ entityType, entityId, ...params })}`,
    ),
};

export function exportUrl(
  entity: 'companies' | 'contacts' | 'leads' | 'deals' | 'tasks' | 'activities',
  params: QueryParams = {},
): string {
  return `${API_BASE}/export/${entity}.csv${queryString(params)}`;
}

export function downloadCsv(
  entity: 'companies' | 'contacts' | 'leads' | 'deals' | 'tasks' | 'activities',
  params: QueryParams = {},
): void {
  const link = document.createElement('a');
  link.href = exportUrl(entity, params);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
