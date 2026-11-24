// Permissions the tools need. Each is asked right before the tool uses it,
// never at first launch (COMPANION_APP_PLAN.md §2.7).

import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Pedometer } from 'expo-sensors';
import { PermissionsAndroid, Platform } from 'react-native';
import { VisionCamera } from 'react-native-vision-camera';

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

/** Motion, for counting steps on walks (expo-sensors Pedometer). */
export const ensureMotion = async (): Promise<PermissionResult> => {
  const current = await Pedometer.getPermissionsAsync();
  if (current.granted) return 'granted';
  const asked = await Pedometer.requestPermissionsAsync();
  if (asked.granted) return 'granted';
  return asked.canAskAgain ? 'denied' : 'blocked';
};

/** The camera, for the pulse check (PulseCamera.tsx) and Runcam (RunCamera.tsx). */
export const ensureCamera = async (): Promise<PermissionResult> => {
  const status = VisionCamera.cameraPermissionStatus;
  if (status === 'authorized') return 'granted';
  if (status === 'denied' || status === 'restricted') return 'blocked';
  return (await VisionCamera.requestCameraPermission()) ? 'granted' : 'blocked';
};

/**
 * Saving a Runcam photo or clip to the member's photo library. Save-only: the
 * Companion never asks to read the library.
 *   iPhone        the "add only" Photos permission.
 *   Android 13+   nothing to ask: an app may add its own files to the gallery.
 *   Android 7–12  the storage permission.
 */
export const ensurePhotoSave = async (): Promise<PermissionResult> => {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) return 'granted';
  const current = await MediaLibrary.getPermissionsAsync(true);
  if (current.granted) return 'granted';
  const asked = await MediaLibrary.requestPermissionsAsync(true);
  if (asked.granted) return 'granted';
  return asked.canAskAgain ? 'denied' : 'blocked';
};
