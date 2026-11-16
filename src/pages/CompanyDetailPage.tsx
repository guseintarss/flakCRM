import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Company, CompanyInput, ContactInput } from '@shared/types';
import {
  useCompany,
  useCompanyContacts,
  useCreateContact,
  useDeleteCompany,
  useUpdateCompany,
} from '@/api/queries';
import {
  AuditTrail,
  DealsPanel,
  EntityActivities,
  EntityTasks,
} from '@/components/entity-sections';
import { CompanyForm, ContactForm } from '@/components/forms';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Modal,
  PageHeader,
  TagList,
} from '@/components/ui';
import { companySizeLabels } from '@/i18n';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { errorMessage, usePageTitle } from '@/lib/hooks';
import { useAppMeta } from '@/lib/meta';
import { NotFoundPage } from './NotFoundPage';

function CompanyContactsPanel({ company }: { company: Company }) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);
  const query = useCompanyContacts(company.id);
  const create = useCreateContact();

  const submit = async (input: ContactInput) => {
    try {
      setFormError(null);
      await create.mutateAsync(input);
      toast.push('Контакт добавлен', 'success');
      setCreating(false);
    } catch (error) {
      setFormError(error);
    }
  };

  const contacts = query.data?.data ?? [];
  const companyRef = { id: company.id, name: company.name, domain: company.domain };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">
          <Icon name="contacts" size={16} />
          Контакты
          {query.data ? <span className="muted small">· {query.data.page.total}</span> : null}
        </h2>
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          onClick={() => {
            setFormError(null);
            setCreating(true);
          }}
        >
          Добавить
        </Button>
      </div>
      <div className="panel-body flush">
        {query.isPending ? (
          <div className="panel-body">
            <LoadingBlock rows={2} />
          </div>
        ) : query.isError ? (
          <div className="panel-body">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon="user"
            title="Контактов пока нет"
            text="Добавьте человека, с которым общаетесь по сделкам этой компании."
            action={
              <Button variant="primary" size="sm" icon="plus" onClick={() => setCreating(true)}>
                Добавить контакт
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Контакт</th>
                  <th>Email</th>
                  <th>Телефон</th>
                  <th>Telegram</th>
                  <th>Обновлён</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <div className="cell-main">
                        <Link className="cell-title" to={`/contacts/${contact.id}`}>
                          {contact.fullName}
                        </Link>
                        <span className="cell-sub">{contact.jobTitle ?? 'Должность не указана'}</span>
                      </div>
                    </td>
                    <td>
                      {contact.email ? (
                        <a href={`mailto:${contact.email}`}>{contact.email}</a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{contact.phone ?? <span className="muted">—</span>}</td>
                    <td>{contact.telegram ?? <span className="muted">—</span>}</td>
                    <td className="muted nowrap">{formatDate(contact.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Новый контакт"
        description={company.name}
        size="lg"
      >
        {creating ? (
          <ContactForm
            defaultCompany={companyRef}
            onSubmit={submit}
            submitting={create.isPending}
            error={formError}
            onCancel={() => setCreating(false)}
          />
        ) : null}
      </Modal>
    </section>
  );
}

export function CompanyDetailPage() {
  const params = useParams();
  const rawId = Number(params.id);
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  const meta = useAppMeta();
  const toast = useToast();
  const navigate = useNavigate();

  const query = useCompany(id);
  const update = useUpdateCompany(id ?? 0);
  const remove = useDeleteCompany();
  const company = query.data;

  usePageTitle(company?.name ?? 'Компания');

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<unknown>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!id) return <NotFoundPage />;

  if (query.isPending) {
    return (
      <div className="page">
        <PageHeader eyebrow="Компании" title="Загрузка компании…" />
        <div className="panel">
          <div className="panel-body">
            <LoadingBlock rows={6} />
          </div>
        </div>
      </div>
    );
  }

  if (query.isError || !company) {
    return (
      <div className="page">
        <PageHeader
          eyebrow={<Link to="/companies">← Компании</Link>}
          title="Компания не найдена"
          subtitle="Возможно, запись удалена или ссылка устарела."
        />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const submitEdit = async (input: CompanyInput) => {
    try {
      setEditError(null);
      await update.mutateAsync(input);
      toast.push('Компания обновлена', 'success');
      setEditOpen(false);
    } catch (error) {
      setEditError(error);
    }
  };

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(company.id);
      toast.push('Компания удалена', 'success');
      navigate('/companies');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
      setDeleteOpen(false);
    }
  };

  const companyRef = { id: company.id, name: company.name, domain: company.domain };

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <Link className="back-link" to="/companies">
            <Icon name="arrow-left" size={14} />
            Компании
          </Link>
        }
        title={company.name}
        subtitle={
          <>
            {company.domain ? (
              <a href={`https://${company.domain}`} target="_blank" rel="noreferrer">
                {company.domain}
              </a>
            ) : (
              'Без домена'
            )}
            {company.industry ? ` · ${company.industry}` : ''}
            {company.location ? ` · ${company.location}` : ''}
            {company.size ? ` · ${companySizeLabels[company.size]}` : ''}
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon="edit"
              onClick={() => {
                setEditError(null);
                setEditOpen(true);
              }}
            >
              Редактировать
            </Button>
            <Button
              variant="danger-ghost"
              size="sm"
              icon="trash"
              onClick={() => setDeleteOpen(true)}
            >
              Удалить
            </Button>
          </>
        }
      />

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">
                <Icon name="note" size={16} />
                Заметки
              </h2>
              <span className="muted small">{company.owner.name}</span>
            </div>
            <div className="panel-body">
              {company.notes ? (
                <div className="notes">{company.notes}</div>
              ) : (
                <div className="notes empty-notes">Заметок пока нет.</div>
              )}
            </div>
          </section>

          <CompanyContactsPanel company={company} />

          <DealsPanel companyId={company.id} defaultCompany={companyRef} />

          <EntityActivities
            entityType="company"
            entityId={company.id}
            relatedLabel={company.name}
          />
          <AuditTrail entityType="company" entityId={company.id} />
        </div>

        <aside className="detail-aside">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">
                <Icon name="building" size={16} />
                Профиль
              </h2>
            </div>
            <div className="panel-body">
              <div className="info-list">
                <div className="info-row">
                  <span className="info-label">Открытый пайплайн</span>
                  <span className="info-value">
                    {formatMoney(company.openPipelineMinor, meta.workspace.baseCurrency)}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Сделки</span>
                  <span className="info-value">
                    {company.counts.openDeals} в работе · {company.counts.wonDeals} won
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Контакты</span>
                  <span className="info-value">{company.counts.contacts}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Telegram</span>
                  <span className="info-value">
                    {company.telegram ? (
                      <a
                        href={`https://t.me/${company.telegram.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {company.telegram}
                      </a>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Владелец</span>
                  <span className="info-value">{company.owner.name}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Создана</span>
                  <span className="info-value">{formatDateTime(company.createdAt)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Обновлена</span>
                  <span className="info-value">{formatDateTime(company.updatedAt)}</span>
                </div>
              </div>

              <div className="divider" style={{ margin: '14px 0' }} />
              <div className="stack-sm">
                <div>
                  <div className="field-label">Стек</div>
                  <div style={{ marginTop: 5 }}>
                    <TagList values={company.stack} tone="tech" />
                  </div>
                </div>
                <div>
                  <div className="field-label">Теги</div>
                  <div style={{ marginTop: 5 }}>
                    <TagList values={company.tags} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <EntityTasks entityType="company" entityId={company.id} relatedLabel={company.name} />
        </aside>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Редактировать компанию"
        size="lg"
      >
        <CompanyForm
          initial={company}
          onSubmit={submitEdit}
          submitting={update.isPending}
          error={editError}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
        title="Удалить компанию?"
        message={`«${company.name}» будет скрыта. Связанные активности и задачи тоже скроются. Компанию с открытыми сделками удалить нельзя.`}
        busy={remove.isPending}
      />
    </div>
  );
}
