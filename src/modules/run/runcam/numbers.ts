// ============================================================================
// Runcam's numbers: what is laid over the camera's picture, read from the
// tracker at one moment. Distance, how fast right now, and how fast this
// split is going (Share Aura's Runcam shows distance, pace and split pace).
// On a ride, speed stands in for pace.
//
// They are worked out with the dashboard's own formatters, so the picture
// always says what the screen said. No React and no phone calls here.
// ============================================================================

import { calculatePace, formatSpeed, METERS_TO_KM, METERS_TO_MILES } from '../calc/constants';
import type { RunEngine } from '../calc/engine';
import { RunMode, type Unit } from '../calc/types';

export interface LiveNumber { label: string; value: string; unit: string }
export interface LiveNumbers { distance: LiveNumber; now: LiveNumber; split: LiveNumber }

/** A number as a share graphic prints it (iStride's ShareFact). */
export interface ShotFact { key: string; label: string; text: string; short: string; words: string }

/** The activity so far, as the share drawing code reads an activity (iStride's ShareRun). */
export interface ShotRun {
  id: string;
  startTime: number;
  timezone: string | null;
  mode: string;
  title: string | null;
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters: number | null;
  calories: null;
  avgHeartRate: null;
  route: { lat: number; lng: number }[];
  splits: { label: string; seconds: number; pace: string }[];
  gear: null;
}

/** Everything a picture is drawn from, kept with the shot so it can be redrawn in another design. */
export interface ShotDraw { run: ShotRun; unit: Unit; lead: ShotFact[] }

/** A split this short has no steady pace yet; the last finished one is shown until it has. */
const MIN_SPLIT_M = 50;

export const liveNumbers = (e: RunEngine): LiveNumbers => {
  const unit = e.cfg.unit;
  const imperial = unit === 'imperial';
  const du = imperial ? 'mi' : 'km';
  const ride = e.kind === 'ride';
  const paceMax = e.kind === 'walk' || e.kind === 'heartwalk' ? 3600 : 1200;
  const rate = (mps: number) => (ride ? formatSpeed(mps, unit) : calculatePace(mps, unit, paceMax));
  const rateUnit = ride ? (imperial ? 'mph' : 'kph') : `/${du}`;

  const sp = e.currentSplit();
  const last = e.splits.length ? e.splits[e.splits.length - 1] : null;
  const splitSpeed = sp.meters >= MIN_SPLIT_M && sp.seconds > 0 ? sp.meters / sp.seconds
    : last && last.timeSeconds > 0 ? e.cfg.splitDistance / last.timeSeconds
    : e.elapsedTime > 0 ? e.totalDistance / e.elapsedTime : 0;
  const splitWord = e.cfg.mode === RunMode.TRACK ? 'Lap' : 'Split';

  return {
    distance: { label: 'Distance', value: (e.totalDistance * (imperial ? METERS_TO_MILES : METERS_TO_KM)).toFixed(2), unit: du },
    now: { label: ride ? 'Speed' : 'Pace', value: rate(e.isPaused ? 0 : e.currentSpeed), unit: rateUnit },
    split: { label: `${splitWord} ${ride ? 'speed' : 'pace'}`, value: rate(splitSpeed), unit: rateUnit },
  };
};

const fact = (key: string, n: LiveNumber): ShotFact => {
  // "8:07/mi" reads as one thing; "15.8 mph" and "2.31 mi" keep their space.
  const short = n.unit.startsWith('/') ? `${n.value}${n.unit}` : `${n.value} ${n.unit}`;
  return { key, label: n.label, text: `${n.value} ${n.unit}`, short, words: short };
};

/** The three numbers, in the order a picture prints them. */
export const shotFacts = (e: RunEngine): ShotFact[] => {
  const n = liveNumbers(e);
  return [fact('distance', n.distance), fact(e.kind === 'ride' ? 'speed' : 'pace', n.now), fact('split', n.split)];
};

/**
 * The activity so far for the drawing code. The route is left out on purpose:
 * the Companion doesn't know the member's privacy zones, so pictures made here
 * never draw where they have been. Route designs are made from the report in
 * iStride, which cuts the route at those zones. Calories and heart rate are
 * left out too; iStride keeps them off a picture until the member ticks them.
 */
export const shotRun = (e: RunEngine, clientRunId: string, timezone: string | null): ShotRun => ({
  id: clientRunId,
  startTime: e.cfg.startedAt,
  timezone,
  mode: e.cfg.mode,
  title: null,
  distanceMeters: e.totalDistance,
  durationSeconds: e.elapsedTime,
  elevationGainMeters: e.elevationGain > 0 ? e.elevationGain : null,
  calories: null,
  avgHeartRate: null,
  route: [],
  splits: e.splits.map((s) => ({ label: s.distanceLabel, seconds: s.timeSeconds, pace: s.pace })),
  gear: null,
});

export const shotDraw = (e: RunEngine, clientRunId: string, timezone: string | null): ShotDraw =>
  ({ run: shotRun(e, clientRunId, timezone), unit: e.cfg.unit, lead: shotFacts(e) });

/** "2.31 mi · 8:07/mi": the line saved with a photo added to the activity. */
export const shotCaption = (lead: ShotFact[]): string => lead.slice(0, 2).map((f) => f.short).join(' · ');
