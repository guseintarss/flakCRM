import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  ActivityInput,
  CompanyInput,
  ContactInput,
  ConvertLeadInput,
  DealInput,
  LeadInput,
  TaskInput,
} from '@shared/types';
import { api, type QueryParams } from './client';

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity });
}

export function useDashboard(params: QueryParams) {
  return useQuery({
    queryKey: ['dashboard', params],
    queryFn: () => api.dashboard(params),
  });
}

export function useGlobalSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: () => api.search(q, 5),
    enabled: q.trim().length >= 2,
    staleTime: 10_000,
  });
}

export function useCompanies(params: QueryParams) {
  return useQuery({
    queryKey: ['companies', params],
    queryFn: () => api.companies(params),
    placeholderData: keepPreviousData,
  });
}

export function useCompany(id: number | null) {
  return useQuery({
    queryKey: ['company', id],
    queryFn: () => api.company(id as number),
    enabled: id != null,
  });
}

export function useCompanyOptions() {
  return useQuery({
    queryKey: ['companies', 'options'],
    queryFn: () => api.companies({ pageSize: 100, sort: 'name' }),
    staleTime: 30_000,
  });
}

export function useContacts(params: QueryParams) {
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: () => api.contacts(params),
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: number | null) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => api.contact(id as number),
    enabled: id != null,
  });
}

export function useCompanyContacts(companyId: number | null) {
  return useQuery({
    queryKey: ['contacts', 'company', companyId],
    queryFn: () => api.contacts({ companyId: companyId as number, pageSize: 100, sort: 'name' }),
    enabled: companyId != null,
  });
}

export function useLeads(params: QueryParams) {
  return useQuery({
    queryKey: ['leads', params],
    queryFn: () => api.leads(params),
    placeholderData: keepPreviousData,
  });
}

export function useLead(id: number | null) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => api.lead(id as number),
    enabled: id != null,
  });
}

export function useDeals(params: QueryParams) {
  return useQuery({
    queryKey: ['deals', params],
    queryFn: () => api.deals(params),
    placeholderData: keepPreviousData,
  });
}

export function useDeal(id: number | null) {
  return useQuery({
    queryKey: ['deal', id],
    queryFn: () => api.deal(id as number),
    enabled: id != null,
  });
}

export function useDealBoard(params: QueryParams) {
  return useQuery({
    queryKey: ['deals', 'board', params],
    queryFn: () => api.dealBoard(params),
    placeholderData: keepPreviousData,
  });
}

export function useDealStageHistory(id: number | null) {
  return useQuery({
    queryKey: ['deal', id, 'history'],
    queryFn: () => api.dealStageHistory(id as number, { pageSize: 100 }),
    enabled: id != null,
  });
}

export function useActivities(params: QueryParams) {
  return useQuery({
    queryKey: ['activities', params],
    queryFn: () => api.activities(params),
    placeholderData: keepPreviousData,
  });
}

export function useTasks(params: QueryParams) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => api.tasks(params),
    placeholderData: keepPreviousData,
  });
}

export function useAuditEvents(
  entityType: string | null,
  entityId: number | null,
  params: QueryParams = {},
  enabled = true,
) {
  return useQuery({
    queryKey: ['audit', entityType, entityId, params],
    queryFn: () =>
      api.auditEvents(entityType as string, entityId as number, { pageSize: 50, ...params }),
    enabled: enabled && entityType != null && entityId != null,
  });
}

function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}

/**
 * Удалённая сущность не должна перезапрашиваться до перехода со страницы
 * деталей: помечаем кэш устаревшим, но не запускаем refetch активных запросов.
 * Списки обновятся при монтировании после navigate.
 */
function useInvalidateAfterDelete() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ refetchType: 'none' });
}

export function useCreateCompany() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: CompanyInput) => api.createCompany(input),
    onSuccess: invalidate,
  });
}

export function useUpdateCompany(id: number) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: Partial<CompanyInput>) => api.updateCompany(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteCompany() {
  const invalidate = useInvalidateAfterDelete();
  return useMutation({ mutationFn: api.deleteCompany, onSuccess: invalidate });
}

export function useCreateContact() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: ContactInput) => api.createContact(input),
    onSuccess: invalidate,
  });
}

export function useUpdateContact(id: number) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: Partial<ContactInput>) => api.updateContact(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteContact() {
  const invalidate = useInvalidateAfterDelete();
  return useMutation({ mutationFn: api.deleteContact, onSuccess: invalidate });
}

export function useCreateLead() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: LeadInput) => api.createLead(input),
    onSuccess: invalidate,
  });
}

export function useUpdateLead(id: number) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: Partial<LeadInput>) => api.updateLead(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteLead() {
  const invalidate = useInvalidateAfterDelete();
  return useMutation({ mutationFn: api.deleteLead, onSuccess: invalidate });
}

export function useConvertLead(id: number) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: ConvertLeadInput | null) => api.convertLead(id, input),
    onSuccess: invalidate,
  });
}

export function useCreateDeal() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: DealInput) => api.createDeal(input),
    onSuccess: invalidate,
  });
}

export function useUpdateDeal(id: number) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (
      input: Partial<DealInput> & { version: number; status?: string; lostReason?: string | null },
    ) => api.updateDeal(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteDeal() {
  const invalidate = useInvalidateAfterDelete();
  return useMutation({ mutationFn: api.deleteDeal, onSuccess: invalidate });
}

export function useChangeDealStage(id?: number) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({
      dealId,
      stageId,
      version,
      note,
    }: {
      dealId: number;
      stageId: number;
      version: number;
      note?: string | null;
    }) => api.changeDealStage(id ?? dealId, { stageId, version, note }),
    onSuccess: invalidate,
  });
}

export function useCreateActivity() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: ActivityInput) => api.createActivity(input),
    onSuccess: invalidate,
  });
}

export function useUpdateActivity(id: number) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: Partial<ActivityInput>) => api.updateActivity(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteActivity() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: api.deleteActivity, onSuccess: invalidate });
}

export function useCreateTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: TaskInput) => api.createTask(input),
    onSuccess: invalidate,
  });
}

export function useUpdateTask(id: number) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: Partial<TaskInput> & { status?: string }) => api.updateTask(id, input),
    onSuccess: invalidate,
  });
}

export function useToggleTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'open' | 'done' }) =>
      api.updateTask(id, { status }),
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: api.deleteTask, onSuccess: invalidate });
}
