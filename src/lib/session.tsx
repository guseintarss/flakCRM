import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LoginInput,
  NetworkTenant,
  RegisterInput,
  SessionInfo,
  TenantCreateInput,
} from '@shared/network';
import { ApiError } from '@/api/client';
import { networkApi } from '@/api/network';

interface SessionContextValue {
  session: SessionInfo | null;
  loading: boolean;
  error: unknown;
  signIn(input: LoginInput): Promise<SessionInfo>;
  signUp(input: RegisterInput): Promise<SessionInfo>;
  signOut(): Promise<void>;
  switchTenant(tenantId: number): Promise<void>;
  createTenant(input: TenantCreateInput): Promise<NetworkTenant>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function loadSession(): Promise<SessionInfo | null> {
  try {
    return await networkApi.me();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['session'],
    queryFn: loadSession,
    retry: false,
    staleTime: Infinity,
  });

  const replaceSession = useCallback(
    (session: SessionInfo | null) => {
      queryClient.setQueryData(['session'], session);
      // Данные CRM привязаны к бизнесу. Сбрасываем их, но не сам запрос
      // сессии: clear() удалил бы активный observer и кабинет не обновился.
      void queryClient.resetQueries({
        predicate: (query) => query.queryKey[0] !== 'session',
      });
    },
    [queryClient],
  );

  const signIn = useCallback(
    async (input: LoginInput) => {
      const session = await networkApi.login(input);
      replaceSession(session);
      return session;
    },
    [replaceSession],
  );

  const signUp = useCallback(
    async (input: RegisterInput) => {
      const session = await networkApi.register(input);
      replaceSession(session);
      return session;
    },
    [replaceSession],
  );

  const signOut = useCallback(async () => {
    try {
      await networkApi.logout();
    } finally {
      replaceSession(null);
    }
  }, [replaceSession]);

  const switchTenant = useCallback(
    async (tenantId: number) => {
      const session = await networkApi.switchTenant(tenantId);
      replaceSession(session);
    },
    [replaceSession],
  );

  const createTenant = useCallback(
    async (input: TenantCreateInput) => {
      const tenant = await networkApi.createTenant(input);
      return tenant;
    },
    [],
  );

  return (
    <SessionContext.Provider
      value={{
        session: query.data ?? null,
        loading: query.isPending,
        error: query.error,
        signIn,
        signUp,
        signOut,
        switchTenant,
        createTenant,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession используется вне SessionProvider.');
  return value;
}
