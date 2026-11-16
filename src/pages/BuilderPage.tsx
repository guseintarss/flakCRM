import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { SiteItem, SiteItemKind, Vertical } from '@shared/site';
import { siteItemKindLabels, verticalLabels } from '@shared/site';
import type { SiteProfileInput } from '@shared/network';
import { networkApi } from '@/api/network';
import { toMajorInput, toMinor, formatMoney } from '@/lib/format';
import { errorMessage } from '@/lib/hooks';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Textarea,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';

function profileFromSite(site: {
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  workingHours: string | null;
  brandColor: string;
  coverUrl: string | null;
}): SiteProfileInput {
  return {
    name: site.name,
    slug: site.slug,
    tagline: site.tagline ?? '',
    description: site.description ?? '',
    city: site.city ?? '',
    address: site.address ?? '',
    phone: site.phone ?? '',
    email: site.email ?? '',
    workingHours: site.workingHours ?? '',
    brandColor: site.brandColor,
    coverUrl: site.coverUrl ?? '',
  };
}

function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function BuilderPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['network-site'], queryFn: networkApi.site });
  const [profile, setProfile] = useState<SiteProfileInput | null>(null);
  const [editor, setEditor] = useState<SiteItem | 'new' | null>(null);

  const site = query.data?.site;
  const items = query.data?.items ?? [];

  useEffect(() => {
    if (site) setProfile(profileFromSite(site));
  }, [site]);

  const saveProfile = useMutation({
    mutationFn: networkApi.saveSite,
    onSuccess: (data) => {
      queryClient.setQueryData(['network-site'], data);
      toast.push('Настройки сайта сохранены', 'success');
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  });

  const publish = useMutation({
    mutationFn: networkApi.publish,
    onSuccess: (updated) => {
      queryClient.setQueryData(['network-site'], (current: typeof query.data) =>
        current ? { ...current, site: updated } : current,
      );
      toast.push(
        updated.isPublished ? 'Сайт опубликован' : 'Сайт скрыт с публикации',
        'success',
      );
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  });

  const removeItem = useMutation({
    mutationFn: networkApi.deleteItem,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['network-site'] });
      toast.push('Позиция удалена', 'success');
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  });

  const submitProfile = (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    saveProfile.mutate({
      ...profile,
      tagline: nullIfBlank(profile.tagline),
      description: nullIfBlank(profile.description),
      city: nullIfBlank(profile.city),
      address: nullIfBlank(profile.address),
      phone: nullIfBlank(profile.phone),
      email: nullIfBlank(profile.email),
      workingHours: nullIfBlank(profile.workingHours),
      coverUrl: nullIfBlank(profile.coverUrl),
    });
  };

  if (query.isPending) {
    return (
      <div className="page">
        <PageHeader title="Конструктор сайта" subtitle="Загружаем настройки бизнеса…" />
        <LoadingBlock rows={5} />
      </div>
    );
  }

  if (query.isError || !site || !profile) {
    return (
      <div className="page">
        <PageHeader title="Конструктор сайта" />
        <EmptyState
          icon="alert"
          title="Не удалось загрузить настройки"
          text={errorMessage(query.error)}
          action={<Button onClick={() => void query.refetch()}>Повторить</Button>}
        />
      </div>
    );
  }

  const publicUrl = `/s/${site.slug}`;

  return (
    <div className="page builder-page">
      <PageHeader
        eyebrow="Сайт бизнеса"
        title="Конструктор сайта"
        subtitle={`${verticalLabels[site.vertical]} · настройки и каталог. Заявки гостей попадают в CRM.`}
        actions={
          <>
            <Link className="btn btn-secondary btn-sm" to={publicUrl} target="_blank" rel="noreferrer">
              <Icon name="external" size={14} /> Открыть сайт
            </Link>
            {site.isPublished ? (
              <Button
                variant="secondary"
                size="sm"
                loading={publish.isPending}
                onClick={() => publish.mutate(false)}
              >
                Снять с публикации
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                icon="check"
                loading={publish.isPending}
                onClick={() => publish.mutate(true)}
              >
                Опубликовать
              </Button>
            )}
          </>
        }
      />

      <div className="builder-status-row">
        <div className={site.isPublished ? 'builder-status live' : 'builder-status'}>
          <span className="dot" />
          {site.isPublished ? 'Сайт опубликован' : 'Черновик — сайт видят только сотрудники'}
        </div>
        <div className="builder-url">
          Адрес: <code>{publicUrl}</code>
        </div>
      </div>

      <div className="builder-layout">
        <form className="panel builder-form" onSubmit={submitProfile}>
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Профиль бизнеса</h2>
              <div className="panel-sub">Так бизнес выглядит на публичной странице.</div>
            </div>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <Field label="Название" htmlFor="site-name" required>
                <Input
                  id="site-name"
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                  maxLength={120}
                />
              </Field>
              <Field
                label="Адрес сайта"
                htmlFor="site-slug"
                hint="Латиница, цифры и дефис."
                required
              >
                <div className="slug-input">
                  <span>/s/</span>
                  <Input
                    id="site-slug"
                    value={profile.slug}
                    onChange={(event) =>
                      setProfile({
                        ...profile,
                        slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                      })
                    }
                    maxLength={48}
                  />
                </div>
              </Field>
              <Field label="Короткий слоган" htmlFor="site-tagline" className="span-2">
                <Input
                  id="site-tagline"
                  value={profile.tagline ?? ''}
                  onChange={(event) => setProfile({ ...profile, tagline: event.target.value })}
                  placeholder="Одна строка, которая цепляет гостя"
                  maxLength={160}
                />
              </Field>
              <Field label="Описание" htmlFor="site-description" className="span-2">
                <Textarea
                  id="site-description"
                  value={profile.description ?? ''}
                  onChange={(event) => setProfile({ ...profile, description: event.target.value })}
                  rows={3}
                  maxLength={2000}
                  placeholder="Расскажите о бизнесе в двух-трёх предложениях"
                />
              </Field>
              <Field label="Город" htmlFor="site-city">
                <Input
                  id="site-city"
                  value={profile.city ?? ''}
                  onChange={(event) => setProfile({ ...profile, city: event.target.value })}
                  maxLength={120}
                />
              </Field>
              <Field label="Адрес" htmlFor="site-address">
                <Input
                  id="site-address"
                  value={profile.address ?? ''}
                  onChange={(event) => setProfile({ ...profile, address: event.target.value })}
                  maxLength={200}
                />
              </Field>
              <Field label="Телефон" htmlFor="site-phone">
                <Input
                  id="site-phone"
                  value={profile.phone ?? ''}
                  onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                  maxLength={32}
                  placeholder="+7 (928) 000-00-00"
                />
              </Field>
              <Field label="Email" htmlFor="site-email">
                <Input
                  id="site-email"
                  type="email"
                  value={profile.email ?? ''}
                  onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                  maxLength={254}
                />
              </Field>
              <Field label="Часы работы" htmlFor="site-hours">
                <Input
                  id="site-hours"
                  value={profile.workingHours ?? ''}
                  onChange={(event) =>
                    setProfile({ ...profile, workingHours: event.target.value })
                  }
                  placeholder="Ежедневно 12:00–23:00"
                  maxLength={120}
                />
              </Field>
              <Field label="Фирменный цвет" htmlFor="site-color">
                <div className="color-input">
                  <input
                    id="site-color"
                    type="color"
                    value={profile.brandColor}
                    onChange={(event) =>
                      setProfile({ ...profile, brandColor: event.target.value })
                    }
                    aria-label="Фирменный цвет"
                  />
                  <Input value={profile.brandColor} readOnly aria-label="Код цвета" />
                </div>
              </Field>
              <Field
                label="Обложка сайта"
                htmlFor="site-cover"
                hint="Ссылка на изображение. Пусто — будет градиент в фирменном цвете."
                className="span-2"
              >
                <Input
                  id="site-cover"
                  value={profile.coverUrl ?? ''}
                  onChange={(event) => setProfile({ ...profile, coverUrl: event.target.value })}
                  placeholder="/demo/restaurant-cover.svg"
                  maxLength={500}
                />
              </Field>
            </div>
            <div className="form-actions">
              <Link className="btn btn-secondary" to={publicUrl} target="_blank" rel="noreferrer">
                Предпросмотр
              </Link>
              <Button type="submit" variant="primary" loading={saveProfile.isPending}>
                Сохранить настройки
              </Button>
            </div>
          </div>
        </form>

        <aside className="builder-preview" style={{ ['--brand' as string]: site.brandColor }}>
          <div className="builder-preview-label">Как выглядит сайт</div>
          <div className="builder-preview-card">
            <div
              className="builder-preview-hero"
              style={
                site.coverUrl
                  ? { backgroundImage: `url(${site.coverUrl})` }
                  : undefined
              }
            >
              <span>{site.city || verticalLabels[site.vertical]}</span>
            </div>
            <div className="builder-preview-body">
              <strong>{site.name}</strong>
              <p>{site.tagline || 'Добавьте слоган, чтобы сайт стал живее.'}</p>
              <span className="builder-preview-cta">
                {site.vertical === 'restaurant'
                  ? 'Забронировать столик'
                  : site.vertical === 'service'
                    ? 'Оставить заявку'
                    : 'Забронировать проживание'}
              </span>
            </div>
          </div>
          <div className="builder-preview-hint">
            {items.length ? `${items.length} позиций в каталоге` : 'Каталог пока пуст'}
          </div>
        </aside>
      </div>

      <section className="panel builder-catalog">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">
              {site.vertical === 'restaurant'
                ? 'Меню'
                : site.vertical === 'service'
                  ? 'Услуги'
                  : 'Номера'}
            </h2>
            <div className="panel-sub">
              {site.vertical === 'restaurant'
                ? 'Витрина блюд. Гость видит её на сайте, бронирует столик отдельно.'
                : site.vertical === 'service'
                  ? 'Что вы делаете и сколько это стоит.'
                  : 'Варианты размещения и цены за ночь.'}
            </div>
          </div>
          <Button variant="primary" icon="plus" onClick={() => setEditor('new')}>
            Добавить
          </Button>
        </div>
        <div className="panel-body">
          {items.length ? (
            <div className="catalog-list">
              {items.map((item) => (
                <div className="catalog-row" key={item.id}>
                  <div className="catalog-kind" aria-hidden="true">
                    {item.kind === 'dish' ? '🍽' : item.kind === 'room' ? '🛏' : '🛠'}
                  </div>
                  <div className="catalog-main">
                    <div className="catalog-title">
                      {item.name}
                      {!item.isActive ? <Badge tone="neutral">Скрыто</Badge> : null}
                    </div>
                    {item.description ? (
                      <div className="catalog-desc">{item.description}</div>
                    ) : null}
                  </div>
                  <div className="catalog-meta">
                    <div className="catalog-price">
                      {item.priceMinor == null
                        ? 'Цена по запросу'
                        : item.priceMinor === 0
                          ? 'Бесплатно'
                          : formatMoney(item.priceMinor, 'RUB')}
                      {site.vertical === 'tourism' && item.priceMinor ? ' / ночь' : ''}
                    </div>
                    <div className="catalog-sub">
                      {item.durationMin ? `${item.durationMin} мин` : null}
                      {item.capacity ? `до ${item.capacity} гостей` : null}
                    </div>
                  </div>
                  <div className="catalog-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="edit"
                      onClick={() => setEditor(item)}
                      aria-label={`Изменить ${item.name}`}
                    />
                    <Button
                      size="sm"
                      variant="danger-ghost"
                      icon="trash"
                      loading={removeItem.isPending}
                      onClick={() => {
                        if (window.confirm(`Удалить «${item.name}»?`)) removeItem.mutate(item.id);
                      }}
                      aria-label={`Удалить ${item.name}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="spark"
              title="Каталог пока пуст"
              text="Добавьте первые позиции — они появятся на публичной странице."
              action={
                <Button variant="primary" icon="plus" onClick={() => setEditor('new')}>
                  Добавить позицию
                </Button>
              }
            />
          )}
        </div>
      </section>

      <Modal
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor === 'new' ? 'Новая позиция' : 'Изменить позицию'}
        description={
          editor && editor !== 'new'
            ? `${siteItemKindLabels[editor.kind as SiteItemKind]} · ${editor.name}`
            : undefined
        }
        size="md"
      >
        {editor !== null ? (
          <CatalogItemForm
            vertical={site.vertical}
            item={editor === 'new' ? null : editor}
            onClose={() => setEditor(null)}
            onSaved={() => {
              setEditor(null);
              void queryClient.invalidateQueries({ queryKey: ['network-site'] });
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function CatalogItemForm({
  vertical,
  item,
  onClose,
  onSaved,
}: {
  vertical: Vertical;
  item: SiteItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(toMajorInput(item?.priceMinor ?? null));
  const [duration, setDuration] = useState(item?.durationMin ? String(item.durationMin) : '');
  const [capacity, setCapacity] = useState(item?.capacity ? String(item.capacity) : '');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '');
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [clientError, setClientError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const input = {
        name: name.trim(),
        description: nullIfBlank(description),
        priceMinor: price.trim() ? toMinor(price) : null,
        durationMin: duration ? Number(duration) : null,
        capacity: capacity ? Number(capacity) : null,
        imageUrl: nullIfBlank(imageUrl),
        isActive,
      };
      return item ? networkApi.updateItem(item.id, input) : networkApi.createItem(input);
    },
    onSuccess: () => {
      toast.push(item ? 'Позиция обновлена' : 'Позиция добавлена', 'success');
      onSaved();
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setClientError('Укажите название.');
      return;
    }
    setClientError(null);
    mutation.mutate();
  };

  return (
    <form onSubmit={submit} className="stack-sm" noValidate>
      {clientError ? (
        <div className="form-error" role="alert">
          {clientError}
        </div>
      ) : null}
      <Field label="Название" htmlFor="catalog-name" required>
        <Input
          id="catalog-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          data-autofocus
        />
      </Field>
      <Field label="Описание" htmlFor="catalog-description">
        <Textarea
          id="catalog-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={1000}
        />
      </Field>
      <div className="form-grid">
        <Field label="Цена, ₽" htmlFor="catalog-price">
          <Input
            id="catalog-price"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="0"
          />
        </Field>
        {vertical === 'service' ? (
          <Field label="Длительность, мин" htmlFor="catalog-duration">
            <Input
              id="catalog-duration"
              inputMode="numeric"
              value={duration}
              onChange={(event) => setDuration(event.target.value.replace(/[^\d]/g, ''))}
              placeholder="60"
            />
          </Field>
        ) : null}
        {vertical === 'tourism' ? (
          <Field label="Вмещает гостей" htmlFor="catalog-capacity">
            <Input
              id="catalog-capacity"
              inputMode="numeric"
              value={capacity}
              onChange={(event) => setCapacity(event.target.value.replace(/[^\d]/g, ''))}
              placeholder="2"
            />
          </Field>
        ) : null}
      </div>
      <Field label="Ссылка на фото" htmlFor="catalog-image" hint="Необязательно.">
        <Input
          id="catalog-image"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
          maxLength={500}
        />
      </Field>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
        />
        <span>Показывать на сайте</span>
      </label>
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </Button>
        <Button type="submit" variant="primary" loading={mutation.isPending}>
          {item ? 'Сохранить' : 'Добавить'}
        </Button>
      </div>
    </form>
  );
}
