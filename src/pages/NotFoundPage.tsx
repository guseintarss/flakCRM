import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui';
import { usePageTitle } from '@/lib/hooks';

export function NotFoundPage() {
  usePageTitle('Страница не найдена');

  return (
    <div className="page">
      <PageHeader
        eyebrow={<Link to="/">← На обзор</Link>}
        title="Страница не найдена"
        subtitle="Такого адреса в workspace нет. Возможно, запись удалена или ссылка устарела."
      />
      <div className="panel notfound">
        <div className="notfound-code">404</div>
        <div className="empty-title">Здесь пусто</div>
        <div className="empty-text">
          Вернитесь к обзору или откройте раздел слева — все рабочие списки доступны из навигации.
        </div>
        <Link className="btn btn-primary" to="/">
          На обзор
        </Link>
      </div>
    </div>
  );
}
