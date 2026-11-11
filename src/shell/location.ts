// ============================================================================
// Location tracking that keeps going with the screen locked
// (COMPANION_APP_PLAN.md §2.5). The Run module uses this; it doesn't start
// location updates itself.
//
//   iPhone   UIBackgroundModes: location (app.config.ts). Started while the
//            app is open, so "While Using" permission is enough.
//   Android  A foreground service with a "Run in progress" notification.
//
// Every point is written to SQLite as it arrives, so a crash or a kill loses
// only the last few seconds, and the session can be finished on next open.
// This file must be imported at startup (src/app/_layout.tsx) so the task is
// defined before the system delivers points to it.
// ============================================================================

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { db } from './storage';

const TASK = 'embracehealthai-track';
const MAX_ACCURACY_M = 30; // points less precise than this don't count toward distance

export type TrackSession = { id: number; startedAt: number; stoppedAt: number | null };
export type TrackStats = {
  points: number;
  distanceM: number;
  lastPointAt: number | null;
  /** The longest time between two points: the sign tracking was paused by the phone. */
  longestGapS: number;
};

let ready = false;
const tables = () => {
  if (ready) return db();
  db().execSync(`
    CREATE TABLE IF NOT EXISTS track_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      stopped_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS track_points (
      session_id INTEGER NOT NULL,
      t INTEGER NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accuracy REAL,
      speed REAL,
      altitude REAL
    );
    CREATE INDEX IF NOT EXISTS track_points_session ON track_points (session_id, t);
  `);
  ready = true;
  return db();
};

type SessionRow = { id: number; started_at: number; stopped_at: number | null };
const toSession = (r: SessionRow): TrackSession => ({ id: r.id, startedAt: r.started_at, stoppedAt: r.stopped_at });

/** The session that was started and not stopped, if any (including one cut off by a crash or kill). */
export const activeSession = (): TrackSession | null => {
  const row = tables().getFirstSync<SessionRow>('SELECT * FROM track_sessions WHERE stopped_at IS NULL ORDER BY id DESC LIMIT 1');
  return row ? toSession(row) : null;
};

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const session = activeSession();
  if (!session) {
    // Nothing to record into: stop rather than drain the battery.
    await Location.stopLocationUpdatesAsync(TASK).catch(() => undefined);
    return;
  }
  const d = tables();
  d.withTransactionSync(() => {
    for (const p of data.locations) {
      d.runSync(
        'INSERT INTO track_points (session_id, t, lat, lng, accuracy, speed, altitude) VALUES (?, ?, ?, ?, ?, ?, ?)',
        session.id, p.timestamp, p.coords.latitude, p.coords.longitude, p.coords.accuracy ?? null, p.coords.speed ?? null, p.coords.altitude ?? null,
      );
    }
  });
});

/** Whether the phone is delivering points right now. */
export const isTracking = () => Location.hasStartedLocationUpdatesAsync(TASK);

type Notice = { title: string; body: string };

const startUpdates = (notice: Notice) =>
  Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    activityType: Location.ActivityType.Fitness,
    distanceInterval: 3,
    timeInterval: 1000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: notice.title,
      notificationBody: notice.body,
      notificationColor: '#08B8A0',
      killServiceOnDestroy: false,
    },
  });

/**
 * Starts a new session and location updates. Call only after
 * ensureLocation() returned 'granted', while the app is on screen.
 */
export const startTracking = async (notice: Notice): Promise<TrackSession> => {
  const d = tables();
  const now = Date.now();
  const existing = activeSession();
  if (existing) d.runSync('UPDATE track_sessions SET stopped_at = ? WHERE id = ?', now, existing.id);
  const res = d.runSync('INSERT INTO track_sessions (started_at) VALUES (?)', now);
  await startUpdates(notice);
  return { id: res.lastInsertRowId, startedAt: now, stoppedAt: null };
};

/** Picks the open session back up after the app was closed or crashed. */
export const resumeTracking = async (notice: Notice) => {
  if (!(await isTracking())) await startUpdates(notice);
};

/** Stops location updates and closes the open session. */
export const stopTracking = async () => {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(TASK);
  const session = activeSession();
  if (session) tables().runSync('UPDATE track_sessions SET stopped_at = ? WHERE id = ?', Date.now(), session.id);
};

const metersBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

type PointRow = { t: number; lat: number; lng: number; accuracy: number | null };

/** The points of a session, oldest first. */
export const sessionPoints = (sessionId: number): PointRow[] =>
  tables().getAllSync<PointRow>('SELECT t, lat, lng, accuracy FROM track_points WHERE session_id = ? ORDER BY t', sessionId);

export const sessionStats = (sessionId: number): TrackStats => {
  const points = sessionPoints(sessionId);
  let distanceM = 0;
  let longestGapMs = 0;
  let lastGood: PointRow | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) longestGapMs = Math.max(longestGapMs, p.t - points[i - 1].t);
    if (p.accuracy != null && p.accuracy > MAX_ACCURACY_M) continue;
    if (lastGood) distanceM += metersBetween(lastGood, p);
    lastGood = p;
  }
  return {
    points: points.length,
    distanceM,
    lastPointAt: points.length ? points[points.length - 1].t : null,
    longestGapS: Math.round(longestGapMs / 1000),
  };
};
