// Permissions the tools need. Each is asked right before the tool uses it,
// never at first launch (COMPANION_APP_PLAN.md §2.7).

import * as Location from 'expo-location';
import { PermissionsAndroid, Platform } from 'react-native';

export type PermissionResult = 'granted' | 'denied' | 'blocked';

/** Location while using the app, which covers a run started in the app. */
export const ensureLocation = async (): Promise<PermissionResult> => {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return 'granted';
  const asked = await Location.requestForegroundPermissionsAsync();
  if (asked.granted) return 'granted';
  return asked.canAskAgain ? 'denied' : 'blocked';
};

/**
 * Android 13+ shows the "Run in progress" notification only with this
 * permission. Tracking keeps working without it.
 */
export const ensureAndroidNotifications = async (): Promise<void> => {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
};
