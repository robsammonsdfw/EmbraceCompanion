// ============================================================================
// Bluetooth heart-rate monitors (react-native-ble-plx)
// ============================================================================
// Any strap that speaks the standard Heart Rate service (0x180D), measurement
// 0x2A37: Polar, Garmin, Wahoo, and WHOOP with "Broadcast heart rate" on.
//
//   ensureBluetooth()               permission, then 'granted' | 'denied' | 'blocked'
//   scanHeartRateMonitors(onFound)  returns stop(); only devices advertising 0x180D
//   connectHeartRate(id)            connects and starts readings; remembers the device
//   disconnectHeartRate()           stops for good (no reconnect)
//   onHeartRate(cb)                 every reading (bpm, time in ms); returns unsubscribe
//   useHeartRate()                  { status, device, bpm, at } for screens
//   lastHeartRateDevice()           the strap used last time, kept between activities
//
// Readings keep coming with the screen locked: iPhone has the bluetooth-central
// background mode (app.config.js); on Android the app stays alive with the
// tracking service during an activity. If the strap drops out it reconnects by
// itself (waits 2 s, then 4, 8 … up to 30 s) until disconnectHeartRate().
// ============================================================================

import { useSyncExternalStore } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, State, type Device, type Subscription } from 'react-native-ble-plx';

import type { PermissionResult } from './permissions';
import { db } from './storage';

const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';

export type HeartRateDevice = { id: string; name: string };
export type HeartRateStatus = 'off' | 'scanning' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable';
export type HeartRateState = { status: HeartRateStatus; device: HeartRateDevice | null; bpm: number | null; at: number | null };

let manager: BleManager | null = null;
const ble = () => (manager ??= new BleManager());

let state: HeartRateState = { status: 'off', device: null, bpm: null, at: null };
const listeners = new Set<() => void>();
const readingListeners = new Set<(bpm: number, t: number) => void>();
const set = (patch: Partial<HeartRateState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

export const useHeartRate = (): HeartRateState =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => state);

export const onHeartRate = (cb: (bpm: number, t: number) => void) => {
  readingListeners.add(cb);
  return () => { readingListeners.delete(cb); };
};

// ---- The strap used last time ------------------------------------------------------

let prefsReady = false;
const prefs = () => {
  if (!prefsReady) {
    db().execSync('CREATE TABLE IF NOT EXISTS shell_prefs (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    prefsReady = true;
  }
  return db();
};

export const lastHeartRateDevice = (): HeartRateDevice | null => {
  const row = prefs().getFirstSync<{ value: string }>("SELECT value FROM shell_prefs WHERE key = 'hr_device'");
  try { return row ? (JSON.parse(row.value) as HeartRateDevice) : null; } catch { return null; }
};
const remember = (d: HeartRateDevice) =>
  prefs().runSync("INSERT OR REPLACE INTO shell_prefs (key, value) VALUES ('hr_device', ?)", JSON.stringify(d));

// ---- Permission and Bluetooth state -----------------------------------------------------

/** Waits for Bluetooth to report a settled state (iPhone asks for permission here the first time). */
const settledState = () =>
  new Promise<State>((resolve) => {
    let done = false;
    let sub: Subscription | null = null;
    const finish = (s: State) => { if (done) return; done = true; sub?.remove(); resolve(s); };
    sub = ble().onStateChange((s) => { if (s !== State.Unknown && s !== State.Resetting) finish(s); }, true);
    setTimeout(() => { void ble().state().then(finish); }, 10_000);
  });

export const ensureBluetooth = async (): Promise<PermissionResult> => {
  if (Platform.OS === 'android') {
    const api = Number(Platform.Version);
    const needed = api >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const result = await PermissionsAndroid.requestMultiple(needed);
    const values = needed.map((p) => result[p]);
    if (values.some((v) => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) return 'blocked';
    if (values.some((v) => v !== PermissionsAndroid.RESULTS.GRANTED)) return 'denied';
  }
  const s = await settledState();
  if (s === State.Unauthorized) return 'blocked';
  if (s !== State.PoweredOn) {
    // Bluetooth is off (or the phone has none). Not a permission problem: the
    // screen shows 'unavailable' until it's turned on.
    set({ status: 'unavailable' });
    return 'denied';
  }
  return 'granted';
};

// ---- Scanning ---------------------------------------------------------------------------

export const scanHeartRateMonitors = (onFound: (d: HeartRateDevice) => void) => {
  const seen = new Set<string>();
  const before = state.status;
  set({ status: 'scanning' });
  void ble().startDeviceScan([HR_SERVICE], { allowDuplicates: false }, (error, device) => {
    if (error || !device || seen.has(device.id)) return;
    seen.add(device.id);
    onFound({ id: device.id, name: device.localName || device.name || 'Heart-rate monitor' });
  });
  return () => {
    void ble().stopDeviceScan();
    if (state.status === 'scanning') set({ status: before === 'scanning' ? 'off' : before });
  };
};

// ---- Readings ------------------------------------------------------------------------------

/** The Heart Rate Measurement value: flags byte, then 8- or 16-bit bpm. */
const parseMeasurement = (base64: string): number | null => {
  const raw = atob(base64);
  if (raw.length < 2) return null;
  const flags = raw.charCodeAt(0);
  const bpm = flags & 0x01 ? raw.charCodeAt(1) | (raw.charCodeAt(2) << 8) : raw.charCodeAt(1);
  return bpm > 0 && bpm < 255 ? bpm : null;
};

let wanted: HeartRateDevice | null = null;
let monitor: Subscription | null = null;
let dropWatch: Subscription | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2_000;

const clearLinks = () => {
  monitor?.remove(); monitor = null;
  dropWatch?.remove(); dropWatch = null;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
};

const scheduleReconnect = () => {
  if (!wanted || retryTimer) return;
  set({ status: 'reconnecting' });
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (wanted) void attach(wanted).catch(() => scheduleReconnect());
  }, retryDelay);
  retryDelay = Math.min(30_000, retryDelay * 2);
};

const attach = async (target: HeartRateDevice) => {
  monitor?.remove(); monitor = null;
  dropWatch?.remove(); dropWatch = null;
  const device: Device = await ble().connectToDevice(target.id, { autoConnect: Platform.OS === 'android', timeout: 15_000 });
  await device.discoverAllServicesAndCharacteristics();
  if (wanted?.id !== target.id) { await device.cancelConnection().catch(() => undefined); return; }
  dropWatch = ble().onDeviceDisconnected(target.id, () => {
    monitor?.remove(); monitor = null;
    if (wanted?.id === target.id) scheduleReconnect();
  });
  monitor = device.monitorCharacteristicForService(HR_SERVICE, HR_MEASUREMENT, (error, ch) => {
    if (error || !ch?.value) return;
    const bpm = parseMeasurement(ch.value);
    if (bpm == null) return;
    const t = Date.now();
    set({ bpm, at: t, status: 'connected' });
    readingListeners.forEach((l) => l(bpm, t));
  });
  retryDelay = 2_000;
  set({ status: 'connected', device: target });
};

export const connectHeartRate = async (id: string) => {
  const known = lastHeartRateDevice();
  const target: HeartRateDevice = { id, name: known?.id === id ? known.name : state.device?.id === id ? state.device.name : 'Heart-rate monitor' };
  if (wanted && wanted.id !== id) await disconnectHeartRate();
  wanted = target;
  clearLinks();
  set({ status: 'connecting', device: target, bpm: null, at: null });
  try {
    await ble().stopDeviceScan();
    // The name the strap advertises, when the system knows it.
    const [found] = await ble().devices([id]).catch(() => [] as Device[]);
    if (found?.localName || found?.name) target.name = found.localName || found.name || target.name;
    await attach(target);
    remember(target);
  } catch (e) {
    if (wanted?.id === id) scheduleReconnect();
    throw e;
  }
};

export const disconnectHeartRate = async () => {
  const id = wanted?.id ?? state.device?.id;
  wanted = null;
  clearLinks();
  set({ status: 'off', bpm: null, at: null });
  if (id) await ble().cancelDeviceConnection(id).catch(() => undefined);
};
