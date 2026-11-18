// The activity as it's saved: the same body iStride's web app posts to
// POST /runs (TempoRun services/apiService.ts saveRunToDatabase with App.tsx
// runExtras), plus client_run_id so a save sent twice is one run.

import { kindOfMode } from './activityTypes';
import type { RunEngine } from './engine';
import type { GeoPoint } from './types';

/** A very long ride has more points than the server takes in one request. */
const MAX_ROUTE_POINTS = 12000;

const thin = (route: GeoPoint[]): GeoPoint[] => {
  if (route.length <= MAX_ROUTE_POINTS) return route;
  const step = Math.ceil(route.length / MAX_ROUTE_POINTS);
  const out = route.filter((_, i) => i % step === 0);
  const last = route[route.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
};

export interface PayloadExtras {
  clientRunId: string;
  timezone: string;
  routeId: number | null;
  hrPre: { bpm: number; confidence: number; source: string } | null;
  /** Steps on a walk; null when the phone doesn't count them. */
  steps: number | null;
  gear: { gear_id?: number | null; ride_shoe_id?: number | null; kit_id?: number | null; worn_ids?: number[] };
  weather: Record<string, unknown> | null;
}

export const buildRunPayload = (e: RunEngine, x: PayloadExtras) => {
  const kind = kindOfMode(e.cfg.mode);
  const plan = e.hiitPlan;
  const st = e.hrStats;
  return {
    client_run_id: x.clientRunId,
    start_time: new Date(e.cfg.startedAt).toISOString(),
    mode: e.cfg.mode,
    duration_seconds: e.elapsedTime,
    distance_meters: e.totalDistance,
    calories_burned: e.caloriesBurned,
    // Average, max and time in zone are a monitor's only. Never a placeholder.
    avg_heart_rate: st.n > 0 ? Math.round(st.sum / st.n) : null,
    hr_pre: x.hrPre?.bpm ?? null,
    hr_source: x.hrPre?.source ?? null,
    hr_confidence: x.hrPre?.confidence ?? null,
    elevation_gain: e.elevationGain ?? 0,
    route: JSON.stringify(thin(e.route)),
    splits: e.splits,
    intervals: e.intervals,
    summary_completed: false, // the member finishes the report in iStride
    timezone: x.timezone,
    route_id: x.routeId,
    max_heart_rate: st.max || null,
    hr_zone_seconds: st.n > 0 ? { max_hr: e.cfg.maxHr, seconds: st.zones.map((v) => Math.round(v)) } : null,
    workout_json: {
      kind,
      ...(kind === 'heartwalk' ? { target_zone: e.cfg.targetZone } : {}),
      ...((kind === 'walk' || kind === 'heartwalk') && x.steps !== null ? { steps: x.steps } : {}),
      ...(kind === 'hiit' && plan ? { hiit: plan.manual ? { manual: true } : { ...plan } } : {}),
      hr_source: st.n > 0 ? 'monitor' : null,
      // Which tracker recorded it, to compare against the web's.
      gps_mode: 'companion',
      // For the report: the member's unit, and when the activity really ended
      // (the reading after it is timed from here).
      unit: e.cfg.unit,
      ended_at: new Date(e.finishedAt ?? e.clock).toISOString(),
      // For filling in Fitbit's heart rate once it syncs: the zones' max, and
      // the pauses (Fitbit's readings while paused don't count).
      max_hr: e.cfg.maxHr,
      pauses: e.pauses.map(([a, b]) => [new Date(a).toISOString(), new Date(b ?? e.finishedAt ?? e.clock).toISOString()]),
    },
    ...x.gear,
    weather: x.weather,
  };
};
