import { createContext, useContext, type ReactNode } from 'react';
import type { Meta } from '@shared/types';
import { useMeta } from '@/api/queries';
import { Button, ErrorState } from '@/components/ui';

const MetaContext = createContext<Meta | null>(null);

export function MetaProvider({ children }: { children: ReactNode }) {
  const query = useMeta();

  if (query.isPending) {
    return (
      <div className="boot-screen">
        <div className="boot-mark">fl</div>
        <div>
          <div className="boot-title">flakCRM</div>
          <div className="boot-text">Загружаем рабочий стол…</div>
        </div>
        <div className="boot-loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="boot-screen">
        <div style={{ width: 'min(520px, 100%)' }}>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Перезагрузить страницу
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <MetaContext.Provider value={query.data}>{children}</MetaContext.Provider>;
}

export function useAppMeta(): Meta {
  const meta = useContext(MetaContext);
  if (!meta) throw new Error('useAppMeta используется вне MetaProvider.');
  return meta;
}
