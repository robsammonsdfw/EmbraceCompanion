// ============================================================================
// The Run module's own storage (the app's one SQLite database, shell/storage).
// An activity is kept here from Start until its upload is done, so one that
// was interrupted (the app closed, the phone restarted) can be resumed or
// finished complete: its setup, every pause, sip, gel and target change, and
// which cues were already spoken. The GPS points are the shell's (track_points).
// ============================================================================

import { db } from '@/shell/storage';

import type { Fix, RunEvent } from './calc/engine';
import type { RunSetup } from './setup';

export type ActivityStatus = 'active' | 'finished' | 'discarded';

export interface Activity {
  clientRunId: string;
  sessionId: number;
  startedAt: number;
  setup: RunSetup;
  returnTo: string | null;
  cuesOn: boolean;
  status: ActivityStatus;
  finishedAt: number | null;
  /** Last time the dashboard was running, for telling how long the app was closed. */
  aliveAt: number;
  /** Steps counted so far (Android loses its count when the app closes). */
  steps: number;
}

type Row = {
  client_run_id: string; session_id: number; started_at: number; setup_json: string; return_to: string | null;
  cues_on: number; status: string; finished_at: number | null; alive_at: number; steps: number;
};

let ready = false;
const tables = () => {
  if (!ready) {
    db().execSync(`
      CREATE TABLE IF NOT EXISTS run_activities (
        client_run_id TEXT PRIMARY KEY,
        session_id INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        setup_json TEXT NOT NULL,
        return_to TEXT,
        cues_on INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        finished_at INTEGER,
        alive_at INTEGER NOT NULL,
        steps INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS run_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_run_id TEXT NOT NULL,
        t INTEGER NOT NULL,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS run_events_activity ON run_events (client_run_id, id);
      CREATE TABLE IF NOT EXISTS run_cues (
        client_run_id TEXT NOT NULL,
        cue_id TEXT NOT NULL,
        PRIMARY KEY (client_run_id, cue_id)
      );
      CREATE TABLE IF NOT EXISTS run_prefs (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    ready = true;
  }
  return db();
};

const toActivity = (r: Row): Activity => ({
  clientRunId: r.client_run_id, sessionId: r.session_id, startedAt: r.started_at,
  setup: JSON.parse(r.setup_json) as RunSetup, returnTo: r.return_to, cuesOn: r.cues_on === 1,
  status: r.status as ActivityStatus, finishedAt: r.finished_at, aliveAt: r.alive_at, steps: r.steps,
});

export const createActivity = (a: { clientRunId: string; sessionId: number; startedAt: number; setup: RunSetup; returnTo: string | null; cuesOn: boolean }) => {
  const d = tables();
  // Only one activity is ever in progress: an older one left open is closed as it stands.
  d.runSync("UPDATE run_activities SET status = 'discarded' WHERE status = 'active'");
  d.runSync(
    'INSERT INTO run_activities (client_run_id, session_id, started_at, setup_json, return_to, cues_on, alive_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    a.clientRunId, a.sessionId, a.startedAt, JSON.stringify(a.setup), a.returnTo, a.cuesOn ? 1 : 0, a.startedAt,
  );
};

/** The activity in progress, if any. */
export const activeActivity = (): Activity | null => {
  const r = tables().getFirstSync<Row>("SELECT * FROM run_activities WHERE status = 'active' ORDER BY started_at DESC LIMIT 1");
  return r ? toActivity(r) : null;
};

export const getActivity = (clientRunId: string): Activity | null => {
  const r = tables().getFirstSync<Row>('SELECT * FROM run_activities WHERE client_run_id = ?', clientRunId);
  return r ? toActivity(r) : null;
};

/** Finished activities, newest first: the ones whose upload may still be waiting. */
export const finishedActivities = (limit = 5): Activity[] =>
  tables().getAllSync<Row>("SELECT * FROM run_activities WHERE status = 'finished' ORDER BY finished_at DESC LIMIT ?", limit).map(toActivity);

export const markAlive = (clientRunId: string, t: number, steps: number) =>
  tables().runSync('UPDATE run_activities SET alive_at = ?, steps = ? WHERE client_run_id = ?', t, steps, clientRunId);

export const setStatus = (clientRunId: string, status: ActivityStatus, t: number) =>
  tables().runSync('UPDATE run_activities SET status = ?, finished_at = ? WHERE client_run_id = ?', status, t, clientRunId);

/** Removes an activity's own rows once it's uploaded and the member has left its Done screen. */
export const forgetActivity = (clientRunId: string) => {
  const d = tables();
  d.runSync('DELETE FROM run_events WHERE client_run_id = ?', clientRunId);
  d.runSync('DELETE FROM run_cues WHERE client_run_id = ?', clientRunId);
  d.runSync('DELETE FROM run_activities WHERE client_run_id = ?', clientRunId);
};

export const addEvent = (clientRunId: string, ev: RunEvent & { steps?: number }) =>
  tables().runSync('INSERT INTO run_events (client_run_id, t, json) VALUES (?, ?, ?)', clientRunId, ev.t, JSON.stringify(ev));

/** Events after `afterId`, oldest first. */
export const eventsAfter = (clientRunId: string, afterId: number): { id: number; ev: RunEvent & { steps?: number } }[] =>
  tables()
    .getAllSync<{ id: number; json: string }>('SELECT id, json FROM run_events WHERE client_run_id = ? AND id > ? ORDER BY id', clientRunId, afterId)
    .map((r) => ({ id: r.id, ev: JSON.parse(r.json) as RunEvent & { steps?: number } }));

export const cueSpoken = (clientRunId: string, cueId: string): boolean =>
  !!tables().getFirstSync('SELECT 1 FROM run_cues WHERE client_run_id = ? AND cue_id = ?', clientRunId, cueId);

export const markCue = (clientRunId: string, cueId: string) =>
  tables().runSync('INSERT OR IGNORE INTO run_cues (client_run_id, cue_id) VALUES (?, ?)', clientRunId, cueId);

type PointRow = { rowid: number; t: number; lat: number; lng: number; accuracy: number | null; speed: number | null; altitude: number | null };

/**
 * The shell's GPS points for a session after `afterRowId`, with speed and
 * altitude (its sessionPoints() leaves those out). Read only.
 */
export const pointsAfter = (sessionId: number, afterRowId: number): { lastRowId: number; fixes: Fix[] } => {
  const rows = tables().getAllSync<PointRow>(
    'SELECT rowid, t, lat, lng, accuracy, speed, altitude FROM track_points WHERE session_id = ? AND rowid > ? ORDER BY rowid',
    sessionId, afterRowId,
  );
  const fixes: Fix[] = rows.map((r) => ({ t: r.t, lat: r.lat, lng: r.lng, accuracy: r.accuracy, speed: r.speed, altitude: r.altitude }));
  fixes.sort((a, b) => a.t - b.t);
  return { lastRowId: rows.length ? rows[rows.length - 1].rowid : afterRowId, fixes };
};

/** The time of a session's newest point, or null. */
export const lastPointAt = (sessionId: number): number | null =>
  tables().getFirstSync<{ t: number | null }>('SELECT MAX(t) AS t FROM track_points WHERE session_id = ?', sessionId)?.t ?? null;

export const getPref = (key: string): string | null =>
  tables().getFirstSync<{ value: string }>('SELECT value FROM run_prefs WHERE key = ?', key)?.value ?? null;

export const setPref = (key: string, value: string) =>
  tables().runSync('INSERT INTO run_prefs (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
