import { useState, type CSSProperties, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { PublicSite, SiteItem, SiteRequestResult, SiteRequestInput } from '@shared/site';
import { verticalLabels } from '@shared/site';
import { networkApi } from '@/api/network';
import { addDays, formatMoney } from '@/lib/format';
import { errorMessage } from '@/lib/hooks';
import { Button, Field, Input, LoadingBlock, Textarea } from '@/components/ui';
import { Icon } from '@/components/Icon';

const today = (): string => new Date().toISOString().slice(0, 10);

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function itemSuffix(site: PublicSite): string {
  return site.vertical === 'tourism' ? ' / ночь' : '';
}

function PublicRequestForm({ site }: { site: PublicSite }) {
  const tomorrow = addDays(today(), 1);
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [requestedDate, setRequestedDate] = useState(
    site.vertical === 'restaurant' || site.vertical === 'tourism' ? tomorrow : '',
  );
  const [requestedTime, setRequestedTime] = useState(
    site.vertical === 'restaurant' ? '19:00' : '',
  );
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState('2');
  const [itemId, setItemId] = useState('');
  const [comment, setComment] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<SiteRequestResult | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setClientError(null);
    setError(null);
    if (!guestName.trim()) {
      setClientError('Как к вам обращаться?');
      return;
    }
    if (!phone.trim()) {
      setClientError('Оставьте телефон — мы позвоним для подтверждения.');
      return;
    }
    if (site.vertical === 'restaurant' && (!requestedDate || !requestedTime)) {
      setClientError('Выберите дату и время.');
      return;
    }
    if (site.vertical === 'tourism' && !requestedDate) {
      setClientError('Выберите дату заезда.');
      return;
    }

    const input: SiteRequestInput = {
      guestName: guestName.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      requestedDate: requestedDate || null,
      requestedTime: requestedTime || null,
      checkOut: checkOut || null,
      guests: guests ? Number(guests) : null,
      itemId: itemId ? Number(itemId) : null,
      comment: comment.trim() || null,
    };

    setBusy(true);
    try {
      const response = await networkApi.createPublicRequest(site.slug, input);
      setResult(response);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="site-success" role="status">
        <div className="site-success-icon">
          <Icon name="check" size={26} />
        </div>
        <h3>Заявка принята</h3>
        <p>{result.message}</p>
        <div className="site-success-code">
          Код заявки <strong>{result.code}</strong>
        </div>
        <p className="site-success-hint">
          Сохраните код — по нему мы быстро найдём вашу заявку.
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            setResult(null);
            setComment('');
          }}
        >
          Отправить ещё одну
        </Button>
      </div>
    );
  }

  const cta =
    site.vertical === 'restaurant'
      ? 'Забронировать столик'
      : site.vertical === 'service'
        ? 'Оставить заявку'
        : 'Забронировать проживание';

  return (
    <form className="site-form" onSubmit={submit} noValidate>
      <h2>{cta}</h2>
      <p className="site-form-lead">
        {site.vertical === 'restaurant'
          ? 'Оставьте контакты — подтвердим бронь звонком.'
          : site.vertical === 'service'
            ? 'Опишите задачу — мастер свяжется и назовёт стоимость.'
            : 'Выберите даты — мы проверим свободные номера и перезвоним.'}
      </p>

      {clientError ? (
        <div className="form-error" role="alert">
          {clientError}
        </div>
      ) : null}
      {error ? (
        <div className="form-error" role="alert">
          {errorMessage(error)}
        </div>
      ) : null}

      <div className="site-form-grid">
        <Field label="Ваше имя" htmlFor="pub-name" required>
          <Input
            id="pub-name"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            autoComplete="name"
            maxLength={120}
            placeholder="Имя"
            data-autofocus
          />
        </Field>
        <Field label="Телефон" htmlFor="pub-phone" required>
          <Input
            id="pub-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            maxLength={32}
            placeholder="+7 (928) 000-00-00"
          />
        </Field>

        {site.vertical === 'restaurant' ? (
          <>
            <Field label="Дата" htmlFor="pub-date" required>
              <Input
                id="pub-date"
                type="date"
                min={today()}
                value={requestedDate}
                onChange={(event) => setRequestedDate(event.target.value)}
              />
            </Field>
            <Field label="Время" htmlFor="pub-time" required>
              <Input
                id="pub-time"
                type="time"
                value={requestedTime}
                onChange={(event) => setRequestedTime(event.target.value)}
              />
            </Field>
            <Field label="Гостей" htmlFor="pub-guests" required>
              <select
                id="pub-guests"
                className="select"
                value={guests}
                onChange={(event) => setGuests(event.target.value)}
              >
                {Array.from({ length: 12 }).map((_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1} {plural(index + 1, 'гость', 'гостя', 'гостей')}
                  </option>
                ))}
                <option value="16">Больше 12 — обсудим</option>
              </select>
            </Field>
          </>
        ) : null}

        {site.vertical === 'service' ? (
          <>
            <Field label="Желаемая дата" htmlFor="pub-date" hint="Можно не указывать.">
              <Input
                id="pub-date"
                type="date"
                min={today()}
                value={requestedDate}
                onChange={(event) => setRequestedDate(event.target.value)}
              />
            </Field>
            {site.items.length ? (
              <Field label="Услуга" htmlFor="pub-item">
                <select
                  id="pub-item"
                  className="select"
                  value={itemId}
                  onChange={(event) => setItemId(event.target.value)}
                >
                  <option value="">Подберите вместе с мастером</option>
                  {site.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </>
        ) : null}

        {site.vertical === 'tourism' ? (
          <>
            <Field label="Заезд" htmlFor="pub-date" required>
              <Input
                id="pub-date"
                type="date"
                min={today()}
                value={requestedDate}
                onChange={(event) => setRequestedDate(event.target.value)}
              />
            </Field>
            <Field label="Выезд" htmlFor="pub-checkout" hint="Можно уточнить по телефону.">
              <Input
                id="pub-checkout"
                type="date"
                min={requestedDate || today()}
                value={checkOut}
                onChange={(event) => setCheckOut(event.target.value)}
              />
            </Field>
            <Field label="Гостей" htmlFor="pub-guests" required>
              <Input
                id="pub-guests"
                inputMode="numeric"
                value={guests}
                onChange={(event) => setGuests(event.target.value.replace(/[^\d]/g, ''))}
              />
            </Field>
            {site.items.length ? (
              <Field label="Номер" htmlFor="pub-item">
                <select
                  id="pub-item"
                  className="select"
                  value={itemId}
                  onChange={(event) => setItemId(event.target.value)}
                >
                  <option value="">Подберите вместе с нами</option>
                  {site.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </>
        ) : null}

        <Field label="Email" htmlFor="pub-email" hint="Необязательно.">
          <Input
            id="pub-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            maxLength={254}
            placeholder="you@example.ru"
          />
        </Field>

        <Field
          label={site.vertical === 'restaurant' ? 'Пожелания' : 'Комментарий'}
          htmlFor="pub-comment"
          className="site-form-span"
        >
          <Textarea
            id="pub-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={
              site.vertical === 'restaurant'
                ? 'Столик у окна, детский стул, день рождения…'
                : site.vertical === 'service'
                  ? 'Что случилось и когда удобно принять мастера'
                  : 'Сколько гостей, нужна ли парковка, ранний заезд…'
            }
          />
        </Field>
      </div>

      <Button type="submit" variant="primary" size="lg" loading={busy}>
        {cta}
      </Button>
      <p className="site-form-note">
        Нажимая кнопку, вы соглашаетесь на обработку персональных данных. Мы
        используем контакты только для ответа на заявку.
      </p>
    </form>
  );
}

function SiteItemCard({ site, item }: { site: PublicSite; item: SiteItem }) {
  return (
    <article className="site-item" style={{ ['--brand' as string]: site.brandColor }}>
      <div
        className="site-item-art"
        style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
      >
        {!item.imageUrl ? (
          <span>{item.kind === 'dish' ? '🍽' : item.kind === 'room' ? '🛏' : '🛠'}</span>
        ) : null}
      </div>
      <div className="site-item-body">
        <div className="site-item-head">
          <h3>{item.name}</h3>
          <div className="site-item-price">
            {item.priceMinor == null
              ? 'По запросу'
              : item.priceMinor === 0
                ? 'Бесплатно'
                : formatMoney(item.priceMinor, 'RUB')}
            {item.priceMinor ? itemSuffix(site) : ''}
          </div>
        </div>
        {item.description ? <p>{item.description}</p> : null}
        <div className="site-item-meta">
          {item.durationMin ? <span>{item.durationMin} мин</span> : null}
          {item.capacity ? <span>до {item.capacity} гостей</span> : null}
        </div>
      </div>
    </article>
  );
}

export function PublicSitePage() {
  const { slug = '' } = useParams();
  const query = useQuery({
    queryKey: ['public-site', slug],
    queryFn: () => networkApi.publicSite(slug),
    retry: false,
  });

  if (query.isPending) {
    return (
      <div className="site-loading">
        <div className="brand-mark">fl</div>
        <LoadingBlock rows={3} />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="site-missing">
        <div className="brand-mark">fl</div>
        <h1>Сайт не найден</h1>
        <p>Возможно, ссылка изменилась или бизнес ещё не опубликовал сайт.</p>
        <a className="btn btn-secondary" href="/login">
          Войти в кабинет
        </a>
      </div>
    );
  }

  const site = query.data;
  const heroStyle: CSSProperties = {
    ['--brand' as string]: site.brandColor,
  };
  const catalogTitle =
    site.vertical === 'restaurant' ? 'Меню' : site.vertical === 'service' ? 'Услуги' : 'Номера';
  const cta =
    site.vertical === 'restaurant'
      ? 'Забронировать столик'
      : site.vertical === 'service'
        ? 'Оставить заявку'
        : 'Забронировать проживание';

  return (
    <div className="site" style={heroStyle}>
      <header className="site-nav">
        <a href="#top" className="site-brand">
          <span className="site-brand-mark">{site.name.slice(0, 1)}</span>
          <span>{site.name}</span>
        </a>
        <div className="site-nav-right">
          {site.phone ? (
            <a className="site-nav-phone" href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}>
              {site.phone}
            </a>
          ) : null}
          <a className="site-nav-cta" href="#request">
            {cta}
          </a>
        </div>
      </header>

      <section className="site-hero" id="top">
        <div
          className="site-hero-bg"
          style={site.coverUrl ? { backgroundImage: `url(${site.coverUrl})` } : undefined}
        />
        <div className="site-hero-shade" />
        <div className="site-hero-inner">
          <div className="site-eyebrow">
            {site.city ? `${site.city} · ` : ''}
            {verticalLabels[site.vertical]}
          </div>
          <h1>{site.name}</h1>
          {site.tagline ? <p className="site-tagline">{site.tagline}</p> : null}
          <div className="site-hero-actions">
            <a className="site-cta" href="#request">
              {cta}
            </a>
            <a className="site-cta ghost" href="#catalog">
              Смотреть {catalogTitle.toLowerCase()}
            </a>
          </div>
          <div className="site-hero-meta">
            {site.address ? (
              <span>
                <Icon name="building" size={16} /> {site.address}
              </span>
            ) : null}
            {site.workingHours ? (
              <span>
                <Icon name="clock" size={16} /> {site.workingHours}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <main className="site-main">
        {site.description ? (
          <section className="site-about">
            <div className="site-section-eyebrow">О нас</div>
            <p>{site.description}</p>
            <div className="site-facts">
              {site.city ? (
                <div className="site-fact">
                  <span>Город</span>
                  <strong>{site.city}</strong>
                </div>
              ) : null}
              {site.phone ? (
                <div className="site-fact">
                  <span>Телефон</span>
                  <a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}>{site.phone}</a>
                </div>
              ) : null}
              {site.workingHours ? (
                <div className="site-fact">
                  <span>Часы работы</span>
                  <strong>{site.workingHours}</strong>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {site.items.length ? (
          <section className="site-catalog" id="catalog">
            <div className="site-section-head">
              <div>
                <div className="site-section-eyebrow">
                  {site.vertical === 'restaurant'
                    ? 'Готовим каждый день'
                    : site.vertical === 'service'
                      ? 'Чем помогаем'
                      : 'Где остановиться'}
                </div>
                <h2>{catalogTitle}</h2>
              </div>
              <a className="site-text-link" href="#request">
                {cta} →
              </a>
            </div>
            <div className="site-items">
              {site.items.map((item) => (
                <SiteItemCard key={item.id} site={site} item={item} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="site-booking" id="request">
          <div className="site-booking-info">
            <div className="site-section-eyebrow">Заявка</div>
            <h2>
              {site.vertical === 'restaurant'
                ? 'Забронируйте столик'
                : site.vertical === 'service'
                  ? 'Расскажите о задаче'
                  : 'Забронируйте проживание'}
            </h2>
            <p>
              {site.vertical === 'restaurant'
                ? 'Оставьте дату, время и число гостей. Мы перезвоним и подтвердим бронь.'
                : site.vertical === 'service'
                  ? 'Опишите поломку или задачу. Мастер свяжется, уточнит детали и назовёт стоимость.'
                  : 'Выберите даты заезда и выезда. Мы проверим свободные номера и перезвоним.'}
            </p>
            <div className="site-booking-points">
              <span>
                <Icon name="check" size={16} /> Ответим в рабочее время
              </span>
              <span>
                <Icon name="check" size={16} /> Не берём предоплату онлайн
              </span>
              <span>
                <Icon name="check" size={16} /> Заявка сразу попадает в CRM
              </span>
            </div>
            {site.phone ? (
              <div className="site-booking-phone">
                <span>Или позвоните</span>
                <a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}>{site.phone}</a>
              </div>
            ) : null}
          </div>
          <PublicRequestForm site={site} />
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <strong>{site.name}</strong>
          <span>
            {[site.city, site.address].filter(Boolean).join(', ') || verticalLabels[site.vertical]}
          </span>
        </div>
        <div className="site-footer-right">
          {site.email ? <a href={`mailto:${site.email}`}>{site.email}</a> : null}
          <span>Работает на flakCRM</span>
        </div>
      </footer>
    </div>
  );
}
