import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { client } from '../lib/api/client';
import { env } from '../lib/env';
import type { Envelope, LoginIn, LoginOut, UserMe } from '../lib/api/types';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { tokenStore } from './tokenStore';

export type AuthContextValue = {
  user: UserMe | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserMe | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Bootstrap: restore user session if token exists or if VITE_AUTH_DISABLED is set
  useEffect(() => {
    const token = tokenStore.get();
    if (!token && !env.VITE_AUTH_DISABLED) {
      setLoading(false);
      return;
    }

    client
      .get<Envelope<UserMe>>('/users/me')
      .then((res) => {
        setUser(res.data.data);
      })
      .catch(() => {
        tokenStore.clear();
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const payload: LoginIn = { email, password };
    const { data } = await client.post<Envelope<LoginOut>>('/auth/login', payload);
    tokenStore.set(data.data.access_token);
    setUser(data.data.user);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {loading ? <FullPageSpinner /> : children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}
