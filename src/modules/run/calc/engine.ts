// ============================================================================
// The live activity, worked out from its GPS points and what the member did.
//
// This is iStride's web tracker (TempoRun App.tsx: the GPS callback, the
// one-second tick, pause/resume, HIIT, Academy, the coach) as plain code with
// no screen and no clock of its own. Feed it the points, the member's actions
// and "now", in time order, and it gives the same numbers the web dashboard
// shows for the same points. Because it only depends on what it's fed:
//   - an activity can be rebuilt from the phone's saved points after the app
//     was closed (recovery), and
//   - what the member sees and what is saved are the same calculation.
//
// Where the Companion differs from the web, on purpose:
//   1. Ticks are exactly one second apart from the start time, instead of
//      whenever a browser timer fired.
//   2. The phone only reports a point after moving 3 m (the shell's setting),
//      so standing still sends nothing. After 5 s with no point the speed
//      eases to zero, as the web's does on its once-a-second zero-speed fixes.
//   3. The web waits for a good GPS fix before Start. Here the clock starts at
//      once and points don't count until one is within 20 m (or 20 s pass).
//   4. No heart-rate strap or camera check yet (Phase 3c): heart rate is a
//      number the member types, shown for 2 minutes like the web's typed one.
// ============================================================================

import { academyPhaseAt, ACADEMY_DONE_CUE, splitWord } from './academy';
import { kindOfMode, maxSpeedFor, maxTargetFor, defaultTargetFor, type ActivityKind } from './activityTypes';
import {
  AdaptiveSmoother, calculateCaloriesPerSecondMETs, calculatePace, getDistanceFromLatLonInM,
  MPS_TO_KPH, MPS_TO_MPH, speakDuration,
} from './constants';
import { cyclingKcalPerSecond, walkingKcalPerSecond } from './exerciseCalories';
import { zoneOf, zoneRange } from './heartZones';
import { hiitCue, hiitPhaseAt, hiitPhases, type HiitPhase, type HiitPlan } from './hiit';
import { RunMode, TrainingZone, type BodyProfile, type GeoPoint, type Interval, type Split, type Unit } from './types';

/** A point from the phone (the shell's track_points row). */
export interface Fix { t: number; lat: number; lng: number; accuracy: number | null; speed: number | null; altitude: number | null }

/** Something the member did during the activity, with the time they did it. */
export type RunEvent =
  | { t: number; type: 'pause' }
  | { t: number; type: 'resume' }
  | { t: number; type: 'gel' }
  | { t: number; type: 'sip' }
  | { t: number; type: 'hr'; bpm: number }
  | { t: number; type: 'target_speed'; mps: number }
  | { t: number; type: 'target_distance'; m: number }
  | { t: number; type: 'hiit_rounds'; rounds: number }
  | { t: number; type: 'hiit_toggle' }
  | { t: number; type: 'off_route_dismiss' }
  /** Reroute: a new way to the finish, as [lat, lng] pairs. */
  | { t: number; type: 'reroute'; path: [number, number][] }
  /** Pace to the song: the target speed that puts each step on the beat. */
  | { t: number; type: 'song'; mps: number; bpm: number; cadence: number };

export interface EngineConfig {
  mode: RunMode;
  unit: Unit;
  startedAt: number;
  /** meters; 0 = an open activity. */
  targetDistance: number;
  /** meters per split. */
  splitDistance: number;
  /** m/s; null = no target. */
  targetSpeed: number | null;
  body: BodyProfile;
  maxHr: number | null;
  targetZone: number;
  hiitPlan: HiitPlan | null;
  plannedRoute: { lat: number; lng: number }[];
}

/** Something to say or sound. `family`: only the newest of a family is spoken (the member tapped ▲ five times). */
export interface Cue { id: string; at: number; text?: string; beep?: { freq: number; ms: number }; family?: string }

const GPS_READY_ACCURACY_M = 20;
const GPS_READY_WAIT_MS = 20_000;
/** No point for this long means standing still. */
const STILL_AFTER_MS = 5_000;
const KCAL_PER_GEL = 100;
const ML_PER_SIP = 150;

export class RunEngine {
  readonly cfg: EngineConfig;
  readonly kind: ActivityKind;

  // ── What the dashboard shows (the web's RunState) ───────────────────────
  isPaused = false;
  /** Whole seconds of active time, as the web shows and saves. */
  elapsedTime = 0;
  totalDistance = 0;
  currentSpeed = 0;
  currentAltitude = 0;
  elevationGain = 0;
  currentGradient = 0;
  currentPhaseDuration = 0;
  route: GeoPoint[] = [];
  splits: Split[] = [];
  intervals: Interval[] = [];
  trainingZone: TrainingZone = TrainingZone.IDLE;
  caloriesBurned = 0;
  caloriesConsumed = 0;
  fluidLostMl = 0;
  fluidIntakeMl = 0;
  /** The last number the member typed, and when. */
  spotHr: { bpm: number; at: number } | null = null;
  /** The heart rate that counts as live right now (0 = none). */
  currentHeartRate = 0;
  targetDistance: number;
  targetSpeed: number | null;
  hiitPlan: HiitPlan | null;
  hiitManual: { kind: 'work' | 'rest'; since: number; round: number } | null = null;
  isOffRoute = false;
  /** The route being followed: the one from setup, or the latest reroute. */
  plannedRoute: { lat: number; lng: number }[];
  /** Fastest smoothed speed of any point so far. */
  maxPointSpeed = 0;
  /** Accuracy of the newest point (m), for the GPS pill; null before the first. */
  gpsAccuracy: number | null = null;
  gpsReady = false;
  lastFixAt: number | null = null;
  cues: Cue[] = [];

  // ── The web's refs ──────────────────────────────────────────────────────
  private lastPosition: GeoPoint | null = null;
  private speedFix: { lat: number; lng: number; t: number } | null = null;
  private derivedSpeed = 0;
  private smoother = new AdaptiveSmoother();
  private accumulatedSplitDistance = 0;
  private splitStartTime: number;
  private activeMs = 0;
  private segmentStart: number | null;
  private lastTick: number;
  private pausedAt: number | null = null;
  private intervalState: { startTime: number; startDist: number; maxSpeed: number; pendingZone: TrainingZone; confirmationTimer: number };
  hiit: { key: string | null; phase: HiitPhase | null; startMs: number; startDist: number; maxSpeed: number; beeped: number };
  private lastAcademyPhase: number | null = null;
  private fuelMilestone = 0;
  private targetReached = false;
  private behindSince: number | null = null;
  private lastSpeedAlert = 0;
  private lastHrAlert = 0;
  private zoneCoach: { outSince: number | null; outDir: 0 | 1 | -1; lastAlert: number; wasOut: boolean } = { outSince: null, outDir: 0, lastAlert: 0, wasOut: false };
  private routeGraceOver = false;
  private lastDeviationCheck = 0;
  private offRouteDismissed = false;
  /** The next one-second tick. */
  private nextTick: number;
  /** Everything up to this time has been worked out. */
  clock: number;
  finishedAt: number | null = null;

  constructor(cfg: EngineConfig) {
    this.cfg = cfg;
    this.kind = kindOfMode(cfg.mode);
    this.targetDistance = cfg.targetDistance;
    this.targetSpeed = cfg.targetSpeed;
    this.hiitPlan = cfg.hiitPlan;
    this.plannedRoute = cfg.plannedRoute;
    const t0 = cfg.startedAt;
    this.splitStartTime = t0;
    this.segmentStart = t0;
    this.lastTick = t0;
    this.nextTick = t0 + 1000;
    this.clock = t0;
    this.intervalState = { startTime: t0, startDist: 0, maxSpeed: 0, pendingZone: TrainingZone.IDLE, confirmationTimer: t0 };
    this.hiit = { key: null, phase: null, startMs: t0, startDist: 0, maxSpeed: 0, beeped: -1 };
    this.smoother.maxSpeed = maxSpeedFor(this.kind);
    // HIIT speaks its own first cue (the warm-up) on the first tick.
    if (this.kind !== 'hiit' || this.hiitPlan?.manual) {
      this.say('start', t0, this.kind === 'heartwalk' ? `Heart walk started. Target zone ${cfg.targetZone}.` : 'Training started.');
    }
  }

  private say(id: string, at: number, text: string, family?: string) { this.cues.push({ id, at, text, family }); }
  private beep(id: string, at: number, freq: number, ms: number) { this.cues.push({ id, at, beep: { freq, ms } }); }

  /** Active time at `t`, in seconds (not rounded). */
  elapsedAt(t: number) {
    return (this.activeMs + (this.segmentStart !== null ? Math.max(0, t - this.segmentStart) : 0)) / 1000;
  }

  /**
   * Works everything out up to `now`: the new points, the member's new
   * actions and each one-second tick, in the order they happened.
   * Points and events must be newer than any given before, oldest first.
   */
  advance(now: number, fixes: Fix[] = [], events: RunEvent[] = []) {
    if (this.finishedAt !== null) return;
    let fi = 0, ei = 0;
    for (;;) {
      const ft = fi < fixes.length ? fixes[fi].t : Infinity;
      const et = ei < events.length ? events[ei].t : Infinity;
      const tt = this.nextTick;
      const next = Math.min(ft, et, tt);
      if (next > now) break;
      if (et <= ft && et <= tt) { this.applyEvent(events[ei++]); }
      else if (ft <= tt) { this.applyFix(fixes[fi++]); }
      else { this.tick(tt); this.nextTick += 1000; }
      this.clock = Math.max(this.clock, next);
    }
    this.clock = Math.max(this.clock, now);
  }

  // ── The member's actions ────────────────────────────────────────────────
  private applyEvent(ev: RunEvent) {
    const t = ev.t;
    switch (ev.type) {
      case 'pause':
        if (this.isPaused) return;
        if (this.segmentStart !== null) { this.activeMs += t - this.segmentStart; this.segmentStart = null; }
        this.pausedAt = t;
        this.isPaused = true;
        this.elapsedTime = Math.round(this.activeMs / 1000);
        return;
      case 'resume': {
        if (!this.isPaused) return;
        this.isPaused = false;
        this.segmentStart = t;
        this.lastTick = t;
        const pausedFor = this.pausedAt !== null ? t - this.pausedAt : 0;
        this.splitStartTime += pausedFor;            // splits exclude the pause
        this.intervalState.startTime += pausedFor;   // so do intervals
        this.pausedAt = null;
        this.behindSince = null;                     // getting back up to speed isn't "behind"
        this.lastSpeedAlert = t;
        // Start fresh after a pause: otherwise the straight line from where you
        // paused to where you resumed was added as distance.
        this.lastPosition = null;
        this.speedFix = null;
        this.derivedSpeed = 0;
        this.smoother.reset();
        this.currentSpeed = 0;
        return;
      }
      case 'gel': this.caloriesConsumed += KCAL_PER_GEL; return;
      case 'sip': this.fluidIntakeMl += ML_PER_SIP; return;
      case 'hr':
        if (ev.bpm >= 30 && ev.bpm <= 240) this.spotHr = { bpm: Math.round(ev.bpm), at: t };
        return;
      case 'target_speed': {
        this.targetSpeed = ev.mps > 0 ? ev.mps : null;
        this.lastSpeedAlert = t; // time to reach the new speed before any callout
        this.behindSince = null;
        if (this.targetSpeed) {
          const toDisplay = this.cfg.unit === 'imperial' ? MPS_TO_MPH : MPS_TO_KPH;
          const per = this.cfg.unit === 'imperial' ? 'mile' : 'kilometer';
          const shown = this.targetSpeed * toDisplay;
          this.say(`tspeed-${t}`, t + 1500,
            `Target ${shown.toFixed(1)} ${this.cfg.unit === 'imperial' ? 'miles an hour' : 'kilometers an hour'}, ${calculatePace(this.targetSpeed, this.cfg.unit)} per ${per}.`,
            'tspeed');
        }
        return;
      }
      case 'target_distance': {
        const per = this.cfg.unit === 'imperial' ? 1609.34 : 1000;
        this.targetDistance = Math.max(0, ev.m);
        // Already past the new target: don't announce it; further out: it can fire again.
        this.targetReached = this.targetDistance > 0 && this.totalDistance >= this.targetDistance;
        this.behindSince = null;
        const unitWord = this.cfg.unit === 'imperial' ? 'miles' : 'kilometers';
        if (this.targetDistance === 0) { this.say(`tdist-${t}`, t + 1500, 'Open run. No distance target.', 'tdist'); return; }
        const finish = this.targetSpeed ? `, about ${speakDuration(this.targetDistance / this.targetSpeed)} at your target pace` : '';
        this.say(`tdist-${t}`, t + 1500, `Target distance ${(this.targetDistance / per).toFixed(1)} ${unitWord}${finish}.`, 'tdist');
        return;
      }
      case 'hiit_rounds': {
        const cur = this.hiitPlan;
        if (!cur || cur.manual) return;
        const next = Math.max(this.hiitRoundsFloor(), Math.min(40, Math.round(ev.rounds)));
        if (next === cur.rounds) return;
        // Now its own plan, so it isn't saved as "Classic" with 4 rounds.
        this.hiitPlan = { ...cur, rounds: next, id: 'custom', name: 'Custom' };
        const ph = this.hiit.phase;
        const p = this.hiitPlan;
        const last = ph?.kind === 'work' && ph.round === p.rounds;
        this.say(`rounds-${t}`, t + 1500,
          `${p.rounds} ${p.rounds === 1 ? 'sprint' : 'sprints'}.${last ? ' This is your last one.' : ph?.kind === 'cooldown' ? '' : ` ${p.rounds - (ph?.round ?? 0)} to go after this.`}`,
          'rounds');
        return;
      }
      case 'hiit_toggle': this.toggleHiitManual(t); return;
      case 'off_route_dismiss':
        this.offRouteDismissed = true;
        this.isOffRoute = false;
        return;
      case 'reroute':
        if (ev.path.length < 2) return;
        this.plannedRoute = ev.path.map(([lat, lng]) => ({ lat, lng }));
        this.offRouteDismissed = false;
        this.isOffRoute = false;
        this.say(`reroute-${t}`, t, 'Route updated.');
        return;
      case 'song': {
        this.targetSpeed = Math.min(8, Math.max(0.8, ev.mps));
        this.lastSpeedAlert = t; // a moment to settle in before "pick it up"
        this.behindSince = null;
        const per = this.cfg.unit === 'imperial' ? 'mile' : 'kilometer';
        this.say(`song-${t}`, t, `Song is ${ev.bpm} beats a minute. New target pace ${calculatePace(this.targetSpeed, this.cfg.unit)} per ${per}, ${ev.cadence} steps a minute.`);
        return;
      }
    }
  }

  /** HIIT rounds can't go below the round you're on. */
  hiitRoundsFloor() {
    const ph = this.hiit.phase;
    return ph && (ph.kind === 'work' || ph.kind === 'rest') ? ph.round : 1;
  }

  /** The HIIT phase in progress, closed out as an interval (at finish, or a manual switch). */
  private closeHiitPhase(t: number): Interval | null {
    const h = this.hiit;
    const manual = this.hiitManual;
    let label: string, type: Interval['type'], round: number | undefined;
    if (manual) {
      label = manual.kind === 'work' ? 'Sprint' : (this.hiitPlan?.restLabel ?? 'Walk');
      type = manual.kind === 'work' ? 'SPRINT' : 'RECOVERY';
      round = manual.round;
    } else {
      const ph = h.phase;
      if (!ph) return null;
      label = ph.label; round = ph.round || undefined;
      type = ph.kind === 'work' ? 'SPRINT' : ph.kind === 'warmup' ? 'WARMUP' : ph.kind === 'cooldown' ? 'COOLDOWN' : 'RECOVERY';
    }
    const secs = (t - h.startMs) / 1000;
    if (secs < 3) return null;
    const dist = this.totalDistance - h.startDist;
    const avg = secs > 0 ? dist / secs : 0;
    return {
      id: this.intervals.length + 1, type, label, round, startTime: h.startMs, duration: secs, distance: dist,
      avgPace: calculatePace(avg, this.cfg.unit), avgSpeed: avg, maxSpeed: Math.max(h.maxSpeed, avg),
    };
  }

  /** "Tap to switch" HIIT: start the next sprint or recovery. */
  private toggleHiitManual(t: number) {
    if (this.kind !== 'hiit' || !this.hiitPlan?.manual) return;
    const cur = this.hiitManual;
    const nextKind: 'work' | 'rest' = !cur || cur.kind === 'rest' ? 'work' : 'rest';
    const round = nextKind === 'work' ? (cur ? cur.round + 1 : 1) : (cur?.round ?? 1);
    const closed = cur ? this.closeHiitPhase(t) : null;
    if (closed) this.intervals.push(closed);
    this.hiit = { key: null, phase: null, startMs: t, startDist: this.totalDistance, maxSpeed: 0, beeped: -1 };
    this.hiitManual = { kind: nextKind, since: t, round };
    if (nextKind === 'work') { this.beep(`hiitm-beep-${t}`, t, 1320, 450); this.say(`hiitm-${t}`, t, `Sprint ${round}. Go!`); }
    else { this.beep(`hiitm-beep-${t}`, t, 520, 300); this.say(`hiitm-${t}`, t, `${this.hiitPlan.restLabel}. Recover.`); }
  }

  // ── A GPS point ─────────────────────────────────────────────────────────
  private applyFix(fix: Fix) {
    if (this.isPaused) return;
    const timestamp = fix.t;
    const acc = typeof fix.accuracy === 'number' && isFinite(fix.accuracy) ? fix.accuracy : null;
    this.gpsAccuracy = acc;
    this.lastFixAt = timestamp;
    // Before a good fix, points don't count (the web waits for one before Start).
    if (!this.gpsReady) {
      if ((acc !== null && acc <= GPS_READY_ACCURACY_M) || timestamp - this.cfg.startedAt >= GPS_READY_WAIT_MS) this.gpsReady = true;
      else return;
    }
    const { lat: latitude, lng: longitude, speed, altitude } = fix;
    const unit = this.cfg.unit;

    // Phones that report no speed: distance moved between fixes at least a second apart.
    let rawSpeed: number;
    if (typeof speed === 'number' && isFinite(speed) && speed >= 0) {
      rawSpeed = speed;
    } else {
      const f = this.speedFix;
      if (!f) {
        this.speedFix = { lat: latitude, lng: longitude, t: timestamp };
      } else if (timestamp - f.t >= 1000) {
        const dt = (timestamp - f.t) / 1000;
        const d = getDistanceFromLatLonInM(f.lat, f.lng, latitude, longitude);
        this.derivedSpeed = dt > 30 ? 0 : Math.min(maxSpeedFor(this.kind), d / dt);
        this.speedFix = { lat: latitude, lng: longitude, t: timestamp };
      }
      rawSpeed = this.derivedSpeed;
    }
    const smoothedSpeed = this.smoother.process(rawSpeed);

    let addedDist = 0;
    let elevationDelta = 0;
    let newGradient = this.currentGradient;
    const last = this.lastPosition;
    if (last) {
      addedDist = getDistanceFromLatLonInM(last.lat, last.lng, latitude, longitude);
      if (altitude !== null && last.altitude !== null) {
        const altDiff = altitude - last.altitude;
        // GPS altitude is noisy and only positive changes add up, so small
        // wobbles are ignored.
        const ELEV_MIN_DELTA_M = 2.5;
        if (altDiff > ELEV_MIN_DELTA_M) elevationDelta = altDiff;
        if (addedDist > 5) {
          newGradient = (altDiff / addedDist) * 100;
          if (newGradient > 30) newGradient = 30;
          if (newGradient < -30) newGradient = -30;
        }
      }
    }
    if (addedDist < 0.5 && rawSpeed < 0.2) addedDist = 0;
    const newTotalDistance = this.totalDistance + addedDist;
    const newPoint: GeoPoint = { lat: latitude, lng: longitude, timestamp, speed: smoothedSpeed, altitude: altitude || 0 };

    this.checkDeviation(newPoint);
    this.accumulatedSplitDistance += addedDist;
    if (this.accumulatedSplitDistance >= this.cfg.splitDistance) {
      const splitTime = (timestamp - (this.splitStartTime || timestamp)) / 1000;
      const pace = calculatePace(this.cfg.splitDistance / splitTime, unit, this.kind === 'walk' || this.kind === 'heartwalk' ? 3600 : 1200);
      const labelPrefix = this.cfg.mode === RunMode.TRACK ? 'Lap' : (unit === 'imperial' ? 'mi' : 'km');
      this.splits.push({
        distanceLabel: `${labelPrefix} ${this.splits.length + 1}`,
        timeSeconds: splitTime,
        cumulativeTime: this.elapsedTime,
        pace,
      });
      // The pace or speed of the split is said with it (the web's cue stops at "complete").
      const n = this.splits.length;
      const toDisplay = unit === 'imperial' ? MPS_TO_MPH : MPS_TO_KPH;
      const splitSpeed = splitTime > 0 ? this.cfg.splitDistance / splitTime : 0;
      const detail = this.kind === 'ride'
        ? ` ${(splitSpeed * toDisplay).toFixed(1)} ${unit === 'imperial' ? 'miles an hour' : 'kilometers an hour'}.`
        : /^\d/.test(pace) ? ` ${speakDuration(splitTime)}.` : '';
      this.say(`split-${n}`, timestamp, `${splitWord(this.cfg.mode, unit)} ${n} complete.${detail}`);
      this.accumulatedSplitDistance = 0;
      this.splitStartTime = timestamp;
    }

    this.totalDistance = newTotalDistance;
    this.currentSpeed = smoothedSpeed;
    this.currentAltitude = altitude || this.currentAltitude;
    this.elevationGain += elevationDelta;
    this.currentGradient = newGradient;
    this.route.push(newPoint);
    if (smoothedSpeed > this.maxPointSpeed) this.maxPointSpeed = smoothedSpeed;
    this.lastPosition = newPoint;

    // Speed-based sprint detection is for runs. HIIT logs its intervals from
    // the plan; a ride or a walk has none.
    if (this.kind !== 'run') {
      if (this.kind === 'hiit') this.hiit.maxSpeed = Math.max(this.hiit.maxSpeed, smoothedSpeed);
      return;
    }
    // Effort against this runner's own pace: hard = 15% faster than the
    // target pace if set, otherwise than their average so far.
    const avgSoFar = this.elapsedTime > 60 ? newTotalDistance / this.elapsedTime : 0;
    const reference = this.targetSpeed || avgSoFar;
    let detectedZone = TrainingZone.AEROBIC;
    if (smoothedSpeed < 0.8) detectedZone = TrainingZone.IDLE;
    else if (reference > 0 && smoothedSpeed > reference * 1.15) detectedZone = TrainingZone.ANAEROBIC;
    const now = timestamp;
    const st = this.intervalState;
    if (detectedZone !== st.pendingZone) {
      st.pendingZone = detectedZone;
      st.confirmationTimer = now;
    }
    let activeZone = this.trainingZone;
    if (now - st.confirmationTimer > 3000 && detectedZone !== activeZone) {
      if (this.elapsedTime > 5) {
        const intervalDuration = (now - st.startTime) / 1000;
        const intervalDist = newTotalDistance - st.startDist;
        const intervalAvgSpeed = intervalDuration > 0 ? intervalDist / intervalDuration : 0;
        if (intervalDuration > 10) {
          this.intervals.push({
            id: this.intervals.length + 1,
            type: activeZone === TrainingZone.ANAEROBIC ? 'SPRINT' : activeZone === TrainingZone.AEROBIC ? 'RECOVERY' : 'WARMUP',
            startTime: st.startTime,
            duration: intervalDuration,
            distance: intervalDist,
            avgPace: calculatePace(intervalAvgSpeed, unit),
            avgSpeed: intervalAvgSpeed,
            maxSpeed: Math.max(st.maxSpeed, intervalAvgSpeed),
          });
        }
      }
      activeZone = detectedZone;
      st.startTime = now;
      st.startDist = newTotalDistance;
      st.maxSpeed = 0;
    }
    this.trainingZone = activeZone;
    this.currentPhaseDuration = (now - st.startTime) / 1000;
  }

  private checkDeviation(pos: GeoPoint) {
    const planned = this.plannedRoute;
    if (!planned || planned.length === 0) return;
    const now = pos.timestamp;
    if (!this.routeGraceOver) {
      if (this.elapsedTime > 30) this.routeGraceOver = true;
      else return;
    }
    if (now - this.lastDeviationCheck < 5000) return;
    this.lastDeviationCheck = now;
    let distance = Infinity;
    for (let i = 0; i < planned.length; i++) {
      const d = getDistanceFromLatLonInM(pos.lat, pos.lng, planned[i].lat, planned[i].lng);
      if (d < distance) distance = d;
    }
    if (distance > 60) {
      if (!this.isOffRoute && !this.offRouteDismissed) {
        this.isOffRoute = true;
        this.say(`offroute-${now}`, now, "You've drifted from your planned route.");
      }
    } else {
      this.offRouteDismissed = false;
      if (this.isOffRoute) {
        this.isOffRoute = false;
        this.say(`onroute-${now}`, now, 'Back on track.');
      }
    }
  }

  // ── The one-second tick ─────────────────────────────────────────────────
  private tick(tickNow: number) {
    if (this.isPaused || this.segmentStart === null) return;
    const cfg = this.cfg;
    const elapsed = this.elapsedAt(tickNow);
    const dt = Math.min(30, Math.max(0, (tickNow - this.lastTick) / 1000));
    this.lastTick = tickNow;

    // Standing still sends no points here (see the note at the top).
    if (this.lastFixAt !== null && tickNow - this.lastFixAt > STILL_AFTER_MS && this.currentSpeed > 0) {
      this.currentSpeed = this.smoother.process(0);
      if (this.currentSpeed < 0.05) this.currentSpeed = 0;
    }

    // Heart rate is only ever a real reading: a typed number shows for 2
    // minutes, then it's too old to call live.
    const sp = this.spotHr;
    const hrAge = sp ? (tickNow - sp.at) / 1000 : Infinity;
    const hr = sp && hrAge <= 120 ? sp.bpm : 0;
    const mx = cfg.maxHr;
    // Heart walk: keep the walker in their target zone.
    if (this.kind === 'heartwalk' && hr > 0 && mx) {
      const z = zoneOf(hr, mx);
      const tz = cfg.targetZone;
      const dir: 0 | 1 | -1 = z > tz ? 1 : z < tz ? -1 : 0;
      const zc = this.zoneCoach;
      if (dir === 0) {
        if (zc.wasOut && tickNow - zc.lastAlert > 8000) { this.say(`zone-in-${tickNow}`, tickNow, `Back in zone ${tz}. Hold this effort.`); zc.lastAlert = tickNow; }
        zc.outSince = null; zc.outDir = 0; zc.wasOut = false;
      } else {
        if (zc.outDir !== dir) { zc.outDir = dir; zc.outSince = tickNow; }
        // Too hard: speak after 15 s. Too easy: give it a minute (warming up).
        const wait = dir > 0 ? 15000 : 60000;
        if (zc.outSince !== null && tickNow - zc.outSince >= wait && tickNow - zc.lastAlert > 45000) {
          zc.lastAlert = tickNow; zc.wasOut = true;
          const [lo, hi] = zoneRange(tz, mx);
          this.say(`zone-out-${tickNow}`, tickNow, dir > 0
            ? `Heart rate ${hr}, zone ${z}. You're pushing too hard. Slow down to get back under ${hi + 1} for zone ${tz}.`
            : `Heart rate ${hr}, zone ${z}. Pick up the pace a little to get above ${lo} for zone ${tz}.`);
        }
      }
    }
    if (cfg.mode === RunMode.ENDURANCE && hr > 150 && tickNow - this.lastHrAlert > 60000) {
      this.lastHrAlert = tickNow;
      this.say(`hr-high-${tickNow}`, tickNow, `Heart rate high at ${hr}.`);
    }

    // Calories need a body weight. Each activity burns differently.
    const kg = cfg.body.weight;
    const calsPerSecond = !(kg > 0) ? 0
      : this.kind === 'ride' ? cyclingKcalPerSecond(this.currentSpeed, this.currentGradient, kg)
      : this.kind === 'walk' || this.kind === 'heartwalk' ? walkingKcalPerSecond(this.currentSpeed, this.currentGradient, kg)
      : calculateCaloriesPerSecondMETs(this.currentSpeed, kg);
    // Sweat tracks energy spent: roughly 1 mL per kcal.
    const fluidPerSecond = calsPerSecond * 1.0;

    // Target distance reached — a route's length or the Quick Target.
    if (this.targetDistance > 0 && !this.targetReached && this.totalDistance >= this.targetDistance) {
      this.targetReached = true;
      this.say(`target-${Math.round(this.targetDistance)}-${tickNow}`, tickNow, 'Target distance reached. Nice work.');
    }

    // HIIT: log each sprint and recovery as it ends, call the next one, and
    // beep 3-2-1 into every sprint.
    const plan = this.hiitPlan;
    if (this.kind === 'hiit' && plan && !plan.manual) {
      const at = hiitPhaseAt(hiitPhases(plan), elapsed);
      const h = this.hiit;
      const key = at.phase ? `${at.phase.kind}-${at.phase.round}` : 'done';
      if (key !== h.key) {
        if (h.phase) {
          const done = h.phase;
          const secs = (tickNow - h.startMs) / 1000;
          const dist = this.totalDistance - h.startDist;
          const avg = secs > 0 ? dist / secs : 0;
          this.intervals.push({
            id: this.intervals.length + 1,
            type: done.kind === 'work' ? 'SPRINT' : done.kind === 'warmup' ? 'WARMUP' : done.kind === 'cooldown' ? 'COOLDOWN' : 'RECOVERY',
            label: done.label, round: done.round || undefined,
            startTime: h.startMs, duration: secs, distance: dist,
            avgPace: calculatePace(avg, cfg.unit), avgSpeed: avg, maxSpeed: Math.max(h.maxSpeed, avg),
          });
        }
        this.hiit = { key, phase: at.phase, startMs: tickNow, startDist: this.totalDistance, maxSpeed: 0, beeped: -1 };
        this.say(`hiit-${key}-${tickNow}`, tickNow, hiitCue(at.phase, plan));
        if (at.phase?.kind === 'work') this.beep(`hiit-beep-${key}-${tickNow}`, tickNow, 1320, 450);
        else if (at.phase) this.beep(`hiit-beep-${key}-${tickNow}`, tickNow, 520, 300);
      } else if (at.next?.kind === 'work' && at.remaining <= 3 && at.remaining >= 1 && h.beeped !== at.remaining) {
        h.beeped = at.remaining;
        this.beep(`hiit-count-${key}-${at.remaining}-${tickNow}`, tickNow, 880, 120);
      }
    }

    // Academy: announce each drill as it starts.
    if (cfg.mode === RunMode.ACADEMY) {
      const { index, phase } = academyPhaseAt(elapsed);
      if (index !== this.lastAcademyPhase) {
        this.lastAcademyPhase = index;
        this.say(`academy-${index}`, tickNow, phase ? phase.cue : ACADEMY_DONE_CUE);
      }
    }
    // Endurance: fuel and hydrate every 45 minutes.
    const fuelMilestone = Math.floor(elapsed / (45 * 60));
    if (cfg.mode === RunMode.ENDURANCE && fuelMilestone > this.fuelMilestone) {
      this.fuelMilestone = fuelMilestone;
      this.say(`fuel-${fuelMilestone}`, tickNow, 'Fuel check. Time to hydrate.');
    }
    // Coach: a full mph (kph in metric) under the target speed for 10 seconds
    // straight calls out the projected finish. At most every 45 seconds.
    if (this.targetSpeed && this.kind !== 'hiit' && this.kind !== 'heartwalk') {
      const toDisplay = cfg.unit === 'imperial' ? MPS_TO_MPH : MPS_TO_KPH;
      const unitWord = cfg.unit === 'imperial' ? 'miles an hour' : 'kilometers an hour';
      const currentMps = this.currentSpeed;
      const gap = (this.targetSpeed - currentMps) * toDisplay;
      const behind = currentMps > 0.5 && gap >= 0.95;
      if (!behind) this.behindSince = null;
      else {
        if (this.behindSince === null) this.behindSince = tickNow;
        if (tickNow - this.behindSince >= 10000 && tickNow - this.lastSpeedAlert > 45000) {
          this.lastSpeedAlert = tickNow;
          const speeds = `You're at ${(currentMps * toDisplay).toFixed(1)} ${unitWord}, target is ${(this.targetSpeed * toDisplay).toFixed(1)}.`;
          const remaining = this.targetDistance - this.totalDistance;
          if (this.targetDistance > 0 && remaining > 0) {
            const projected = elapsed + remaining / currentMps;
            const targetFinish = this.targetDistance / this.targetSpeed;
            this.say(`behind-${tickNow}`, tickNow, `${speeds} Pick up the speed if you're going to reach your target time. Right now your finish time will be ${speakDuration(projected)} at your current pace. Your target is ${speakDuration(targetFinish)}.`);
          } else {
            this.say(`behind-${tickNow}`, tickNow, `${speeds} Pick up the speed.`);
          }
        }
      }
    }

    // Rounded: duration_seconds is a whole number, and every display shows whole seconds.
    this.elapsedTime = Math.round(elapsed);
    this.caloriesBurned += calsPerSecond * dt;
    this.fluidLostMl += fluidPerSecond * dt;
    this.currentHeartRate = hr > 0 ? hr : 0;
    this.currentPhaseDuration = (tickNow - this.intervalState.startTime) / 1000;
  }

  /** Stop: works everything out to `t`, then closes the activity. */
  finish(t: number, fixes: Fix[] = [], events: RunEvent[] = []) {
    if (this.finishedAt !== null) return;
    this.advance(t, fixes, events);
    // Bank any time still running, so the saved duration matches the display.
    if (this.segmentStart !== null) { this.activeMs += t - this.segmentStart; this.segmentStart = null; }
    this.elapsedTime = Math.round(this.activeMs / 1000);
    // HIIT: the phase in progress becomes the last interval.
    if (this.kind === 'hiit') {
      const lastInterval = this.closeHiitPhase(t);
      if (lastInterval) this.intervals.push(lastInterval);
    }
    this.finishedAt = t;
  }
}

/** ▲▼ on the target speed: the new target in m/s (the web's adjustTargetSpeed). */
export const nextTargetSpeed = (e: RunEngine, delta: number): number => {
  const unit = e.cfg.unit;
  const toDisplay = unit === 'imperial' ? MPS_TO_MPH : MPS_TO_KPH;
  const cur = e.targetSpeed ? e.targetSpeed * toDisplay : null;
  const base = cur ?? (e.currentSpeed > 0.5 ? e.currentSpeed * toDisplay : defaultTargetFor(e.kind, unit));
  const next = Math.min(maxTargetFor(e.kind, unit), Math.max(1, Math.round((cur === null ? base : cur + delta) * 10) / 10));
  return next / toDisplay;
};

/** ▲▼ on the target distance: the new target in meters; null delta clears it (the web's adjustTargetDistance). */
export const nextTargetDistance = (e: RunEngine, delta: number | null): number => {
  const per = e.cfg.unit === 'imperial' ? 1609.34 : 1000;
  const covered = e.totalDistance / per;
  let next = 0;
  if (delta === null) next = 0; // clear: an open activity
  else if (!(e.targetDistance > 0)) next = Math.max(1, Math.ceil(covered + 0.5));
  else next = Math.max(0.1, Math.round((e.targetDistance / per + delta) * 100) / 100);
  return next * per;
};
