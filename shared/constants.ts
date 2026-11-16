export const CURRENCIES = [
  'RUB',
  'USD',
  'EUR',
  'GBP',
  'CHF',
  'PLN',
  'KZT',
  'UAH',
  'GEL',
  'AED',
  'TRY',
] as const;

export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'] as const;

export const SERVICE_TYPES = [
  'web',
  'mobile',
  'devops',
  'ai_ml',
  'design',
  'consulting',
  'staff_augmentation',
  'restaurant',
  'service',
  'tourism',
  'other',
] as const;

export const VERTICALS = ['restaurant', 'service', 'tourism'] as const;

export const LEAD_SOURCES = [
  'website',
  'referral',
  'linkedin',
  'cold_outreach',
  'event',
  'marketplace',
  'partner',
  'other',
] as const;

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'disqualified'] as const;

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const;

export const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note'] as const;

export const TASK_STATUSES = ['open', 'done'] as const;

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

export const ENTITY_TYPES = ['company', 'contact', 'lead', 'deal'] as const;

export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'convert', 'stage_change'] as const;

export const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'mail.ru',
  'yandex.ru',
  'bk.ru',
  'list.ru',
  'inbox.ru',
]);
