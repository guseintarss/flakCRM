import type {
  ACTIVITY_TYPES,
  AUDIT_ACTIONS,
  COMPANY_SIZES,
  CURRENCIES,
  DEAL_STATUSES,
  ENTITY_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  SERVICE_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from './constants';

export type Id = number;
export type IsoDate = string;
export type IsoDateTime = string;

export type Currency = (typeof CURRENCIES)[number];
export type CompanySize = (typeof COMPANY_SIZES)[number];
export type ServiceType = (typeof SERVICE_TYPES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type DealStatus = (typeof DEAL_STATUSES)[number];
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type EntityType = (typeof ENTITY_TYPES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PageResult<T> {
  data: T[];
  page: PageMeta;
}

export interface UserRef {
  id: Id;
  name: string;
  email: string;
}

export interface Stage {
  id: Id;
  name: string;
  position: number;
  probability: number;
}

export interface Pipeline {
  id: Id;
  name: string;
  stages: Stage[];
}

export interface CompanyRef {
  id: Id;
  name: string;
  domain: string | null;
}

export interface ContactRef {
  id: Id;
  fullName: string;
  email: string | null;
}

export interface EntityRef {
  type: EntityType;
  id: Id;
}

export interface CompanyListItem {
  id: Id;
  name: string;
  domain: string | null;
  industry: string | null;
  size: CompanySize | null;
  location: string | null;
  telegram: string | null;
  stack: string[];
  tags: string[];
  counts: { contacts: number; openDeals: number; wonDeals: number };
  openPipelineMinor: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Company extends CompanyListItem {
  notes: string | null;
  owner: UserRef;
}

export interface ContactListItem {
  id: Id;
  firstName: string;
  lastName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  linkedin: string | null;
  jobTitle: string | null;
  company: CompanyRef | null;
  tags: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Contact extends ContactListItem {
  notes: string | null;
  owner: UserRef;
}

export interface LeadListItem {
  id: Id;
  companyName: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  serviceType: ServiceType | null;
  status: LeadStatus;
  estimatedAmountMinor: number | null;
  currency: Currency;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Lead extends LeadListItem {
  notes: string | null;
  owner: UserRef;
  convertedCompanyId: Id | null;
  convertedContactId: Id | null;
  convertedDealId: Id | null;
  convertedAt: IsoDateTime | null;
}

export interface DealListItem {
  id: Id;
  title: string;
  amountMinor: number;
  currency: Currency;
  serviceType: ServiceType;
  source: LeadSource | null;
  status: DealStatus;
  stage: Stage;
  company: CompanyRef | null;
  primaryContact: ContactRef | null;
  expectedCloseDate: IsoDate | null;
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Deal extends DealListItem {
  pipelineId: Id;
  owner: UserRef;
  closedAt: IsoDateTime | null;
  lostReason: string | null;
}

export interface DealCard {
  id: Id;
  title: string;
  amountMinor: number;
  currency: Currency;
  serviceType: ServiceType;
  company: CompanyRef | null;
  primaryContact: ContactRef | null;
  expectedCloseDate: IsoDate | null;
  version: number;
  updatedAt: IsoDateTime;
}

export interface DealBoardStage {
  stage: Stage;
  dealCount: number;
  amountMinor: number;
  deals: DealCard[];
}

export interface DealBoard {
  currency: Currency;
  stages: DealBoardStage[];
  truncated: boolean;
}

export interface StageHistoryEntry {
  id: Id;
  fromStage: Stage | null;
  toStage: Stage;
  note: string | null;
  changedBy: UserRef;
  changedAt: IsoDateTime;
}

export interface Activity {
  id: Id;
  type: ActivityType;
  subject: string;
  body: string | null;
  occurredAt: IsoDateTime;
  author: UserRef;
  relatedTo: EntityRef;
  relatedLabel: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Task {
  id: Id;
  title: string;
  description: string | null;
  dueDate: IsoDate;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt: IsoDateTime | null;
  isOverdue: boolean;
  assignee: UserRef;
  relatedTo: EntityRef;
  relatedLabel: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface AuditChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface AuditEvent {
  id: Id;
  action: AuditAction;
  entityType: EntityType | 'activity' | 'task';
  entityId: Id;
  actor: UserRef;
  changes: AuditChange[];
  metadata: Record<string, unknown> | null;
  createdAt: IsoDateTime;
}

export interface DashboardStage {
  stage: Stage;
  dealCount: number;
  amountMinor: number;
  weightedAmountMinor: number;
}

export interface DashboardTrendPoint {
  month: string;
  wonMinor: number;
  lostMinor: number;
}

export interface Dashboard {
  period: { from: IsoDate; to: IsoDate; timezone: string };
  currency: Currency;
  availableCurrencies: Currency[];
  pipeline: {
    dealCount: number;
    amountMinor: number;
    weightedAmountMinor: number;
    stages: DashboardStage[];
  };
  won: { dealCount: number; amountMinor: number; averageAmountMinor: number };
  lost: { dealCount: number; amountMinor: number };
  winRate: number | null;
  tasks: {
    openCount: number;
    overdueCount: number;
    dueTodayCount: number;
    upcoming: Task[];
  };
  recentActivities: Activity[];
  trend: DashboardTrendPoint[];
}

export interface SearchGroup<T> {
  total: number;
  items: T[];
}

export interface SearchResults {
  query: string;
  companies: SearchGroup<{ id: Id; name: string; domain: string | null; industry: string | null }>;
  contacts: SearchGroup<{
    id: Id;
    fullName: string;
    email: string | null;
    company: CompanyRef | null;
  }>;
  deals: SearchGroup<{
    id: Id;
    title: string;
    amountMinor: number;
    currency: Currency;
    status: DealStatus;
    stage: Stage;
    company: CompanyRef | null;
  }>;
  leads: SearchGroup<{
    id: Id;
    companyName: string;
    contactName: string;
    status: LeadStatus;
  }>;
}

export interface Meta {
  workspace: { id: Id; name: string; baseCurrency: Currency; timezone: string };
  currentUser: UserRef;
  pipeline: Pipeline;
  enums: {
    companySizes: CompanySize[];
    serviceTypes: ServiceType[];
    leadSources: LeadSource[];
    leadStatuses: LeadStatus[];
    dealStatuses: DealStatus[];
    activityTypes: ActivityType[];
    taskStatuses: TaskStatus[];
    taskPriorities: TaskPriority[];
    entityTypes: EntityType[];
  };
  currencies: Currency[];
  today: IsoDate;
}

export interface ConvertLeadResult {
  lead: Lead;
  company: Company;
  contact: Contact;
  deal: Deal;
  created: { company: boolean; contact: boolean; deal: boolean };
  alreadyConverted: boolean;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export interface CompanyInput {
  name: string;
  domain?: string | null;
  industry?: string | null;
  size?: CompanySize | null;
  location?: string | null;
  telegram?: string | null;
  stack?: string[];
  tags?: string[];
  notes?: string | null;
}

export interface ContactInput {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  telegram?: string | null;
  linkedin?: string | null;
  jobTitle?: string | null;
  companyId?: Id | null;
  tags?: string[];
  notes?: string | null;
  allowDuplicate?: boolean;
}

export interface LeadInput {
  companyName: string;
  contactName: string;
  email?: string | null;
  phone?: string | null;
  source: LeadSource;
  serviceType?: ServiceType | null;
  status?: Exclude<LeadStatus, 'converted'>;
  estimatedAmountMinor?: number | null;
  currency?: Currency;
  notes?: string | null;
  allowDuplicate?: boolean;
}

export interface DealInput {
  title: string;
  amountMinor: number;
  currency: Currency;
  serviceType: ServiceType;
  source?: LeadSource | null;
  companyId: Id;
  primaryContactId?: Id | null;
  stageId?: Id;
  expectedCloseDate?: IsoDate | null;
}

export interface ActivityInput {
  type: ActivityType;
  subject: string;
  body?: string | null;
  occurredAt?: IsoDateTime;
  relatedTo: EntityRef;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  dueDate: IsoDate;
  priority?: TaskPriority;
  relatedTo: EntityRef;
}

export interface ConvertLeadInput {
  companyId?: Id;
  companyName?: string;
  contact?: {
    firstName?: string;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    jobTitle?: string | null;
  };
  deal: {
    title: string;
    amountMinor: number;
    currency: Currency;
    stageId?: Id;
    serviceType: ServiceType;
    source?: LeadSource;
    expectedCloseDate?: IsoDate | null;
  };
}
