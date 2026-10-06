import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { AppState, View, Text, Pressable } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authApi } from './src/api/services';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, IDLE_LOGOUT_AFTER_MS, LAST_ACTIVITY_KEY, useAuth } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { isSessionExpired } from './src/auth/sessionPolicy';

const ACTIVITY_PERSIST_INTERVAL_MS = 15_000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    mutations: { retry: 0 },
  },
});

function IdleSessionGuard({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const lastActivityAt = useRef(Date.now());
  const lastPersistedActivityAt = useRef(0);
  const activityRevision = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutStarted = useRef(false);
  const lastHeartbeat = useRef(0);
  const [warning, setWarning] = useState(false);

  const clearTimeoutIfScheduled = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
  }, []);

  const scheduleIdleLogout = useCallback(() => {
    clearTimeoutIfScheduled();
    if (!user || logoutStarted.current) return;

    const remaining = Math.max(0, IDLE_LOGOUT_AFTER_MS - (Date.now() - lastActivityAt.current));
    timeout.current = setTimeout(() => {
      if (isSessionExpired(lastActivityAt.current)) {
        logoutStarted.current = true;
        void logout().catch(() => undefined);
      } else {
        scheduleIdleLogout();
      }
    }, remaining);
  }, [clearTimeoutIfScheduled, logout, user?.id]);

  const markActivity = useCallback(() => {
    if (!user || logoutStarted.current) return;
    const now = Date.now();
    // Check the deadline BEFORE accepting a touch after resume.
    if (isSessionExpired(lastActivityAt.current, now)) {
      logoutStarted.current = true;
      void logout().catch(() => undefined);
      return;
    }
    setWarning(false);
    if (now - lastHeartbeat.current >= 15_000) {
      lastHeartbeat.current = now;
      void authApi.activity().catch(() => undefined);
    }
    lastActivityAt.current = now;
    activityRevision.current += 1;
    if (now - lastPersistedActivityAt.current >= ACTIVITY_PERSIST_INTERVAL_MS) {
      lastPersistedActivityAt.current = now;
      void SecureStore.setItemAsync(LAST_ACTIVITY_KEY, String(now)).catch(() => undefined);
    }
    scheduleIdleLogout();
  }, [scheduleIdleLogout, logout, user?.id]);

  useEffect(() => {
    clearTimeoutIfScheduled();
    if (!user) {
      logoutStarted.current = false;
      setWarning(false);
      return;
    }

    logoutStarted.current = false;
    lastActivityAt.current = Date.now();
    lastHeartbeat.current = 0;
    const warningTimer = setInterval(() => {
      setWarning(Date.now() - lastActivityAt.current >= 9 * 60 * 1000);
    }, 1000);
    const revisionAtRestore = activityRevision.current;
    let cancelled = false;
    void SecureStore.getItemAsync(LAST_ACTIVITY_KEY).then((value) => {
      if (cancelled || revisionAtRestore !== activityRevision.current) return;
      const storedActivityAt = Number(value);
      if (Number.isFinite(storedActivityAt) && storedActivityAt > 0) {
        lastActivityAt.current = storedActivityAt;
      }
      lastPersistedActivityAt.current = Date.now();

      if (isSessionExpired(lastActivityAt.current)) {
        logoutStarted.current = true;
        void logout().catch(() => undefined);
        return;
      }
      scheduleIdleLogout();
    }).catch(() => {
      if (!cancelled) scheduleIdleLogout();
    });

    const subscription = AppState.addEventListener('change', (state) => {
      if (logoutStarted.current) return;
      if (state !== 'active') {
        void SecureStore.setItemAsync(LAST_ACTIVITY_KEY, String(lastActivityAt.current)).catch(() => undefined);
        return;
      }

      if (isSessionExpired(lastActivityAt.current)) {
        logoutStarted.current = true;
        void logout().catch(() => undefined);
      } else {
        scheduleIdleLogout();
      }
    });

    return () => {
      cancelled = true;
      clearInterval(warningTimer);
      clearTimeoutIfScheduled();
      subscription.remove();
    };
  }, [clearTimeoutIfScheduled, logout, scheduleIdleLogout, user?.id]);

  return (
    <View style={{ flex: 1 }} onTouchStart={markActivity}>
      {children}
      {user && warning && <View accessibilityRole="alert" style={{ position: 'absolute', top: 60, left: 16, right: 16, padding: 16, backgroundColor: '#FFF4CE', borderRadius: 12 }}>
        <Text style={{ color: '#442A00' }}>You will be signed out after 10 minutes without activity.</Text>
        <Pressable onPress={markActivity} accessibilityRole="button"><Text style={{ fontWeight: '700', paddingTop: 8 }}>Stay signed in</Text></Pressable>
      </View>}
    </View>
  );
}

export default function App() {
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => focusManager.setFocused(state === 'active'));
    return () => subscription.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <IdleSessionGuard>
            <StatusBar style="light" />
            <RootNavigator />
          </IdleSessionGuard>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
