import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ContactInput } from '@shared/types';
import {
  useContact,
  useDeleteContact,
  useUpdateContact,
} from '@/api/queries';
import {
  AuditTrail,
  DealsPanel,
  EntityActivities,
  EntityTasks,
} from '@/components/entity-sections';
import { ContactForm } from '@/components/forms';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import {
  Avatar,
  Button,
  ConfirmDialog,
  ErrorState,
  LoadingBlock,
  Modal,
  PageHeader,
  TagList,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { errorMessage, usePageTitle } from '@/lib/hooks';
import { NotFoundPage } from './NotFoundPage';

export function ContactDetailPage() {
  const params = useParams();
  const rawId = Number(params.id);
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  const toast = useToast();
  const navigate = useNavigate();

  const query = useContact(id);
  const update = useUpdateContact(id ?? 0);
  const remove = useDeleteContact();
  const contact = query.data;

  usePageTitle(contact?.fullName ?? 'Контакт');

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<unknown>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!id) return <NotFoundPage />;

  if (query.isPending) {
    return (
      <div className="page">
        <PageHeader eyebrow="Контакты" title="Загрузка контакта…" />
        <div className="panel">
          <div className="panel-body">
            <LoadingBlock rows={6} />
          </div>
        </div>
      </div>
    );
  }

  if (query.isError || !contact) {
    return (
      <div className="page">
        <PageHeader
          eyebrow={<Link to="/contacts">← Контакты</Link>}
          title="Контакт не найден"
          subtitle="Возможно, запись удалена или ссылка устарела."
        />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const submitEdit = async (input: ContactInput) => {
    try {
      setEditError(null);
      await update.mutateAsync(input);
      toast.push('Контакт обновлён', 'success');
      setEditOpen(false);
    } catch (error) {
      setEditError(error);
    }
  };

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(contact.id);
      toast.push('Контакт удалён', 'success');
      navigate('/contacts');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
      setDeleteOpen(false);
    }
  };

  const contactRef = {
    id: contact.id,
    fullName: contact.fullName,
    email: contact.email,
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <Link className="back-link" to="/contacts">
            <Icon name="arrow-left" size={14} />
            Контакты
          </Link>
        }
        title={
          <>
            <Avatar name={contact.fullName} />
            {contact.fullName}
          </>
        }
        subtitle={
          <>
            {contact.jobTitle ?? 'Должность не указана'}
            {contact.company ? (
              <>
                {' · '}
                <Link to={`/companies/${contact.company.id}`}>{contact.company.name}</Link>
              </>
            ) : null}
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
              <span className="muted small">{contact.owner.name}</span>
            </div>
            <div className="panel-body">
              {contact.notes ? (
                <div className="notes">{contact.notes}</div>
              ) : (
                <div className="notes empty-notes">Заметок пока нет.</div>
              )}
            </div>
          </section>

          <DealsPanel
            contactId={contact.id}
            defaultCompany={contact.company}
            defaultContact={contactRef}
          />

          <EntityActivities
            entityType="contact"
            entityId={contact.id}
            relatedLabel={contact.fullName}
          />
          <AuditTrail entityType="contact" entityId={contact.id} />
        </div>

        <aside className="detail-aside">
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">
                <Icon name="user" size={16} />
                Контакт
              </h2>
            </div>
            <div className="panel-body">
              <div className="info-list">
                <div className="info-row">
                  <span className="info-label">Компания</span>
                  <span className="info-value">
                    {contact.company ? (
                      <Link to={`/companies/${contact.company.id}`}>{contact.company.name}</Link>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Должность</span>
                  <span className="info-value">{contact.jobTitle ?? '—'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Email</span>
                  <span className="info-value">
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`}>{contact.email}</a>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Телефон</span>
                  <span className="info-value">
                    {contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : '—'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Telegram</span>
                  <span className="info-value">
                    {contact.telegram ? (
                      <a
                        href={`https://t.me/${contact.telegram.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {contact.telegram}
                      </a>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">LinkedIn</span>
                  <span className="info-value">
                    {contact.linkedin ? (
                      <a href={contact.linkedin} target="_blank" rel="noreferrer">
                        Профиль
                      </a>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Владелец</span>
                  <span className="info-value">{contact.owner.name}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Создан</span>
                  <span className="info-value">{formatDateTime(contact.createdAt)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Обновлён</span>
                  <span className="info-value">{formatDateTime(contact.updatedAt)}</span>
                </div>
              </div>

              <div className="divider" style={{ margin: '14px 0' }} />
              <div>
                <div className="field-label">Теги</div>
                <div style={{ marginTop: 5 }}>
                  <TagList values={contact.tags} />
                </div>
              </div>
            </div>
          </section>

          <EntityTasks
            entityType="contact"
            entityId={contact.id}
            relatedLabel={contact.fullName}
          />
        </aside>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Редактировать контакт"
        size="lg"
      >
        <ContactForm
          initial={contact}
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
        title="Удалить контакт?"
        message={`«${contact.fullName}» будет скрыт. Связанные активности и задачи тоже скроются. Действие попадёт в аудит.`}
        busy={remove.isPending}
      />
    </div>
  );
}
