import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { ToastProvider } from '@/components/Toast';
import { Button } from '@/components/ui';
import { MetaProvider } from '@/lib/meta';
import { SessionProvider, useSession } from '@/lib/session';
import { ActivitiesPage } from '@/pages/ActivitiesPage';
import { LoginPage, RegisterPage } from '@/pages/AuthPages';
import { BuilderPage } from '@/pages/BuilderPage';
import { BuilderRequestsPage } from '@/pages/BuilderRequestsPage';
import { CompaniesPage } from '@/pages/CompaniesPage';
import { CompanyDetailPage } from '@/pages/CompanyDetailPage';
import { ContactDetailPage } from '@/pages/ContactDetailPage';
import { ContactsPage } from '@/pages/ContactsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DealDetailPage } from '@/pages/DealDetailPage';
import { DealsPage } from '@/pages/DealsPage';
import { LeadDetailPage } from '@/pages/LeadDetailPage';
import { LeadsPage } from '@/pages/LeadsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PublicSitePage } from '@/pages/PublicSitePage';
import { TasksPage } from '@/pages/TasksPage';

function SessionBoot() {
  return (
    <div className="boot-screen">
      <div className="boot-mark">fl</div>
      <div>
        <div className="boot-title">flakCRM</div>
        <div className="boot-text">Открываем рабочий стол…</div>
      </div>
      <div className="boot-loader" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function ProtectedShell({ children }: { children: ReactNode }) {
  const { session, loading, error } = useSession();
  const location = useLocation();

  if (loading) return <SessionBoot />;
  if (error) {
    return (
      <div className="boot-screen">
        <div style={{ width: 'min(520px, 100%)', textAlign: 'center' }}>
          <div className="boot-mark">fl</div>
          <div className="boot-title">Не удалось открыть кабинет</div>
          <div className="boot-text">Проверьте соединение с сервером и попробуйте снова.</div>
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Перезагрузить страницу
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return <MetaProvider>{children}</MetaProvider>;
}

export default function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="s/:slug" element={<PublicSitePage />} />
            <Route
              element={
                <ProtectedShell>
                  <AppShell />
                </ProtectedShell>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="deals" element={<DealsPage />} />
              <Route path="deals/:id" element={<DealDetailPage />} />
              <Route path="leads" element={<LeadsPage />} />
              <Route path="leads/:id" element={<LeadDetailPage />} />
              <Route path="companies" element={<CompaniesPage />} />
              <Route path="companies/:id" element={<CompanyDetailPage />} />
              <Route path="contacts" element={<ContactsPage />} />
              <Route path="contacts/:id" element={<ContactDetailPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="activities" element={<ActivitiesPage />} />
              <Route path="builder" element={<BuilderPage />} />
              <Route path="builder/requests" element={<BuilderRequestsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </SessionProvider>
  );
}
