import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { SiteRequest } from '@shared/site';
import { networkApi } from '@/api/network';
import { formatDate, formatDateTime } from '@/lib/format';
import { errorMessage } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { useToast } from '@/components/Toast';
import {
  Badge,
  Button,
  EmptyState,
  LoadingBlock,
  PageHeader,
  Select,
} from '@/components/ui';

type RequestStatus = 'new' | 'contacted' | 'qualified' | 'disqualified';

const statusLabels: Record<RequestStatus, string> = {
  new: 'Новая',
  contacted: 'На связи',
  qualified: 'Подтверждена',
  disqualified: 'Отклонена',
};

const statusTones: Record<RequestStatus, 'indigo' | 'amber' | 'green' | 'red'> = {
  new: 'indigo',
  contacted: 'amber',
  qualified: 'green',
  disqualified: 'red',
};

const filters: Array<{ value: 'all' | RequestStatus; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'contacted', label: 'На связи' },
  { value: 'qualified', label: 'Подтверждённые' },
  { value: 'disqualified', label: 'Отклонённые' },
];

function requestDetails(request: SiteRequest): string[] {
  const details: string[] = [];
  if (request.requestedDate) {
    const date = formatDate(request.requestedDate);
    if (request.requestedTime) details.push(`${date}, ${request.requestedTime}`);
    else details.push(date);
  }
  if (request.checkOut) {
    details.push(`выезд ${formatDate(request.checkOut)}`);
  }
  if (request.guests) {
    details.push(`${request.guests} ${request.guests === 1 ? 'гость' : 'гостей'}`);
  }
  if (request.itemName) details.push(request.itemName);
  return details;
}

export function BuilderRequestsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [filter, setFilter] = useState<'all' | RequestStatus>('all');
  const query = useQuery({ queryKey: ['network-requests'], queryFn: networkApi.requests });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: RequestStatus }) =>
      networkApi.updateRequest(id, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['network-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.push('Статус заявки обновлён', 'success');
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  });

  const requests = query.data ?? [];
  const counts = requests.reduce<Record<string, number>>(
    (acc, request) => {
      acc[request.leadStatus] = (acc[request.leadStatus] ?? 0) + 1;
      return acc;
    },
    { all: requests.length },
  );
  const visible =
    filter === 'all'
      ? requests
      : requests.filter((request) => request.leadStatus === filter);

  const vertical = session?.tenant.vertical ?? 'restaurant';
  const actionLabel =
    vertical === 'restaurant'
      ? 'брони'
      : vertical === 'service'
        ? 'заявки'
        : 'брони';

  return (
    <div className="page">
      <PageHeader
        eyebrow="Сайт бизнеса"
        title="Заявки с сайта"
        subtitle={`Здесь появляются ${actionLabel} гостей. Статус заявки совпадает со статусом лида в CRM.`}
        actions={
          <Link className="btn btn-secondary btn-sm" to="/builder">
            Настроить сайт
          </Link>
        }
      />

      <div className="filter-chips" role="group" aria-label="Фильтр заявок">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            className={filter === item.value ? 'filter-chip active' : 'filter-chip'}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
            <span>{counts[item.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {query.isPending ? (
        <LoadingBlock rows={4} />
      ) : query.isError ? (
        <EmptyState
          icon="alert"
          title="Не удалось загрузить заявки"
          text={errorMessage(query.error)}
          action={<Button onClick={() => void query.refetch()}>Повторить</Button>}
        />
      ) : visible.length ? (
        <div className="request-list">
          {visible.map((request) => {
            const status = request.leadStatus as RequestStatus;
            const details = requestDetails(request);
            return (
              <article className="request-card" key={request.id}>
                <div className="request-card-head">
                  <div>
                    <div className="request-guest">
                      {request.guestName}
                      <Badge tone={statusTones[status]} dot>
                        {statusLabels[status]}
                      </Badge>
                    </div>
                    <div className="request-code">Заявка {request.code}</div>
                  </div>
                  <Select
                    aria-label={`Статус заявки ${request.code}`}
                    value={status}
                    disabled={updateStatus.isPending}
                    onChange={(event) =>
                      updateStatus.mutate({
                        id: request.id,
                        status: event.target.value as RequestStatus,
                      })
                    }
                  >
                    {(Object.keys(statusLabels) as RequestStatus[]).map((value) => (
                      <option key={value} value={value}>
                        {statusLabels[value]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="request-card-body">
                  <div className="request-contact">
                    <a href={`tel:${request.phone.replace(/[^\d+]/g, '')}`}>
                      {request.phone}
                    </a>
                    {request.email ? (
                      <a href={`mailto:${request.email}`}>{request.email}</a>
                    ) : null}
                  </div>
                  {details.length ? (
                    <div className="request-details">
                      {details.map((detail) => (
                        <span key={detail}>{detail}</span>
                      ))}
                    </div>
                  ) : null}
                  {request.comment ? (
                    <div className="request-comment">«{request.comment}»</div>
                  ) : null}
                </div>

                <div className="request-card-foot">
                  <span>Получена {formatDateTime(request.createdAt)}</span>
                  <Link to={`/leads/${request.leadId}`}>Открыть лид в CRM →</Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="calendar"
          title={filter === 'all' ? 'Заявок пока нет' : 'В этом статусе пусто'}
          text={
            filter === 'all'
              ? 'Опубликуйте сайт и поделитесь ссылкой с гостями — заявки появятся здесь.'
              : 'Выберите другой статус или покажите все заявки.'
          }
          action={
            filter === 'all' ? (
              <Link className="btn btn-primary" to="/builder">
                Перейти в конструктор
              </Link>
            ) : (
              <Button onClick={() => setFilter('all')}>Показать все</Button>
            )
          }
        />
      )}
    </div>
  );
}
