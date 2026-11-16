import { nowIso, withTransaction, type Db } from './db';
import { config } from './config';
import { addDays, todayInTimeZone } from './lib/dates';
import { normalizeDomain, normalizeText } from './lib/normalize';
import { writeAudit } from './services/audit';

const STAGE_SEED = [
  { name: 'Квалификация', probability: 10 },
  { name: 'Выявление потребностей', probability: 25 },
  { name: 'Предложение', probability: 50 },
  { name: 'Переговоры', probability: 70 },
  { name: 'Договор', probability: 90 },
];

type Row = Record<string, unknown>;

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function scalar(db: Db, sql: string, ...params: (string | number | null)[]): number {
  const row = db.prepare(sql).get(...params) as Row | undefined;
  return Number(row ? Object.values(row)[0] : 0);
}

function insertWorkspace(db: Db): void {
  const timestamp = nowIso();
  db.prepare(
    `INSERT OR IGNORE INTO workspace
      (id, name, base_currency, timezone, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)`,
  ).run(config.workspaceName, config.baseCurrency, config.workspaceTimezone, timestamp, timestamp);

  db.prepare(
    `INSERT OR IGNORE INTO app_user
      (id, workspace_id, name, email, timezone, created_at, updated_at)
     VALUES (1, 1, ?, ?, ?, ?, ?)`,
  ).run(config.localUserName, config.localUserEmail, config.workspaceTimezone, timestamp, timestamp);

  db.prepare(
    `INSERT OR IGNORE INTO membership (workspace_id, user_id, role, created_at)
     VALUES (1, 1, 'owner', ?)`,
  ).run(timestamp);
}

function insertPipeline(db: Db): number {
  const existing = db
    .prepare('SELECT id FROM pipeline WHERE workspace_id = 1 AND is_default = 1')
    .get() as Row | undefined;
  if (existing) return Number(existing.id);

  const timestamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO pipeline (workspace_id, name, is_default, created_at, updated_at)
       VALUES (1, 'Продажи', 1, ?, ?)`,
    )
    .run(timestamp, timestamp);
  const pipelineId = Number(result.lastInsertRowid);

  if (scalar(db, 'SELECT COUNT(*) FROM stage WHERE pipeline_id = ?', pipelineId) === 0) {
    const insertStage = db.prepare(
      `INSERT INTO stage
        (workspace_id, pipeline_id, name, position, probability, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?)`,
    );
    STAGE_SEED.forEach((stage, index) => {
      insertStage.run(pipelineId, stage.name, index + 1, stage.probability, timestamp, timestamp);
    });
  }
  return pipelineId;
}

function seedDemo(db: Db, pipelineId: number): void {
  if (scalar(db, 'SELECT COUNT(*) FROM company WHERE workspace_id = 1') > 0) return;

  const timestamp = nowIso();
  const today = todayInTimeZone(config.workspaceTimezone);

  const insertCompany = db.prepare(
    `INSERT INTO company
      (workspace_id, name, name_norm, domain, domain_norm, industry, size, location,
       telegram, stack, tags, notes, owner_id, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const company = (input: {
    name: string;
    domain: string | null;
    industry: string;
    size: string;
    location: string;
    telegram?: string | null;
    stack: string[];
    tags: string[];
    notes?: string | null;
  }): number => {
    const domain = normalizeDomain(input.domain);
    const result = insertCompany.run(
      input.name,
      normalizeText(input.name),
      domain,
      domain,
      input.industry,
      input.size,
      input.location,
      input.telegram ?? null,
      JSON.stringify(input.stack),
      JSON.stringify(input.tags),
      input.notes ?? null,
      timestamp,
      timestamp,
    );
    const id = Number(result.lastInsertRowid);
    writeAudit(db, { entityType: 'company', entityId: id, action: 'create' });
    return id;
  };

  const severny = company({
    name: 'ООО «Северный Ветер»',
    domain: 'severny-wind.ru',
    industry: 'Финтех',
    size: '51-200',
    location: 'Москва',
    telegram: '@severny_wind',
    stack: ['Go', 'PostgreSQL', 'Kubernetes', 'React'],
    tags: ['стратегический', 'финтех'],
    notes: 'Платёжная платформа для B2B. Закупки идут через CTO, договор с юристами занимает ~3 недели.',
  });
  const vector = company({
    name: 'Онлайн-школа «Вектор»',
    domain: 'vector-school.ru',
    industry: 'EdTech',
    size: '11-50',
    location: 'Санкт-Петербург',
    stack: ['React', 'Node.js', 'PostgreSQL'],
    tags: ['edtech', 'inbound'],
    notes: 'Растут быстро, продуктовые команды перегружены. Готовы обсуждать выделенную команду.',
  });
  const logplus = company({
    name: '«Логистика Плюс»',
    domain: 'logplus.ru',
    industry: 'Логистика',
    size: '201-500',
    location: 'Москва',
    stack: ['1С', 'PostgreSQL', 'Kubernetes'],
    tags: ['enterprise', 'партнёр'],
    notes: 'Партнёрская сделка через интегратора. Есть свой ИТ-отдел, нужна экспертиза по DevOps.',
  });
  const medtech = company({
    name: 'MedTech Lab',
    domain: 'medtechlab.ru',
    industry: 'Медтех',
    size: '11-50',
    location: 'Казань',
    stack: ['Python', 'FastAPI', 'PyTorch', 'PostgreSQL'],
    tags: ['медтех', 'ai'],
    notes: 'Делают сервис для радиологов. Важны сроки и соответствие требованиям к персональным данным.',
  });
  const retail = company({
    name: '«Ритейл Софт»',
    domain: 'retailsoft.ru',
    industry: 'Ритейл',
    size: '51-200',
    location: 'Екатеринбург',
    stack: ['.NET', 'Azure', 'SQL Server'],
    tags: ['аутсорс', 'ритейл'],
    notes: 'Пришли с холодным письмом. Нужен подрядчик на рефакторинг личного кабинета.',
  });
  const atlas = company({
    name: '«Атлас Инжиниринг»',
    domain: null,
    industry: 'Промышленность',
    size: '1000+',
    location: 'Новосибирск',
    stack: ['SAP', 'Java', 'Oracle'],
    tags: ['enterprise', 'cold'],
    notes: 'Крупный промышленный холдинг. Долгий цикл закупки, но высокий бюджет.',
  });

  const insertContact = db.prepare(
    `INSERT INTO contact
      (workspace_id, first_name, last_name, first_name_norm, last_name_norm, email, phone,
       telegram, linkedin, job_title, company_id, tags, notes, owner_id, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const contact = (input: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    telegram?: string;
    linkedin?: string;
    jobTitle: string;
    companyId: number;
    tags?: string[];
    notes?: string;
  }): number => {
    const result = insertContact.run(
      input.firstName,
      input.lastName,
      normalizeText(input.firstName),
      normalizeText(input.lastName),
      input.email.toLowerCase(),
      input.phone ?? null,
      input.telegram ?? null,
      input.linkedin ?? null,
      input.jobTitle,
      input.companyId,
      JSON.stringify(input.tags ?? []),
      input.notes ?? null,
      timestamp,
      timestamp,
    );
    const id = Number(result.lastInsertRowid);
    writeAudit(db, { entityType: 'contact', entityId: id, action: 'create' });
    return id;
  };

  const artem = contact({
    firstName: 'Артём',
    lastName: 'Соколов',
    email: 'a.sokolov@severny-wind.ru',
    phone: '+7 999 120-45-67',
    telegram: '@asokolov',
    linkedin: 'https://www.linkedin.com/in/artem-sokolov',
    jobTitle: 'CTO',
    companyId: severny,
    tags: ['decision-maker'],
    notes: 'Отвечает за технологии и архитектуру. Предпочитает короткие встречи с конкретикой.',
  });
  contact({
    firstName: 'Мария',
    lastName: 'Лебедева',
    email: 'm.lebedeva@severny-wind.ru',
    phone: '+7 999 120-45-68',
    telegram: '@mlebedeva',
    jobTitle: 'CPO',
    companyId: severny,
    tags: ['product'],
  });
  const ilya = contact({
    firstName: 'Илья',
    lastName: 'Морозов',
    email: 'i.morozov@vector-school.ru',
    phone: '+7 921 555-21-18',
    telegram: '@imorozov',
    jobTitle: 'Head of Engineering',
    companyId: vector,
    tags: ['decision-maker'],
    notes: 'Технический контакт. Любит смотреть на прототипы, а не презентации.',
  });
  const anna = contact({
    firstName: 'Анна',
    lastName: 'Ким',
    email: 'a.kim@logplus.ru',
    phone: '+7 916 340-12-90',
    jobTitle: 'COO',
    companyId: logplus,
    tags: ['decision-maker', 'партнёр'],
  });
  const dmitry = contact({
    firstName: 'Дмитрий',
    lastName: 'Волков',
    email: 'd.volkov@medtechlab.ru',
    phone: '+7 917 222-33-44',
    telegram: '@dvolkov',
    jobTitle: 'CTO',
    companyId: medtech,
    tags: ['decision-maker'],
  });
  const olga = contact({
    firstName: 'Ольга',
    lastName: 'Смирнова',
    email: 'o.smirnova@retailsoft.ru',
    phone: '+7 912 777-01-22',
    jobTitle: 'IT Director',
    companyId: retail,
    tags: ['decision-maker'],
  });
  const sergey = contact({
    firstName: 'Сергей',
    lastName: 'Павлов',
    email: 's.pavlov@atlas-eng.ru',
    phone: '+7 913 888-04-55',
    jobTitle: 'CIO',
    companyId: atlas,
    tags: ['enterprise'],
    notes: 'Выходить на контакт лучше через заместителя, сам отвечает редко.',
  });
  const ekaterina = contact({
    firstName: 'Екатерина',
    lastName: 'Новикова',
    email: 'e.novikova@vector-school.ru',
    phone: '+7 921 555-21-19',
    telegram: '@enovikova',
    jobTitle: 'Product Manager',
    companyId: vector,
    tags: ['product'],
  });

  const insertLead = db.prepare(
    `INSERT INTO lead
      (workspace_id, company_name, company_name_norm, contact_name, contact_name_norm,
       email, phone, source, service_type, status, estimated_amount_minor, currency,
       notes, owner_id, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RUB', ?, 1, ?, ?)`,
  );
  const lead = (input: {
    companyName: string;
    contactName: string;
    email: string;
    phone?: string;
    source: string;
    serviceType: string;
    status: string;
    amountMinor: number;
    notes?: string;
    ageDays: number;
  }): number => {
    const createdAt = daysFromNow(-input.ageDays);
    const result = insertLead.run(
      input.companyName,
      normalizeText(input.companyName),
      input.contactName,
      normalizeText(input.contactName),
      input.email.toLowerCase(),
      input.phone ?? null,
      input.source,
      input.serviceType,
      input.status,
      input.amountMinor,
      input.notes ?? null,
      createdAt,
      createdAt,
    );
    const id = Number(result.lastInsertRowid);
    writeAudit(db, { entityType: 'lead', entityId: id, action: 'create' });
    return id;
  };

  lead({
    companyName: 'ФинТех Старт',
    contactName: 'Алексей Григорьев',
    email: 'a.grigoriev@fintechstart.ru',
    phone: '+7 925 401-77-21',
    source: 'website',
    serviceType: 'web',
    status: 'new',
    amountMinor: 180_000_000,
    notes: 'Заявка с сайта: хотят перезапустить личный кабинет за 2 месяца.',
    ageDays: 2,
  });
  lead({
    companyName: 'Складские технологии',
    contactName: 'Наталья Орлова',
    email: 'n.orlova@skladtech.ru',
    phone: '+7 903 118-44-12',
    source: 'referral',
    serviceType: 'ai_ml',
    status: 'contacted',
    amountMinor: 240_000_000,
    notes: 'Рекомендация от «Логистика Плюс». Интересует прогноз загрузки складов.',
    ageDays: 6,
  });
  lead({
    companyName: 'Гринвуд',
    contactName: 'Павел Титов',
    email: 'p.titov@greenwood.ru',
    source: 'linkedin',
    serviceType: 'mobile',
    status: 'qualified',
    amountMinor: 320_000_000,
    notes: 'Обсудили MVP мобильного приложения. Ждут оценку до конца недели.',
    ageDays: 9,
  });
  lead({
    companyName: 'Старый Клиент',
    contactName: 'Игорь Белов',
    email: 'i.belov@oldclient.ru',
    source: 'cold_outreach',
    serviceType: 'consulting',
    status: 'disqualified',
    amountMinor: 60_000_000,
    notes: 'Бюджет отменён, вернуться через полгода.',
    ageDays: 24,
  });

  const stageIds = (db
    .prepare('SELECT id FROM stage WHERE pipeline_id = ? ORDER BY position ASC')
    .all(pipelineId) as Row[]).map((row) => Number(row.id));
  const stage = (position: number): number => {
    const id = stageIds[position - 1];
    if (!id) throw new Error(`Нет стадии ${position}`);
    return id;
  };

  const insertDeal = db.prepare(
    `INSERT INTO deal
      (workspace_id, pipeline_id, stage_id, company_id, primary_contact_id, owner_id,
       title, title_norm, amount_minor, currency, service_type, source, status,
       expected_close_date, closed_at, lost_reason, version, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, 1, ?, ?, ?, 'RUB', ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const insertHistory = db.prepare(
    `INSERT INTO deal_stage_history
      (workspace_id, deal_id, from_stage_id, to_stage_id, note, changed_by, changed_at)
     VALUES (1, ?, ?, ?, ?, 1, ?)`,
  );
  const deal = (input: {
    title: string;
    companyId: number;
    contactId: number;
    stagePosition: number;
    amountMinor: number;
    serviceType: string;
    source: string;
    status: 'open' | 'won' | 'lost';
    expectedCloseDate: string | null;
    closedAt?: string | null;
    lostReason?: string | null;
    createdAt: string;
    updatedAt: string;
    history?: Array<{ from: number; to: number; note: string; at: string }>;
  }): number => {
    const result = insertDeal.run(
      pipelineId,
      stage(input.stagePosition),
      input.companyId,
      input.contactId,
      input.title,
      normalizeText(input.title),
      input.amountMinor,
      input.serviceType,
      input.source,
      input.status,
      input.expectedCloseDate,
      input.closedAt ?? null,
      input.lostReason ?? null,
      input.createdAt,
      input.updatedAt,
    );
    const id = Number(result.lastInsertRowid);
    insertHistory.run(id, null, stage(1), 'Сделка создана', input.createdAt);
    for (const entry of input.history ?? []) {
      insertHistory.run(id, stage(entry.from), stage(entry.to), entry.note, entry.at);
    }
    writeAudit(db, {
      entityType: 'deal',
      entityId: id,
      action: 'create',
      changes: [
        { field: 'title', from: null, to: input.title },
        { field: 'amountMinor', from: null, to: input.amountMinor },
        { field: 'currency', from: null, to: 'RUB' },
      ],
    });
    if (input.status !== 'open') {
      writeAudit(db, {
        entityType: 'deal',
        entityId: id,
        action: 'update',
        changes: [{ field: 'status', from: 'open', to: input.status }],
      });
    }
    return id;
  };

  const dealVector = deal({
    title: 'Платформа онлайн-обучения — 2-я очередь',
    companyId: vector,
    contactId: ilya,
    stagePosition: 3,
    amountMinor: 240_000_000,
    serviceType: 'web',
    source: 'website',
    status: 'open',
    expectedCloseDate: addDays(today, 21),
    createdAt: daysFromNow(-18),
    updatedAt: daysFromNow(-2),
    history: [
      {
        from: 1,
        to: 2,
        note: 'Провели discovery-встречу',
        at: daysFromNow(-12),
      },
      {
        from: 2,
        to: 3,
        note: 'Отправили предложение и план работ',
        at: daysFromNow(-4),
      },
    ],
  });
  const dealSeverny = deal({
    title: 'Мобильное приложение для B2B-клиентов',
    companyId: severny,
    contactId: artem,
    stagePosition: 4,
    amountMinor: 480_000_000,
    serviceType: 'mobile',
    source: 'referral',
    status: 'open',
    expectedCloseDate: addDays(today, 35),
    createdAt: daysFromNow(-26),
    updatedAt: daysFromNow(-1),
    history: [
      { from: 1, to: 2, note: 'Согласовали объём MVP', at: daysFromNow(-20) },
      { from: 2, to: 3, note: 'Отправили смету', at: daysFromNow(-9) },
      { from: 3, to: 4, note: 'Обсуждаем условия договора', at: daysFromNow(-3) },
    ],
  });
  const dealLogplus = deal({
    title: 'DevOps-платформа и CI/CD',
    companyId: logplus,
    contactId: anna,
    stagePosition: 5,
    amountMinor: 360_000_000,
    serviceType: 'devops',
    source: 'partner',
    status: 'open',
    expectedCloseDate: addDays(today, 10),
    createdAt: daysFromNow(-34),
    updatedAt: daysFromNow(-1),
    history: [
      { from: 1, to: 3, note: 'Партнёр передал контакт, сразу к предложению', at: daysFromNow(-25) },
      { from: 3, to: 4, note: 'Согласовали архитектуру решения', at: daysFromNow(-11) },
      { from: 4, to: 5, note: 'Юристы согласовывают договор', at: daysFromNow(-2) },
    ],
  });
  const dealMedtech = deal({
    title: 'ML-сервис триажа медицинских снимков',
    companyId: medtech,
    contactId: dmitry,
    stagePosition: 2,
    amountMinor: 520_000_000,
    serviceType: 'ai_ml',
    source: 'linkedin',
    status: 'open',
    expectedCloseDate: addDays(today, 60),
    createdAt: daysFromNow(-10),
    updatedAt: daysFromNow(-2),
    history: [
      {
        from: 1,
        to: 2,
        note: 'Собираем требования к данным и модели',
        at: daysFromNow(-5),
      },
    ],
  });
  deal({
    title: 'Рефакторинг личного кабинета',
    companyId: retail,
    contactId: olga,
    stagePosition: 1,
    amountMinor: 150_000_000,
    serviceType: 'web',
    source: 'cold_outreach',
    status: 'open',
    expectedCloseDate: addDays(today, 45),
    createdAt: daysFromNow(-4),
    updatedAt: daysFromNow(-4),
  });
  deal({
    title: 'Выделенная команда разработки — 3 месяца',
    companyId: atlas,
    contactId: sergey,
    stagePosition: 4,
    amountMinor: 600_000_000,
    serviceType: 'staff_augmentation',
    source: 'cold_outreach',
    status: 'open',
    expectedCloseDate: addDays(today, 20),
    createdAt: daysFromNow(-40),
    updatedAt: daysFromNow(-3),
    history: [
      { from: 1, to: 2, note: 'Провели технический созвон', at: daysFromNow(-31) },
      { from: 2, to: 3, note: 'Отправили профили инженеров', at: daysFromNow(-18) },
      { from: 3, to: 4, note: 'Обсуждаем ставки и сроки', at: daysFromNow(-6) },
    ],
  });
  deal({
    title: 'Дизайн-система для продуктовых команд',
    companyId: vector,
    contactId: ekaterina,
    stagePosition: 5,
    amountMinor: 90_000_000,
    serviceType: 'design',
    source: 'website',
    status: 'won',
    expectedCloseDate: addDays(today, -10),
    closedAt: daysFromNow(-12),
    createdAt: daysFromNow(-45),
    updatedAt: daysFromNow(-12),
    history: [
      { from: 1, to: 2, note: 'Уточнили состав компонентов', at: daysFromNow(-35) },
      { from: 2, to: 5, note: 'Клиент согласовал договор', at: daysFromNow(-15) },
    ],
  });
  deal({
    title: 'Аудит инфраструктуры и безопасность',
    companyId: retail,
    contactId: olga,
    stagePosition: 4,
    amountMinor: 120_000_000,
    serviceType: 'consulting',
    source: 'cold_outreach',
    status: 'lost',
    expectedCloseDate: addDays(today, -20),
    closedAt: daysFromNow(-25),
    lostReason: 'Выбрали подрядчика с готовым решением и ниже ценой',
    createdAt: daysFromNow(-60),
    updatedAt: daysFromNow(-25),
    history: [
      { from: 1, to: 4, note: 'Быстро дошли до переговоров', at: daysFromNow(-46) },
    ],
  });
  const dealCloud = deal({
    title: 'Консалтинг по облачной миграции',
    companyId: logplus,
    contactId: anna,
    stagePosition: 5,
    amountMinor: 200_000_000,
    serviceType: 'consulting',
    source: 'partner',
    status: 'won',
    expectedCloseDate: addDays(today, -38),
    closedAt: daysFromNow(-40),
    createdAt: daysFromNow(-75),
    updatedAt: daysFromNow(-40),
    history: [
      { from: 1, to: 3, note: 'Партнёрская сделка', at: daysFromNow(-62) },
      { from: 3, to: 5, note: 'Договор подписан', at: daysFromNow(-41) },
    ],
  });
  deal({
    title: 'Поддержка и доработка 1С',
    companyId: logplus,
    contactId: anna,
    stagePosition: 1,
    amountMinor: 80_000_000,
    serviceType: 'other',
    source: 'partner',
    status: 'open',
    expectedCloseDate: addDays(today, 15),
    createdAt: daysFromNow(-3),
    updatedAt: daysFromNow(-3),
  });

  const insertActivity = db.prepare(
    `INSERT INTO activity
      (workspace_id, type, subject, body, occurred_at, author_id, entity_type, entity_id,
       created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
  );
  const activity = (input: {
    type: string;
    subject: string;
    body?: string;
    ageDays: number;
    entityType: string;
    entityId: number;
  }): number => {
    const occurredAt = daysFromNow(-input.ageDays);
    const result = insertActivity.run(
      input.type,
      input.subject,
      input.body ?? null,
      occurredAt,
      input.entityType,
      input.entityId,
      occurredAt,
      occurredAt,
    );
    const id = Number(result.lastInsertRowid);
    writeAudit(db, { entityType: 'activity', entityId: id, action: 'create' });
    return id;
  };

  activity({
    type: 'call',
    subject: 'Созвон по условиям договора',
    body: 'Обсудили этапы, аванс 40%. Артём согласует с финансовым директором до пятницы.',
    ageDays: 1,
    entityType: 'deal',
    entityId: dealSeverny,
  });
  activity({
    type: 'email',
    subject: 'Отправили обновлённое предложение',
    body: 'Добавили второй этап и опцию поддержки на 6 месяцев.',
    ageDays: 2,
    entityType: 'deal',
    entityId: dealVector,
  });
  activity({
    type: 'meeting',
    subject: 'Демо прототипа',
    body: 'Показали прототип мобильного приложения. Вопросы были по офлайн-режиму.',
    ageDays: 3,
    entityType: 'deal',
    entityId: dealSeverny,
  });
  activity({
    type: 'note',
    subject: 'Юристы на стороне клиента',
    body: 'Договор ушёл на согласование. Ожидаем правки к концу недели.',
    ageDays: 1,
    entityType: 'deal',
    entityId: dealLogplus,
  });
  activity({
    type: 'call',
    subject: 'Квалификация входящего лида',
    body: 'Бюджет подтверждён, ЛПР — Алексей. Нужна встреча с техническим директором.',
    ageDays: 2,
    entityType: 'lead',
    entityId: 1,
  });
  activity({
    type: 'meeting',
    subject: 'Встреча по ML-требованиям',
    body: 'Собрали ограничения по данным. Нужно подготовить план пилота.',
    ageDays: 4,
    entityType: 'deal',
    entityId: dealMedtech,
  });
  activity({
    type: 'email',
    subject: 'Итоги проекта и рекомендации',
    body: 'Отправили клиенту финальный отчёт по дизайн-системе.',
    ageDays: 11,
    entityType: 'deal',
    entityId: dealCloud,
  });
  activity({
    type: 'note',
    subject: 'Причина проигрыша',
    body: 'Клиент выбрал подрядчика с готовым отраслевым решением. Оставить в планах на Q2.',
    ageDays: 25,
    entityType: 'deal',
    entityId: 8,
  });
  activity({
    type: 'call',
    subject: 'Партнёрская передача контакта',
    body: 'Интегратор передал контакт Анны Ким. Подтвердили интерес к DevOps.',
    ageDays: 26,
    entityType: 'deal',
    entityId: dealLogplus,
  });

  const insertTask = db.prepare(
    `INSERT INTO task
      (workspace_id, title, description, due_date, priority, status, completed_at, assignee_id,
       entity_type, entity_id, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
  );
  const task = (input: {
    title: string;
    description?: string;
    dueDate: string;
    priority: string;
    status?: 'open' | 'done';
    entityType: string;
    entityId: number;
    createdAt: string;
  }): number => {
    const status = input.status ?? 'open';
    const result = insertTask.run(
      input.title,
      input.description ?? null,
      input.dueDate,
      input.priority,
      status,
      status === 'done' ? daysFromNow(-1) : null,
      input.entityType,
      input.entityId,
      input.createdAt,
      status === 'done' ? daysFromNow(-1) : input.createdAt,
    );
    const id = Number(result.lastInsertRowid);
    writeAudit(db, { entityType: 'task', entityId: id, action: 'create' });
    return id;
  };

  task({
    title: 'Согласовать финальную смету с Артёмом',
    description: 'Уточнить стоимость поддержки и включить офлайн-режим в MVP.',
    dueDate: today,
    priority: 'high',
    entityType: 'deal',
    entityId: dealSeverny,
    createdAt: daysFromNow(-2),
  });
  task({
    title: 'Позвонить Алексею из «ФинТех Старт»',
    description: 'Назначить технический созвон на следующую неделю.',
    dueDate: addDays(today, -2),
    priority: 'high',
    entityType: 'lead',
    entityId: 1,
    createdAt: daysFromNow(-2),
  });
  task({
    title: 'Проверить правки юристов по договору',
    dueDate: addDays(today, 2),
    priority: 'high',
    entityType: 'deal',
    entityId: dealLogplus,
    createdAt: daysFromNow(-1),
  });
  task({
    title: 'Подготовить план ML-пилота',
    description: 'Описать данные, метрики качества и ограничения по срокам.',
    dueDate: addDays(today, 4),
    priority: 'medium',
    entityType: 'deal',
    entityId: dealMedtech,
    createdAt: daysFromNow(-3),
  });
  task({
    title: 'Отправить кейс по дизайн-системе',
    dueDate: addDays(today, 6),
    priority: 'low',
    entityType: 'company',
    entityId: vector,
    createdAt: daysFromNow(-1),
  });
  task({
    title: 'Уточнить бюджет на выделенную команду',
    dueDate: addDays(today, 8),
    priority: 'medium',
    entityType: 'deal',
    entityId: 6,
    createdAt: daysFromNow(-2),
  });
  task({
    title: 'Записать итоги встречи в карточку лида',
    dueDate: addDays(today, -1),
    priority: 'low',
    status: 'done',
    entityType: 'lead',
    entityId: 3,
    createdAt: daysFromNow(-5),
  });
}

export interface SeedOptions {
  demo?: boolean;
}

export function seedDatabase(db: Db, options: SeedOptions = {}): void {
  withTransaction(db, () => {
    insertWorkspace(db);
    const pipelineId = insertPipeline(db);
    if (options.demo ?? config.seedDemo) {
      seedDemo(db, pipelineId);
    }
  });
}
