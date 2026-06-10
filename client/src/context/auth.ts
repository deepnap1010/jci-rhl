import { createContext, useContext } from 'react';
import type { Role, User } from '@shared/types';

export interface AuthCtx {
  user: User | null;
  role: Role | null; // convenience = user?.role
  loading: boolean; // true while we restore the session on load
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export const Ctx = createContext<AuthCtx>({
  user: null,
  role: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  changePassword: async () => {},
});

export const useAuth = () => useContext(Ctx);
