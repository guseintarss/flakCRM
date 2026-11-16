# Доменная модель flakCRM MVP

- **Версия:** MVP, 2026-11-10; контекст доступа обновлён ADR 0003
- **Стек и границы:** `docs/adr/0001-stack.md`, `docs/adr/0002-single-user-local-mode.md`, `docs/adr/0003-multi-tenant-network.md`, `docs/architecture/network.md`
- **API:** `docs/architecture/api.md`
- **Статус:** канон CRM-домена; мультитенантность и сайты — в `network.md`

> В сетевом режиме `workspace.id = 1` существует внутри отдельной базы бизнеса.
> Аккаунт, членство и выбор бизнеса живут в реестре. См. ADR 0003.

## 1. Общие правила

| Правило | Решение |
| --- | --- |
| Workspace | Один, id `1`, создаётся seed-ом. `workspace_id` есть во всех дочерних доменных таблицах и всегда подставляется сервером (ADR 0002). |
| Пользователь | Один, id `1`, membership с ролью `owner`. Поля `owner_id` / `author_id` / `assignee_id` заполняются сервером. |
| ID | Целые числа, `INTEGER PRIMARY KEY AUTOINCREMENT`, в API — `number`. ID не переиспользуются. |
| Деньги | `amount_minor INTEGER`, целые минорные единицы, `currency` — ISO 4217. Поддержаны валюты с экспонентой 2: `USD, EUR, GBP, CHF, PLN, RUB, KZT, UAH, GEL, AED, TRY`. `float` запрещён. |
| Время | Timestamps — UTC ISO 8601 `YYYY-MM-DDTHH:mm:ss.sssZ`. Календарные даты — `YYYY-MM-DD`. Часовой пояс workspace задаёт границы отчётов и «сегодня». |
| Мягкое удаление | Все CRM-сущности (`company`, `contact`, `lead`, `deal`, `activity`, `task`) имеют `deleted_at`. Жёсткое удаление через API отсутствует. |
| Версия | Только `deal.version`: старт с `1`, инкремент при каждом успешном изменении сделки или стадии. Остальные сущности — last-write-wins (один пользователь). |
| Сортировка | Любой список детерминирован; последний ключ — `id ASC` или `id DESC` в зависимости от направления основного ключа. |
| Регистр поиска | Для кириллицы SQLite `lower()/LIKE` ненадёжны. Храним нормализованные колонки `*_norm` и ищем по ним. Нормализация: `NFKC`, `trim`, схлопывание пробелов, `toLocaleLowerCase('ru-RU')`. |
| JSON-поля | `stack`, `tags`, `changes` хранятся как JSON-текст с `CHECK (json_valid(...))`; в API — массивы/объекты. |
| Аудит | Append-only, без мягкого удаления. Пишется сервисным слоем, не триггерами. |

## 2. Связи

```text
workspace 1 ──< membership >── 1 user
workspace 1 ──< company ──< contact
workspace 1 ──< lead
workspace 1 ──< pipeline ──< stage ──< deal
company 1 ──< deal >── 0..1 contact (primary_contact)
deal 1 ──< deal_stage_history
{company|contact|lead|deal} 1 ──< activity (полиморфная ссылка)
{company|contact|lead|deal} 1 ──< task     (полиморфная ссылка)
{все значимые сущности} 1 ──< audit_event  (полиморфная ссылка)
```

Полиморфные ссылки `activity` и `task` не имеют FK: SQLite не умеет FK на «одну из таблиц». Существование и активность цели проверяет сервис в транзакции создания/изменения. `audit_event` намеренно не имеет FK, чтобы журнал переживал удаление записи.

## 3. Справочники и перечисления

| Тип | Значения |
| --- | --- |
| `company_size` | `1-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1000+` |
| `service_type` | `web`, `mobile`, `devops`, `ai_ml`, `design`, `consulting`, `staff_augmentation`, `other` |
| `lead_source` | `website`, `referral`, `linkedin`, `cold_outreach`, `event`, `marketplace`, `partner`, `other` |
| `lead_status` | `new`, `contacted`, `qualified`, `converted`, `disqualified` |
| `deal_status` | `open`, `won`, `lost` |
| `activity_type` | `call`, `email`, `meeting`, `note` |
| `task_status` | `open`, `done` |
| `task_priority` | `low`, `medium`, `high` |
| `entity_type` | `company`, `contact`, `lead`, `deal` |
| `audit_action` | `create`, `update`, `delete`, `convert`, `stage_change` |
| `currency` | `USD`, `EUR`, `GBP`, `CHF`, `PLN`, `RUB`, `KZT`, `UAH`, `GEL`, `AED`, `TRY` |

Отрасль компании (`industry`) — свободный текст до 100 символов, не enum: IT-клиенты плохо укладываются в фиксированный список. Frontend предлагает подсказки, сервер принимает любое непустое значение.

## 4. Сущности

### 4.1 `workspace`

| Поле | Тип | Ограничения | Назначение |
| --- | --- | --- | --- |
| `id` | INTEGER PK | всегда `1` | единственная организация |
| `name` | TEXT | 1..120 | имя в шапке |
| `base_currency` | TEXT | из списка валют | валюта по умолчанию |
| `timezone` | TEXT | IANA, валидируется через `Intl` | границы отчётов, «сегодня» |
| `created_at`, `updated_at` | TEXT | UTC | — |

### 4.2 `user` и `membership`

`user`: `id` (1), `workspace_id`, `name` (1..120), `email` (нормализованный, 3..254), `timezone` (IANA, по умолчанию из env), `created_at`, `updated_at`.

`membership`: `workspace_id`, `user_id`, `role` (`owner`), `created_at`; PK `(workspace_id, user_id)`. В MVP всегда одна строка `owner`. Роли не проверяются (ADR 0002), таблица нужна для будущего перехода.

### 4.3 `pipeline` и `stage`

`pipeline`: `id` (1), `workspace_id`, `name` (1..80), `is_default` (0/1), `created_at`, `updated_at`. Ровно одна воронка; API только читает.

`stage`: `id` (1..5), `pipeline_id`, `workspace_id`, `name` (1..80), `position` (1..N, уникален в воронке), `probability` (0..100), `created_at`, `updated_at`.

Seed-воронка «Продажи»:

| id | name | probability |
| --- | --- | --- |
| 1 | Квалификация | 10 |
| 2 | Выявление потребностей | 25 |
| 3 | Предложение | 50 |
| 4 | Переговоры | 70 |
| 5 | Договор | 90 |

`won`/`lost` — не стадии, а статусы сделки. Сделка не обязана проходить все стадии; порядок не enforced. Редактирование воронки и стадий — вне MVP.

### 4.4 `company`

| Поле | Тип | Ограничения | Назначение |
| --- | --- | --- | --- |
| `id` | INTEGER PK | — | — |
| `workspace_id` | INTEGER | FK, NOT NULL | изоляция |
| `name` | TEXT | 1..200 | название |
| `name_norm` | TEXT | NOT NULL | поиск/сортировка без учёта регистра |
| `domain` | TEXT NULL | 3..253, нормализованный | сайт/домен; уникален среди активных |
| `industry` | TEXT NULL | 1..100 | отрасль |
| `size` | TEXT NULL | `company_size` | размер |
| `stack` | TEXT | JSON-массив строк, ≤20, каждая 1..40 | технологический стек клиента |
| `tags` | TEXT | JSON-массив, ≤20, каждая 1..30, lowercase | метки |
| `notes` | TEXT NULL | ≤10 000 | заметки; в аудит не попадают |
| `owner_id` | INTEGER | FK user, NOT NULL | заполняется сервером |
| `created_at`, `updated_at` | TEXT | UTC | — |
| `deleted_at` | TEXT NULL | UTC | мягкое удаление |

Инварианты:

- `domain` хранится только в нормализованном виде: lowercase, punycode, без схемы, пути, порта и ведущего `www.`.
- Активная компания с тем же `domain` невозможна: частичный уникальный индекс `(workspace_id, domain) WHERE domain IS NOT NULL AND deleted_at IS NULL`. Попытка → `409 DUPLICATE_COMPANY`.
- `name` обязателен; `domain` может отсутствовать (лид без сайта).
- `stack` и `tags` очищаются от пустых значений и дублей без учёта регистра; `tags` приводятся к lowercase, `stack` сохраняет регистр.

### 4.5 `contact`

| Поле | Тип | Ограничения | Назначение |
| --- | --- | --- | --- |
| `id` | INTEGER PK | — | — |
| `workspace_id` | INTEGER | FK, NOT NULL | изоляция |
| `first_name` | TEXT | 1..100 | имя |
| `last_name` | TEXT NULL | ≤100 | фамилия |
| `first_name_norm`, `last_name_norm` | TEXT | NOT NULL / NULL | поиск |
| `email` | TEXT NULL | 3..254, lowercase | нормализованный email |
| `phone` | TEXT NULL | 3..32, trim | телефон как введён; без сложной нормализации |
| `job_title` | TEXT NULL | ≤120 | должность |
| `company_id` | INTEGER NULL | FK company, `ON DELETE SET NULL` | компания |
| `tags` | TEXT | JSON, ≤20 | метки |
| `notes` | TEXT NULL | ≤10 000 | заметки |
| `owner_id` | INTEGER | FK user | — |
| `created_at`, `updated_at`, `deleted_at` | TEXT | UTC | — |

Инварианты:

- `first_name` обязателен; `last_name` может быть пустым. `fullName` вычисляется как `first_name + " " + last_name` без двойных пробелов.
- `email` нормализуется: `trim`, lowercase, без отображаемого имени. Валидность — базовая проверка `local@domain`, без DNS.
- Дубли по email не запрещены на уровне БД (общие ящики), но создание/изменение по умолчанию возвращает `409 DUPLICATE_CONTACT`, если активный контакт с таким email существует. Обход — `allowDuplicate: true`.
- `company_id` может быть NULL. Ссылка на удалённую компанию в API резолвится в `null` (см. §7).

### 4.6 `lead`

| Поле | Тип | Ограничения | Назначение |
| --- | --- | --- | --- |
| `id` | INTEGER PK | — | — |
| `workspace_id` | INTEGER | FK, NOT NULL | изоляция |
| `company_name` | TEXT | 1..200 | компания-потенциал |
| `company_name_norm` | TEXT | NOT NULL | поиск |
| `contact_name` | TEXT | 1..160 | контактное лицо |
| `contact_name_norm` | TEXT | NOT NULL | поиск |
| `email` | TEXT NULL | 3..254, lowercase | email лида |
| `phone` | TEXT NULL | 3..32 | телефон |
| `source` | TEXT | `lead_source`, NOT NULL | источник |
| `service_type` | TEXT NULL | `service_type` | предполагаемая услуга |
| `status` | TEXT | `lead_status`, NOT NULL, default `new` | статус |
| `estimated_amount_minor` | INTEGER NULL | ≥0, ≤10^15 | оценка бюджета |
| `currency` | TEXT | из списка, default base | валюта оценки |
| `notes` | TEXT NULL | ≤10 000 | заметки |
| `owner_id` | INTEGER | FK user | — |
| `converted_company_id` | INTEGER NULL | FK company | результат конвертации |
| `converted_contact_id` | INTEGER NULL | FK contact | результат конвертации |
| `converted_deal_id` | INTEGER NULL | FK deal | результат конвертации |
| `converted_at` | TEXT NULL | UTC | момент конвертации |
| `created_at`, `updated_at`, `deleted_at` | TEXT | UTC | — |

Инварианты:

- `email` и `phone` оба опциональны; лид может быть создан только с названием компании и контактом.
- При наличии email активный лид с тем же email по умолчанию блокируется: `409 DUPLICATE_LEAD`; обход — `allowDuplicate: true`.
- `status = converted` выставляется только транзакцией конвертации. PATCH с `status: converted` → `422 USE_CONVERT_ENDPOINT`.
- У конвертированного лида `converted_*` заполнены согласованно; PATCH разрешён только для `notes`. Остальные поля → `422 LEAD_CONVERTED`.
- Статусы `new`, `contacted`, `qualified`, `disqualified` переключаются свободно; история статусов лида не ведётся (в MVP достаточно аудита).
- Дубли лида не создаются при повторной конвертации: идемпотентность по `lead.id` (см. §8).

### 4.7 `deal`

| Поле | Тип | Ограничения | Назначение |
| --- | --- | --- | --- |
| `id` | INTEGER PK | — | — |
| `workspace_id` | INTEGER | FK, NOT NULL | изоляция |
| `pipeline_id` | INTEGER | FK pipeline, NOT NULL | воронка |
| `stage_id` | INTEGER | FK stage, NOT NULL | текущая стадия |
| `company_id` | INTEGER | FK company, NOT NULL | компания |
| `primary_contact_id` | INTEGER NULL | FK contact | основной контакт |
| `owner_id` | INTEGER | FK user | — |
| `title` | TEXT | 1..200 | название проекта |
| `title_norm` | TEXT | NOT NULL | поиск |
| `amount_minor` | INTEGER | ≥0, ≤10^15 | сумма |
| `currency` | TEXT | из списка | валюта |
| `service_type` | TEXT | `service_type`, NOT NULL | тип услуги |
| `source` | TEXT NULL | `lead_source` | источник |
| `status` | TEXT | `deal_status`, default `open` | статус |
| `expected_close_date` | TEXT NULL | `YYYY-MM-DD` | ожидаемое закрытие |
| `closed_at` | TEXT NULL | UTC | фактическое закрытие |
| `lost_reason` | TEXT NULL | 1..500 | причина проигрыша |
| `version` | INTEGER | ≥1, default 1 | оптимистическая блокировка |
| `created_at`, `updated_at`, `deleted_at` | TEXT | UTC | — |

Инварианты:

- `company_id` обязателен и указывает на активную компанию при создании и при изменении `company_id`.
- `primary_contact_id`, если задан или меняется, должен ссылаться на активный контакт, у которого `company_id = deal.company_id`. Иначе `422 CONTACT_COMPANY_MISMATCH`. Контакт без компании к сделке не привязывается.
- Уже сохранённые ссылки на мягко удалённые компанию/контакт не блокируют изменение других полей сделки и отдаются в API как `null`. Валидация ссылок выполняется только когда соответствующее поле меняется.
- При смене `company_id` существующий `primary_contact_id` должен принадлежать новой компании; иначе `422 CONTACT_COMPANY_MISMATCH`, если в том же PATCH не передан `primary_contact_id: null`.
- `stage_id` должен принадлежать `pipeline_id`. В MVP pipeline один, но проверка обязательна. Иначе `422 INVALID_STAGE`.
- `status = lost` требует непустой `lost_reason` в итоговом состоянии. Иначе `422 LOST_REASON_REQUIRED`.
- `lost_reason` допускается только при итоговом `status = lost`; для `open`/`won` попытка задать причину → `422 LOST_REASON_NOT_ALLOWED`.
- Переход в `won`/`lost` выставляет `closed_at = now`, если он ещё не был закрыт; `lost` сохраняет/требует причину, `won` очищает `lost_reason`.
- Возврат в `open` очищает `closed_at` и `lost_reason`.
- `status != open` запрещает смену стадии: `422 DEAL_CLOSED`. Сначала сделка переоткрывается.
- PATCH и смена стадии требуют `version` из клиента. Несовпадение → `409 VERSION_CONFLICT` с `currentVersion`; данные не меняются. Успешное изменение увеличивает `version` на 1 и обновляет `updated_at`.
- Смена стадии на ту же самую — no-op: `200`, без истории, аудита и инкремента версии.
- Изменение суммы/валюты/статуса закрытой сделки разрешено (с версией) и аудируется; отчёты пересчитываются по текущим данным.
- Удаление сделки каскадно мягко удаляет её активности и задачи (см. §7).

### 4.8 `deal_stage_history`

| Поле | Тип | Ограничения | Назначение |
| --- | --- | --- | --- |
| `id` | INTEGER PK | — | — |
| `workspace_id` | INTEGER | NOT NULL | изоляция |
| `deal_id` | INTEGER | FK deal, NOT NULL | сделка |
| `from_stage_id` | INTEGER NULL | FK stage | `NULL` — создание сделки |
| `to_stage_id` | INTEGER | FK stage, NOT NULL | новая стадия |
| `note` | TEXT NULL | ≤500 | комментарий к переходу |
| `changed_by` | INTEGER | FK user | актор |
| `changed_at` | TEXT | UTC | время |

Запись создаётся:

- при создании сделки: `from_stage_id = NULL`, `to_stage_id = стартовая стадия`;
- при успешной смене стадии: `from`/`to` + опциональный `note`.

История не удаляется и не редактируется. При мягком удалении сделки остаётся в БД, но недоступна через API сделки.

### 4.9 `activity`

| Поле | Тип | Ограничения | Назначение |
| --- | --- | --- | --- |
| `id` | INTEGER PK | — | — |
| `workspace_id` | INTEGER | NOT NULL | изоляция |
| `type` | TEXT | `activity_type`, NOT NULL | звонок/письмо/встреча/заметка |
| `subject` | TEXT | 1..200 | тема |
| `body` | TEXT NULL | ≤20 000 | содержание; в аудит не попадает |
| `occurred_at` | TEXT | UTC, NOT NULL | когда произошло |
| `author_id` | INTEGER | FK user, NOT NULL | автор |
| `entity_type` | TEXT | `entity_type`, NOT NULL | тип записи |
| `entity_id` | INTEGER | NOT NULL | id записи |
| `created_at`, `updated_at`, `deleted_at` | TEXT | UTC | — |

Инварианты:

- `relatedTo` обязателен, цель существует, не удалена и принадлежит workspace. Проверка — в той же транзакции.
- `author` всегда текущий пользователь; из входных данных не принимается.
- `relatedTo` после создания не меняется (перенос активности запрещён).
- `occurred_at` может быть в прошлом и будущем; по умолчанию — `now` при создании.
- При удалении родительской сущности активности этой сущности мягко удаляются каскадно.

### 4.10 `task`

| Поле | Тип | Ограничения | Назначение |
| --- | --- | --- | --- |
| `id` | INTEGER PK | — | — |
| `workspace_id` | INTEGER | NOT NULL | изоляция |
| `title` | TEXT | 1..200 | задача |
| `description` | TEXT NULL | ≤5 000 | детали; в аудит не попадает |
| `due_date` | TEXT | `YYYY-MM-DD`, NOT NULL | срок |
| `priority` | TEXT | `task_priority`, default `medium` | приоритет |
| `status` | TEXT | `task_status`, default `open` | статус |
| `completed_at` | TEXT NULL | UTC | момент выполнения |
| `assignee_id` | INTEGER | FK user | исполнитель |
| `entity_type` | TEXT | `entity_type` | привязка |
| `entity_id` | INTEGER | NOT NULL | id записи |
| `created_at`, `updated_at`, `deleted_at` | TEXT | UTC | — |

Инварианты:

- `relatedTo` обязателен и валидируется так же, как у активности.
- `status = done` выставляет `completed_at = now`, если он пуст; `open` очищает `completed_at`.
- `isOverdue` вычисляется сервером: `status = open` и `due_date < сегодня в таймзоне workspace`.
- `assignee` всегда текущий пользователь; смена исполнителя и привязки после создания не поддерживается.
- Удаление родителя каскадно мягко удаляет его задачи.

### 4.11 `audit_event`

| Поле | Тип | Ограничения | Назначение |
| --- | --- | --- | --- |
| `id` | INTEGER PK | — | — |
| `workspace_id` | INTEGER | NOT NULL | изоляция |
| `actor_id` | INTEGER | FK user | кто изменил |
| `entity_type` | TEXT | `company/contact/lead/deal/activity/task` | что |
| `entity_id` | INTEGER | NOT NULL | id |
| `action` | TEXT | `audit_action` | действие |
| `changes` | TEXT | JSON-массив, `json_valid` | `[{field, from, to}]` |
| `metadata` | TEXT NULL | JSON-объект | контекст: `snapshot`, `createdIds`, `cascaded` |
| `created_at` | TEXT | UTC | когда |

Правила содержимого:

- `changes` содержит только отслеживаемые поля (таблица ниже). Значения — JSON-безопасные: строка, число, `null`, массив строк.
- `notes`, `description`, `body` и другие свободные тексты в аудит не попадают.
- `delete` пишет `metadata: {snapshot: {name|title}}` и, при каскаде, `{cascaded: {activities: N, tasks: M}}`.
- `convert` пишет `metadata: {companyId, contactId, dealId}`.
- `stage_change` дополнительно к записи истории пишет `changes: [{field: "stageId", from, to}]`.
- `create` для большинства сущностей пишет `changes: []`; для сделки — стартовые значимые поля.
- Аудит append-only; API только читает. Секретов в приложении нет; лишние PII (телефоны в заметках) не журналируются.

| Сущность | Отслеживаемые поля |
| --- | --- |
| company | `name`, `domain`, `industry`, `size`, `stack`, `tags` |
| contact | `firstName`, `lastName`, `email`, `phone`, `jobTitle`, `companyId`, `tags` |
| lead | `companyName`, `contactName`, `email`, `phone`, `source`, `serviceType`, `status`, `estimatedAmountMinor`, `currency` |
| deal | `title`, `amountMinor`, `currency`, `serviceType`, `source`, `companyId`, `primaryContactId`, `status`, `lostReason`, `expectedCloseDate`; стадия — через `stage_change` |
| task | `title`, `dueDate`, `priority`, `status` |
| activity | `type`, `subject`, `occurredAt` |

## 5. Машины состояний

### 5.1 Лид

```text
new ⇄ contacted ⇄ qualified
  ↘        ↘         ↘
   disqualified (в любой момент)
new/contacted/qualified/disqualified ──convert──> converted (терминальный)
```

`converted` не выставляется вручную. Конвертация разрешена из любого неконвертированного статуса, включая `disqualified`: пользователь может передумать. Повторная конвертация возвращает существующий результат.

### 5.2 Сделка

```text
open ──won──> won ──reopen──> open
  │              
  └──lost──> lost ──reopen──> open
```

- `open`: доступны PATCH, смена стадии, won/lost.
- `won`/`lost`: смена стадии запрещена; PATCH разрешён (например, исправить сумму), но `lost` всегда должен иметь непустую причину.
- `reopen` — PATCH `status: open`; `closed_at` и `lost_reason` очищаются.
- Закрытие фиксирует `closed_at`; повторное закрытие не перезаписывает дату, если сделка уже была закрыта.

## 6. Дедупликация и нормализация

Правила едины для ручного создания, PATCH, конвертации лида и будущего импорта.

### 6.1 Email

1. `trim`, lowercase, отбросить пустые.
2. Проверка формата: ровно один `@`, непустые local/domain, длина ≤254. DNS и SMTP не проверяются.
3. Плюс-адресация (`user+tag@`) **не** схлопывается: это разные ящики с точки зрения CRM.
4. Дубли контактов и лидов: активная запись с тем же нормализованным email → `409` с `existingId`; обход — `allowDuplicate: true`.
5. Дубли лидов при конвертации не блокируют конвертацию: используется дедупликация компании и контакта.

### 6.2 Домен

1. Принимаем домен или URL: `https://www.Example.com/path` → `example.com`.
2. `URL`-парсинг, lowercase, punycode для IDN, удаление порта, пути, query, hash и ведущего `www.`.
3. Отклоняем пустой результат и строки без точки.
4. Публичные почтовые домены никогда не становятся доменом компании: `gmail.com`, `googlemail.com`, `outlook.com`, `hotmail.com`, `yahoo.com`, `icloud.com`, `proton.me`, `protonmail.com`, `mail.ru`, `yandex.ru`, `bk.ru`, `list.ru`, `inbox.ru`. Список — константа в `shared/`.
5. Домен компании уникален среди активных. Обновление на занятый домен → `409 DUPLICATE_COMPANY`. Обхода нет: две активные компании с одним сайтом — почти всегда ошибка.

### 6.3 Конвертация лида

Порядок в одной транзакции:

1. Загрузить лид с блокировкой записи; если `status = converted`, вернуть существующие связи и `alreadyConverted: true` (без записи).
2. Найти активный контакт по нормализованному email: `contact.email` из входа, если передан, иначе email лида. Это кандидат на переиспользование, запись ещё не меняется.
3. Определить компанию в порядке приоритета:
   - передан `companyId` — использовать активную компанию;
   - у найденного контакта есть активная компания — использовать её;
   - иначе взять корпоративный домен из того же итогового email (если не публичный) и найти активную компанию с таким доменом;
   - если не найдена — создать компанию из `companyName` и домена.
   Флаг `created.company` показывает, создана ли новая.
4. Определить контакт:
   - если найденный контакт не имеет компании или его компания удалена — привязать к компании из шага 3 и переиспользовать;
   - если его компания совпадает — переиспользовать;
   - если компания другая — `422 CONTACT_COMPANY_MISMATCH` с `details.contactId` и `details.currentCompanyId`; пользователь выбирает правильную компанию или меняет email. Дубль email через конвертацию не создаётся;
   - если контакта нет — создать из `contactName` (первое слово — имя, остаток — фамилия; переопределяется входными полями), email/phone из лида.
   Флаг `created.contact`.
5. Создать сделку с переданными `title`, `amountMinor`, `currency`, `stageId` (по умолчанию первая стадия), `serviceType`; `source` — из входа или из лида; `companyId` и `primaryContactId` — из шагов 3–4. Записать начальную историю стадии.
6. Обновить лид: `status = converted`, `converted_*`, `converted_at`.
7. Записать `AuditEvent` с `action: convert` и ID созданных сущностей.
8. Вернуть лид, компанию, контакт, сделку и флаги `created`.

Повторный вызов после успешной конвертации не создаёт ничего и возвращает те же ID. Конкурентный повторный вызов (если появится второй процесс) разрешается транзакцией и повторным чтением: второй получает уже сохранённый результат, а не дубль.

## 7. Мягкое удаление и каскады

| Удаляемая сущность | Поведение |
| --- | --- |
| `company` | Запрещено, если есть активные сделки в статусе `open` → `409 COMPANY_HAS_OPEN_DEALS` с количеством. Иначе `deleted_at = now`. Активности и задачи компании каскадно мягко удаляются. Контакты и закрытые сделки не удаляются; в API их `company` резолвится в `null`. |
| `contact` | `deleted_at = now`. Сделки, где контакт основной, остаются; `primaryContact` резолвится в `null`. Задачи и активности контакта каскадно мягко удаляются. |
| `lead` | `deleted_at = now`. Созданные при конвертации компания/контакт/сделка не затрагиваются. Активности и задачи лида каскадно мягко удаляются. |
| `deal` | `deleted_at = now`. Стадии и история остаются в БД. Активности и задачи сделки каскадно мягко удаляются. |
| `activity`, `task` | `deleted_at = now`. |
| `stage`, `pipeline`, `user`, `workspace`, `audit_event` | API удаления нет. |
| Повторный DELETE | `404 NOT_FOUND`, потому что запись уже не видна. |

Правила чтения:

- Все списки, поиск, dashboard, board, дедупликация и проверки ссылок исключают `deleted_at IS NOT NULL`.
- `GET` удалённой записи → `404`.
- Ссылки на удалённую компанию/контакт в DTO отдаются как `null`, а не как объект с флагом. UI показывает «Компания удалена» только там, где сохранил ID (например, в аудите).
- Каскадное удаление не пишет отдельный `AuditEvent` на каждую активность/задачу; родительский `delete` содержит `cascaded`-счётчики.
- Восстановление из корзины в MVP отсутствует; данные остаются в БД для ручного разбора.

## 8. Идемпотентность и конкурентность

| Операция | Правило |
| --- | --- |
| Конвертация лида | Идемпотентна по `lead.id`: повтор возвращает существующие связи, `200`, `alreadyConverted: true`. |
| Смена стадии на текущую | No-op: `200`, без истории/аудита/версии. |
| PATCH сделки / смена стадии | Требует `version`. Несовпадение → `409 VERSION_CONFLICT`, без частичных изменений. |
| Создание компании с занятым доменом | Всегда `409 DUPLICATE_COMPANY`; ретрай с тем же телом не создаёт дубль. |
| Создание контакта/лида с дублем email | `409` без `allowDuplicate`; с флагом создаётся новая запись. |
| DELETE | Повторный вызов → `404`; состояние не меняется. |
| CSV export | Читающая операция, безопасна для повторов. |

Другие POST не имеют `Idempotency-Key`: один пользователь, локальная сеть, автоматических ретраев нет. Вводить ключи идемпотентности для всех операций — вне MVP.

## 9. Права и область видимости

| Актор | Workspace | Чтение | Создание/изменение/удаление | Аудит |
| --- | --- | --- | --- | --- |
| Единственный локальный пользователь (`owner`) | всегда `1`, из контекста сервера | все записи workspace | все операции MVP | чтение по сущности |

- Объектная область «свои/командные» не применяется: пользователь один.
- `workspace_id` никогда не берётся из запроса; все repository-методы обязаны содержать фильтр.
- Роли из `AGENTS.md` отложены ADR 0002. При появлении второго пользователя матрица будет введена новым ADR; схема уже готова.
- API не принимает `ownerId`; сервер ставит текущего пользователя.

## 10. Индексы

Индексы под реальные запросы MVP (частичные — по активным записям):

| Таблица | Индекс |
| --- | --- |
| company | `UNIQUE (workspace_id, domain) WHERE domain IS NOT NULL AND deleted_at IS NULL`; `(workspace_id, deleted_at, name_norm)`; `(workspace_id, industry)` |
| contact | `(workspace_id, deleted_at, company_id)`; `(workspace_id, deleted_at, email)`; `(workspace_id, deleted_at, first_name_norm, last_name_norm)` |
| lead | `(workspace_id, deleted_at, status, updated_at)`; `(workspace_id, deleted_at, email)`; `(workspace_id, deleted_at, created_at)` |
| deal | `(workspace_id, deleted_at, status, stage_id)`; `(workspace_id, deleted_at, company_id)`; `(workspace_id, deleted_at, primary_contact_id)`; `(workspace_id, status, closed_at)`; `(workspace_id, deleted_at, expected_close_date)`; `(workspace_id, deleted_at, currency)` |
| deal_stage_history | `(deal_id, changed_at DESC, id DESC)` |
| activity | `(workspace_id, deleted_at, entity_type, entity_id, occurred_at DESC)`; `(workspace_id, deleted_at, occurred_at DESC)` |
| task | `(workspace_id, deleted_at, status, due_date)`; `(workspace_id, deleted_at, entity_type, entity_id)` |
| audit_event | `(workspace_id, entity_type, entity_id, created_at DESC)`; `(workspace_id, created_at DESC)` |

Поиск по подстроке (`LIKE '%q%'`) индекс не использует; это осознанно для локального объёма. FTS5 — отдельное решение после MVP, если появятся десятки тысяч записей и жалобы на скорость.

## 11. Объём и производительность (допущения)

- Расчётный объём: до 10 000 компаний, 20 000 контактов, 5 000 сделок, 100 000 активностей/задач.
- Списки — только с пагинацией; экспорт — с жёстким лимитом 100 000 строк.
- Dashboard и board используют агрегирующие запросы, а не выгрузку всех строк в приложение.
- Цели: p95 списка < 150 мс, dashboard < 300 мс, board < 250 мс на локальной машине при указанном объёме.
- SQLite single-writer: транзакции короткие, без длинных операций внутри; WAL и `busy_timeout` сглаживают редкую конкуренцию.

## 12. Вне модели MVP

Не создаются таблицы и API для: `attachment`, `saved_view`, `notification`, `integration_connection`, `external_ref`, нескольких воронок, управления стадиями, пользовательских полей, импорта, вебхуков, фоновых задач, корзины/восстановления, мультивалютной агрегации в одной сумме. Появление любого пункта — новый срез и, при влиянии на схему, ADR.
