# API-контракт flakCRM MVP

> Актуально для CRM-домена. Сетевые эндпоинты и обязательная авторизация описаны
> в `docs/architecture/network.md`; все пути `/api/v1` теперь требуют сессию и
> работают в базе активного бизнеса.

- **База:** `/api/v1` (кроме `GET /api/health`)
- **Формат:** JSON, `camelCase`, UTF-8
- **Аутентификация:** отсутствует; все запросы выполняются от единственного пользователя workspace `1` (ADR 0002)
- **Канон модели:** `docs/architecture/domain.md`
- **Статус:** обязателен для backend и frontend; изменения — через архитектора

## 1. Общие правила

| Правило | Значение |
| --- | --- |
| Версионирование | Префикс `/api/v1`; ломающее изменение — `/api/v2`, старый контракт не ломается молча |
| Content-Type | JSON-запросы: `application/json`; иное для POST/PATCH → `415`. Исключение: повторная конвертация лида допускает пустое тело (см. §7.2) |
| Лимит тела | 1 МБ → `413 PAYLOAD_TOO_LARGE` |
| Неизвестные поля/параметры | `400 VALIDATION_ERROR`; клиент не может передать `workspaceId`, `workspace_id`, `ownerId`, `userId` |
| ID | целые числа в JSON |
| Деньги | `amountMinor` — целое ≥ 0; `currency` — код из списка §2 |
| Время | timestamps — UTC ISO 8601 с `Z`; календарные даты — `YYYY-MM-DD` |
| Ошибки | единый конверт §4; сообщения на русском, коды на английском |
| Request ID | сервер генерирует UUID, возвращает в `X-Request-Id` и `error.requestId` |
| Сжатие/кеш | JSON-ответы `Cache-Control: no-store`; статика — отдельно |
| CORS | не включается: dev идёт через Vite proxy, production — same-origin |
| Порядок маршрутов | служебные `/duplicates` и `/board` регистрируются раньше `/:id` |
| Ссылочные фильтры | `companyId` и `primaryContactId` сопоставляют только активные цели; удалённая цель не даёт совпадений |

### Пагинация

Параметры: `page` (1.., по умолчанию `1`), `pageSize` (1..100, по умолчанию `25`).

```ts
interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface Page<T> {
  data: T[];
  page: PageMeta;
}
```

- `page` за пределами диапазона → `200` с пустым `data` и корректными `page`.
- `from > to` в любом диапазоне дат → `400 VALIDATION_ERROR`.
- Сортировка всегда детерминирована: при равенстве основного ключа добавляется `id` в том же направлении.
- `total` считается по тем же фильтрам, что и `data`.
- Отдельного cursor-режима нет: локальный объём и стабильная сортировка достаточны.

## 2. Типы и перечисления

```ts
type Id = number;
type IsoDate = string;        // "2026-11-10"
type IsoDateTime = string;    // "2026-11-10T09:30:00.000Z"

type Currency = 'USD'|'EUR'|'GBP'|'CHF'|'PLN'|'RUB'|'KZT'|'UAH'|'GEL'|'AED'|'TRY';
type CompanySize = '1-10'|'11-50'|'51-200'|'201-500'|'501-1000'|'1000+';
type ServiceType = 'web'|'mobile'|'devops'|'ai_ml'|'design'|'consulting'|'staff_augmentation'|'other';
type LeadSource = 'website'|'referral'|'linkedin'|'cold_outreach'|'event'|'marketplace'|'partner'|'other';
type LeadStatus = 'new'|'contacted'|'qualified'|'converted'|'disqualified';
type DealStatus = 'open'|'won'|'lost';
type ActivityType = 'call'|'email'|'meeting'|'note';
type TaskStatus = 'open'|'done';
type TaskPriority = 'low'|'medium'|'high';
type EntityType = 'company'|'contact'|'lead'|'deal';
type AuditAction = 'create'|'update'|'delete'|'convert'|'stage_change';
```

```ts
interface UserRef { id: Id; name: string; email: string; }
interface Stage { id: Id; name: string; position: number; probability: number; }
interface Pipeline { id: Id; name: string; stages: Stage[]; }
interface CompanyRef { id: Id; name: string; domain: string | null; }
interface ContactRef { id: Id; fullName: string; email: string | null; }
interface EntityRef { type: EntityType; id: Id; }
```

## 3. Ошибки

```ts
interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}
```

| HTTP | `code` | Когда |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | схема, типы, неизвестные поля/параметры, неверная пагинация |
| 400 | `MALFORMED_JSON` | тело не парсится |
| 404 | `NOT_FOUND` | запись/маршрут не найдены или запись мягко удалена |
| 405 | `METHOD_NOT_ALLOWED` | метод не поддержан маршрутом |
| 409 | `DUPLICATE_COMPANY` | активный домен уже занят |
| 409 | `DUPLICATE_CONTACT` | активный контакт с таким email |
| 409 | `DUPLICATE_LEAD` | активный лид с таким email |
| 409 | `VERSION_CONFLICT` | `version` сделки устарела |
| 409 | `COMPANY_HAS_OPEN_DEALS` | удаление компании с открытыми сделками |
| 413 | `PAYLOAD_TOO_LARGE` | тело > 1 МБ |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | POST/PATCH без JSON |
| 422 | `INVALID_REFERENCE` | ссылка на несуществующую/удалённую запись |
| 422 | `INVALID_STAGE` | стадия не из воронки сделки |
| 422 | `CONTACT_COMPANY_MISMATCH` | контакт не принадлежит компании сделки или выбранной компании при конвертации |
| 422 | `LOST_REASON_REQUIRED` | `status=lost` без причины |
| 422 | `LOST_REASON_NOT_ALLOWED` | причина проигрыша при `open`/`won` |
| 422 | `DEAL_CLOSED` | смена стадии закрытой сделки |
| 422 | `USE_CONVERT_ENDPOINT` | ручная установка `lead.status=converted` |
| 422 | `LEAD_CONVERTED` | правка полей конвертированного лида, кроме `notes` |
| 500 | `INTERNAL_ERROR` | непредвиденная ошибка; без стека и PII |

`details`:

- валидация: `[{ path: "amountMinor", message: "..." }]`;
- дубли: `{ existingId: 42 }`;
- конфликт версии: `{ currentVersion: 7, updatedAt: "..." }`;
- открытые сделки: `{ openDealCount: 3 }`;
- неверная ссылка: `{ field: "companyId" }`.

## 4. Справочники

### `GET /api/health`

```ts
// 200
interface Health {
  status: 'ok';
  db: 'ok';
  version: string;
  uptimeSeconds: number;
}
```

Не входит в `/v1`, не содержит бизнес-данных. При недоступной БД — `503` с `status: 'degraded'`.

### `GET /api/v1/meta`

```ts
interface Meta {
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
  today: IsoDate; // сегодня в таймзоне workspace
}
```

Источник значений для форм, фильтров и канбана. Frontend не хардкодит стадии и перечисления.

## 5. Компании

```ts
interface CompanyListItem {
  id: Id; name: string; domain: string | null;
  industry: string | null; size: CompanySize | null;
  stack: string[]; tags: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

interface Company extends CompanyListItem {
  notes: string | null;
  owner: UserRef;
  counts: { contacts: number; openDeals: number; wonDeals: number };
}
```

| Метод | Путь | Вход | Выход |
| --- | --- | --- | --- |
| GET | `/companies` | query §5.1 | `Page<CompanyListItem>` |
| POST | `/companies` | `CompanyCreate` | `201 Company`, `Location` |
| GET | `/companies/duplicates` | `domain` | `CompanyDuplicateCheck` |
| GET | `/companies/:id` | — | `Company` |
| PATCH | `/companies/:id` | `CompanyUpdate` | `Company` |
| DELETE | `/companies/:id` | — | `204` |

> `/companies/duplicates` регистрируется до `/:id`.

```ts
interface CompanyCreate {
  name: string;                    // 1..200
  domain?: string | null;          // домен или URL; нормализуется
  industry?: string | null;        // 1..100
  size?: CompanySize | null;
  stack?: string[];                // ≤20, элементы 1..40
  tags?: string[];                 // ≤20, элементы 1..30
  notes?: string | null;           // ≤10 000
}

type CompanyUpdate = Partial<CompanyCreate>;

interface CompanyDuplicateCheck {
  input: string;
  normalizedDomain: string;
  duplicate: CompanyRef | null;
}
```

Ошибки: `DUPLICATE_COMPANY` (`details.existingId`), `INVALID_REFERENCE` при ссылках, `COMPANY_HAS_OPEN_DEALS` при удалении.

### 5.1 Query `GET /companies`

| Параметр | Тип | По умолчанию | Смысл |
| --- | --- | --- | --- |
| `q` | string 1..100 | — | подстрока в name/domain без учёта регистра |
| `industry` | string | — | точное совпадение |
| `size` | `CompanySize` | — | точное |
| `tag` | string | — | точный тег (нормализуется в lowercase) |
| `sort` | enum | `name` | `name`, `-name`, `createdAt`, `-createdAt`, `updatedAt`, `-updatedAt` |
| `page`, `pageSize` | int | 1 / 25 | §1 |

## 6. Контакты

```ts
interface ContactListItem {
  id: Id; firstName: string; lastName: string | null; fullName: string;
  email: string | null; phone: string | null; jobTitle: string | null;
  company: CompanyRef | null; tags: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

interface Contact extends ContactListItem {
  notes: string | null;
  owner: UserRef;
}
```

| Метод | Путь | Вход | Выход |
| --- | --- | --- | --- |
| GET | `/contacts` | query §6.1 | `Page<ContactListItem>` |
| POST | `/contacts` | `ContactCreate` | `201 Contact`, `Location` |
| GET | `/contacts/duplicates` | `email` | `ContactDuplicateCheck` |
| GET | `/contacts/:id` | — | `Contact` |
| PATCH | `/contacts/:id` | `ContactUpdate` | `Contact` |
| DELETE | `/contacts/:id` | — | `204` |

```ts
interface ContactCreate {
  firstName: string;               // 1..100
  lastName?: string | null;        // ≤100
  email?: string | null;           // 3..254, нормализуется
  phone?: string | null;           // 3..32
  jobTitle?: string | null;        // ≤120
  companyId?: Id | null;
  tags?: string[];                 // ≤20
  notes?: string | null;           // ≤10 000
  allowDuplicate?: boolean;        // не сохраняется; обход проверки email
}

type ContactUpdate = Partial<ContactCreate>;
```

```ts
interface ContactDuplicateCheck {
  input: string;
  normalizedEmail: string;
  duplicate: ContactRef | null;
}
```

Без `allowDuplicate` создание/изменение с занятым email → `409 DUPLICATE_CONTACT`. `companyId: null` отвязывает контакт.

### 6.1 Query `GET /contacts`

`q` (имя/фамилия/email), `companyId`, `tag`, `sort` (`name` по умолчанию, `-name`, `createdAt`, `-createdAt`, `updatedAt`, `-updatedAt`), `page`, `pageSize`.

## 7. Лиды

```ts
interface LeadListItem {
  id: Id; companyName: string; contactName: string;
  email: string | null; source: LeadSource; serviceType: ServiceType | null;
  status: LeadStatus; estimatedAmountMinor: number | null; currency: Currency;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

interface Lead extends LeadListItem {
  phone: string | null;
  notes: string | null;
  owner: UserRef;
  convertedCompanyId: Id | null;
  convertedContactId: Id | null;
  convertedDealId: Id | null;
  convertedAt: IsoDateTime | null;
}
```

| Метод | Путь | Вход | Выход |
| --- | --- | --- | --- |
| GET | `/leads` | query §7.1 | `Page<LeadListItem>` |
| POST | `/leads` | `LeadCreate` | `201 Lead`, `Location` |
| GET | `/leads/duplicates` | `email` | `LeadDuplicateCheck` |
| GET | `/leads/:id` | — | `Lead` |
| PATCH | `/leads/:id` | `LeadUpdate` | `Lead` |
| DELETE | `/leads/:id` | — | `204` |
| POST | `/leads/:id/convert` | `ConvertLeadInput` (или пусто для повтора) | `200 ConvertLeadResult` |

```ts
interface LeadCreate {
  companyName: string;             // 1..200
  contactName: string;             // 1..160
  email?: string | null;
  phone?: string | null;
  source: LeadSource;
  serviceType?: ServiceType | null;
  status?: Exclude<LeadStatus, 'converted'>; // default new
  estimatedAmountMinor?: number | null;      // 0..10^15
  currency?: Currency;                        // default base
  notes?: string | null;
  allowDuplicate?: boolean;
}

type LeadUpdate = {
  companyName?: string;
  contactName?: string;
  email?: string | null;
  phone?: string | null;
  source?: LeadSource;
  serviceType?: ServiceType | null;
  status?: LeadStatus;
  estimatedAmountMinor?: number | null;
  currency?: Currency;
  notes?: string | null;
  allowDuplicate?: boolean;
};
```

- `status: converted` в PATCH → `422 USE_CONVERT_ENDPOINT`.
- PATCH конвертированного лида допускает только `notes`; иначе `422 LEAD_CONVERTED`.
- `allowDuplicate` обходит проверку активного лида с тем же email.

### 7.1 Query `GET /leads`

`q` (companyName/contactName/email), `status`, `source`, `serviceType`, `sort` (`-createdAt` по умолчанию, `createdAt`, `-updatedAt`, `updatedAt`), `page`, `pageSize`.

### 7.2 Конвертация

```ts
interface ConvertLeadInput {
  companyId?: Id;                  // существующая компания; взаимоисключимо с companyName
  companyName?: string;            // переопределение названия новой компании
  contact?: {
    firstName?: string;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    jobTitle?: string | null;
  };
  deal: {
    title: string;                 // 1..200, обязательно
    amountMinor: number;           // 0..10^15
    currency: Currency;
    stageId?: Id;                  // default — первая стадия
    serviceType: ServiceType;
    source?: LeadSource;           // default — source лида
    expectedCloseDate?: IsoDate | null;
  };
}

interface ConvertLeadResult {
  lead: Lead;
  company: Company;
  contact: Contact;
  deal: Deal;
  created: { company: boolean; contact: boolean; deal: boolean };
  alreadyConverted: boolean;
}
```

Семантика:

- Первый вызов: `200`, `alreadyConverted: false`, `created.deal: true`; компания/контакт могут быть переиспользованы (`false`).
- Повторный вызов: `200`, те же ID, `alreadyConverted: true`, все `created: false`. Тело не валидируется и может отсутствовать; это делает retry безопасным.
- Обе компании (`companyId` и `companyName`) одновременно → `400 VALIDATION_ERROR`.
- `companyId` не найден/удалён → `422 INVALID_REFERENCE`.
- Стадия вне воронки → `422 INVALID_STAGE`; транзакция откатывается целиком.
- Компания выбирается по приоритету: `companyId` → активная компания найденного по email контакта → домен итогового email (`contact.email` или email лида) → новая компания из `companyName`.
- Найденный по email контакт без компании привязывается к выбранной; контакт из другой компании → `422 CONTACT_COMPANY_MISMATCH` с `details.contactId/currentCompanyId`. Дубль email через конвертацию не создаётся: пользователь выбирает компанию контакта или меняет email.
- Флаги `created` отражают, какие сущности созданы именно этим вызовом.

```ts
interface LeadDuplicateCheck {
  input: string;
  normalizedEmail: string;
  duplicate: { id: Id; companyName: string; contactName: string } | null;
}
```

## 8. Сделки

```ts
interface DealListItem {
  id: Id; title: string; amountMinor: number; currency: Currency;
  serviceType: ServiceType; source: LeadSource | null;
  status: DealStatus; stage: Stage;
  company: CompanyRef | null; primaryContact: ContactRef | null;
  expectedCloseDate: IsoDate | null;
  version: number; createdAt: IsoDateTime; updatedAt: IsoDateTime;
}

interface Deal extends DealListItem {
  pipelineId: Id;
  owner: UserRef;
  closedAt: IsoDateTime | null;
  lostReason: string | null;
}

interface DealCard {
  id: Id; title: string; amountMinor: number; currency: Currency;
  serviceType: ServiceType;
  company: CompanyRef | null; primaryContact: ContactRef | null;
  expectedCloseDate: IsoDate | null;
  version: number; updatedAt: IsoDateTime;
}
```

| Метод | Путь | Вход | Выход |
| --- | --- | --- | --- |
| GET | `/deals` | query §8.1 | `Page<DealListItem>` |
| POST | `/deals` | `DealCreate` | `201 Deal`, `Location` |
| GET | `/deals/board` | query §8.2 | `DealBoard` |
| GET | `/deals/:id` | — | `Deal` |
| PATCH | `/deals/:id` | `DealUpdate` | `Deal` |
| POST | `/deals/:id/stage` | `DealStageChange` | `DealStageChangeResult` |
| GET | `/deals/:id/stage-history` | `page`, `pageSize` | `Page<StageHistoryEntry>` |
| DELETE | `/deals/:id` | — | `204` |

> `/deals/board` регистрируется до `/:id`.

```ts
interface DealCreate {
  title: string;                   // 1..200
  amountMinor: number;             // 0..10^15
  currency: Currency;
  serviceType: ServiceType;
  source?: LeadSource | null;
  companyId: Id;                   // обязателен, активная компания
  primaryContactId?: Id | null;    // должен принадлежать companyId
  stageId?: Id;                    // default — первая стадия
  expectedCloseDate?: IsoDate | null;
}

interface DealUpdate {
  version: number;                 // обязателен
  title?: string;
  amountMinor?: number;
  currency?: Currency;
  serviceType?: ServiceType;
  source?: LeadSource | null;
  companyId?: Id;
  primaryContactId?: Id | null;
  expectedCloseDate?: IsoDate | null;
  status?: DealStatus;
  lostReason?: string | null;      // 1..500
}

interface DealStageChange {
  stageId: Id;
  version: number;
  note?: string | null;            // ≤500
}

interface DealStageChangeResult {
  deal: Deal;
  changed: boolean;                // false — стадия та же, версия не менялась
}
```

Правила:

- `PATCH` не принимает `stageId` (только `POST /stage`).
- В PATCH кроме `version` требуется хотя бы одно изменяемое поле; пустой набор → `400 VALIDATION_ERROR`.
- Успешный PATCH/смена стадии увеличивает `version`; ответ содержит новую версию.
- `status: lost` требует непустой `lostReason` в итоговом состоянии; `won` очищает причину; `open` очищает `closedAt` и `lostReason`.
- `lostReason` принимается только при итоговом `status = lost`; иначе `422 LOST_REASON_NOT_ALLOWED`.
- Закрытие выставляет `closedAt`; повторное закрытие уже закрытой сделки дату не перезаписывает.
- Закрытая сделка не меняет стадию: `422 DEAL_CLOSED`.
- Смена на ту же стадию: `200`, `changed: false`, без истории и версии.
- `primaryContactId` при задании/изменении обязан принадлежать итоговой `companyId`: иначе `422 CONTACT_COMPANY_MISMATCH`.
- Уже сохранённые ссылки на мягко удалённые компанию/контакт не блокируют PATCH других полей и отдаются как `null`; валидация выполняется только для изменяемых ссылок.
- При смене `companyId` существующий `primaryContactId` должен принадлежать новой компании; иначе `422 CONTACT_COMPANY_MISMATCH`, если в том же PATCH не передан `primaryContactId: null`.
- Невалидный `version` → `409 VERSION_CONFLICT` с текущей версией; никакие поля не меняются.

### 8.1 Query `GET /deals`

| Параметр | Тип | По умолчанию | Смысл |
| --- | --- | --- | --- |
| `q` | string 1..100 | — | title или название компании |
| `status` | `open/won/lost/all` | `all` | статус |
| `stageId` | Id | — | стадия |
| `companyId` | Id | — | компания |
| `primaryContactId` | Id | — | контакт |
| `serviceType` | `ServiceType` | — | услуга |
| `source` | `LeadSource` | — | источник |
| `currency` | `Currency` | — | валюта |
| `expectedCloseFrom`, `expectedCloseTo` | IsoDate | — | диапазон ожидаемого закрытия включительно |
| `sort` | enum | `-updatedAt` | `updatedAt`, `-updatedAt`, `createdAt`, `-createdAt`, `amountMinor`, `-amountMinor`, `expectedCloseDate`, `-expectedCloseDate` |
| `page`, `pageSize` | int | 1 / 25 | §1 |

Сделки без `expectedCloseDate` при сортировке по дате идут в конце.

### 8.2 `GET /deals/board`

Query: `q`, `currency` (default base), `companyId`, `serviceType`, `source`, `limitPerStage` (1..100, default 50).

```ts
interface DealBoardStage {
  stage: Stage;
  dealCount: number;               // все подходящие открытые сделки стадии
  amountMinor: number;             // сумма всех подходящих сделок стадии в currency
  deals: DealCard[];               // не более limitPerStage
}

interface DealBoard {
  currency: Currency;
  stages: DealBoardStage[];        // все стадии воронки, включая пустые
  truncated: boolean;              // хотя бы в одной стадии deals урезан
}
```

Board показывает только `status = open` и только выбранную валюту. `dealCount`/`amountMinor` считаются по всем подходящим сделкам, даже если карточки урезаны.

### 8.3 История стадий

```ts
interface StageHistoryEntry {
  id: Id;
  fromStage: Stage | null;         // null — создание сделки
  toStage: Stage;
  note: string | null;
  changedBy: UserRef;
  changedAt: IsoDateTime;
}
```

Сортировка `changedAt DESC, id DESC`. История создаётся при создании сделки и при каждой реальной смене стадии; удаление сделки историю не стирает.

## 9. Активности

```ts
interface Activity {
  id: Id;
  type: ActivityType;
  subject: string;
  body: string | null;
  occurredAt: IsoDateTime;
  author: UserRef;
  relatedTo: EntityRef;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

| Метод | Путь | Вход | Выход |
| --- | --- | --- | --- |
| GET | `/activities` | query §9.1 | `Page<Activity>` |
| POST | `/activities` | `ActivityCreate` | `201 Activity`, `Location` |
| GET | `/activities/:id` | — | `Activity` |
| PATCH | `/activities/:id` | `ActivityUpdate` | `Activity` |
| DELETE | `/activities/:id` | — | `204` |

```ts
interface ActivityCreate {
  type: ActivityType;
  subject: string;                 // 1..200
  body?: string | null;            // ≤20 000
  occurredAt?: IsoDateTime;        // default now
  relatedTo: EntityRef;            // обязателен, цель активна
}

interface ActivityUpdate {
  type?: ActivityType;
  subject?: string;
  body?: string | null;
  occurredAt?: IsoDateTime;
}
```

`relatedTo` и `author` неизменяемы. При удалении родительской сущности активность мягко удаляется каскадом.

### 9.1 Query `GET /activities`

`entityType` + `entityId` (либо оба, либо ни одного), `type`, `sort` (`-occurredAt` по умолчанию, `occurredAt`), `page`, `pageSize`. Если сущность указана и не найдена/удалена → `404 NOT_FOUND`. `authorId` не фильтруется: пользователь один.

## 10. Задачи

```ts
interface Task {
  id: Id;
  title: string;
  description: string | null;
  dueDate: IsoDate;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt: IsoDateTime | null;
  isOverdue: boolean;              // open && dueDate < today (workspace tz)
  assignee: UserRef;
  relatedTo: EntityRef;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

| Метод | Путь | Вход | Выход |
| --- | --- | --- | --- |
| GET | `/tasks` | query §10.1 | `Page<Task>` |
| POST | `/tasks` | `TaskCreate` | `201 Task`, `Location` |
| GET | `/tasks/:id` | — | `Task` |
| PATCH | `/tasks/:id` | `TaskUpdate` | `Task` |
| DELETE | `/tasks/:id` | — | `204` |

```ts
interface TaskCreate {
  title: string;                   // 1..200
  description?: string | null;     // ≤5 000
  dueDate: IsoDate;                // обязательна
  priority?: TaskPriority;         // default medium
  relatedTo: EntityRef;            // обязателен, цель активна
}

interface TaskUpdate {
  title?: string;
  description?: string | null;
  dueDate?: IsoDate;
  priority?: TaskPriority;
  status?: TaskStatus;             // done выставляет completedAt, если пуст; open очищает
}
```

`assignee` и `relatedTo` неизменяемы. Удаление родителя каскадно мягко удаляет задачи.

### 10.1 Query `GET /tasks`

`status` (`open/done/all`, default `open`), `priority`, `overdue` (`true` — только просроченные открытые), `dueFrom`, `dueTo` (IsoDate включительно), `entityType` + `entityId`, `sort` (`dueDate` по умолчанию, `-dueDate`, `createdAt`, `-createdAt`), `page`, `pageSize`.

## 11. Дашборд

### `GET /api/v1/dashboard`

Query: `from`, `to` (IsoDate, default — с 1-го числа текущего месяца по сегодня в таймзоне workspace), `currency` (default base). Диапазон включительный, не более 366 дней; `from > to` → `400`.

```ts
interface DashboardStage {
  stage: Stage;
  dealCount: number;               // открытые сделки на стадии сейчас
  amountMinor: number;
  weightedAmountMinor: number;     // round(amountMinor * stage.probability / 100)
}

interface DashboardTrendPoint {
  month: string;                   // YYYY-MM
  wonMinor: number;
  lostMinor: number;
}

interface Dashboard {
  period: { from: IsoDate; to: IsoDate; timezone: string };
  currency: Currency;
  availableCurrencies: Currency[]; // валюты активных/закрытых сделок + base
  pipeline: {
    dealCount: number;
    amountMinor: number;
    weightedAmountMinor: number;   // сумма weightedAmountMinor по стадиям
    stages: DashboardStage[];
  };
  won: { dealCount: number; amountMinor: number; averageAmountMinor: number };
  lost: { dealCount: number; amountMinor: number };
  winRate: number | null;          // won / (won + lost) за период; null, если закрытых нет
  tasks: {
    openCount: number;
    overdueCount: number;
    dueTodayCount: number;
    upcoming: Task[];              // open, dueDate от сегодня до +7 дней, ≤5
  };
  recentActivities: Activity[];    // последние 10 активных
  trend: DashboardTrendPoint[];    // последние 6 месяцев, включая текущий
}
```

- `pipeline` — снимок текущих открытых сделок, не зависит от периода.
- `won`/`lost` — сделки, у которых `closedAt` попадает в период; фильтр валюты обязателен, суммы не смешиваются.
- `averageAmountMinor` — целое, округление половины вверх.
- Все суммы — в выбранной валюте; сделки другой валюты не попадают ни в суммы, ни в счётчики pipeline/won/lost. `availableCurrencies` помогает UI показать переключатель.
- `trend` не зависит от `from`/`to`: это фиксированное окно из 6 месяцев (включая текущий) в таймзоне workspace. Месяцы без закрытых сделок возвращаются с нулями; `closedAt` относится к месяцу по таймзоне workspace, валюта — `currency`.

## 12. Глобальный поиск

### `GET /api/v1/search?q=&limit=`

`q` — 2..100 символов после trim; иначе `400`. `limit` — 1..10, default 5 (на каждую группу).

```ts
interface SearchResult {
  query: string;
  companies: { total: number; items: Array<{ id: Id; name: string; domain: string | null; industry: string | null }> };
  contacts: { total: number; items: Array<{ id: Id; fullName: string; email: string | null; company: CompanyRef | null }> };
  deals: { total: number; items: Array<{ id: Id; title: string; amountMinor: number; currency: Currency; status: DealStatus; stage: Stage; company: CompanyRef | null }> };
  leads: { total: number; items: Array<{ id: Id; companyName: string; contactName: string; status: LeadStatus }> };
}
```

- Ищет по компаниям (name/domain), контактам (имя/фамилия/email), сделкам (title/компания), лидам (companyName/contactName/email).
- Задачи и активности в глобальный поиск MVP не входят: они доступны через фильтры и timeline. Расширение — новый срез.
- Сортировка групп — `updatedAt DESC`; `total` — полное число совпадений, `items` урезаны `limit`.
- Удалённые записи не попадают. Пустой `q` не допускается.

## 13. CSV-экспорт

| Метод | Путь | Фильтры |
| --- | --- | --- |
| GET | `/export/companies.csv` | как `GET /companies` |
| GET | `/export/contacts.csv` | как `GET /contacts` |
| GET | `/export/leads.csv` | как `GET /leads` |
| GET | `/export/deals.csv` | как `GET /deals` |
| GET | `/export/tasks.csv` | как `GET /tasks` (status default `all` для экспорта) |
| GET | `/export/activities.csv` | как `GET /activities` |

Правила:

- `Content-Type: text/csv; charset=utf-8`; UTF-8 BOM; строки CRLF; поля экранируются кавычками.
- `Content-Disposition: attachment; filename="<entity>-YYYY-MM-DD.csv"`.
- Пагинация не применяется; экспортируются все подходящие активные записи.
- Жёсткий лимит — 100 000 строк. При усечении `X-Export-Truncated: true`; в остальных случаях заголовок отсутствует.
- Защита от CSV-инъекций: значение, начинающееся с `=`, `+`, `-`, `@`, tab или CR, получает префикс `'`.
- Суммы — десятичная строка с двумя знаками (`1250.00`) и отдельная колонка `currency`; внутренние минорные единицы в CSV не выводятся.
- Даты/время — ISO; теги и стек — через `; `.
- Ошибки — обычный JSON-конверт, даже для `.csv`-маршрута.

Колонки (заголовки фиксированы):

| Файл | Колонки |
| --- | --- |
| companies | `id,name,domain,industry,size,stack,tags,createdAt,updatedAt` |
| contacts | `id,firstName,lastName,email,phone,jobTitle,company,tags,createdAt,updatedAt` |
| leads | `id,companyName,contactName,email,phone,source,serviceType,status,estimatedAmount,currency,convertedCompanyId,convertedContactId,convertedDealId,convertedAt,createdAt,updatedAt` |
| deals | `id,title,company,primaryContact,stage,status,amount,currency,serviceType,source,expectedCloseDate,closedAt,lostReason,createdAt,updatedAt` |
| tasks | `id,title,status,priority,dueDate,completedAt,relatedToType,relatedToId,createdAt,updatedAt` |
| activities | `id,type,subject,relatedToType,relatedToId,occurredAt,createdAt,updatedAt` |

`notes`, `description`, `body` в экспорт не попадают — это снижает риск утечки лишних PII и объём файла.

## 14. Аудит

### `GET /api/v1/audit-events`

Обязательны `entityType` (включая `activity`/`task`) и `entityId`. Опционально `action`. Сортировка `createdAt DESC, id DESC`, пагинация §1.

```ts
interface AuditChange { field: string; from: unknown; to: unknown; }

interface AuditEvent {
  id: Id;
  action: AuditAction;
  entityType: 'company'|'contact'|'lead'|'deal'|'activity'|'task';
  entityId: Id;
  actor: UserRef;
  changes: AuditChange[];
  metadata: Record<string, unknown> | null;
  createdAt: IsoDateTime;
}
```

- Аудит читается и после мягкого удаления сущности.
- `changes[].field` — имя поля в API (camelCase), а не колонка БД; `from`/`to` — значения в API-представлении, отсутствующее значение — `null`. Неизменившиеся поля в `changes` не попадают.
- Глобального журнала «все события» в MVP нет: это ограничивает выдачу и соответствует UI (история на карточке).
- UI склеивает историю сделки из `stage-history` и `audit-events` по времени. События `stage_change` не дублируются: переходы стадий берутся из `stage-history`, аудит показывает остальные изменения.

## 15. Примеры

### Конфликт версии

```http
PATCH /api/v1/deals/17
Content-Type: application/json

{ "version": 3, "amountMinor": 1500000 }
```

```http
HTTP/1.1 409 Conflict

{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Сделка изменена в другом окне. Обновите данные и повторите.",
    "details": { "currentVersion": 4, "updatedAt": "2026-11-10T10:15:00.000Z" },
    "requestId": "0f1c..."
  }
}
```

### Повторная конвертация

```http
POST /api/v1/leads/8/convert
Content-Type: application/json

{}
```

```json
{
  "lead": { "id": 8, "status": "converted", "...": "..." },
  "company": { "id": 12, "...": "..." },
  "contact": { "id": 31, "...": "..." },
  "deal": { "id": 44, "version": 1, "...": "..." },
  "created": { "company": false, "contact": false, "deal": false },
  "alreadyConverted": true
}
```

## 16. Что не входит в контракт MVP

Нет эндпоинтов для: аутентификации, пользователей и ролей, настроек workspace, CRUD воронок/стадий, импорта, вложений, сохранённых представлений, уведомлений, вебхуков, интеграций, корзины/восстановления, глобального журнала аудита, произвольных отчётов. Добавление — новый срез и обновление этого документа.
