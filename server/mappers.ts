import type {
  Activity,
  AuditEvent,
  Company,
  CompanyListItem,
  CompanyRef,
  Contact,
  ContactListItem,
  ContactRef,
  Deal,
  DealListItem,
  Lead,
  LeadListItem,
  Stage,
  StageHistoryEntry,
  Task,
  UserRef,
} from '../shared/types';
import { parseStringArray } from './lib/normalize';

type Row = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value : String(value ?? ''));
const nullableStr = (value: unknown): string | null =>
  value == null ? null : typeof value === 'string' ? value : String(value);
const num = (value: unknown): number => Number(value ?? 0);
const nullableNum = (value: unknown): number | null => (value == null ? null : Number(value));

const field = (prefix: string, name: string): string =>
  prefix ? `${prefix}${name}` : name[0].toLowerCase() + name.slice(1);

export function userRef(row: Row, prefix = ''): UserRef {
  return {
    id: num(row[field(prefix, 'Id')]),
    name: str(row[field(prefix, 'Name')]),
    email: str(row[field(prefix, 'Email')]),
  };
}

export function stageFromRow(row: Row, prefix = ''): Stage {
  return {
    id: num(row[field(prefix, 'Id')]),
    name: str(row[field(prefix, 'Name')]),
    position: num(row[field(prefix, 'Position')]),
    probability: num(row[field(prefix, 'Probability')]),
  };
}

export function companyRefFromRow(row: Row, prefix = ''): CompanyRef | null {
  const id = row[field(prefix, 'Id')];
  if (id == null) return null;
  return {
    id: num(id),
    name: str(row[field(prefix, 'Name')]),
    domain: nullableStr(row[field(prefix, 'Domain')]),
  };
}

export function contactRefFromRow(row: Row, prefix = ''): ContactRef | null {
  const id = row[field(prefix, 'Id')];
  if (id == null) return null;
  return {
    id: num(id),
    fullName: str(row[field(prefix, 'FullName')]),
    email: nullableStr(row[field(prefix, 'Email')]),
  };
}

export function mapCompanyListItem(row: Row): CompanyListItem {
  return {
    id: num(row.id),
    name: str(row.name),
    domain: nullableStr(row.domain),
    industry: nullableStr(row.industry),
    size: (nullableStr(row.size) as CompanyListItem['size']) ?? null,
    location: nullableStr(row.location),
    telegram: nullableStr(row.telegram),
    stack: parseStringArray(row.stack),
    tags: parseStringArray(row.tags),
    counts: {
      contacts: num(row.contactsCount),
      openDeals: num(row.openDealsCount),
      wonDeals: num(row.wonDealsCount),
    },
    openPipelineMinor: num(row.openPipelineMinor),
    createdAt: str(row.createdAt),
    updatedAt: str(row.updatedAt),
  };
}

export function mapCompany(row: Row): Company {
  return {
    ...mapCompanyListItem(row),
    notes: nullableStr(row.notes),
    owner: userRef(row, 'owner'),
  };
}

export function mapContactListItem(row: Row): ContactListItem {
  return {
    id: num(row.id),
    firstName: str(row.firstName),
    lastName: nullableStr(row.lastName),
    fullName: str(row.fullName),
    email: nullableStr(row.email),
    phone: nullableStr(row.phone),
    telegram: nullableStr(row.telegram),
    linkedin: nullableStr(row.linkedin),
    jobTitle: nullableStr(row.jobTitle),
    company: companyRefFromRow(row, 'company'),
    tags: parseStringArray(row.tags),
    createdAt: str(row.createdAt),
    updatedAt: str(row.updatedAt),
  };
}

export function mapContact(row: Row): Contact {
  return {
    ...mapContactListItem(row),
    notes: nullableStr(row.notes),
    owner: userRef(row, 'owner'),
  };
}

export function mapLead(row: Row): Lead {
  return {
    id: num(row.id),
    companyName: str(row.companyName),
    contactName: str(row.contactName),
    email: nullableStr(row.email),
    phone: nullableStr(row.phone),
    source: str(row.source) as Lead['source'],
    serviceType: (nullableStr(row.serviceType) as Lead['serviceType']) ?? null,
    status: str(row.status) as Lead['status'],
    estimatedAmountMinor: nullableNum(row.estimatedAmountMinor),
    currency: str(row.currency ?? 'RUB') as Lead['currency'],
    notes: nullableStr(row.notes),
    owner: userRef(row, 'owner'),
    convertedCompanyId: nullableNum(row.convertedCompanyId),
    convertedContactId: nullableNum(row.convertedContactId),
    convertedDealId: nullableNum(row.convertedDealId),
    convertedAt: nullableStr(row.convertedAt),
    createdAt: str(row.createdAt),
    updatedAt: str(row.updatedAt),
  };
}

export function mapLeadListItem(row: Row): LeadListItem {
  const lead = mapLead(row);
  return {
    id: lead.id,
    companyName: lead.companyName,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    serviceType: lead.serviceType,
    status: lead.status,
    estimatedAmountMinor: lead.estimatedAmountMinor,
    currency: lead.currency,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

export function mapDealListItem(row: Row): DealListItem {
  return {
    id: num(row.id),
    title: str(row.title),
    amountMinor: num(row.amountMinor),
    currency: str(row.currency) as DealListItem['currency'],
    serviceType: str(row.serviceType) as DealListItem['serviceType'],
    source: (nullableStr(row.source) as DealListItem['source']) ?? null,
    status: str(row.status) as DealListItem['status'],
    stage: stageFromRow(row, 'stage'),
    company: companyRefFromRow(row, 'company'),
    primaryContact: contactRefFromRow(row, 'contact'),
    expectedCloseDate: nullableStr(row.expectedCloseDate),
    version: num(row.version),
    createdAt: str(row.createdAt),
    updatedAt: str(row.updatedAt),
  };
}

export function mapDeal(row: Row): Deal {
  return {
    ...mapDealListItem(row),
    pipelineId: num(row.pipelineId),
    owner: userRef(row, 'owner'),
    closedAt: nullableStr(row.closedAt),
    lostReason: nullableStr(row.lostReason),
  };
}

export function mapActivity(row: Row): Activity {
  return {
    id: num(row.id),
    type: str(row.type) as Activity['type'],
    subject: str(row.subject),
    body: nullableStr(row.body),
    occurredAt: str(row.occurredAt),
    author: userRef(row, 'author'),
    relatedTo: {
      type: str(row.entityType) as Activity['relatedTo']['type'],
      id: num(row.entityId),
    },
    relatedLabel: str(row.relatedLabel ?? ''),
    createdAt: str(row.createdAt),
    updatedAt: str(row.updatedAt),
  };
}

export function mapTask(row: Row, today: string): Task {
  const status = str(row.status) as Task['status'];
  const dueDate = str(row.dueDate);
  return {
    id: num(row.id),
    title: str(row.title),
    description: nullableStr(row.description),
    dueDate,
    priority: str(row.priority) as Task['priority'],
    status,
    completedAt: nullableStr(row.completedAt),
    isOverdue: status === 'open' && dueDate < today,
    assignee: userRef(row, 'assignee'),
    relatedTo: {
      type: str(row.entityType) as Task['relatedTo']['type'],
      id: num(row.entityId),
    },
    relatedLabel: str(row.relatedLabel ?? ''),
    createdAt: str(row.createdAt),
    updatedAt: str(row.updatedAt),
  };
}

export function mapStageHistory(row: Row): StageHistoryEntry {
  const fromId = row.fromStageId;
  return {
    id: num(row.id),
    fromStage:
      fromId == null
        ? null
        : {
            id: num(fromId),
            name: str(row.fromStageName),
            position: num(row.fromStagePosition),
            probability: num(row.fromStageProbability),
          },
    toStage: {
      id: num(row.toStageId),
      name: str(row.toStageName),
      position: num(row.toStagePosition),
      probability: num(row.toStageProbability),
    },
    note: nullableStr(row.note),
    changedBy: userRef(row, 'changedBy'),
    changedAt: str(row.changedAt),
  };
}

export function mapAuditEvent(row: Row): AuditEvent {
  let changes: AuditEvent['changes'] = [];
  let metadata: Record<string, unknown> | null = null;
  try {
    changes = JSON.parse(str(row.changes));
  } catch {
    changes = [];
  }
  try {
    metadata = row.metadata == null ? null : JSON.parse(str(row.metadata));
  } catch {
    metadata = null;
  }
  return {
    id: num(row.id),
    action: str(row.action) as AuditEvent['action'],
    entityType: str(row.entityType) as AuditEvent['entityType'],
    entityId: num(row.entityId),
    actor: userRef(row, 'actor'),
    changes,
    metadata,
    createdAt: str(row.createdAt),
  };
}
