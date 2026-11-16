import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCreateDeal, useTasks } from '@/api/queries';
import { networkApi } from '@/api/network';
import { useAppMeta } from '@/lib/meta';
import { useSession } from '@/lib/session';
import { CommandPalette } from './CommandPalette';
import { DealForm, type DealFormValues } from './forms';
import { Icon, type IconName } from './Icon';
import { TenantSwitcher } from './TenantSwitcher';
import { useToast } from './Toast';
import { Avatar, Button, Modal } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  badge?: number;
}

export function AppShell() {
  const meta = useAppMeta();
  const { signOut } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [dealError, setDealError] = useState<unknown>(null);

  const openTasks = useTasks({ status: 'open', page: 1, pageSize: 1 });
  const siteRequests = useQuery({
    queryKey: ['network-requests'],
    queryFn: networkApi.requests,
    staleTime: 30_000,
  });
  const createDeal = useCreateDeal();
  const newRequests = siteRequests.data?.filter((request) => request.leadStatus === 'new').length;

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const submitDeal = async (values: DealFormValues) => {
    try {
      setDealError(null);
      const deal = await createDeal.mutateAsync(values);
      toast.push('Сделка создана', 'success');
      setDealOpen(false);
      navigate(`/deals/${deal.id}`);
    } catch (error) {
      setDealError(error);
    }
  };

  const groups: Array<{ label: string; items: NavItem[] }> = [
    {
      label: 'Сайт бизнеса',
      items: [
        { to: '/builder', label: 'Конструктор', icon: 'spark', end: true },
        {
          to: '/builder/requests',
          label: 'Заявки с сайта',
          icon: 'calendar',
          badge: newRequests,
        },
      ],
    },
    {
      label: 'Продажи',
      items: [
        { to: '/', label: 'Обзор', icon: 'dashboard', end: true },
        { to: '/deals', label: 'Сделки', icon: 'deals' },
        { to: '/leads', label: 'Лиды', icon: 'leads' },
      ],
    },
    {
      label: 'База',
      items: [
        { to: '/companies', label: 'Компании', icon: 'companies' },
        { to: '/contacts', label: 'Контакты', icon: 'contacts' },
      ],
    },
    {
      label: 'Работа',
      items: [
        {
          to: '/tasks',
          label: 'Задачи',
          icon: 'tasks',
          badge: openTasks.data?.page.total,
        },
        { to: '/activities', label: 'Активности', icon: 'activities' },
      ],
    },
  ];

  return (
    <div className={navOpen ? 'app-shell nav-open' : 'app-shell'}>
      <a className="skip-link" href="#main-content">
        К содержимому
      </a>

      <aside className="sidebar" aria-label="Основная навигация">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            fl
          </div>
          <div>
            <div className="brand-name">
              flak<span>CRM</span>
            </div>
            <div className="brand-sub">Бизнес · CRM · сайт</div>
          </div>
        </div>

        <TenantSwitcher />

        <nav className="sidebar-nav">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="nav-section">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                >
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                  {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <Avatar name={meta.currentUser.name} />
            <div style={{ minWidth: 0 }}>
              <div className="user-chip-name">{meta.currentUser.name}</div>
              <div className="user-chip-mail">{meta.currentUser.email}</div>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-logout"
            onClick={() => {
              void signOut();
              navigate('/login');
            }}
          >
            <Icon name="logout" size={16} />
            <span>Выйти</span>
          </button>
        </div>
      </aside>

      <div
        className={navOpen ? 'nav-backdrop show' : 'nav-backdrop'}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-toggle"
            onClick={() => setNavOpen((current) => !current)}
            aria-label={navOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={navOpen}
          >
            <Icon name={navOpen ? 'close' : 'menu'} size={18} />
          </button>

          <div className="topbar-spacer" />

          <button
            type="button"
            className="topbar-search"
            onClick={() => setSearchOpen(true)}
            aria-label="Поиск по CRM (Ctrl или Cmd K)"
          >
            <Icon name="search" size={16} />
            <span className="topbar-search-text">Поиск по CRM…</span>
            <span className="kbd">⌘K</span>
          </button>

          <Button
            variant="primary"
            size="sm"
            icon="plus"
            onClick={() => {
              setDealError(null);
              setDealOpen(true);
            }}
          >
            <span className="topbar-add-label">Новая сделка</span>
          </Button>
        </header>

        <main className="content" id="main-content">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />

      <Modal
        open={dealOpen}
        onClose={() => setDealOpen(false)}
        title="Новая сделка"
        description="Быстрое создание из любого экрана"
        size="lg"
      >
        {dealOpen ? (
          <DealForm
            onSubmit={submitDeal}
            submitting={createDeal.isPending}
            error={dealError}
            onCancel={() => setDealOpen(false)}
          />
        ) : null}
      </Modal>
    </div>
  );
}
