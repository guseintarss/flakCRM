import { z } from 'zod';
import {
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
} from '../shared/constants';
import { isIsoDate } from './lib/dates';

export const idSchema = z.coerce.number().int().positive();
export const currencySchema = z.enum(CURRENCIES);
export const companySizeSchema = z.enum(COMPANY_SIZES);
export const serviceTypeSchema = z.enum(SERVICE_TYPES);
export const leadSourceSchema = z.enum(LEAD_SOURCES);
export const leadStatusSchema = z.enum(LEAD_STATUSES);
export const dealStatusSchema = z.enum(DEAL_STATUSES);
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export const entityTypeSchema = z.enum(ENTITY_TYPES);
export const auditActionSchema = z.enum(AUDIT_ACTIONS);

export const isoDateSchema = z
  .string()
  .trim()
  .refine(isIsoDate, 'Ожидается дата в формате YYYY-MM-DD.');

export const isoDateTimeSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Ожидается дата и время.');

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Не больше ${max} символов.`)
    .nullable()
    .optional();

export const requiredText = (max: number) =>
  z.string().trim().min(1, 'Обязательное поле.').max(max, `Не больше ${max} символов.`);

export const tagsSchema = z
  .array(z.string().trim().min(1).max(30))
  .max(20)
  .optional();

export const stackSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .optional();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const companyCreateSchema = z
  .object({
    name: requiredText(200),
    domain: optionalText(253),
    industry: optionalText(100),
    size: companySizeSchema.nullable().optional(),
    location: optionalText(120),
    telegram: optionalText(120),
    stack: stackSchema,
    tags: tagsSchema,
    notes: optionalText(10_000),
  })
  .strict();

export const companyUpdateSchema = companyCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Нужно хотя бы одно поле.');

export const contactCreateSchema = z
  .object({
    firstName: requiredText(100),
    lastName: optionalText(100),
    email: optionalText(254).refine(
      (value) => value == null || value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      'Некорректный email.',
    ),
    phone: optionalText(32),
    telegram: optionalText(120),
    linkedin: optionalText(200),
    jobTitle: optionalText(120),
    companyId: idSchema.nullable().optional(),
    tags: tagsSchema,
    notes: optionalText(10_000),
    allowDuplicate: z.boolean().optional(),
  })
  .strict();

export const contactUpdateSchema = contactCreateSchema
  .partial()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'allowDuplicate'),
    'Нужно хотя бы одно поле.',
  );

export const leadCreateSchema = z
  .object({
    companyName: requiredText(200),
    contactName: requiredText(160),
    email: optionalText(254).refine(
      (value) => value == null || value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      'Некорректный email.',
    ),
    phone: optionalText(32),
    source: leadSourceSchema,
    serviceType: serviceTypeSchema.nullable().optional(),
    status: z.enum(['new', 'contacted', 'qualified', 'disqualified']).optional(),
    estimatedAmountMinor: z.number().int().min(0).max(1_000_000_000_000_000).nullable().optional(),
    currency: currencySchema.optional(),
    notes: optionalText(10_000),
    allowDuplicate: z.boolean().optional(),
  })
  .strict();

export const leadUpdateSchema = z
  .object({
    companyName: requiredText(200).optional(),
    contactName: requiredText(160).optional(),
    email: optionalText(254),
    phone: optionalText(32),
    source: leadSourceSchema.optional(),
    serviceType: serviceTypeSchema.nullable().optional(),
    status: leadStatusSchema.optional(),
    estimatedAmountMinor: z.number().int().min(0).max(1_000_000_000_000_000).nullable().optional(),
    currency: currencySchema.optional(),
    notes: optionalText(10_000),
    allowDuplicate: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'allowDuplicate'),
    'Нужно хотя бы одно поле.',
  );

export const dealCreateSchema = z
  .object({
    title: requiredText(200),
    amountMinor: z.number().int().min(0).max(1_000_000_000_000_000),
    currency: currencySchema,
    serviceType: serviceTypeSchema,
    source: leadSourceSchema.nullable().optional(),
    companyId: idSchema,
    primaryContactId: idSchema.nullable().optional(),
    stageId: idSchema.optional(),
    expectedCloseDate: isoDateSchema.nullable().optional(),
  })
  .strict();

export const dealUpdateSchema = z
  .object({
    version: z.number().int().min(1),
    title: requiredText(200).optional(),
    amountMinor: z.number().int().min(0).max(1_000_000_000_000_000).optional(),
    currency: currencySchema.optional(),
    serviceType: serviceTypeSchema.optional(),
    source: leadSourceSchema.nullable().optional(),
    companyId: idSchema.optional(),
    primaryContactId: idSchema.nullable().optional(),
    expectedCloseDate: isoDateSchema.nullable().optional(),
    status: dealStatusSchema.optional(),
    lostReason: optionalText(500),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'version'),
    'Нужно хотя бы одно изменяемое поле.',
  );

export const dealStageChangeSchema = z
  .object({
    stageId: idSchema,
    version: z.number().int().min(1),
    note: optionalText(500),
  })
  .strict();

export const activityCreateSchema = z
  .object({
    type: activityTypeSchema,
    subject: requiredText(200),
    body: optionalText(20_000),
    occurredAt: isoDateTimeSchema.optional(),
    relatedTo: z
      .object({
        type: entityTypeSchema,
        id: idSchema,
      })
      .strict(),
  })
  .strict();

export const activityUpdateSchema = z
  .object({
    type: activityTypeSchema.optional(),
    subject: requiredText(200).optional(),
    body: optionalText(20_000),
    occurredAt: isoDateTimeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Нужно хотя бы одно поле.');

export const taskCreateSchema = z
  .object({
    title: requiredText(200),
    description: optionalText(5_000),
    dueDate: isoDateSchema,
    priority: taskPrioritySchema.optional(),
    relatedTo: z
      .object({
        type: entityTypeSchema,
        id: idSchema,
      })
      .strict(),
  })
  .strict();

export const taskUpdateSchema = z
  .object({
    title: requiredText(200).optional(),
    description: optionalText(5_000),
    dueDate: isoDateSchema.optional(),
    priority: taskPrioritySchema.optional(),
    status: taskStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Нужно хотя бы одно поле.');

const convertContactSchema = z
  .object({
    firstName: requiredText(100).optional(),
    lastName: optionalText(100),
    email: optionalText(254),
    phone: optionalText(32),
    jobTitle: optionalText(120),
  })
  .strict();

const convertDealSchema = z
  .object({
    title: requiredText(200),
    amountMinor: z.number().int().min(0).max(1_000_000_000_000_000),
    currency: currencySchema,
    stageId: idSchema.optional(),
    serviceType: serviceTypeSchema,
    source: leadSourceSchema.optional(),
    expectedCloseDate: isoDateSchema.nullable().optional(),
  })
  .strict();

export const convertLeadSchema = z
  .object({
    companyId: idSchema.optional(),
    companyName: requiredText(200).optional(),
    contact: convertContactSchema.optional(),
    deal: convertDealSchema,
  })
  .strict()
  .refine(
    (value) => !(value.companyId !== undefined && value.companyName !== undefined),
    'Укажите либо companyId, либо companyName, но не оба.',
  );

export const companiesQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  industry: z.string().trim().max(100).optional(),
  size: companySizeSchema.optional(),
  tag: z.string().trim().max(30).optional(),
  sort: z
    .enum(['name', '-name', 'createdAt', '-createdAt', 'updatedAt', '-updatedAt'])
    .default('name'),
}).strict();

export const contactsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  companyId: idSchema.optional(),
  tag: z.string().trim().max(30).optional(),
  sort: z
    .enum(['name', '-name', 'createdAt', '-createdAt', 'updatedAt', '-updatedAt'])
    .default('name'),
}).strict();

export const leadsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: leadStatusSchema.optional(),
  source: leadSourceSchema.optional(),
  serviceType: serviceTypeSchema.optional(),
  sort: z.enum(['-createdAt', 'createdAt', '-updatedAt', 'updatedAt']).default('-createdAt'),
}).strict();

export const dealsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['open', 'won', 'lost', 'all']).default('all'),
  stageId: idSchema.optional(),
  companyId: idSchema.optional(),
  primaryContactId: idSchema.optional(),
  serviceType: serviceTypeSchema.optional(),
  source: leadSourceSchema.optional(),
  currency: currencySchema.optional(),
  expectedCloseFrom: isoDateSchema.optional(),
  expectedCloseTo: isoDateSchema.optional(),
  sort: z
    .enum([
      'updatedAt',
      '-updatedAt',
      'createdAt',
      '-createdAt',
      'amountMinor',
      '-amountMinor',
      'expectedCloseDate',
      '-expectedCloseDate',
    ])
    .default('-updatedAt'),
})
  .strict()
  .refine(
    (value) =>
      !(
        value.expectedCloseFrom &&
        value.expectedCloseTo &&
        value.expectedCloseFrom > value.expectedCloseTo
      ),
    'expectedCloseFrom больше expectedCloseTo.',
  );

export const boardQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  currency: currencySchema.optional(),
  companyId: idSchema.optional(),
  serviceType: serviceTypeSchema.optional(),
  source: leadSourceSchema.optional(),
  limitPerStage: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const activitiesQuerySchema = paginationSchema
  .extend({
    entityType: entityTypeSchema.optional(),
    entityId: idSchema.optional(),
    type: activityTypeSchema.optional(),
    sort: z.enum(['-occurredAt', 'occurredAt']).default('-occurredAt'),
  })
  .strict()
  .refine(
    (value) => (value.entityType === undefined) === (value.entityId === undefined),
    'entityType и entityId указываются вместе.',
  );

export const tasksQuerySchema = paginationSchema
  .extend({
    status: z.enum(['open', 'done', 'all']).default('open'),
    priority: taskPrioritySchema.optional(),
    overdue: z.enum(['true', 'false']).optional(),
    dueFrom: isoDateSchema.optional(),
    dueTo: isoDateSchema.optional(),
    entityType: entityTypeSchema.optional(),
    entityId: idSchema.optional(),
    sort: z.enum(['dueDate', '-dueDate', 'createdAt', '-createdAt']).default('dueDate'),
  })
  .strict()
  .refine(
    (value) => (value.entityType === undefined) === (value.entityId === undefined),
    'entityType и entityId указываются вместе.',
  )
  .refine(
    (value) => !(value.dueFrom && value.dueTo && value.dueFrom > value.dueTo),
    'dueFrom больше dueTo.',
  );

export const dashboardQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    currency: currencySchema.optional(),
  })
  .strict()
  .refine((value) => !(value.from && value.to && value.from > value.to), 'from больше to.');

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(10).default(5),
}).strict();

export const auditQuerySchema = paginationSchema.extend({
  entityType: z.enum(['company', 'contact', 'lead', 'deal', 'activity', 'task']),
  entityId: idSchema,
  action: auditActionSchema.optional(),
}).strict();

export const duplicateCompanyQuerySchema = z
  .object({ domain: z.string().trim().min(1).max(253) })
  .strict();
export const duplicateContactQuerySchema = z
  .object({ email: z.string().trim().min(3).max(254) })
  .strict();
export const duplicateLeadQuerySchema = z
  .object({ email: z.string().trim().min(3).max(254) })
  .strict();
