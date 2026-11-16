import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Vertical } from '@shared/site';
import { verticalLabels } from '@shared/site';
import { errorMessage } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { useToast } from './Toast';
import { Button, Field, Input, Modal, Select } from './ui';
import { Icon } from './Icon';

export function TenantSwitcher() {
  const { session, switchTenant, createTenant } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [switching, setSwitching] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [vertical, setVertical] = useState<Vertical>('restaurant');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!session) return null;

  const changeTenant = async (tenantId: number) => {
    if (tenantId === session.tenant.id) return;
    setSwitching(true);
    try {
      await switchTenant(tenantId);
      if (!location.pathname.startsWith('/builder')) navigate('/');
      toast.push('Бизнес переключён', 'success');
    } catch (cause) {
      toast.push(errorMessage(cause), 'error');
    } finally {
      setSwitching(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(new Error('Укажите название бизнеса.'));
      return;
    }
    setBusy(true);
    try {
      const tenant = await createTenant({ name: name.trim(), vertical });
      await switchTenant(tenant.id);
      setOpen(false);
      setName('');
      toast.push('Бизнес создан', 'success');
      navigate('/builder');
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tenant-switcher">
      <label className="tenant-switcher-label" htmlFor="tenant-select">
        Бизнес
      </label>
      <div className="tenant-switcher-row">
        <Select
          id="tenant-select"
          value={session.tenant.id}
          disabled={switching}
          onChange={(event) => void changeTenant(Number(event.target.value))}
        >
          {session.tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </Select>
        <button
          type="button"
          className="tenant-add"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          aria-label="Добавить бизнес"
          title="Добавить бизнес"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      <div className="tenant-switcher-type">
        {verticalLabels[session.tenant.vertical]}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Новый бизнес"
        description="У каждого бизнеса своя база данных, сайт и заявки."
        size="sm"
      >
        <form onSubmit={submit} className="stack-sm" noValidate>
          {error ? (
            <div className="form-error" role="alert">
              {errorMessage(error)}
            </div>
          ) : null}
          <Field label="Название" htmlFor="new-business-name" required>
            <Input
              id="new-business-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Например, «Тихий дворик»"
              data-autofocus
            />
          </Field>
          <Field label="Шаблон" htmlFor="new-business-vertical" required>
            <Select
              id="new-business-vertical"
              value={vertical}
              onChange={(event) => setVertical(event.target.value as Vertical)}
            >
              {(Object.keys(verticalLabels) as Vertical[]).map((value) => (
                <option key={value} value={value}>
                  {verticalLabels[value]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Создать и настроить
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
