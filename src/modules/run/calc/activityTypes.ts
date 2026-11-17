// Copied from iStride (TempoRun services/activityTypes.ts, commit ea7c71d). The live numbers must match the
// web dashboard, so keep this identical to that file: change it there first.

import { RunMode } from './types';

/**
 * One place that knows what each activity mode is. Tracked activities are
 * saved with their mode (ACADEMY, CYCLING, HEART_WALK…) and manual entries
 * with run / ride / walk / hike / trail_run. Goals, challenges and clubs
 * think in sports, so everything maps through here (and the backend's
 * sportForMode, which matches).
 */

/** Go Run tiles, in order. */
export const RUN_MODES: RunMode[] = [
  RunMode.ACADEMY, RunMode.TRAIL, RunMode.TRACK, RunMode.ENDURANCE, RunMode.CASUAL, RunMode.HIIT,
];
/** Go Exercise tiles, in order. */
export const EXERCISE_MODES: RunMode[] = [
  RunMode.HIIT, RunMode.CYCLING, RunMode.WALKING, RunMode.HEART_WALK,
];

/** Which live dashboard and which calorie model an activity uses. */
export type ActivityKind = 'run' | 'hiit' | 'ride' | 'walk' | 'heartwalk';
export const kindOfMode = (mode: string | null | undefined): ActivityKind => {
  const m = String(mode || '').toLowerCase();
  if (m === 'hiit') return 'hiit';
  if (m === 'cycling' || m === 'ride' || m === 'bike') return 'ride';
  if (m === 'heart_walk') return 'heartwalk';
  if (m === 'walking' || m === 'walk') return 'walk';
  return 'run';
};

export type Sport = 'run' | 'ride' | 'walk' | 'hike';
/** Same mapping as the backend: what goals and challenges count it as. */
export const sportOfMode = (mode: string | null | undefined): Sport => {
  const m = String(mode || '').toLowerCase();
  if (m === 'ride' || m === 'cycling' || m === 'bike') return 'ride';
  if (m === 'walk' || m === 'walking' || m === 'heart_walk') return 'walk';
  if (m === 'hike' || m === 'hiking') return 'hike';
  return 'run';
};

/** Short name for lists and feed cards. */
export const activityLabel = (mode: string | null | undefined): string => {
  const m = String(mode || '').toLowerCase();
  switch (m) {
    case 'hiit':       return 'HIIT';
    case 'cycling': case 'ride': case 'bike': return 'Ride';
    case 'heart_walk': return 'Heart Walk';
    case 'walking': case 'walk': return 'Walk';
    case 'hike': case 'hiking': return 'Hike';
    case 'trail': case 'trail_run': return 'Trail Run';
    default: return 'Run';
  }
};

/** Name on the setup screen and tiles ("Cycling", "Heart Walk", "Academy"). */
export const modeTitle = (mode: RunMode): string => {
  switch (mode) {
    case RunMode.HIIT: return 'HIIT';
    case RunMode.CYCLING: return 'Cycling';
    case RunMode.WALKING: return 'Walking';
    case RunMode.HEART_WALK: return 'Heart Walk';
    default: return mode.charAt(0) + mode.slice(1).toLowerCase();
  }
};

/**
 * Fastest believable GPS speed, m/s. A fix implying more is a glitch. Bikes
 * reach 60–70 mph downhill, so a ride allows up to 80 mph; on foot it stays
 * at 27 mph (faster than any sprinter).
 */
export const maxSpeedFor = (kind: ActivityKind) => (kind === 'ride' ? 35.8 : 12);

/** Highest target speed the ▲▼ allow, in mph or kph. */
export const maxTargetFor = (kind: ActivityKind, unit: 'imperial' | 'metric') =>
  kind === 'ride' ? (unit === 'imperial' ? 80 : 130) : (unit === 'imperial' ? 25 : 40);

/** Where the ▲▼ start when there's no target and you're standing still. */
export const defaultTargetFor = (kind: ActivityKind, unit: 'imperial' | 'metric') =>
  kind === 'ride' ? (unit === 'imperial' ? 15 : 25)
  : kind === 'walk' || kind === 'heartwalk' ? (unit === 'imperial' ? 3 : 5)
  : (unit === 'imperial' ? 6 : 10);

/** Badge text: a run's training mode (ACADEMY…), otherwise the activity name. */
export const modeBadge = (mode: string | null | undefined): string =>
  kindOfMode(mode) === 'run' && mode && /^[A-Z]+$/.test(mode) ? mode : activityLabel(mode);
