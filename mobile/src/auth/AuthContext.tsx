import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authApi } from '../api/services';
import { ApiError, setApiToken, setUnauthorizedHandler } from '../api/client';
import { startDeviceUnregistration } from '../notifications/pushNotifications';
import type { User } from '../types/api';
import { isSessionExpired } from './sessionPolicy';
export { IDLE_LOGOUT_AFTER_MS } from './sessionPolicy';

const TOKEN_KEY = 'library_access_token';
export const LAST_ACTIVITY_KEY = 'library_last_activity_at';

interface RegisterValues {
  name: string;
  member_id: string;
  email: string;
  password: string;
  password_confirmation: string;
}

interface AuthContextValue {
  user: User | null;
  isRestoring: boolean;
  login(email: string, password: string): Promise<void>;
  register(values: RegisterValues): Promise<void>;
  updateProfile(name: string): Promise<void>;
  logout(): Promise<void>;
  clearSession(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const clearSession = useCallback(async () => {
    setApiToken(null);
    setUser(null);
    await queryClient.cancelQueries();
    queryClient.clear();
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(LAST_ACTIVITY_KEY),
    ]);
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    void (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!token) return;

        const storedActivity = Number(await SecureStore.getItemAsync(LAST_ACTIVITY_KEY));
        if (isSessionExpired(storedActivity)) {
          await clearSession();
          return;
        }

        setApiToken(token);
        const response = await authApi.me();
        if (response.data.role !== 'user') {
          await clearSession();
          return;
        }
        setUser(response.data);
      } catch {
        await clearSession();
      } finally {
        setIsRestoring(false);
      }
    })();
  }, [clearSession]);

  const saveAuth = useCallback(async (token: string, nextUser: User) => {
    if (nextUser.role !== 'user') {
      // The shared API can authenticate admins for the web panel. Revoke the
      // token just created by that attempt before rejecting the mobile login.
      setApiToken(token);
      try {
        await authApi.logout();
      } finally {
        setApiToken(null);
      }
      throw new ApiError('This Android app is for library members. Use the web panel for admin access.', 403);
    }
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(LAST_ACTIVITY_KEY, String(Date.now())),
    ]);
    setApiToken(token);
    setUser(nextUser);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email.trim().toLowerCase(), password);
    await saveAuth(response.data.token, response.data.user);
  }, [saveAuth]);

  const register = useCallback(async (values: RegisterValues) => {
    const response = await authApi.register({
      ...values,
      email: values.email.trim().toLowerCase(),
    });
    await saveAuth(response.data.token, response.data.user);
  }, [saveAuth]);

  const logout = useCallback(async () => {
    // Start authenticated requests before clearing the token, but never keep
    // the protected UI visible while waiting for an offline network timeout.
    setUser(null);
    const unregister = await startDeviceUnregistration().catch(() => null);
    const revoke = authApi.logout().catch(() => undefined);
    await clearSession();
    void Promise.all([unregister?.completion, revoke]);
  }, [clearSession]);

  const updateProfile = useCallback(async (name: string) => {
    const response = await authApi.updateProfile(name.trim());
    setUser(response.data);
  }, []);

  const value = useMemo(
    () => ({ user, isRestoring, login, register, updateProfile, logout, clearSession }),
    [user, isRestoring, login, register, updateProfile, logout, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
