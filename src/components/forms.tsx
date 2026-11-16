import { useId, useState, type FormEvent, type ReactNode } from 'react';
import type {
  Activity,
  ActivityInput,
  ActivityType,
  Company,
  CompanyInput,
  CompanyRef,
  Contact,
  ContactInput,
  ContactRef,
  ConvertLeadInput,
  Deal,
  DealInput,
  Lead,
  LeadInput,
  Task,
  TaskInput,
  TaskPriority,
} from '@shared/types';
import { useCompanyContacts } from '@/api/queries';
import {
  activityTypeLabels,
  companySizeLabels,
  leadSourceLabels,
  leadStatusLabels,
  serviceTypeLabels,
} from '@/i18n';
import { toMajorInput, toMinor } from '@/lib/format';
import { useAppMeta } from '@/lib/meta';
import { CompanyCombobox, EntityCombobox, type CompanySelection, type EntitySelection } from './combobox';
import { Button, Field, FormError, Input, Select, Textarea } from './ui';

function parseList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function FormActions({
  onCancel,
  submitting,
  submitLabel,
}: {
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <div className="form-actions">
      <Button variant="secondary" onClick={onCancel} disabled={submitting}>
        Отмена
      </Button>
      <Button type="submit" variant="primary" loading={submitting}>
        {submitLabel}
      </Button>
    </div>
  );
}

interface BaseFormProps {
  submitting: boolean;
  error: unknown;
  onCancel: () => void;
}

export function CompanyForm({
  initial,
  onSubmit,
  submitting,
  error,
  onCancel,
}: BaseFormProps & {
  initial?: Company | null;
  onSubmit: (input: CompanyInput) => Promise<void>;
}) {
  const meta = useAppMeta();
  const formId = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [domain, setDomain] = useState(initial?.domain ?? '');
  const [industry, setIndustry] = useState(initial?.industry ?? '');
  const [size, setSize] = useState(initial?.size ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [telegram, setTelegram] = useState(initial?.telegram ?? '');
  const [stack, setStack] = useState(initial?.stack.join(', ') ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [clientError, setClientError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setClientError('Укажите название компании.');
      return;
    }
    setClientError(null);
    await onSubmit({
      name: name.trim(),
      domain: blankToNull(domain),
      industry: blankToNull(industry),
      size: size ? (size as CompanyInput['size']) : null,
      location: blankToNull(location),
      telegram: blankToNull(telegram),
      stack: parseList(stack),
      tags: parseList(tags),
      notes: blankToNull(notes),
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="stack-sm">
        {clientError ? (
          <div className="form-error" role="alert">
            {clientError}
          </div>
        ) : null}
        <FormError error={error} />
        <div className="form-grid">
          <Field label="Название" htmlFor={`${formId}-name`} required className="span-2">
            <Input
              id={`${formId}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="ООО «Ромашка»"
              maxLength={200}
              data-autofocus
            />
          </Field>
          <Field label="Домен" htmlFor={`${formId}-domain`} hint="Нормализуется: без https, www и пути.">
            <Input
              id={`${formId}-domain`}
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="example.ru"
              maxLength={253}
            />
          </Field>
          <Field label="Отрасль" htmlFor={`${formId}-industry`}>
            <Input
              id={`${formId}-industry`}
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              placeholder="Финтех"
              maxLength={100}
            />
          </Field>
          <Field label="Размер" htmlFor={`${formId}-size`}>
            <Select id={`${formId}-size`} value={size} onChange={(event) => setSize(event.target.value)}>
              <option value="">Не указан</option>
              {meta.enums.companySizes.map((option) => (
                <option key={option} value={option}>
                  {companySizeLabels[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Город" htmlFor={`${formId}-location`}>
            <Input
              id={`${formId}-location`}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Москва"
              maxLength={120}
            />
          </Field>
          <Field label="Telegram" htmlFor={`${formId}-telegram`}>
            <Input
              id={`${formId}-telegram`}
              value={telegram}
              onChange={(event) => setTelegram(event.target.value)}
              placeholder="@username"
              maxLength={120}
            />
          </Field>
          <Field label="Стек" htmlFor={`${formId}-stack`} hint="Через запятую, до 20 значений.">
            <Input
              id={`${formId}-stack`}
              value={stack}
              onChange={(event) => setStack(event.target.value)}
              placeholder="React, Node.js, PostgreSQL"
            />
          </Field>
          <Field label="Теги" htmlFor={`${formId}-tags`} hint="Через запятую." className="span-2">
            <Input
              id={`${formId}-tags`}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="стратегический, inbound"
            />
          </Field>
          <Field label="Заметки" htmlFor={`${formId}-notes`} className="span-2">
            <Textarea
              id={`${formId}-notes`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Контекст по компании, особенности закупки, договорённости…"
            />
          </Field>
        </div>
        <FormActions
          onCancel={onCancel}
          submitting={submitting}
          submitLabel={initial ? 'Сохранить' : 'Создать компанию'}
        />
      </div>
    </form>
  );
}

export function ContactForm({
  initial,
  defaultCompany,
  onSubmit,
  submitting,
  error,
  onCancel,
}: BaseFormProps & {
  initial?: Contact | null;
  defaultCompany?: CompanyRef | null;
  onSubmit: (input: ContactInput) => Promise<void>;
}) {
  const formId = useId();
  const initialCompany = initial?.company ?? defaultCompany ?? null;
  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [telegram, setTelegram] = useState(initial?.telegram ?? '');
  const [linkedin, setLinkedin] = useState(initial?.linkedin ?? '');
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? '');
  const [company, setCompany] = useState<CompanySelection | null>(initialCompany);
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!firstName.trim()) {
      setClientError('Укажите имя контакта.');
      return;
    }
    setClientError(null);
    await onSubmit({
      firstName: firstName.trim(),
      lastName: blankToNull(lastName),
      email: blankToNull(email),
      phone: blankToNull(phone),
      telegram: blankToNull(telegram),
      linkedin: blankToNull(linkedin),
      jobTitle: blankToNull(jobTitle),
      companyId: company?.id ?? null,
      tags: parseList(tags),
      notes: blankToNull(notes),
      allowDuplicate,
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="stack-sm">
        {clientError ? (
          <div className="form-error" role="alert">
            {clientError}
          </div>
        ) : null}
        <FormError error={error} />
        <div className="form-grid">
          <Field label="Имя" htmlFor={`${formId}-firstName`} required>
            <Input
              id={`${formId}-firstName`}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              placeholder="Анна"
              maxLength={100}
              data-autofocus
            />
          </Field>
          <Field label="Фамилия" htmlFor={`${formId}-lastName`}>
            <Input
              id={`${formId}-lastName`}
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder="Смирнова"
              maxLength={100}
            />
          </Field>
          <Field label="Email" htmlFor={`${formId}-email`} hint="Проверяется на дубликаты.">
            <Input
              id={`${formId}-email`}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="a.smirnova@example.ru"
              maxLength={254}
            />
          </Field>
          <Field label="Телефон" htmlFor={`${formId}-phone`}>
            <Input
              id={`${formId}-phone`}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+7 999 000-00-00"
              maxLength={32}
            />
          </Field>
          <Field label="Компания" htmlFor={`${formId}-company`}>
            <CompanyCombobox id={`${formId}-company`} value={company} onChange={setCompany} />
          </Field>
          <Field label="Должность" htmlFor={`${formId}-jobTitle`}>
            <Input
              id={`${formId}-jobTitle`}
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              placeholder="CTO"
              maxLength={120}
            />
          </Field>
          <Field label="Telegram" htmlFor={`${formId}-telegram`}>
            <Input
              id={`${formId}-telegram`}
              value={telegram}
              onChange={(event) => setTelegram(event.target.value)}
              placeholder="@username"
              maxLength={120}
            />
          </Field>
          <Field label="LinkedIn" htmlFor={`${formId}-linkedin`}>
            <Input
              id={`${formId}-linkedin`}
              value={linkedin}
              onChange={(event) => setLinkedin(event.target.value)}
              placeholder="https://linkedin.com/in/…"
              maxLength={200}
            />
          </Field>
          <Field label="Теги" htmlFor={`${formId}-tags`} className="span-2" hint="Через запятую.">
            <Input
              id={`${formId}-tags`}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="decision-maker, product"
            />
          </Field>
          <Field label="Заметки" htmlFor={`${formId}-notes`} className="span-2">
            <Textarea
              id={`${formId}-notes`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Что важно знать перед звонком…"
            />
          </Field>
          <label className="checkbox-row span-2">
            <input
              type="checkbox"
              checked={allowDuplicate}
              onChange={(event) => setAllowDuplicate(event.target.checked)}
            />
            <span>Разрешить дубликат email, если такой контакт уже существует</span>
          </label>
        </div>
        <FormActions
          onCancel={onCancel}
          submitting={submitting}
          submitLabel={initial ? 'Сохранить' : 'Создать контакт'}
        />
      </div>
    </form>
  );
}

export function LeadForm({
  initial,
  onSubmit,
  submitting,
  error,
  onCancel,
}: BaseFormProps & {
  initial?: Lead | null;
  onSubmit: (input: LeadInput) => Promise<void>;
}) {
  const meta = useAppMeta();
  const formId = useId();
  const [companyName, setCompanyName] = useState(initial?.companyName ?? '');
  const [contactName, setContactName] = useState(initial?.contactName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [source, setSource] = useState(initial?.source ?? 'website');
  const [serviceType, setServiceType] = useState(initial?.serviceType ?? '');
  const [status, setStatus] = useState(initial?.status === 'converted' ? 'qualified' : (initial?.status ?? 'new'));
  const [amount, setAmount] = useState(
    initial?.estimatedAmountMinor != null ? toMajorInput(initial.estimatedAmountMinor) : '',
  );
  const [currency, setCurrency] = useState(initial?.currency ?? meta.workspace.baseCurrency);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!companyName.trim() || !contactName.trim()) {
      setClientError('Заполните компанию и контактное лицо.');
      return;
    }
    setClientError(null);
    await onSubmit({
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      email: blankToNull(email),
      phone: blankToNull(phone),
      source: source as LeadInput['source'],
      serviceType: serviceType ? (serviceType as LeadInput['serviceType']) : null,
      status: status as LeadInput['status'],
      estimatedAmountMinor: amount.trim() ? toMinor(amount) : null,
      currency: currency as LeadInput['currency'],
      notes: blankToNull(notes),
      allowDuplicate,
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="stack-sm">
        {clientError ? (
          <div className="form-error" role="alert">
            {clientError}
          </div>
        ) : null}
        <FormError error={error} />
        <div className="form-grid">
          <Field label="Компания" htmlFor={`${formId}-company`} required>
            <Input
              id={`${formId}-company`}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Название компании"
              maxLength={200}
              data-autofocus
            />
          </Field>
          <Field label="Контактное лицо" htmlFor={`${formId}-contact`} required>
            <Input
              id={`${formId}-contact`}
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="Имя и фамилия"
              maxLength={160}
            />
          </Field>
          <Field label="Email" htmlFor={`${formId}-email`} hint="По домену определим компанию при конвертации.">
            <Input
              id={`${formId}-email`}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="lead@company.ru"
              maxLength={254}
            />
          </Field>
          <Field label="Телефон" htmlFor={`${formId}-phone`}>
            <Input
              id={`${formId}-phone`}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+7 999 000-00-00"
              maxLength={32}
            />
          </Field>
          <Field label="Источник" htmlFor={`${formId}-source`} required>
            <Select
              id={`${formId}-source`}
              value={source}
              onChange={(event) => setSource(event.target.value as LeadInput['source'])}
            >
              {meta.enums.leadSources.map((option) => (
                <option key={option} value={option}>
                  {leadSourceLabels[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Услуга" htmlFor={`${formId}-service`}>
            <Select id={`${formId}-service`} value={serviceType} onChange={(event) => setServiceType(event.target.value)}>
              <option value="">Не указана</option>
              {meta.enums.serviceTypes.map((option) => (
                <option key={option} value={option}>
                  {serviceTypeLabels[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Статус" htmlFor={`${formId}-status`}>
            <Select
              id={`${formId}-status`}
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              {meta.enums.leadStatuses
                .filter((option) => option !== 'converted')
                .map((option) => (
                  <option key={option} value={option}>
                    {leadStatusLabels[option]}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Оценка бюджета" htmlFor={`${formId}-amount`} hint="В основных единицах валюты.">
            <div className="row" style={{ gap: 8 }}>
              <Input
                id={`${formId}-amount`}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="180 000"
              />
              <Select
                aria-label="Валюта"
                style={{ width: 94 }}
                value={currency}
                onChange={(event) => setCurrency(event.target.value as typeof currency)}
              >
                {meta.currencies.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Заметки" htmlFor={`${formId}-notes`} className="span-2">
            <Textarea
              id={`${formId}-notes`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Откуда пришёл лид, что уже обсудили, следующий шаг…"
            />
          </Field>
          <label className="checkbox-row span-2">
            <input
              type="checkbox"
              checked={allowDuplicate}
              onChange={(event) => setAllowDuplicate(event.target.checked)}
            />
            <span>Разрешить дубликат email, если такой лид уже существует</span>
          </label>
        </div>
        <FormActions
          onCancel={onCancel}
          submitting={submitting}
          submitLabel={initial ? 'Сохранить' : 'Создать лид'}
        />
      </div>
    </form>
  );
}

export interface DealFormValues extends DealInput {
  stageId?: number;
}

export function DealForm({
  initial,
  defaultCompany,
  defaultContact,
  onSubmit,
  submitting,
  error,
  onCancel,
}: BaseFormProps & {
  initial?: Deal | null;
  defaultCompany?: CompanyRef | null;
  defaultContact?: ContactRef | null;
  onSubmit: (input: DealFormValues) => Promise<void>;
}) {
  const meta = useAppMeta();
  const formId = useId();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [amount, setAmount] = useState(
    initial ? toMajorInput(initial.amountMinor) : '',
  );
  const [currency, setCurrency] = useState(initial?.currency ?? meta.workspace.baseCurrency);
  const [serviceType, setServiceType] = useState(initial?.serviceType ?? 'web');
  const [source, setSource] = useState(initial?.source ?? '');
  const [company, setCompany] = useState<CompanySelection | null>(
    initial?.company ?? defaultCompany ?? null,
  );
  const [contactId, setContactId] = useState(
    initial?.primaryContact?.id?.toString() ?? defaultContact?.id?.toString() ?? '',
  );
  const [expectedCloseDate, setExpectedCloseDate] = useState(initial?.expectedCloseDate ?? '');
  const [stageId, setStageId] = useState(
    String(meta.pipeline.stages[0]?.id ?? ''),
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const contacts = useCompanyContacts(company?.id ?? null);

  const selectCompany = (next: CompanySelection | null) => {
    setCompany(next);
    setContactId('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setClientError('Укажите название сделки.');
      return;
    }
    if (!company) {
      setClientError('Выберите компанию.');
      return;
    }
    if (amount.trim() && toMinor(amount) < 0) {
      setClientError('Сумма не может быть отрицательной.');
      return;
    }
    setClientError(null);
    await onSubmit({
      title: title.trim(),
      amountMinor: amount.trim() ? toMinor(amount) : 0,
      currency: currency as DealInput['currency'],
      serviceType: serviceType as DealInput['serviceType'],
      source: source ? (source as DealInput['source']) : null,
      companyId: company.id,
      primaryContactId: contactId ? Number(contactId) : null,
      expectedCloseDate: expectedCloseDate || null,
      ...(initial ? {} : { stageId: stageId ? Number(stageId) : undefined }),
    });
  };

  const contactOptions = contacts.data?.data ?? [];

  return (
    <form onSubmit={submit} noValidate>
      <div className="stack-sm">
        {clientError ? (
          <div className="form-error" role="alert">
            {clientError}
          </div>
        ) : null}
        <FormError error={error} />
        <div className="form-grid">
          <Field label="Название" htmlFor={`${formId}-title`} required className="span-2">
            <Input
              id={`${formId}-title`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Платформа онлайн-обучения — 2-я очередь"
              maxLength={200}
              data-autofocus
            />
          </Field>
          <Field label="Компания" htmlFor={`${formId}-company`} required>
            <CompanyCombobox
              id={`${formId}-company`}
              value={company}
              onChange={selectCompany}
              placeholder="Найдите компанию"
            />
          </Field>
          <Field
            label="Основной контакт"
            htmlFor={`${formId}-contact`}
            hint={!company ? 'Сначала выберите компанию.' : undefined}
          >
            <Select
              id={`${formId}-contact`}
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
              disabled={!company || contacts.isPending}
            >
              <option value="">Без контакта</option>
              {contactOptions.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.fullName}
                  {contact.jobTitle ? ` — ${contact.jobTitle}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Сумма" htmlFor={`${formId}-amount`} hint="В основных единицах валюты.">
            <div className="row" style={{ gap: 8 }}>
              <Input
                id={`${formId}-amount`}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="240 000"
              />
              <Select
                aria-label="Валюта"
                style={{ width: 94 }}
                value={currency}
                onChange={(event) => setCurrency(event.target.value as DealInput['currency'])}
              >
                {meta.currencies.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Услуга" htmlFor={`${formId}-service`} required>
            <Select
              id={`${formId}-service`}
              value={serviceType}
              onChange={(event) => setServiceType(event.target.value as typeof serviceType)}
            >
              {meta.enums.serviceTypes.map((option) => (
                <option key={option} value={option}>
                  {serviceTypeLabels[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Источник" htmlFor={`${formId}-source`}>
            <Select id={`${formId}-source`} value={source ?? ''} onChange={(event) => setSource(event.target.value)}>
              <option value="">Не указан</option>
              {meta.enums.leadSources.map((option) => (
                <option key={option} value={option}>
                  {leadSourceLabels[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ожидаемое закрытие" htmlFor={`${formId}-date`}>
            <Input
              id={`${formId}-date`}
              type="date"
              value={expectedCloseDate ?? ''}
              onChange={(event) => setExpectedCloseDate(event.target.value)}
            />
          </Field>
          {initial ? null : (
            <Field label="Стадия" htmlFor={`${formId}-stage`}>
              <Select id={`${formId}-stage`} value={stageId} onChange={(event) => setStageId(event.target.value)}>
                {meta.pipeline.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <FormActions
          onCancel={onCancel}
          submitting={submitting}
          submitLabel={initial ? 'Сохранить' : 'Создать сделку'}
        />
      </div>
    </form>
  );
}

export function ConvertLeadForm({
  lead,
  onSubmit,
  submitting,
  error,
  onCancel,
}: BaseFormProps & {
  lead: Lead;
  onSubmit: (input: ConvertLeadInput) => Promise<void>;
}) {
  const meta = useAppMeta();
  const formId = useId();
  const [companyName, setCompanyName] = useState(lead.companyName);
  const [dealTitle, setDealTitle] = useState(`Проект для ${lead.companyName}`);
  const [amount, setAmount] = useState(
    lead.estimatedAmountMinor != null ? toMajorInput(lead.estimatedAmountMinor) : '',
  );
  const [currency, setCurrency] = useState(lead.currency);
  const [serviceType, setServiceType] = useState(lead.serviceType ?? 'web');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [stageId, setStageId] = useState(String(meta.pipeline.stages[0]?.id ?? ''));
  const [clientError, setClientError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!dealTitle.trim()) {
      setClientError('Укажите название сделки.');
      return;
    }
    setClientError(null);
    await onSubmit({
      companyName: blankToNull(companyName) ?? undefined,
      deal: {
        title: dealTitle.trim(),
        amountMinor: amount.trim() ? toMinor(amount) : 0,
        currency: currency as ConvertLeadInput['deal']['currency'],
        serviceType: serviceType as ConvertLeadInput['deal']['serviceType'],
        source: lead.source,
        stageId: stageId ? Number(stageId) : undefined,
        expectedCloseDate: expectedCloseDate || null,
      },
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="stack-sm">
        <div className="form-note">
          Компания и контакт будут найдены по email или домену. Если их нет — создадим автоматически и
          свяжем со сделкой. Повторная конвертация не создаст дублей.
        </div>
        {clientError ? (
          <div className="form-error" role="alert">
            {clientError}
          </div>
        ) : null}
        <FormError error={error} />
        <div className="form-grid">
          <Field
            label="Компания"
            htmlFor={`${formId}-company`}
            hint="Используется, если компания ещё не найдена по домену."
            className="span-2"
          >
            <Input
              id={`${formId}-company`}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label="Название сделки" htmlFor={`${formId}-title`} required className="span-2">
            <Input
              id={`${formId}-title`}
              value={dealTitle}
              onChange={(event) => setDealTitle(event.target.value)}
              maxLength={200}
              data-autofocus
            />
          </Field>
          <Field label="Сумма" htmlFor={`${formId}-amount`} hint="В основных единицах валюты.">
            <div className="row" style={{ gap: 8 }}>
              <Input
                id={`${formId}-amount`}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="180 000"
              />
              <Select
                aria-label="Валюта"
                style={{ width: 94 }}
                value={currency}
                onChange={(event) => setCurrency(event.target.value as ConvertLeadInput['deal']['currency'])}
              >
                {meta.currencies.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field label="Услуга" htmlFor={`${formId}-service`} required>
            <Select
              id={`${formId}-service`}
              value={serviceType}
              onChange={(event) => setServiceType(event.target.value as typeof serviceType)}
            >
              {meta.enums.serviceTypes.map((option) => (
                <option key={option} value={option}>
                  {serviceTypeLabels[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Стадия" htmlFor={`${formId}-stage`}>
            <Select id={`${formId}-stage`} value={stageId} onChange={(event) => setStageId(event.target.value)}>
              {meta.pipeline.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ожидаемое закрытие" htmlFor={`${formId}-date`}>
            <Input
              id={`${formId}-date`}
              type="date"
              value={expectedCloseDate}
              onChange={(event) => setExpectedCloseDate(event.target.value)}
            />
          </Field>
        </div>
        <FormActions
          onCancel={onCancel}
          submitting={submitting}
          submitLabel="Конвертировать лид"
        />
      </div>
    </form>
  );
}

export interface ActivityFormValues {
  type: ActivityType;
  subject: string;
  body: string | null;
  occurredAt: string;
  relatedTo: ActivityInput['relatedTo'];
}

function toLocalDateTimeInput(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(
    value.getHours(),
  )}:${pad(value.getMinutes())}`;
}

export function ActivityForm({
  initial,
  fixedRelated,
  onSubmit,
  submitting,
  error,
  onCancel,
}: BaseFormProps & {
  initial?: Activity | null;
  fixedRelated?: { type: ActivityInput['relatedTo']['type']; id: number; label: string } | null;
  onSubmit: (input: ActivityFormValues) => Promise<void>;
}) {
  const meta = useAppMeta();
  const formId = useId();
  const [type, setType] = useState<ActivityType>(initial?.type ?? 'call');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [occurredAt, setOccurredAt] = useState(
    initial ? toLocalDateTimeInput(new Date(initial.occurredAt)) : toLocalDateTimeInput(new Date()),
  );
  const [related, setRelated] = useState<EntitySelection | null>(
    initial
      ? { type: initial.relatedTo.type, id: initial.relatedTo.id, label: initial.relatedLabel }
      : fixedRelated
        ? fixedRelated
        : null,
  );
  const [clientError, setClientError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!subject.trim()) {
      setClientError('Укажите тему активности.');
      return;
    }
    if (!related) {
      setClientError('Выберите, к какой записи относится активность.');
      return;
    }
    setClientError(null);
    await onSubmit({
      type,
      subject: subject.trim(),
      body: blankToNull(body),
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
      relatedTo: { type: related.type, id: related.id },
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="stack-sm">
        {clientError ? (
          <div className="form-error" role="alert">
            {clientError}
          </div>
        ) : null}
        <FormError error={error} />
        <div className="form-grid">
          <Field label="Тип" htmlFor={`${formId}-type`}>
            <Select id={`${formId}-type`} value={type} onChange={(event) => setType(event.target.value as ActivityType)}>
              {meta.enums.activityTypes.map((option) => (
                <option key={option} value={option}>
                  {activityTypeLabels[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Когда" htmlFor={`${formId}-when`}>
            <Input
              id={`${formId}-when`}
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </Field>
          <Field label="Тема" htmlFor={`${formId}-subject`} required className="span-2">
            <Input
              id={`${formId}-subject`}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Созвон по условиям договора"
              maxLength={200}
              data-autofocus
            />
          </Field>
          {fixedRelated ? null : (
            <Field label="Связанная запись" htmlFor={`${formId}-related`} required className="span-2">
              <EntityCombobox
                id={`${formId}-related`}
                value={related}
                onChange={setRelated}
                invalid={Boolean(clientError && !related)}
              />
            </Field>
          )}
          <Field label="Описание" htmlFor={`${formId}-body`} className="span-2">
            <Textarea
              id={`${formId}-body`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              placeholder="Что обсудили, о чём договорились, следующий шаг…"
            />
          </Field>
        </div>
        <FormActions
          onCancel={onCancel}
          submitting={submitting}
          submitLabel={initial ? 'Сохранить' : 'Добавить активность'}
        />
      </div>
    </form>
  );
}

export interface TaskFormValues {
  title: string;
  description: string | null;
  dueDate: string;
  priority: TaskPriority;
  relatedTo: TaskInput['relatedTo'];
}

export function TaskForm({
  initial,
  fixedRelated,
  onSubmit,
  submitting,
  error,
  onCancel,
}: BaseFormProps & {
  initial?: Task | null;
  fixedRelated?: { type: TaskInput['relatedTo']['type']; id: number; label: string } | null;
  onSubmit: (input: TaskFormValues) => Promise<void>;
}) {
  const meta = useAppMeta();
  const formId = useId();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? meta.today);
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'medium');
  const [related, setRelated] = useState<EntitySelection | null>(
    initial
      ? { type: initial.relatedTo.type, id: initial.relatedTo.id, label: initial.relatedLabel }
      : fixedRelated
        ? fixedRelated
        : null,
  );
  const [clientError, setClientError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !dueDate) {
      setClientError('Заполните название и срок.');
      return;
    }
    if (!related) {
      setClientError('Выберите, к какой записи относится задача.');
      return;
    }
    setClientError(null);
    await onSubmit({
      title: title.trim(),
      description: blankToNull(description),
      dueDate,
      priority,
      relatedTo: { type: related.type, id: related.id },
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="stack-sm">
        {clientError ? (
          <div className="form-error" role="alert">
            {clientError}
          </div>
        ) : null}
        <FormError error={error} />
        <div className="form-grid">
          <Field label="Задача" htmlFor={`${formId}-title`} required className="span-2">
            <Input
              id={`${formId}-title`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Согласовать финальную смету"
              maxLength={200}
              data-autofocus
            />
          </Field>
          <Field label="Срок" htmlFor={`${formId}-due`} required>
            <Input
              id={`${formId}-due`}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>
          <Field label="Приоритет" htmlFor={`${formId}-priority`}>
            <Select
              id={`${formId}-priority`}
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
            >
              {meta.enums.taskPriorities.map((option) => (
                <option key={option} value={option}>
                  {option === 'high' ? 'Высокий' : option === 'medium' ? 'Средний' : 'Низкий'}
                </option>
              ))}
            </Select>
          </Field>
          {fixedRelated ? null : (
            <Field
              label="Связанная запись"
              htmlFor={`${formId}-related`}
              required
              className="span-2"
            >
              <EntityCombobox
                id={`${formId}-related`}
                value={related}
                onChange={setRelated}
                invalid={Boolean(clientError && !related)}
              />
            </Field>
          )}
          <Field label="Описание" htmlFor={`${formId}-description`} className="span-2">
            <Textarea
              id={`${formId}-description`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Что нужно сделать и какой результат считается готовым…"
            />
          </Field>
        </div>
        <FormActions
          onCancel={onCancel}
          submitting={submitting}
          submitLabel={initial ? 'Сохранить' : 'Создать задачу'}
        />
      </div>
    </form>
  );
}

export function FormShell({ children }: { children: ReactNode }) {
  return <div className="stack-sm">{children}</div>;
}

/** Exposed for pages that need a client-side amount parse. */
export { toMinor };
