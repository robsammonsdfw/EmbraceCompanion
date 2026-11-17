// ============================================================================
// The activity in progress: one for the whole app, alive across screens.
//
// Once a second it reads the new GPS points (the shell stores them, screen
// locked or not) and the member's new actions, lets the tracker work out the
// numbers (calc/engine.ts), speaks any cue that's due, and tells the screens
// to redraw. Every action is written to storage first, so an activity whose
// app was closed can be rebuilt exactly and resumed or finished.
// ============================================================================

import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { istride } from '@/shell/api';
import { connectHeartRate, disconnectHeartRate, lastHeartRateDevice, onHeartRate } from '@/shell/heartRate';
import type { LngLat } from '@/shell/ActivityMap';
import { activeSession, resumeTracking, startTracking, stopTracking, updateNotice } from '@/shell/location';
import { ensureAndroidNotifications } from '@/shell/permissions';
import { prepareAudio } from '@/shell/speech';
import { startSteps, type StepCounter } from '@/shell/steps';
import { enqueueUpload } from '@/shell/uploads';

import { ACADEMY_PLAN, splitWord } from './calc/academy';
import { activityLabel, kindOfMode } from './calc/activityTypes';
import { calculatePace, formatClock, formatSpeed, METERS_TO_KM, METERS_TO_MILES } from './calc/constants';
import { nextTargetDistance, nextTargetSpeed, RunEngine, type RunEvent } from './calc/engine';
import { hiitCue, hiitPhases } from './calc/hiit';
import { buildRunPayload } from './calc/payload';
import { RunMode } from './calc/types';
import { engineConfig, type RunSetup } from './setup';
import {
  activeActivity, addEvent, createActivity, cueSpoken, eventsAfter, getPref, lastPointAt, markAlive, markCue, pointsAfter, setStatus,
  type Activity,
} from './store';
import { beep, hush, prefetch, say } from './voice';

/** A cue older than this when its turn comes is skipped (the app was closed, or the phone was busy). */
const CUE_MAX_AGE_MS = 20_000;
/** Longer than this without the dashboard running or a point arriving: the activity was interrupted. */
const GAP_MS = 15_000;
const HEARTBEAT_MS = 60_000;

interface Live {
  activity: Activity;
  engine: RunEngine;
  pointCursor: number;
  eventCursor: number;
  handledCues: Set<string>;
  nextCue: number;
  pendingCues: number[];
  counter: StepCounter | null;
  /** Steps the counter has reported, including any taken while paused. */
  rawSteps: number;
  /** Steps taken while paused, left out of the total. */
  hiddenSteps: number;
  pauseMark: number | null;
  /** Android: steps counted before the app was last closed. */
  stepBase: number;
  stepSamples: { t: number; n: number }[];
  cadence: number;
  line: LngLat[];
  lineLength: number;
  lastHeartbeat: number;
  ticks: number;
}

let live: Live | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version += 1; listeners.forEach((l) => l()); };

/** Re-renders with every step of the activity. */
export const useLive = (): Live | null => {
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => version, () => version);
  return live;
};
export const currentLive = () => live;

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/** Active steps: what the walk tile shows and what's saved. */
export const activeSteps = (l: Live) =>
  Math.max(0, l.rawSteps - l.hiddenSteps - (l.pauseMark !== null ? l.rawSteps - l.pauseMark : 0));

/**
 * The Android notification's words while tracking (R8): "[Run] in progress",
 * with time, distance and pace (speed on a ride).
 */
export const trackingNotice = (mode: RunMode, engine: RunEngine | null) => {
  const title = `${activityLabel(mode)} in progress`;
  if (!engine) return { title, body: 'EmbraceHealthAI Companion is tracking your route.' };
  const unit = engine.cfg.unit;
  const dist = `${(engine.totalDistance * (unit === 'imperial' ? METERS_TO_MILES : METERS_TO_KM)).toFixed(2)} ${unit === 'imperial' ? 'mi' : 'km'}`;
  const avg = engine.elapsedTime > 0 ? engine.totalDistance / engine.elapsedTime : 0;
  const rate = engine.kind === 'ride'
    ? `${formatSpeed(avg, unit)} ${unit === 'imperial' ? 'mph' : 'kph'}`
    : `${calculatePace(avg, unit, engine.kind === 'walk' || engine.kind === 'heartwalk' ? 3600 : 1200)} /${unit === 'imperial' ? 'mi' : 'km'}`;
  return { title, body: `${formatClock(engine.elapsedTime)} · ${dist} · ${rate}${engine.isPaused ? ' · paused' : ''}` };
};

const heartbeat = (l: Live) => {
  l.lastHeartbeat = Date.now();
  istride('/runs/live', {
    method: 'POST',
    body: { client_run_id: l.activity.clientRunId, mode: l.activity.setup.mode, started_at: new Date(l.activity.startedAt).toISOString() },
  }).catch(() => undefined);
};

const speakDue = (l: Live, now: number) => {
  const cues = l.engine.cues;
  for (; l.nextCue < cues.length; l.nextCue++) l.pendingCues.push(l.nextCue);
  const still: number[] = [];
  for (const i of l.pendingCues) {
    const cue = cues[i];
    if (now < cue.at) { still.push(i); continue; }
    if (l.handledCues.has(cue.id)) continue;
    l.handledCues.add(cue.id);
    if (cueSpoken(l.activity.clientRunId, cue.id)) continue;
    markCue(l.activity.clientRunId, cue.id);
    // ▲ tapped five times: only the last target is said.
    if (cue.family && cues.some((c, j) => j > i && c.family === cue.family)) continue;
    if (now - cue.at > CUE_MAX_AGE_MS || !l.activity.cuesOn) continue;
    if (cue.beep) void beep(cue.beep.freq, cue.beep.ms);
    if (cue.text) void say(cue.text);
  }
  l.pendingCues = still;
};

const readSteps = (l: Live, now: number) => {
  if (!l.counter) return;
  l.counter.current().then((n) => {
    if (live !== l) return;
    l.rawSteps = Math.max(l.rawSteps, l.stepBase + n);
    const shown = activeSteps(l);
    l.stepSamples.push({ t: now, n: shown });
    while (l.stepSamples.length > 1 && now - l.stepSamples[0].t > 20_000) l.stepSamples.shift();
    const first = l.stepSamples[0];
    const span = (now - first.t) / 1000;
    // Cadence over the last 20 seconds, as on the web.
    l.cadence = span >= 5 && !l.engine.isPaused ? Math.min(240, Math.round(((shown - first.n) / span) * 60)) : l.engine.isPaused ? 0 : l.cadence;
  }).catch(() => undefined);
};

/** One step: new points, new actions, the numbers, the cues. */
const step = () => {
  const l = live;
  if (!l || l.engine.finishedAt !== null) return;
  const now = Date.now();
  const pts = pointsAfter(l.activity.sessionId, l.pointCursor);
  l.pointCursor = pts.lastRowId;
  const evs = eventsAfter(l.activity.clientRunId, l.eventCursor);
  if (evs.length) l.eventCursor = evs[evs.length - 1].id;
  for (const { ev } of evs) noteStepsAt(l, ev);
  l.engine.advance(now, pts.fixes, evs.map((e) => e.ev));
  // The map's line: [lng, lat], rebuilt only when points were added.
  const route = l.engine.route;
  if (route.length !== l.lineLength) {
    for (let i = l.lineLength; i < route.length; i++) l.line.push([route[i].lng, route[i].lat]);
    l.lineLength = route.length;
    l.line = l.line.slice();
  }
  speakDue(l, now);
  l.ticks += 1;
  if (l.ticks % 2 === 0) readSteps(l, now);
  if (l.ticks % 5 === 0) markAlive(l.activity.clientRunId, now, activeSteps(l));
  // Android's notification: time, distance and pace, about every 10 seconds (only while the app is on screen).
  if (l.ticks % 10 === 0) void updateNotice(trackingNotice(l.activity.setup.mode, l.engine));
  if (now - l.lastHeartbeat >= HEARTBEAT_MS) heartbeat(l);
  emit();
};

/** Pauses and resumes carry the step count, so steps taken while paused are left out. */
const noteStepsAt = (l: Live, ev: RunEvent & { steps?: number }) => {
  if (ev.type === 'pause' && l.pauseMark === null) l.pauseMark = ev.steps ?? l.rawSteps;
  if (ev.type === 'resume' && l.pauseMark !== null) {
    l.hiddenSteps += Math.max(0, (ev.steps ?? l.rawSteps) - l.pauseMark);
    l.pauseMark = null;
  }
};

// A connected heart-rate monitor: its readings are written down about once a
// second as they arrive (screen locked or not), so the average, max and time
// in zone survive the app being closed.
let stopHeartRate: (() => void) | null = null;
let lastMonitorWrite = 0;
const watchHeartRate = () => {
  stopHeartRate?.();
  stopHeartRate = onHeartRate((bpm) => {
    const l = live;
    const now = Date.now();
    if (!l || l.engine.finishedAt !== null || l.engine.isPaused || now - lastMonitorWrite < 950) return;
    lastMonitorWrite = now;
    addEvent(l.activity.clientRunId, { t: now, type: 'hrm', bpm });
  });
  // The strap used last time connects by itself (Bluetooth was allowed then).
  const last = lastHeartRateDevice();
  if (last && getPref('perm.bluetooth') === 'granted') connectHeartRate(last.id).catch(() => undefined);
};

const startLoop = () => {
  if (timer) clearInterval(timer);
  timer = setInterval(step, 1000);
  watchHeartRate();
};
const stopLoop = () => {
  if (timer) { clearInterval(timer); timer = null; }
  stopHeartRate?.();
  stopHeartRate = null;
  disconnectHeartRate().catch(() => undefined);
};

const newLive = (activity: Activity): Live => ({
  activity,
  engine: new RunEngine(engineConfig(activity.setup, activity.startedAt)),
  pointCursor: 0, eventCursor: 0, handledCues: new Set(), nextCue: 0, pendingCues: [],
  counter: null, rawSteps: 0, hiddenSteps: 0, pauseMark: null, stepBase: 0, stepSamples: [], cadence: 0,
  line: [], lineLength: 0, lastHeartbeat: 0, ticks: 0,
});

const attachSteps = async (l: Live, countSteps: boolean) => {
  if (!countSteps || l.engine.kind === 'ride') return;
  const counter = await startSteps(new Date(l.activity.startedAt)).catch(() => null);
  if (live === l) l.counter = counter; else counter?.stop();
};

/** The cues we know are coming, fetched while the activity gets going. */
const warmVoice = (setup: RunSetup) => {
  const kind = kindOfMode(setup.mode);
  const plan = setup.hiit;
  void prefetch([
    ...(setup.mode === RunMode.ACADEMY ? ACADEMY_PLAN.slice(0, 3).map((p) => p.cue) : []),
    ...(kind === 'hiit' && plan && !plan.manual ? hiitPhases(plan).slice(0, 4).map((ph) => hiitCue(ph, plan)) : []),
    ...(setup.target_distance_m > 0 ? ['Target distance reached. Nice work.'] : []),
    `${splitWord(setup.mode, setup.unit)} 1 complete.`,
  ]);
};

/** Start: tracking on, a new activity, the dashboard running. Location must already be allowed. */
export const startActivity = async (opts: { setup: RunSetup; returnTo: string | null; cuesOn: boolean; countSteps: boolean }) => {
  await ensureAndroidNotifications();
  if (opts.cuesOn) await prepareAudio();
  const session = await startTracking(trackingNotice(opts.setup.mode, null));
  const clientRunId = uuid();
  createActivity({ clientRunId, sessionId: session.id, startedAt: session.startedAt, setup: opts.setup, returnTo: opts.returnTo, cuesOn: opts.cuesOn });
  const activity = activeActivity();
  if (!activity) throw new Error("Couldn't save the activity on this phone.");
  const l = newLive(activity);
  live = l;
  heartbeat(l);
  if (opts.cuesOn) warmVoice(opts.setup);
  void attachSteps(l, opts.countSteps);
  startLoop();
  step();
};

/**
 * An activity that was in progress when the app was last closed (or is still
 * running in another screen). Null when there is none or it's the live one.
 */
export const interruptedActivity = (): Activity | null => {
  const a = activeActivity();
  if (!a) return null;
  return live && live.activity.clientRunId === a.clientRunId ? null : a;
};

/**
 * Picks an interrupted activity back up: rebuilt from its saved points and
 * actions. If the app was closed for a while, the time away isn't counted
 * (a pause is put where it stopped). `resume` starts tracking again;
 * otherwise it stays paused, ready to finish.
 */
export const recoverActivity = async (resume: boolean, countSteps: boolean): Promise<boolean> => {
  const activity = activeActivity();
  if (!activity) return false;
  const now = Date.now();
  const l = newLive(activity);
  const lastAlive = Math.max(activity.aliveAt, lastPointAt(activity.sessionId) ?? 0, activity.startedAt);
  const all = eventsAfter(activity.clientRunId, 0);
  const lastPauseOrResume = [...all].reverse().find((e) => e.ev.type === 'pause' || e.ev.type === 'resume');
  const wasPaused = lastPauseOrResume?.ev.type === 'pause';
  if (!wasPaused && now - lastAlive > GAP_MS) addEvent(activity.clientRunId, { t: lastAlive, type: 'pause', steps: activity.steps });
  // Android's step counter starts again from zero; iPhone reads from the start time.
  if (Platform.OS !== 'ios') { l.stepBase = activity.steps; l.rawSteps = activity.steps; }
  live = l;
  if (activity.cuesOn) await prepareAudio();
  // Rebuild to now without speaking the cues that came due while the app was closed.
  const pts = pointsAfter(activity.sessionId, 0);
  l.pointCursor = pts.lastRowId;
  const evs = eventsAfter(activity.clientRunId, 0);
  if (evs.length) l.eventCursor = evs[evs.length - 1].id;
  if (Platform.OS === 'ios') for (const { ev } of evs) noteStepsAt(l, ev);
  l.engine.advance(now, pts.fixes, evs.map((e) => e.ev));
  for (const cue of l.engine.cues) {
    if (now - cue.at > 3000) { l.handledCues.add(cue.id); markCue(activity.clientRunId, cue.id); }
  }
  if (resume) {
    const session = activeSession();
    // The phone's tracking session must still be this activity's to add to it.
    if (!session || session.id !== activity.sessionId) { live = null; emit(); return false; }
    await ensureAndroidNotifications();
    await resumeTracking(trackingNotice(activity.setup.mode, l.engine));
    if (l.engine.isPaused) addEvent(activity.clientRunId, { t: Date.now(), type: 'resume', steps: l.rawSteps });
    heartbeat(l);
    void attachSteps(l, countSteps);
    startLoop();
    step();
  }
  emit();
  return true;
};

const act = (ev: RunEvent & { steps?: number }) => {
  const l = live;
  if (!l || l.engine.finishedAt !== null) return;
  addEvent(l.activity.clientRunId, ev);
  step();
};

export const pause = () => { const l = live; if (l && !l.engine.isPaused) { hush(); act({ t: Date.now(), type: 'pause', steps: l.rawSteps }); markAlive(l.activity.clientRunId, Date.now(), activeSteps(l)); } };
export const resume = () => { const l = live; if (l && l.engine.isPaused) act({ t: Date.now(), type: 'resume', steps: l.rawSteps }); };
export const logGel = () => act({ t: Date.now(), type: 'gel' });
export const logSip = () => act({ t: Date.now(), type: 'sip' });
export const enterHeartRate = (bpm: number, source: 'manual' | 'camera' = 'manual') => act({ t: Date.now(), type: 'hr', bpm, source });
export const adjustTargetSpeed = (delta: number) => { if (live) act({ t: Date.now(), type: 'target_speed', mps: nextTargetSpeed(live.engine, delta) }); };
export const adjustTargetDistance = (delta: number | null) => { if (live) act({ t: Date.now(), type: 'target_distance', m: nextTargetDistance(live.engine, delta) }); };
export const adjustHiitRounds = (delta: number) => { const p = live?.engine.hiitPlan; if (p) act({ t: Date.now(), type: 'hiit_rounds', rounds: p.rounds + delta }); };
export const toggleHiit = () => act({ t: Date.now(), type: 'hiit_toggle' });
export const dismissOffRoute = () => act({ t: Date.now(), type: 'off_route_dismiss' });

/**
 * Pace to the song (iStride's applySongCadence): the target speed that lands
 * each step on the beat, at the stride measured now, else the music pacer's,
 * else 1 m.
 */
export const applySong = (bpm: number, cadence: number) => {
  const l = live;
  if (!l) return;
  const speed = l.engine.currentSpeed;
  const liveStride = l.cadence > 0 ? (speed * 60) / l.cadence : 0;
  const measured = l.cadence > 100 && speed > 1 && liveStride >= 0.5 && liveStride <= 2.2;
  const pacer = l.activity.setup.pacer_stride_m;
  const stride = measured ? liveStride : pacer && pacer > 0.3 ? pacer : 1.0;
  act({ t: Date.now(), type: 'song', mps: (cadence * stride) / 60, bpm, cadence });
};

/**
 * Reroute (iStride's handleReroute): a walking route from where you are to
 * your route's finish. OpenRouteService with the key iStride handed over;
 * the public OSRM server when there's none.
 */
export const reroute = async (): Promise<boolean> => {
  const l = live;
  const here = l?.engine.route[l.engine.route.length - 1];
  const planned = l?.engine.plannedRoute ?? [];
  if (!l || !here || planned.length === 0) return false;
  const end = planned[planned.length - 1];
  let path: [number, number][] | null = null;
  const key = l.activity.setup.routing_key;
  if (key) {
    try {
      const res = await fetch('https://api.heigit.org/ors/v2/directions/foot-walking/geojson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: key },
        body: JSON.stringify({ coordinates: [[here.lng, here.lat], [end.lng, end.lat]] }),
      });
      if (res.ok) {
        const coords: number[][] = (await res.json())?.features?.[0]?.geometry?.coordinates ?? [];
        if (coords.length > 1) path = coords.map((c) => [c[1], c[0]]);
      }
    } catch { /* try the fallback */ }
  }
  if (!path) {
    try {
      const res = await fetch(`https://router.project-osrm.org/route/v1/foot/${here.lng},${here.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`);
      const data = await res.json();
      const coords: number[][] = data?.code === 'Ok' ? data.routes?.[0]?.geometry?.coordinates ?? [] : [];
      if (coords.length > 1) path = coords.map((c) => [c[1], c[0]]);
    } catch { /* none */ }
  }
  if (live !== l) return false;
  if (path) { act({ t: Date.now(), type: 'reroute', path }); return true; }
  if (l.activity.cuesOn) void say('Could not find a new route. Try moving to a road.');
  return false;
};

/**
 * Stop: closes the activity and hands it to the upload queue, which keeps it
 * until the server has it. Returns the key to watch the upload with.
 */
export const finishActivity = async (): Promise<string | null> => {
  const l = live;
  if (!l) return null;
  if (l.engine.finishedAt !== null) return l.activity.clientRunId;
  stopLoop();
  hush();
  const now = Date.now();
  const pts = pointsAfter(l.activity.sessionId, l.pointCursor);
  l.pointCursor = pts.lastRowId;
  const evs = eventsAfter(l.activity.clientRunId, l.eventCursor);
  l.engine.finish(now, pts.fixes, evs.map((e) => e.ev));
  const setup = l.activity.setup;
  let timezone = 'UTC';
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* keep UTC */ }
  const walk = l.engine.kind === 'walk' || l.engine.kind === 'heartwalk';
  const body = buildRunPayload(l.engine, {
    clientRunId: l.activity.clientRunId,
    timezone,
    routeId: setup.route_id,
    hrPre: setup.hr_pre,
    steps: walk && l.counter ? activeSteps(l) : null,
    gear: setup.gear,
    weather: setup.weather,
  });
  // Saved on the phone first; only then is tracking let go.
  enqueueUpload({ key: l.activity.clientRunId, api: 'istride', path: '/runs', body });
  setStatus(l.activity.clientRunId, 'finished', now);
  l.counter?.stop();
  await stopTracking().catch(() => undefined);
  emit();
  return l.activity.clientRunId;
};

/** Discard: nothing is saved. */
export const discardActivity = async () => {
  const l = live;
  stopLoop();
  hush();
  const a = l?.activity ?? activeActivity();
  if (a) {
    setStatus(a.clientRunId, 'discarded', Date.now());
    istride(`/runs/live/${a.clientRunId}`, { method: 'DELETE' }).catch(() => undefined);
  }
  l?.counter?.stop();
  live = null;
  await stopTracking().catch(() => undefined);
  emit();
};

/** Leaves the finished activity's Done screen. */
export const clearLive = () => { live = null; emit(); };
