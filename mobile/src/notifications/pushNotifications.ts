import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { pushDeviceApi } from '../api/services';

const PUSH_DEVICE_ID_KEY = 'library_push_device_id';

export async function currentPushDeviceId(): Promise<number> {
  const id = Number(await SecureStore.getItemAsync(PUSH_DEVICE_ID_KEY));
  if (!id) throw new Error('Register this phone first using Register / retry this phone.');
  return id;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushRegistrationResult =
  | { status: 'ready' }
  | { status: 'permission-denied'; message: string }
  | { status: 'unavailable'; message: string };

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;

  return process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    ?? Constants.easConfig?.projectId
    ?? extra?.eas?.projectId;
}

const TOKEN_ATTEMPTS = 3;

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Firebase/Google Play services can briefly return SERVICE_NOT_AVAILABLE when
 * a device has just connected to a network. Retry before treating registration
 * as unavailable; the token is only sent to the API after it is obtained.
 */
async function getExpoPushToken(projectId: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= TOKEN_ATTEMPTS; attempt += 1) {
    try {
      return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (error) {
      lastError = error;
      if (attempt < TOKEN_ATTEMPTS) await pause(attempt * 1_500);
    }
  }

  throw lastError;
}

/**
 * Registers the current physical device only after Android notification
 * permission is granted. This is intentionally separate from login so that a
 * member can decline push alerts and still use the library application.
 */
export async function registerCurrentDevice(requestPermission: boolean): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return { status: 'unavailable', message: 'Push notifications require a physical Android device.' };
  }

  // Android 13+ requires a channel BEFORE requesting notification permission
  // or obtaining an FCM/Expo token.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('library-reminders', {
      name: 'Library reminders', importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  let permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== 'granted' && requestPermission) {
    permissions = await Notifications.requestPermissionsAsync();
  }

  if (permissions.status !== 'granted') {
    return { status: 'permission-denied', message: 'Notification permission was not granted.' };
  }

  const currentProjectId = projectId();
  if (!currentProjectId) {
    return {
      status: 'unavailable',
      message: 'Push notifications are not configured in this app build yet. Contact the librarian or developer.',
    };
  }

  let expoPushToken: string;
  try {
    expoPushToken = await getExpoPushToken(currentProjectId);
  } catch {
    return {
      status: 'unavailable',
      message: 'Google Play services could not create a notification token. Check your internet connection, update Google Play services, then try again.',
    };
  }
  const response = await pushDeviceApi.register({
    expo_push_token: expoPushToken,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  await SecureStore.setItemAsync(PUSH_DEVICE_ID_KEY, String(response.data.id));

  return { status: 'ready' };
}

/** Removes this phone from the account when the member signs out. */
export async function unregisterCurrentDevice(): Promise<void> {
  const { completion } = await startDeviceUnregistration();
  await completion;
}

// Resolves after the request has captured its authorization header, not after
// the network responds. Logout can then clear local credentials immediately.
export async function startDeviceUnregistration(): Promise<{ completion: Promise<void> }> {
  const deviceId = await SecureStore.getItemAsync(PUSH_DEVICE_ID_KEY);
  const completion = (deviceId ? pushDeviceApi.unregister(Number(deviceId)) : Promise.resolve())
    .then(() => undefined).catch(() => undefined);
  await SecureStore.deleteItemAsync(PUSH_DEVICE_ID_KEY);
  return { completion };
}
