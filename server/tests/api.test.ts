import assert from 'node:assert/strict';
import test from 'node:test';
import { api, createCompany, createContact, createDeal, withApp } from './helpers';

function errorCode(body: any): string | undefined {
  return body?.error?.code;
}

test('health и meta отдают служебные данные без авторизации', async () => {
  await withApp(async (ctx) => {
    const health = await api(ctx, 'GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.status, 'ok');
    assert.equal(health.json.db, 'ok');
    assert.match(health.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);

    const meta = await api(ctx, 'GET', '/api/v1/meta');
    assert.equal(meta.status, 200);
    assert.equal(meta.json.workspace.id, 1);
    assert.equal(meta.json.currentUser.id, 1);
    assert.equal(meta.json.pipeline.stages.length, 5);
    assert.ok(meta.json.enums.serviceTypes.includes('ai_ml'));
    assert.ok(meta.json.currencies.includes('RUB'));
    assert.match(meta.json.today, /^\d{4}-\d{2}-\d{2}$/);

    const missing = await api(ctx, 'GET', '/api/v1/nope');
    assert.equal(missing.status, 404);
    assert.equal(errorCode(missing.json), 'NOT_FOUND');
    assert.ok(missing.json.error.requestId);
  });
});

test('компании: нормализация домена, дубли, аудит и мягкое удаление', async () => {
  await withApp(async (ctx) => {
    const created = await api(ctx, 'POST', '/api/v1/companies', {
      body: {
        name: 'Acme',
        domain: 'https://www.Acme.RU/about',
        industry: 'Финтех',
        stack: ['Node.js', ' node.js ', 'React'],
        tags: ['Strategic', 'strategic', 'VIP'],
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.domain, 'acme.ru');
    assert.deepEqual(created.json.stack, ['Node.js', 'React']);
    assert.deepEqual(created.json.tags, ['strategic', 'vip']);
    assert.equal(created.headers.get('location'), `/api/v1/companies/${created.json.id}`);

    const duplicate = await api(ctx, 'POST', '/api/v1/companies', {
      body: { name: 'Acme 2', domain: 'acme.ru' },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(errorCode(duplicate.json), 'DUPLICATE_COMPANY');

    const publicDomain = await api(ctx, 'POST', '/api/v1/companies', {
      body: { name: 'Gmail', domain: 'gmail.com' },
    });
    assert.equal(publicDomain.status, 422);

    const patched = await api(ctx, 'PATCH', `/api/v1/companies/${created.json.id}`, {
      body: { industry: 'SaaS' },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.industry, 'SaaS');

    const audit = await api(
      ctx,
      'GET',
      `/api/v1/audit-events?entityType=company&entityId=${created.json.id}`,
    );
    assert.equal(audit.status, 200);
    assert.equal(audit.json.page.total, 2);
    assert.equal(audit.json.data[0].action, 'update');
    assert.equal(audit.json.data[0].actor.id, 1);
    assert.deepEqual(audit.json.data[0].changes, [
      { field: 'industry', from: 'Финтех', to: 'SaaS' },
    ]);

    const deleted = await api(ctx, 'DELETE', `/api/v1/companies/${created.json.id}`);
    assert.equal(deleted.status, 204);
    assert.equal((await api(ctx, 'GET', `/api/v1/companies/${created.json.id}`)).status, 404);

    const recreated = await api(ctx, 'POST', '/api/v1/companies', {
      body: { name: 'Acme Again', domain: 'acme.ru' },
    });
    assert.equal(recreated.status, 201);
  });
});

test('аудит: изменения полей сопоставляются по API-именам, без ложных очисток', async () => {
  await withApp(async (ctx) => {
    const company = await createCompany(ctx);
    const deal = await createDeal(ctx, company.id, { amountMinor: 10_000_000 });

    const patched = await api(ctx, 'PATCH', `/api/v1/deals/${deal.id}`, {
      body: { version: 1, amountMinor: 12_000_000, expectedCloseDate: '2026-12-31' },
    });
    assert.equal(patched.status, 200);

    const audit = await api(
      ctx,
      'GET',
      `/api/v1/audit-events?entityType=deal&entityId=${deal.id}&pageSize=10`,
    );
    assert.equal(audit.status, 200);
    const update = audit.json.data.find((event: any) => event.action === 'update');
    assert.ok(update);
    assert.deepEqual(update.changes, [
      { field: 'amountMinor', from: 10_000_000, to: 12_000_000 },
      { field: 'expectedCloseDate', from: null, to: '2026-12-31' },
    ]);
  });
});

test('контакты: дубли email, ссылка на компанию и фильтр по компании', async () => {
  await withApp(async (ctx) => {
    const company = await createCompany(ctx);
    const created = await createContact(ctx, company.id, {
      email: ' A.Sokolov@Example.COM ',
    });
    assert.equal(created.email, 'a.sokolov@example.com');

    const duplicate = await api(ctx, 'POST', '/api/v1/contacts', {
      body: { firstName: 'Другой', email: 'a.sokolov@example.com' },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(errorCode(duplicate.json), 'DUPLICATE_CONTACT');

    const allowed = await api(ctx, 'POST', '/api/v1/contacts', {
      body: {
        firstName: 'Другой',
        email: 'a.sokolov@example.com',
        companyId: company.id,
        allowDuplicate: true,
      },
    });
    assert.equal(allowed.status, 201);

    const badCompany = await api(ctx, 'POST', '/api/v1/contacts', {
      body: { firstName: 'Без компании', companyId: 9999 },
    });
    assert.equal(badCompany.status, 422);
    assert.equal(errorCode(badCompany.json), 'INVALID_REFERENCE');

    const filtered = await api(ctx, 'GET', `/api/v1/contacts?companyId=${company.id}`);
    assert.equal(filtered.status, 200);
    assert.equal(filtered.json.page.total, 2);
    assert.equal(filtered.json.data[0].company.id, company.id);
  });
});

test('конвертация лида атомарна, идемпотентна и создаёт связанные записи', async () => {
  await withApp(async (ctx) => {
    const lead = await api(ctx, 'POST', '/api/v1/leads', {
      body: {
        companyName: 'Brand New',
        contactName: 'Иван Петров',
        email: 'cto@brand-new.ru',
        phone: '+7 900 000-00-00',
        source: 'website',
        serviceType: 'web',
        estimatedAmountMinor: 150_000_00,
      },
    });
    assert.equal(lead.status, 201);

    const payload = {
      deal: {
        title: 'Разработка платформы',
        amountMinor: 150_000_00,
        currency: 'RUB',
        serviceType: 'web',
      },
    };
    const first = await api(ctx, 'POST', `/api/v1/leads/${lead.json.id}/convert`, {
      body: payload,
    });
    assert.equal(first.status, 200);
    assert.equal(first.json.alreadyConverted, false);
    assert.deepEqual(first.json.created, { company: true, contact: true, deal: true });
    assert.equal(first.json.company.domain, 'brand-new.ru');
    assert.equal(first.json.contact.fullName, 'Иван Петров');
    assert.equal(first.json.deal.company.id, first.json.company.id);
    assert.equal(first.json.lead.status, 'converted');

    const repeat = await api(ctx, 'POST', `/api/v1/leads/${lead.json.id}/convert`, {
      body: { deal: { ...payload.deal, title: 'Другой заголовок' } },
    });
    assert.equal(repeat.status, 200);
    assert.equal(repeat.json.alreadyConverted, true);
    assert.equal(repeat.json.company.id, first.json.company.id);
    assert.equal(repeat.json.contact.id, first.json.contact.id);
    assert.equal(repeat.json.deal.id, first.json.deal.id);

    const companies = await api(ctx, 'GET', '/api/v1/companies?q=Brand');
    assert.equal(companies.json.page.total, 1);

    const edit = await api(ctx, 'PATCH', `/api/v1/leads/${lead.json.id}`, {
      body: { companyName: 'Другое имя' },
    });
    assert.equal(edit.status, 422);
    assert.equal(errorCode(edit.json), 'LEAD_CONVERTED');

    const notes = await api(ctx, 'PATCH', `/api/v1/leads/${lead.json.id}`, {
      body: { notes: 'Клиент доволен' },
    });
    assert.equal(notes.status, 200);
    assert.equal(notes.json.notes, 'Клиент доволен');

    const secondLead = await api(ctx, 'POST', '/api/v1/leads', {
      body: {
        companyName: 'Bad Ref',
        contactName: 'Тест',
        source: 'referral',
      },
    });
    const status = await api(ctx, 'PATCH', `/api/v1/leads/${secondLead.json.id}`, {
      body: { status: 'converted' },
    });
    assert.equal(status.status, 422);
    assert.equal(errorCode(status.json), 'USE_CONVERT_ENDPOINT');

    const badRef = await api(ctx, 'POST', `/api/v1/leads/${secondLead.json.id}/convert`, {
      body: { companyId: 99999, deal: payload.deal },
    });
    assert.equal(badRef.status, 422);
    assert.equal(errorCode(badRef.json), 'INVALID_REFERENCE');
  });
});

test('сделки: версия, lostReason, закрытие, повторное открытие и история стадий', async () => {
  await withApp(async (ctx) => {
    const company = await createCompany(ctx);
    const contact = await createContact(ctx, company.id);

    const deal = await createDeal(ctx, company.id, { primaryContactId: contact.id });
    assert.equal(deal.version, 1);
    assert.equal(deal.stage.position, 1);

    const stale = await api(ctx, 'PATCH', `/api/v1/deals/${deal.id}`, {
      body: { version: 99, title: 'Чужая правка' },
    });
    assert.equal(stale.status, 409);
    assert.equal(errorCode(stale.json), 'VERSION_CONFLICT');
    assert.equal(stale.json.error.details.currentVersion, 1);

    const won = await api(ctx, 'PATCH', `/api/v1/deals/${deal.id}`, {
      body: { version: 1, status: 'won' },
    });
    assert.equal(won.status, 200);
    assert.equal(won.json.status, 'won');
    assert.ok(won.json.closedAt);
    assert.equal(won.json.version, 2);

    const lostNoReason = await api(ctx, 'PATCH', `/api/v1/deals/${deal.id}`, {
      body: { version: 2, status: 'lost' },
    });
    assert.equal(lostNoReason.status, 422);
    assert.equal(errorCode(lostNoReason.json), 'LOST_REASON_REQUIRED');

    const lost = await api(ctx, 'PATCH', `/api/v1/deals/${deal.id}`, {
      body: { version: 2, status: 'lost', lostReason: 'Выбрали другого подрядчика' },
    });
    assert.equal(lost.status, 200);
    assert.equal(lost.json.lostReason, 'Выбрали другого подрядчика');

    const open = await api(ctx, 'PATCH', `/api/v1/deals/${deal.id}`, {
      body: { version: 3, status: 'open', lostReason: null },
    });
    assert.equal(open.status, 200);
    assert.equal(open.json.status, 'open');
    assert.equal(open.json.lostReason, null);
    assert.equal(open.json.closedAt, null);

    const lostAgain = await api(ctx, 'PATCH', `/api/v1/deals/${deal.id}`, {
      body: { version: 4, status: 'lost', lostReason: 'Отмена бюджета' },
    });
    assert.equal(lostAgain.status, 200);

    const wonAgain = await api(ctx, 'PATCH', `/api/v1/deals/${deal.id}`, {
      body: { version: 5, status: 'won' },
    });
    assert.equal(wonAgain.status, 200);
    assert.equal(wonAgain.json.lostReason, null);
    assert.ok(wonAgain.json.closedAt);

    const notAllowed = await api(ctx, 'PATCH', `/api/v1/deals/${deal.id}`, {
      body: { version: 6, status: 'won', lostReason: 'Нельзя' },
    });
    assert.equal(notAllowed.status, 422);
    assert.equal(errorCode(notAllowed.json), 'LOST_REASON_NOT_ALLOWED');

    const stageDeal = await createDeal(ctx, company.id, { title: 'Смена стадии' });
    const moved = await api(ctx, 'POST', `/api/v1/deals/${stageDeal.id}/stage`, {
      body: { stageId: 2, version: 1, note: 'Квалифицировали' },
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.json.changed, true);
    assert.equal(moved.json.deal.stage.id, 2);
    assert.equal(moved.json.deal.version, 2);

    const same = await api(ctx, 'POST', `/api/v1/deals/${stageDeal.id}/stage`, {
      body: { stageId: 2, version: 2 },
    });
    assert.equal(same.status, 200);
    assert.equal(same.json.changed, false);
    assert.equal(same.json.deal.version, 2);

    const closed = await api(ctx, 'PATCH', `/api/v1/deals/${stageDeal.id}`, {
      body: { version: 2, status: 'won' },
    });
    assert.equal(closed.status, 200);

    const closedMove = await api(ctx, 'POST', `/api/v1/deals/${stageDeal.id}/stage`, {
      body: { stageId: 3, version: 3 },
    });
    assert.equal(closedMove.status, 422);
    assert.equal(errorCode(closedMove.json), 'DEAL_CLOSED');

    const reopened = await api(ctx, 'PATCH', `/api/v1/deals/${stageDeal.id}`, {
      body: { version: 3, status: 'open' },
    });
    assert.equal(reopened.status, 200);
    const movedAgain = await api(ctx, 'POST', `/api/v1/deals/${stageDeal.id}/stage`, {
      body: { stageId: 3, version: 4 },
    });
    assert.equal(movedAgain.status, 200);

    const history = await api(
      ctx,
      'GET',
      `/api/v1/deals/${stageDeal.id}/stage-history?page=1&pageSize=10`,
    );
    assert.equal(history.status, 200);
    assert.equal(history.json.page.total, 3);
    assert.equal(history.json.data[0].toStage.id, 3);
    assert.equal(history.json.data[0].changedBy.id, 1);
  });
});

test('сделки: контакт другой компании, запрет удаления компании с открытой сделкой', async () => {
  await withApp(async (ctx) => {
    const companyA = await createCompany(ctx, { name: 'A', domain: 'a.ru' });
    const companyB = await createCompany(ctx, { name: 'B', domain: 'b.ru' });
    const contactA = await createContact(ctx, companyA.id, { email: 'a@a.ru' });
    const contactB = await createContact(ctx, companyB.id, { email: 'b@b.ru' });

    const mismatch = await api(ctx, 'POST', '/api/v1/deals', {
      body: {
        title: 'Плохая сделка',
        amountMinor: 100,
        currency: 'RUB',
        serviceType: 'web',
        companyId: companyA.id,
        primaryContactId: contactB.id,
      },
    });
    assert.equal(mismatch.status, 422);
    assert.equal(errorCode(mismatch.json), 'CONTACT_COMPANY_MISMATCH');

    const deal = await createDeal(ctx, companyA.id, { primaryContactId: contactA.id });
    const blocked = await api(ctx, 'DELETE', `/api/v1/companies/${companyA.id}`);
    assert.equal(blocked.status, 409);
    assert.equal(errorCode(blocked.json), 'COMPANY_HAS_OPEN_DEALS');

    const changedCompany = await api(ctx, 'PATCH', `/api/v1/deals/${deal.id}`, {
      body: { version: 1, companyId: companyB.id },
    });
    assert.equal(changedCompany.status, 422);
    assert.equal(errorCode(changedCompany.json), 'CONTACT_COMPANY_MISMATCH');

    const changedWithNull = await api(ctx, 'PATCH', `/api/v1/deals/${deal.id}`, {
      body: { version: 1, companyId: companyB.id, primaryContactId: null },
    });
    assert.equal(changedWithNull.status, 200);
    assert.equal(changedWithNull.json.company.id, companyB.id);
    assert.equal(changedWithNull.json.primaryContact, null);

    const closed = await api(ctx, 'PATCH', `/api/v1/deals/${deal.id}`, {
      body: { version: 2, status: 'won' },
    });
    assert.equal(closed.status, 200);
    const deleted = await api(ctx, 'DELETE', `/api/v1/companies/${companyB.id}`);
    assert.equal(deleted.status, 204);
    const after = await api(ctx, 'GET', `/api/v1/deals/${deal.id}`);
    assert.equal(after.status, 200);
    assert.equal(after.json.company, null);
  });
});

test('активности и задачи: ссылки, overdue, completedAt и каскадное удаление', async () => {
  await withApp(async (ctx) => {
    const company = await createCompany(ctx);
    const activity = await api(ctx, 'POST', '/api/v1/activities', {
      body: {
        type: 'call',
        subject: 'Позвонить',
        relatedTo: { type: 'company', id: company.id },
      },
    });
    assert.equal(activity.status, 201);
    assert.equal(activity.json.author.id, 1);
    assert.equal(activity.json.relatedLabel, 'Acme');

    const task = await api(ctx, 'POST', '/api/v1/tasks', {
      body: {
        title: 'Проверить',
        dueDate: '2000-01-01',
        priority: 'high',
        relatedTo: { type: 'company', id: company.id },
      },
    });
    assert.equal(task.status, 201);
    assert.equal(task.json.isOverdue, true);
    assert.equal(task.json.assignee.id, 1);

    const done = await api(ctx, 'PATCH', `/api/v1/tasks/${task.json.id}`, {
      body: { status: 'done' },
    });
    assert.equal(done.status, 200);
    assert.ok(done.json.completedAt);
    assert.equal(done.json.isOverdue, false);

    const reopened = await api(ctx, 'PATCH', `/api/v1/tasks/${task.json.id}`, {
      body: { status: 'open' },
    });
    assert.equal(reopened.json.completedAt, null);
    assert.equal(reopened.json.isOverdue, true);

    const badRelated = await api(ctx, 'POST', '/api/v1/activities', {
      body: {
        type: 'note',
        subject: 'Нет цели',
        relatedTo: { type: 'deal', id: 9999 },
      },
    });
    assert.equal(badRelated.status, 404);

    const deleted = await api(ctx, 'DELETE', `/api/v1/companies/${company.id}`);
    assert.equal(deleted.status, 204);
    assert.equal(
      (await api(ctx, 'GET', `/api/v1/activities/${activity.json.id}`)).status,
      404,
    );
    assert.equal((await api(ctx, 'GET', `/api/v1/tasks/${task.json.id}`)).status, 404);
  });
});

test('дашборд: пайплайн, won/lost за период, winRate и фильтр валюты', async () => {
  await withApp(async (ctx) => {
    const company = await createCompany(ctx);
    const contact = await createContact(ctx, company.id);

    const openDeal = await createDeal(ctx, company.id, {
      title: 'Открытая',
      amountMinor: 100_000,
      primaryContactId: contact.id,
    });
    const wonDeal = await createDeal(ctx, company.id, { title: 'Выигранная', amountMinor: 50_000 });
    const lostDeal = await createDeal(ctx, company.id, { title: 'Проигранная', amountMinor: 25_000 });

    await api(ctx, 'PATCH', `/api/v1/deals/${wonDeal.id}`, {
      body: { version: 1, status: 'won' },
    });
    await api(ctx, 'PATCH', `/api/v1/deals/${lostDeal.id}`, {
      body: { version: 1, status: 'lost', lostReason: 'Дорого' },
    });

    const meta = await api(ctx, 'GET', '/api/v1/meta');
    const today = meta.json.today;

    const dashboard = await api(
      ctx,
      'GET',
      `/api/v1/dashboard?from=${today}&to=${today}&currency=RUB`,
    );
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.json.pipeline.dealCount, 1);
    assert.equal(dashboard.json.pipeline.amountMinor, 100_000);
    assert.equal(dashboard.json.pipeline.stages.length, 5);
    assert.equal(dashboard.json.won.dealCount, 1);
    assert.equal(dashboard.json.won.amountMinor, 50_000);
    assert.equal(dashboard.json.won.averageAmountMinor, 50_000);
    assert.equal(dashboard.json.lost.dealCount, 1);
    assert.equal(dashboard.json.lost.amountMinor, 25_000);
    assert.equal(dashboard.json.winRate, 0.5);
    assert.ok(dashboard.json.availableCurrencies.includes('RUB'));
    assert.equal(dashboard.json.trend.at(-1).wonMinor, 50_000);
    assert.equal(dashboard.json.pipeline.stages[0].dealCount, 1);

    const usd = await api(
      ctx,
      'GET',
      `/api/v1/dashboard?from=${today}&to=${today}&currency=USD`,
    );
    assert.equal(usd.status, 200);
    assert.equal(usd.json.pipeline.dealCount, 0);
    assert.equal(usd.json.won.dealCount, 0);
    assert.equal(usd.json.winRate, null);

    assert.equal(openDeal.status, 'open');
  });
});

test('поиск, CSV с BOM и защита от формул', async () => {
  await withApp(async (ctx) => {
    const company = await createCompany(ctx, {
      name: '=Опасная Компания',
      domain: 'evil.example',
      industry: 'Тест',
    });
    await createDeal(ctx, company.id, { title: '=Сделка', amountMinor: 123_45 });

    const search = await api(
      ctx,
      'GET',
      `/api/v1/search?q=${encodeURIComponent('Опасная')}&limit=5`,
    );
    assert.equal(search.status, 200);
    assert.equal(search.json.companies.total, 1);
    assert.equal(search.json.companies.items[0].id, company.id);
    assert.equal(search.json.deals.total, 1);
    assert.equal(search.json.deals.items[0].company.id, company.id);

    const csv = await api(ctx, 'GET', '/api/v1/export/companies.csv');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type') ?? '', /^text\/csv/);
    assert.match(csv.headers.get('content-disposition') ?? '', /companies-\d{4}-\d{2}-\d{2}\.csv/);
    assert.equal(csv.headers.get('x-export-truncated'), null);
    const raw = new Uint8Array(
      await (await fetch(`${ctx.base}/api/v1/export/companies.csv`)).arrayBuffer(),
    );
    assert.deepEqual(Array.from(raw.slice(0, 3)), [0xef, 0xbb, 0xbf]);
    assert.ok(csv.text.startsWith('id,name,domain'));
    assert.ok(csv.text.includes("'=Опасная Компания"));

    const dealsCsv = await api(ctx, 'GET', '/api/v1/export/deals.csv');
    assert.ok(dealsCsv.text.includes("'=Сделка"));
    assert.ok(dealsCsv.text.includes('123.45'));

    const empty = await api(ctx, 'GET', '/api/v1/export/tasks.csv');
    assert.equal(empty.status, 200);
    assert.ok(empty.text.startsWith('id,title'));

    const short = await api(ctx, 'GET', '/api/v1/search?q=a');
    assert.equal(short.status, 400);
  });
});

test('ошибки: 415, 400, 405, неизвестные поля и границы пагинации', async () => {
  await withApp(async (ctx) => {
    const wrongType = await api(ctx, 'POST', '/api/v1/companies', {
      rawBody: '{}',
      headers: { 'Content-Type': 'text/plain' },
    });
    assert.equal(wrongType.status, 415);
    assert.equal(errorCode(wrongType.json), 'UNSUPPORTED_MEDIA_TYPE');

    const malformed = await api(ctx, 'POST', '/api/v1/companies', {
      rawBody: '{bad',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(malformed.status, 400);
    assert.equal(errorCode(malformed.json), 'MALFORMED_JSON');

    const injected = await api(ctx, 'POST', '/api/v1/companies', {
      body: { name: 'X', workspaceId: 2 },
    });
    assert.equal(injected.status, 400);
    assert.equal(errorCode(injected.json), 'VALIDATION_ERROR');

    const unknownQuery = await api(ctx, 'GET', '/api/v1/companies?limit=10');
    assert.equal(unknownQuery.status, 400);
    assert.equal(errorCode(unknownQuery.json), 'VALIDATION_ERROR');

    const badPage = await api(ctx, 'GET', '/api/v1/companies?page=0&pageSize=101');
    assert.equal(badPage.status, 400);

    const method = await api(ctx, 'PUT', '/api/v1/companies');
    assert.equal(method.status, 405);
    assert.equal(errorCode(method.json), 'METHOD_NOT_ALLOWED');

    const range = await api(
      ctx,
      'GET',
      '/api/v1/deals?expectedCloseFrom=2026-02-02&expectedCloseTo=2026-01-01',
    );
    assert.equal(range.status, 400);

    const missing = await api(ctx, 'GET', '/api/v1/companies/99999');
    assert.equal(missing.status, 404);
    assert.equal(errorCode(missing.json), 'NOT_FOUND');

    const notFound = await api(ctx, 'POST', '/api/v1/companies', {
      body: { name: 'X', domain: 'not a domain' },
    });
    assert.equal(notFound.status, 422);
    assert.equal(errorCode(notFound.json), 'VALIDATION_ERROR');
  });
});
