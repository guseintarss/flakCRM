import type {
  ActivityType,
  CompanySize,
  DealStatus,
  EntityType,
  LeadSource,
  LeadStatus,
  ServiceType,
  TaskPriority,
  TaskStatus,
} from '@shared/types';

export const serviceTypeLabels: Record<ServiceType, string> = {
  web: 'Веб-разработка',
  mobile: 'Мобильная разработка',
  devops: 'DevOps',
  ai_ml: 'AI / ML',
  design: 'Дизайн',
  consulting: 'Консалтинг',
  staff_augmentation: 'Выделенная команда',
  restaurant: 'Ресторан',
  service: 'Сервисный бизнес',
  tourism: 'Туризм и размещение',
  other: 'Другое',
};

export const leadSourceLabels: Record<LeadSource, string> = {
  website: 'Сайт',
  referral: 'Рекомендация',
  linkedin: 'LinkedIn',
  cold_outreach: 'Холодный аутрич',
  event: 'Мероприятие',
  marketplace: 'Маркетплейс',
  partner: 'Партнёр',
  other: 'Другое',
};

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: 'Новый',
  contacted: 'На связи',
  qualified: 'Квалифицирован',
  converted: 'Конвертирован',
  disqualified: 'Не подходит',
};

export const dealStatusLabels: Record<DealStatus, string> = {
  open: 'В работе',
  won: 'Выиграна',
  lost: 'Проиграна',
};

export const companySizeLabels: Record<CompanySize, string> = {
  '1-10': '1–10 человек',
  '11-50': '11–50 человек',
  '51-200': '51–200 человек',
  '201-500': '201–500 человек',
  '501-1000': '501–1000 человек',
  '1000+': '1000+ человек',
};

export const activityTypeLabels: Record<ActivityType, string> = {
  call: 'Звонок',
  email: 'Письмо',
  meeting: 'Встреча',
  note: 'Заметка',
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  open: 'Открыта',
  done: 'Выполнена',
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
};

export const entityTypeLabels: Record<EntityType, string> = {
  company: 'Компания',
  contact: 'Контакт',
  lead: 'Лид',
  deal: 'Сделка',
};

export const entityTypeGenitive: Record<EntityType, string> = {
  company: 'компании',
  contact: 'контакта',
  lead: 'лида',
  deal: 'сделки',
};

export function labelOf<T extends Record<string, string>>(map: T, value: string | null | undefined): string {
  if (!value) return '—';
  return map[value] ?? value;
}
