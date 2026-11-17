// Copied from iStride (TempoRun services/heartZones.ts, commit ea7c71d). The live numbers must match the
// web dashboard, so keep this identical to that file: change it there first.

/**
 * Heart-rate zones as a share of maximum heart rate (the common five-zone
 * model used by Garmin, Polar and Fitbit):
 *   Z1 50–60%  Warm-up      Z2 60–70%  Fat burn / easy endurance
 *   Z3 70–80%  Aerobic      Z4 80–90%  Threshold      Z5 90–100%  Max
 * Max HR comes from the runner if they know it, otherwise from age with
 * Tanaka's formula (208 − 0.7 × age), which fits adults better than 220 − age.
 */

export interface ZoneInfo { zone: number; name: string; short: string; color: string; lo: number; hi: number }

export const ZONES: ZoneInfo[] = [
  { zone: 1, name: 'Warm-up',   short: 'Easy',      color: '#60a5fa', lo: 0.50, hi: 0.60 },
  { zone: 2, name: 'Fat burn',  short: 'Endurance', color: '#22c55e', lo: 0.60, hi: 0.70 },
  { zone: 3, name: 'Aerobic',   short: 'Cardio',    color: '#eab308', lo: 0.70, hi: 0.80 },
  { zone: 4, name: 'Threshold', short: 'Hard',      color: '#f97316', lo: 0.80, hi: 0.90 },
  { zone: 5, name: 'Maximum',   short: 'Max',       color: '#ef4444', lo: 0.90, hi: 1.00 },
];

export const tanakaMax = (age: number) => Math.round(208 - 0.7 * age);

/** The max HR to use: the runner's own number, else from age, else null. */
export const resolveMaxHr = (override: number | null | undefined, age: number | null | undefined): number | null => {
  if (override && override >= 120 && override <= 230) return Math.round(override);
  if (age && age > 0) return tanakaMax(age);
  return null;
};

/** 0 = below zone 1 (resting), 1–5 = zones. */
export const zoneOf = (bpm: number, maxHr: number): number => {
  const f = bpm / maxHr;
  if (f < ZONES[0].lo) return 0;
  for (let i = ZONES.length - 1; i >= 0; i--) if (f >= ZONES[i].lo) return ZONES[i].zone;
  return 0;
};

/** Whole-bpm range of a zone, e.g. zone 2 at max 180 → [108, 125]. */
export const zoneRange = (zone: number, maxHr: number): [number, number] => {
  const z = ZONES[zone - 1];
  return [Math.round(z.lo * maxHr), Math.round(z.hi * maxHr) - 1];
};

/** Seconds spent below zone 1 and in zones 1–5, indexed 0–5. */
export type ZoneSeconds = [number, number, number, number, number, number];
export const emptyZoneSeconds = (): ZoneSeconds => [0, 0, 0, 0, 0, 0];
