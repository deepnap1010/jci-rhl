// client/src/context/AuthContext.tsx
// ============================================================
//  AUTH CONTEXT  —  real login state
//
//  Holds the logged-in User + JWT. The token is persisted in
//  localStorage (see api/client.ts) so a refresh keeps you in.
//  On mount we restore the session by calling /api/auth/me.
//
//  Everything downstream reads `user` / `role` to drive the
//  sidebar nav and to scope API calls.
// ============================================================
import { useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { AuthResponse, User } from '@shared/types';
import { api, setAuthToken, getAuthToken } from '../api/client';
import { Ctx } from './auth.ts';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // restore session on first load if a token is present
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!getAuthToken()) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get<{ user: User }>('/api/auth/me');
        if (!cancelled) setUser(data.user);
      } catch {
        setAuthToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restore();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/api/auth/login', { email, password });
    setAuthToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api.post('/api/auth/change-password', { currentPassword, newPassword });
    // password changed → clear the "must change" flag locally
    setUser((u) => (u ? { ...u, mustChangePassword: false } : u));
  }, []);

  return (
    <Ctx.Provider value={{ user, role: user?.role ?? null, loading, login, logout, changePassword }}>
      {children}
    </Ctx.Provider>
  );
}
