import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ContactInput } from '@shared/types';
import { downloadCsv } from '@/api/client';
import { useContacts, useCreateContact } from '@/api/queries';
import { CompanyCombobox, type CompanySelection } from '@/components/combobox';
import { ContactForm } from '@/components/forms';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Select,
} from '@/components/ui';
import { formatDate, pluralRu } from '@/lib/format';
import { useDebounced, usePageTitle } from '@/lib/hooks';
import { useAppMeta } from '@/lib/meta';

export function ContactsPage() {
  const meta = useAppMeta();
  usePageTitle('Контакты');
  const toast = useToast();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 250);
  const [company, setCompany] = useState<CompanySelection | null>(null);
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);

  const query = useContacts({
    q: debouncedQ.trim() || undefined,
    companyId: company?.id,
    sort,
    page,
    pageSize: 25,
  });
  const create = useCreateContact();
  const data = query.data;

  const submit = async (input: ContactInput) => {
    try {
      setCreateError(null);
      const contact = await create.mutateAsync(input);
      toast.push('Контакт создан', 'success');
      setCreating(false);
      navigate(`/contacts/${contact.id}`);
    } catch (error) {
      setCreateError(error);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="База"
        title="Контакты"
        subtitle={
          data
            ? `${data.page.total} ${pluralRu(
                data.page.total,
                'контакт',
                'контакта',
                'контактов',
              )} · ${meta.workspace.name}`
            : 'Люди, с которыми вы ведёте сделки'
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={() =>
                downloadCsv('contacts', {
                  q: debouncedQ.trim() || undefined,
                  companyId: company?.id,
                  sort,
                })
              }
            >
              CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="plus"
              onClick={() => {
                setCreateError(null);
                setCreating(true);
              }}
            >
              Новый контакт
            </Button>
          </>
        }
      />

      <div className="toolbar">
        <div className="search-field">
          <Icon name="search" size={16} />
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Имя, email, компания"
            aria-label="Поиск контактов"
          />
        </div>
        <div className="toolbar-combo">
          <CompanyCombobox
            value={company}
            onChange={(value) => {
              setCompany(value);
              setPage(1);
            }}
            placeholder="Все компании"
          />
        </div>
        <Select
          aria-label="Сортировка контактов"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(1);
          }}
        >
          <option value="name">По имени</option>
          <option value="-createdAt">Сначала новые</option>
          <option value="-updatedAt">Сначала обновлённые</option>
        </Select>
      </div>

      {query.isPending ? (
        <div className="panel">
          <div className="panel-body">
            <LoadingBlock rows={7} />
          </div>
        </div>
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <section className="panel">
          <div className="panel-body flush">
            {data.data.length === 0 ? (
              <EmptyState
                icon="user"
                title={debouncedQ || company ? 'Контакты не найдены' : 'Контактов пока нет'}
                text={
                  debouncedQ || company
                    ? 'Сбросьте фильтры или создайте контакт вручную.'
                    : 'Добавьте первое контактное лицо и свяжите его с компанией.'
                }
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    icon="plus"
                    onClick={() => setCreating(true)}
                  >
                    Новый контакт
                  </Button>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Контакт</th>
                      <th>Компания</th>
                      <th>Email</th>
                      <th>Телефон</th>
                      <th>Telegram</th>
                      <th>Обновлён</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((contact) => (
                      <tr key={contact.id}>
                        <td>
                          <div className="avatar-cell">
                            <Avatar name={contact.fullName} size="sm" />
                            <div className="cell-main">
                              <Link className="cell-title" to={`/contacts/${contact.id}`}>
                                {contact.fullName}
                              </Link>
                              <span className="cell-sub">
                                {contact.jobTitle ?? 'Должность не указана'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {contact.company ? (
                            <Link className="cell-link" to={`/companies/${contact.company.id}`}>
                              {contact.company.name}
                            </Link>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {contact.email ? (
                            <a href={`mailto:${contact.email}`}>{contact.email}</a>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="nowrap">
                          {contact.phone ? (
                            <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>{contact.telegram ?? <span className="muted">—</span>}</td>
                        <td className="muted nowrap">{formatDate(contact.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {data.page.totalPages > 1 ? (
            <Pagination
              page={data.page.page}
              totalPages={data.page.totalPages}
              total={data.page.total}
              onChange={setPage}
              disabled={query.isFetching}
            />
          ) : null}
        </section>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Новый контакт"
        description="Email проверяется на дубликаты — при совпадении откроем существующий контакт."
        size="lg"
      >
        {creating ? (
          <ContactForm
            onSubmit={submit}
            submitting={create.isPending}
            error={createError}
            onCancel={() => setCreating(false)}
          />
        ) : null}
      </Modal>
    </div>
  );
}
