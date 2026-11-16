import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { LeadInput } from '@shared/types';
import { downloadCsv } from '@/api/client';
import { useCreateLead, useLeads } from '@/api/queries';
import { LeadForm } from '@/components/forms';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LeadStatusBadge,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Select,
} from '@/components/ui';
import {
  leadSourceLabels,
  leadStatusLabels,
  serviceTypeLabels,
} from '@/i18n';
import { formatDate, formatMoney, pluralRu } from '@/lib/format';
import { useDebounced, usePageTitle } from '@/lib/hooks';
import { useAppMeta } from '@/lib/meta';

export function LeadsPage() {
  const meta = useAppMeta();
  usePageTitle('Лиды');
  const toast = useToast();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 250);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);

  const query = useLeads({
    q: debouncedQ.trim() || undefined,
    status: status || undefined,
    source: source || undefined,
    serviceType: serviceType || undefined,
    page,
    pageSize: 25,
  });
  const create = useCreateLead();
  const data = query.data;

  const submit = async (input: LeadInput) => {
    try {
      setCreateError(null);
      const lead = await create.mutateAsync(input);
      toast.push('Лид создан', 'success');
      setCreating(false);
      navigate(`/leads/${lead.id}`);
    } catch (error) {
      setCreateError(error);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Продажи"
        title="Лиды"
        subtitle={
          data
            ? `${data.page.total} ${pluralRu(
                data.page.total,
                'лид',
                'лида',
                'лидов',
              )} · ${meta.workspace.name}`
            : 'Входящие контакты до квалификации'
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={() =>
                downloadCsv('leads', {
                  q: debouncedQ.trim() || undefined,
                  status: status || undefined,
                  source: source || undefined,
                  serviceType: serviceType || undefined,
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
              Новый лид
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
            placeholder="Компания, контакт, email"
            aria-label="Поиск лидов"
          />
        </div>
        <Select
          aria-label="Статус лида"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Все статусы</option>
          {meta.enums.leadStatuses.map((item) => (
            <option key={item} value={item}>
              {leadStatusLabels[item]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Источник лида"
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Все источники</option>
          {meta.enums.leadSources.map((item) => (
            <option key={item} value={item}>
              {leadSourceLabels[item]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Услуга лида"
          value={serviceType}
          onChange={(event) => {
            setServiceType(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Все услуги</option>
          {meta.enums.serviceTypes.map((item) => (
            <option key={item} value={item}>
              {serviceTypeLabels[item]}
            </option>
          ))}
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
                icon="leads"
                title="Лидов не найдено"
                text="Измените фильтры или добавьте входящий контакт, чтобы начать квалификацию."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    icon="plus"
                    onClick={() => setCreating(true)}
                  >
                    Новый лид
                  </Button>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Лид</th>
                      <th>Статус</th>
                      <th>Источник</th>
                      <th>Услуга</th>
                      <th className="num">Бюджет</th>
                      <th>Создан</th>
                      <th>Обновлён</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((lead) => (
                      <tr key={lead.id}>
                        <td>
                          <div className="cell-main">
                            <Link className="cell-title" to={`/leads/${lead.id}`}>
                              {lead.companyName}
                            </Link>
                            <span className="cell-sub">
                              {lead.contactName}
                              {lead.email ? ` · ${lead.email}` : ''}
                            </span>
                          </div>
                        </td>
                        <td>
                          <LeadStatusBadge status={lead.status} />
                        </td>
                        <td>{leadSourceLabels[lead.source]}</td>
                        <td>
                          {lead.serviceType ? (
                            serviceTypeLabels[lead.serviceType]
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="num lead-amount">
                          {formatMoney(lead.estimatedAmountMinor, lead.currency)}
                        </td>
                        <td className="muted nowrap">{formatDate(lead.createdAt)}</td>
                        <td className="muted nowrap">{formatDate(lead.updatedAt)}</td>
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
        title="Новый лид"
        description="После квалификации лид конвертируется в компанию, контакт и сделку."
        size="lg"
      >
        {creating ? (
          <LeadForm
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
