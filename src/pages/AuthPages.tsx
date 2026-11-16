import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Vertical } from '@shared/site';
import { verticalLabels } from '@shared/site';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/hooks';
import { Button, Field, Input } from '@/components/ui';
import { Icon } from '@/components/Icon';

const verticalHints: Record<Vertical, string> = {
  restaurant: 'Меню, бронь столиков, заявки в CRM',
  service: 'Услуги, выезд мастера, заявки в CRM',
  tourism: 'Номера, бронирование проживания, заявки в CRM',
};

function AuthAside() {
  return (
    <aside className="auth-aside">
      <Link to="/" className="auth-brand">
        <span className="brand-mark">fl</span>
        <span>
          flak<span>CRM</span>
        </span>
      </Link>
      <div className="auth-aside-main">
        <div className="auth-eyebrow">Сеть бизнесов</div>
        <h1>Один кабинет — все ваши бизнесы</h1>
        <p>
          Настройте сайт под свой бизнес за несколько минут. Заявки гостей сразу
          попадают в CRM, а данные каждого бизнеса изолированы.
        </p>
        <div className="auth-verticals">
          {(Object.keys(verticalLabels) as Vertical[]).map((vertical) => (
            <div className="auth-vertical" key={vertical}>
              <Icon
                name={
                  vertical === 'restaurant' ? 'spark' : vertical === 'service' ? 'tasks' : 'building'
                }
                size={18}
              />
              <div>
                <strong>{verticalLabels[vertical]}</strong>
                <span>{verticalHints[vertical]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="auth-aside-foot">
        Один сервер · отдельная база у каждого бизнеса · общая сеть
      </div>
    </aside>
  );
}

export function LoginPage() {
  const { signIn, session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn({ email: email.trim(), password });
      navigate(from, { replace: true });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = () => {
    setEmail('owner@flakcrm.ru');
    setPassword('demo12345');
    setError(null);
  };

  if (session) return <Navigate to={from} replace />;

  return (
    <div className="auth-screen">
      <AuthAside />
      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-head">
            <h2>Вход в кабинет</h2>
            <p>Управляйте бизнесом, сайтом и заявками в одном месте.</p>
          </div>
          <form onSubmit={submit} className="stack-sm" noValidate>
            {error ? (
              <div className="form-error" role="alert">
                {errorMessage(error)}
              </div>
            ) : null}
            <Field label="Email" htmlFor="login-email" required>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="owner@example.ru"
                data-autofocus
              />
            </Field>
            <Field label="Пароль" htmlFor="login-password" required>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <Button type="submit" variant="primary" size="lg" loading={busy}>
              Войти
            </Button>
          </form>
          <button type="button" className="auth-demo" onClick={fillDemo}>
            <b>Демо-доступ</b>
            <span>owner@flakcrm.ru · demo12345</span>
          </button>
          <div className="auth-switch">
            Ещё нет кабинета? <Link to="/register">Создать бизнес</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export function RegisterPage() {
  const { signUp, session } = useSession();
  const navigate = useNavigate();
  const [vertical, setVertical] = useState<Vertical>('restaurant');
  const [businessName, setBusinessName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setClientError(null);    if (!businessName.trim()) {
      setClientError('Укажите название бизнеса.');
      return;
    }
    if (!name.trim()) {
      setClientError('Укажите ваше имя.');
      return;
    }
    if (password.length < 8 || !/[a-zA-Zа-яА-Я]/.test(password) || !/\d/.test(password)) {
      setClientError('Пароль — от 8 символов, хотя бы одна буква и одна цифра.');
      return;
    }
    setBusy(true);
    try {
      await signUp({
        businessName: businessName.trim(),
        vertical,
        email: email.trim(),
        name: name.trim(),
        password,
      });
      navigate('/', { replace: true });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  if (session) return <Navigate to="/" replace />;

  return (
    <div className="auth-screen">
      <AuthAside />
      <main className="auth-panel">
        <div className="auth-card auth-card-wide">
          <div className="auth-card-head">
            <h2>Создать кабинет</h2>
            <p>Выберите шаблон — интерфейс и сайт настроятся под ваш бизнес.</p>
          </div>
          <form onSubmit={submit} className="stack-sm" noValidate>
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
            <div className="vertical-grid" role="radiogroup" aria-label="Тип бизнеса">
              {(Object.keys(verticalLabels) as Vertical[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={vertical === item ? 'vertical-choice active' : 'vertical-choice'}
                  onClick={() => setVertical(item)}
                  role="radio"
                  aria-checked={vertical === item}
                >
                  <strong>{verticalLabels[item]}</strong>
                  <span>{verticalHints[item]}</span>
                </button>
              ))}
            </div>
            <Field label="Название бизнеса" htmlFor="reg-business" required>
              <Input
                id="reg-business"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Например, «Тихий дворик»"
                maxLength={120}
                data-autofocus
              />
            </Field>
            <div className="form-grid">
              <Field label="Ваше имя" htmlFor="reg-name" required>
                <Input
                  id="reg-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Как к вам обращаться"
                  maxLength={120}
                />
              </Field>
              <Field label="Email" htmlFor="reg-email" required>
                <Input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="owner@example.ru"
                />
              </Field>
            </div>
            <Field
              label="Пароль"
              htmlFor="reg-password"
              hint="От 8 символов, хотя бы одна буква и одна цифра."
              required
            >
              <Input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Придумайте пароль"
              />
            </Field>
            <Button type="submit" variant="primary" size="lg" loading={busy}>
              Создать бизнес
            </Button>
          </form>
          <div className="auth-switch">
            Уже есть кабинет? <Link to="/login">Войти</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
