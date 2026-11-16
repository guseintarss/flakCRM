import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CompanyInput } from '@shared/types';
import { downloadCsv } from '@/api/client';
import { useCompanies, useCreateCompany } from '@/api/queries';
import { CompanyForm } from '@/components/forms';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Select,
  TagList,
} from '@/components/ui';
import { companySizeLabels } from '@/i18n';
import { formatDate, formatMoney, pluralRu } from '@/lib/format';
import { useDebounced, usePageTitle } from '@/lib/hooks';
import { useAppMeta } from '@/lib/meta';

export function CompaniesPage() {
  const meta = useAppMeta();
  usePageTitle('Компании');
  const toast = useToast();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 250);
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);

  const query = useCompanies({
    q: debouncedQ.trim() || undefined,
    sort,
    page,
    pageSize: 25,
  });
  const create = useCreateCompany();
  const data = query.data;

  const submit = async (input: CompanyInput) => {
    try {
      setCreateError(null);
      const company = await create.mutateAsync(input);
      toast.push('Компания создана', 'success');
      setCreating(false);
      navigate(`/companies/${company.id}`);
    } catch (error) {
      setCreateError(error);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="База"
        title="Компании"
        subtitle={
          data
            ? `${data.page.total} ${pluralRu(
                data.page.total,
                'компания',
                'компании',
                'компаний',
              )} · суммы пайплайна в ${meta.workspace.baseCurrency}`
            : 'Клиенты и потенциальные заказчики'
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={() =>
                downloadCsv('companies', {
                  q: debouncedQ.trim() || undefined,
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
              Новая компания
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
            placeholder="Название, домен, отрасль"
            aria-label="Поиск компаний"
          />
        </div>
        <Select
          aria-label="Сортировка компаний"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(1);
          }}
        >
          <option value="name">По названию</option>
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
                icon="building"
                title={debouncedQ ? 'Компании не найдены' : 'База пока пуста'}
                text={
                  debouncedQ
                    ? 'Попробуйте изменить запрос или создайте компанию вручную.'
                    : 'Добавьте первого клиента, чтобы связать с ним контакты и сделки.'
                }
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    icon="plus"
                    onClick={() => setCreating(true)}
                  >
                    Новая компания
                  </Button>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Компания</th>
                      <th>Отрасль</th>
                      <th>Размер</th>
                      <th>Контакты</th>
                      <th className="num">Открытый пайплайн</th>
                      <th>Сделки</th>
                      <th>Обновлена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((company) => (
                      <tr key={company.id}>
                        <td>
                          <div className="cell-main">
                            <Link className="cell-title" to={`/companies/${company.id}`}>
                              {company.name}
                            </Link>
                            <span className="cell-sub">
                              {company.domain ?? 'Без домена'}
                              {company.location ? ` · ${company.location}` : ''}
                            </span>
                            {company.tags.length ? (
                              <div style={{ marginTop: 4 }}>
                                <TagList values={company.tags.slice(0, 3)} />
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td>{company.industry ?? <span className="muted">—</span>}</td>
                        <td className="nowrap">
                          {company.size ? (
                            companySizeLabels[company.size]
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="num">{company.counts.contacts}</td>
                        <td className="num">
                          {formatMoney(company.openPipelineMinor, meta.workspace.baseCurrency)}
                        </td>
                        <td>
                          <span className="badge badge-indigo">
                            {company.counts.openDeals} в работе
                          </span>{' '}
                          <span className="badge badge-green">{company.counts.wonDeals} won</span>
                        </td>
                        <td className="muted nowrap">{formatDate(company.updatedAt)}</td>
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
        title="Новая компания"
        description="Домен нормализуется, поэтому дубликаты ловятся до сохранения."
        size="lg"
      >
        {creating ? (
          <CompanyForm
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
