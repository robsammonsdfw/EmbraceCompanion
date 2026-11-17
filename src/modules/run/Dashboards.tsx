// ============================================================================
// The live dashboards, one per kind of activity, showing what iStride's web
// RUNNING view shows for that kind (TempoRun App.tsx renderRunning and
// renderExerciseRunning):
//   run        speed, target speed ▲▼, pace / finish / average pace, target
//              distance ▲▼, splits, off-route notice, map, heart rate, fuel,
//              fluid, cadence, route weather. Academy adds the drill card;
//              Trail adds elevation gain, altitude, grade and GAP; Track adds
//              the lap in progress and sprint / recovery.
//   casual     the big calorie counter, food burned off, time, distance.
//   ride       speed, average, top, finish, climb, grade, calories, map.
//   walk       speed, pace, steps and cadence, finish, average pace, climb.
//   heartwalk  pulse, zone gauge, in / above / below zone, pace, steps.
//   hiit       the interval card, rounds − +, sprint tiles, the interval log.
// Not here yet (COMPANION_RUN_DASHBOARD.md §6): music pacing, the camera pulse
// check and heart-rate straps, and rerouting (the notice has Dismiss only).
// ============================================================================

import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { ActivityMap, type LngLat } from '@/shell/ActivityMap';

import { ACADEMY_TOTAL, academyPhaseAt } from './calc/academy';
import { modeTitle } from './calc/activityTypes';
import {
  calculateGAP, calculatePace, FOOD_BURNS, formatClock, formatSpeed, METERS_TO_FEET, METERS_TO_KM, METERS_TO_MILES, MPS_TO_KPH, MPS_TO_MPH,
} from './calc/constants';
import type { RunEngine } from './calc/engine';
import { ZONES, zoneOf, zoneRange } from './calc/heartZones';
import { hiitPhaseAt, hiitPhases } from './calc/hiit';
import { RunMode, TrainingZone } from './calc/types';
import {
  adjustHiitRounds, adjustTargetDistance, adjustTargetSpeed, dismissOffRoute, enterHeartRate, logGel, logSip, toggleHiit,
} from './liveRun';
import { Big, DarkButton, distUnit, FuelGauge, HydrationGauge, ink, Nudge, Panel, PulseEntry, Row, s, speedUnit, Tile } from './parts';
import type { RunSetup } from './setup';

export interface DashProps {
  e: RunEngine;
  setup: RunSetup;
  line: LngLat[];
  steps: number | null;
  cadence: number;
  now: number;
}

const clockOf = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
const shownSpeed = (e: RunEngine) => (e.isPaused ? 0 : e.currentSpeed);
const paceMax = (e: RunEngine) => (e.kind === 'walk' || e.kind === 'heartwalk' ? 3600 : 1200);
const avgSpeed = (e: RunEngine) => (e.elapsedTime > 0 ? e.totalDistance / e.elapsedTime : 0);
const climb = (e: RunEngine) => (e.cfg.unit === 'imperial' ? Math.round(e.elevationGain * METERS_TO_FEET) : Math.round(e.elevationGain));
const kcal = (e: RunEngine) => (e.caloriesBurned > 0 ? String(Math.round(e.caloriesBurned)) : e.cfg.body.weight > 0 ? '0' : '--');
export const distanceText = (e: RunEngine) => (e.totalDistance * (e.cfg.unit === 'imperial' ? METERS_TO_MILES : METERS_TO_KM)).toFixed(2);

/** Now against the target: when you'd finish at this speed, and the finish your target gives. */
const finish = (e: RunEngine) => {
  const remaining = e.targetDistance - e.totalDistance;
  const projected = e.targetDistance > 0
    ? (remaining <= 0 ? e.elapsedTime : e.currentSpeed > 0.5 ? e.elapsedTime + remaining / e.currentSpeed : null) : null;
  const target = e.targetDistance > 0 && e.targetSpeed ? e.targetDistance / e.targetSpeed : null;
  return { projected, target, behind: projected !== null && target !== null && projected > target };
};

/** The typed pulse, while it's fresh enough to show. */
const liveHr = (e: RunEngine, now: number) => {
  const sp = e.spotHr;
  if (!sp) return null;
  const age = Math.max(0, Math.round((now - sp.at) / 1000));
  return age <= 600 ? { bpm: sp.bpm, age, fresh: age <= 120 } : null;
};

const TargetSpeed: React.FC<{ e: RunEngine }> = ({ e }) => {
  const toDisplay = e.cfg.unit === 'imperial' ? MPS_TO_MPH : MPS_TO_KPH;
  const t = e.targetSpeed ? e.targetSpeed * toDisplay : null;
  const whole = t !== null ? Math.floor(Math.round(t * 10) / 10) : null;
  const tenth = t !== null ? Math.round(t * 10) % 10 : null;
  return (
    <Row style={{ alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
      <Text style={[s.tileLabel, { color: ink.dim, textAlign: 'right' }]}>Target{'\n'}{speedUnit(e.cfg.unit)}</Text>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Nudge label="Raise target by 1" text="▲" onPress={() => adjustTargetSpeed(1)} />
        <Text style={[s.gaugeValue, { fontSize: 30 }]}>{whole ?? '--'}</Text>
        <Nudge label="Lower target by 1" text="▼" onPress={() => adjustTargetSpeed(-1)} />
      </View>
      <Text style={[s.gaugeValue, { color: ink.faint, fontSize: 30 }]}>.</Text>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Nudge label="Raise target by 0.1" text="▲" onPress={() => adjustTargetSpeed(0.1)} />
        <Text style={[s.gaugeValue, { fontSize: 30 }]}>{tenth ?? '-'}</Text>
        <Nudge label="Lower target by 0.1" text="▼" onPress={() => adjustTargetSpeed(-0.1)} />
      </View>
    </Row>
  );
};

const TargetDistance: React.FC<{ e: RunEngine }> = ({ e }) => {
  const per = e.cfg.unit === 'imperial' ? 1609.34 : 1000;
  const u = distUnit(e.cfg.unit);
  const has = e.targetDistance > 0;
  const reached = has && e.totalDistance >= e.targetDistance;
  return (
    <Panel>
      <Row style={{ alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.tileLabel, { color: ink.dim }]}>{has ? 'Target distance' : e.kind === 'ride' ? 'Open ride' : e.kind === 'walk' ? 'Open walk' : 'Open run'}</Text>
          <Text style={[s.gaugeValue, { fontSize: 30 }]}>{has ? (e.targetDistance / per).toFixed(2) : '--'} <Text style={{ fontSize: 16, color: ink.faint }}>{u}</Text></Text>
          <Text style={[s.tileSub, { textAlign: 'left', color: reached ? ink.tealSoft : ink.dim }]}>
            {!has ? 'No distance target' : reached ? 'Reached ✓' : `${(Math.max(0, e.targetDistance - e.totalDistance) / per).toFixed(2)} ${u} to go`}
          </Text>
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Nudge label="Raise target distance by 1" text="▲" onPress={() => adjustTargetDistance(1)} />
          <Nudge label="Lower target distance by 1" text="▼" onPress={() => adjustTargetDistance(-1)} />
          <Text style={s.tileSub}>1</Text>
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Nudge label="Raise target distance by 0.1" text="▲" onPress={() => adjustTargetDistance(0.1)} />
          <Nudge label="Lower target distance by 0.1" text="▼" onPress={() => adjustTargetDistance(-0.1)} />
          <Text style={s.tileSub}>0.1</Text>
        </View>
      </Row>
      {has && (
        <>
          <View style={s.bar}><View style={[s.barFill, { width: `${Math.min(100, (e.totalDistance / e.targetDistance) * 100)}%`, backgroundColor: ink.tealSoft }]} /></View>
          <DarkButton title="Clear target" onPress={() => adjustTargetDistance(null)} fg={ink.dim} />
        </>
      )}
    </Panel>
  );
};

const Gauges: React.FC<{ e: RunEngine; setup: RunSetup }> = ({ e, setup }) => (
  <Row>
    <FuelGauge startCalories={setup.fuel.start_kcal} consumed={e.caloriesConsumed} burned={e.caloriesBurned} hasWeight={e.cfg.body.weight > 0}
      unit={e.cfg.unit} fasted={setup.fuel.fasted} onGel={logGel} />
    <HydrationGauge lost={e.fluidLostMl} intake={e.fluidIntakeMl} hasWeight={e.cfg.body.weight > 0} onSip={logSip} />
  </Row>
);

const planned = (setup: RunSetup): LngLat[] => setup.planned_route.map(([lat, lng]) => [lng, lat]);

const RouteMap: React.FC<{ setup: RunSetup; line: LngLat[] }> = ({ setup, line }) => (
  <ActivityMap route={line} planned={planned(setup)} basemap="dark" follow style={{ height: 260 }} />
);

const MapToggle: React.FC<{ setup: RunSetup; line: LngLat[] }> = ({ setup, line }) => {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <DarkButton title={open ? 'Hide map' : 'Show map'} onPress={() => setOpen((v) => !v)} fg={ink.dim} />
      {open && <RouteMap setup={setup} line={line} />}
    </View>
  );
};

const HrTile: React.FC<{ e: RunEngine; now: number; accent?: string }> = ({ e, now, accent = ink.rose }) => {
  const hr = liveHr(e, now);
  const fresh = hr?.fresh ? hr : null;
  const zone = fresh && e.cfg.maxHr ? zoneOf(fresh.bpm, e.cfg.maxHr) : null;
  return (
    <Tile label="Heart" accent={accent} value={fresh ? fresh.bpm : '--'}
      sub={fresh ? `${zone ? `Zone ${zone}` : 'resting'} · ${fresh.age}s ago` : 'enter below'}
      color={fresh ? (zone ? ZONES[zone - 1].color : ink.rose) : ink.faint} />
  );
};

const OffRoute: React.FC<{ e: RunEngine }> = ({ e }) =>
  e.isOffRoute && e.cfg.plannedRoute.length > 0 ? (
    <Panel style={{ backgroundColor: '#431407', borderColor: '#F97316' }}>
      <Text style={{ color: ink.text, fontSize: 16, fontWeight: '900' }}>You&apos;re off your route</Text>
      <Text style={{ color: '#FED7AA', fontSize: 13 }}>The map shows your planned route as a dashed line.</Text>
      <DarkButton title="Dismiss" onPress={dismissOffRoute} bg="#7C2D12" fg="#FED7AA" />
    </Panel>
  ) : null;

/** The route weather checked on the web before starting (the summary saved with the activity). */
const Weather: React.FC<{ setup: RunSetup }> = ({ setup }) => {
  const w = setup.weather as Record<string, string | number | null> | null;
  if (!w) return null;
  const n = (k: string) => (typeof w[k] === 'number' ? Math.round(w[k] as number) : null);
  const lo = n('temp_min'), hi = n('temp_max'), rain = n('rain_chance_max'), gust = n('max_gust'), head = n('headwind_pct');
  return (
    <Panel>
      <Text style={[s.tileLabel, { color: ink.sky }]}>Route weather{w.route_name ? ` · ${String(w.route_name)}` : ''}</Text>
      <Row>
        <Tile label="Temp" value={lo !== null && hi !== null ? (lo === hi ? `${hi}` : `${lo}–${hi}`) : '--'} sub={String(w.temp_unit ?? '')} />
        <Tile label="Rain" value={rain !== null ? `${rain}%` : '--'} sub="chance" />
        <Tile label="Gusts" value={gust !== null ? `${gust}` : '--'} sub={String(w.speed_unit ?? '')} />
        <Tile label="Headwind" value={head !== null ? `${head}%` : '--'} sub="of route" />
      </Row>
    </Panel>
  );
};

const Splits: React.FC<{ e: RunEngine }> = ({ e }) => {
  if (!e.splits.length) return null;
  return (
    <Panel>
      <Text style={[s.tileLabel, { color: ink.dim }]}>{e.cfg.mode === RunMode.TRACK ? 'Laps' : 'Splits'}</Text>
      {e.splits.slice(-4).reverse().map((sp) => (
        <Row key={sp.distanceLabel} style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: ink.dim, fontSize: 16, fontWeight: '800' }}>{sp.distanceLabel}</Text>
          <Text style={{ color: ink.text, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{formatClock(sp.timeSeconds)}</Text>
          <Text style={{ color: ink.text, fontSize: 16, fontVariant: ['tabular-nums'] }}>{sp.pace}</Text>
        </Row>
      ))}
    </Panel>
  );
};

// ── Run: Academy, Trail, Track, Endurance ───────────────────────────────────
export const RunDash: React.FC<DashProps> = ({ e, setup, line, cadence, now }) => {
  const u = e.cfg.unit;
  const f = finish(e);
  const hr = liveHr(e, now);
  const academy = e.cfg.mode === RunMode.ACADEMY ? academyPhaseAt(e.elapsedTime) : null;
  return (
    <>
      <Panel style={{ alignItems: 'center' }}>
        <Big value={formatSpeed(shownSpeed(e), u)} unit={speedUnit(u)} />
        <TargetSpeed e={e} />
        <Row style={{ alignSelf: 'stretch', marginTop: 6 }}>
          <Tile label="Pace" value={calculatePace(shownSpeed(e), u, paceMax(e))} sub={`Target ${e.targetSpeed ? calculatePace(e.targetSpeed, u) : '--'}`} />
          <Tile label="Finish" value={f.projected !== null ? formatClock(f.projected) : '--'} sub={`Target ${f.target !== null ? formatClock(f.target) : '--'}`} color={f.behind ? ink.orange : ink.text} />
          <Tile label="Avg pace" value={e.elapsedTime > 0 && e.totalDistance > 0 ? calculatePace(avgSpeed(e), u) : '-:--'} sub={`/${distUnit(u)}`} color={ink.indigo} />
        </Row>
      </Panel>
      <TargetDistance e={e} />
      <OffRoute e={e} />
      {academy && (
        <Panel style={academy.phase?.kind === 'fast' ? { backgroundColor: '#1E1B4B', borderColor: ink.indigo } : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={[s.tileLabel, { color: '#A5B4FC' }]}>Academy session</Text>
            <Text style={[s.tileLabel, { color: ink.dim }]}>{academy.index === -1 ? 'Complete' : `${clockOf(Math.max(0, ACADEMY_TOTAL - e.elapsedTime))} left`}</Text>
          </Row>
          {academy.index === -1 || !academy.phase ? (
            <Text style={{ color: ink.text, fontSize: 18, fontWeight: '900' }}>Drills done — run easy or finish</Text>
          ) : (
            <>
              <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ color: ink.text, fontSize: 22, fontWeight: '900', fontStyle: 'italic' }}>{academy.phase.name}</Text>
                <Text style={[s.gaugeValue, { fontSize: 30 }]}>{clockOf(academy.remaining)}</Text>
              </Row>
              <Text style={{ color: '#D4D4D8', fontSize: 14 }}>{academy.phase.cue}</Text>
              {academy.next && <Text style={[s.tileLabel, { color: ink.faint }]}>Next: {academy.next.name}</Text>}
            </>
          )}
        </Panel>
      )}
      {e.cfg.mode === RunMode.TRAIL && (
        <Row>
          <Tile label="Elev gain" accent={ink.green} value={climb(e)} sub={u === 'imperial' ? 'ft' : 'm'} />
          <Tile label="Altitude" accent={ink.green} value={e.currentAltitude ? Math.round(u === 'imperial' ? e.currentAltitude * METERS_TO_FEET : e.currentAltitude) : '--'} sub={u === 'imperial' ? 'ft' : 'm'} />
          <Tile label="Grade" accent={ink.green} value={`${Math.round(e.currentGradient)}%`} />
          <Tile label="GAP" accent={ink.green} value={calculatePace(calculateGAP(e.currentSpeed, e.currentGradient), u)} />
        </Row>
      )}
      {e.cfg.mode === RunMode.TRACK && (
        <Row>
          <Tile label="Lap" accent={ink.tealSoft} value={e.splits.length + 1} sub="in progress" />
          <Tile label={e.trainingZone === TrainingZone.ANAEROBIC ? 'Sprint' : e.trainingZone === TrainingZone.AEROBIC ? 'Recovery' : 'Rest'} accent={ink.tealSoft}
            value={clockOf(e.currentPhaseDuration)} sub="this phase" color={e.trainingZone === TrainingZone.ANAEROBIC ? ink.indigo : ink.text} />
        </Row>
      )}
      <Splits e={e} />
      <RouteMap setup={setup} line={line} />
      <Row>
        <Tile label={hr?.fresh ? 'HR' : 'Rest HR'} accent={ink.rose} value={hr?.fresh ? hr.bpm : (setup.hr_pre?.bpm ?? '--')}
          sub={hr?.fresh ? `${hr.age}s ago` : setup.hr_pre ? 'before start' : 'enter below'} />
        <Tile label="SPM" accent={ink.purple} value={cadence || '--'} sub="cadence" />
      </Row>
      <Gauges e={e} setup={setup} />
      <PulseEntry last={e.spotHr?.bpm ?? null} onSave={enterHeartRate} />
      <Weather setup={setup} />
    </>
  );
};

// ── Casual: Calorie Burning Mode ────────────────────────────────────────────
export const CasualDash: React.FC<DashProps> = ({ e, setup }) => {
  const total = Math.round(e.caloriesBurned);
  const food = FOOD_BURNS.slice().reverse().find((f) => total >= f.k) || null;
  return (
    <>
      <View style={{ alignItems: 'center', paddingVertical: 18 }}>
        <Text style={[s.tileLabel, { color: '#D8B4FE', letterSpacing: 3 }]}>{setup.pause_weight_loss ? 'Calorie burn' : 'Weight loss mode'}</Text>
        <Big value={e.cfg.body.weight > 0 ? String(total) : '--'} unit="Calories burned" color={ink.purple} size={128} />
      </View>
      {/* Food burned off: not shown when weight loss is paused (never say why). */}
      {!setup.pause_weight_loss && (
        <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Text style={{ fontSize: 48 }}>{food ? food.icon : '🔥'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.tileLabel, { color: '#D8B4FE' }]}>Equivalent to</Text>
            <Text style={{ color: ink.text, fontSize: 22, fontWeight: '900', fontStyle: 'italic' }}>{food ? `You burned a ${food.label}!` : 'Keep moving!'}</Text>
          </View>
        </Panel>
      )}
      <Row>
        <Tile label="Duration" value={formatClock(e.elapsedTime)} />
        <Tile label={e.cfg.unit === 'imperial' ? 'Miles' : 'Kilometers'} value={distanceText(e)} />
      </Row>
    </>
  );
};

// ── Ride and walk ───────────────────────────────────────────────────────────
export const RideWalkDash: React.FC<DashProps> = ({ e, setup, line, steps, cadence, now }) => {
  const u = e.cfg.unit;
  const ride = e.kind === 'ride';
  const accent = ride ? ink.green : ink.sky;
  const f = finish(e);
  // Speeds are smoothed from zero, so early on the top can lag the average; it's never really below it.
  const top = Math.max(e.maxPointSpeed, avgSpeed(e));
  return (
    <>
      <Panel style={{ alignItems: 'center' }}>
        <Big value={formatSpeed(shownSpeed(e), u)} unit={speedUnit(u)} color={accent} />
        <TargetSpeed e={e} />
        <Row style={{ alignSelf: 'stretch', marginTop: 6 }}>
          {ride ? (
            <>
              <Tile label="Avg" accent={accent} value={formatSpeed(avgSpeed(e), u)} sub={speedUnit(u).toLowerCase()} />
              <Tile label="Top" accent={accent} value={formatSpeed(top, u)} sub={speedUnit(u).toLowerCase()} color={ink.amber} />
            </>
          ) : (
            <>
              <Tile label="Pace" accent={accent} value={calculatePace(shownSpeed(e), u, paceMax(e))} sub={e.targetSpeed ? `target ${calculatePace(e.targetSpeed, u)}` : `/${distUnit(u)}`} />
              <Tile label="Steps" accent={accent} value={steps ? steps.toLocaleString() : '--'} sub={cadence ? `${cadence} spm` : steps === null ? 'not counted' : 'counting…'} />
            </>
          )}
          <Tile label="Finish" accent={accent} value={f.projected !== null ? formatClock(f.projected) : '--'} sub={f.target !== null ? `target ${formatClock(f.target)}` : 'set a target'} color={f.behind ? ink.orange : ink.text} />
        </Row>
      </Panel>
      <TargetDistance e={e} />
      <OffRoute e={e} />
      <Row>
        {ride
          ? <Tile label="Grade" accent={accent} value={`${Math.round(e.currentGradient)}%`} />
          : <Tile label="Avg pace" accent={accent} value={avgSpeed(e) > 0.1 ? calculatePace(avgSpeed(e), u, paceMax(e)) : '-:--'} sub={`/${distUnit(u)}`} />}
        <Tile label="Climb" accent={accent} value={climb(e)} sub={u === 'imperial' ? 'ft' : 'm'} />
        <Tile label="kcal" accent={accent} value={kcal(e)} sub="burned" />
        <HrTile e={e} now={now} accent={accent} />
      </Row>
      <Splits e={e} />
      <RouteMap setup={setup} line={line} />
      <Gauges e={e} setup={setup} />
      <PulseEntry last={e.spotHr?.bpm ?? null} onSave={enterHeartRate} />
      <Weather setup={setup} />
    </>
  );
};

// ── Heart Walk ──────────────────────────────────────────────────────────────
export const HeartWalkDash: React.FC<DashProps> = ({ e, setup, line, steps, now }) => {
  const u = e.cfg.unit;
  const tz = e.cfg.targetZone;
  const maxHr = e.cfg.maxHr;
  const hr = liveHr(e, now);
  const fresh = hr?.fresh ? hr : null;
  const zone = fresh && maxHr ? zoneOf(fresh.bpm, maxHr) : null;
  const status = !fresh || !maxHr ? null : zone === tz ? 'in' : (zone ?? 0) > tz ? 'high' : 'low';
  const color = fresh ? (zone ? ZONES[zone - 1].color : ink.rose) : '#52525B';
  return (
    <>
      <Panel>
        <Text style={[s.tileLabel, { color: ink.dim, textAlign: 'center' }]}>Heart rate</Text>
        <Big value={fresh ? String(fresh.bpm) : '--'} unit="bpm" color={ink.faint} valueColor={color} />
        {hr && (
          <Text style={[s.tileSub, { color: hr.fresh ? ink.dim : ink.rose }]}>
            Entered {hr.age < 60 ? `${hr.age}s` : `${Math.floor(hr.age / 60)} min`} ago{hr.fresh ? '' : ' — enter it again'}
          </Text>
        )}
        {/* The five zones, the target outlined, the current one lit. */}
        <Row style={{ gap: 4 }}>
          {ZONES.map((z) => (
            <View key={z.zone} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
              <View style={{ alignSelf: 'stretch', height: 18, borderRadius: 6, backgroundColor: z.color, opacity: zone === z.zone ? 1 : 0.25, borderWidth: z.zone === tz ? 2 : 0, borderColor: ink.text }} />
              <Text style={[s.tileSub, z.zone === tz && { color: ink.text }]}>Z{z.zone}</Text>
            </View>
          ))}
        </Row>
        <View style={{ borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12, backgroundColor: status === 'in' ? '#052E16' : status === 'high' ? '#450A0A' : status === 'low' ? '#172554' : ink.bg }}>
          <Text style={{ textAlign: 'center', fontSize: 19, fontWeight: '900', textTransform: 'uppercase', color: status === 'in' ? '#4ADE80' : status === 'high' ? ink.rose : status === 'low' ? '#93C5FD' : ink.dim }}>
            {status === 'in' ? `✓ In zone ${tz} — hold this pace`
              : status === 'high' ? 'Too hard — slow down'
              : status === 'low' ? `Below zone ${tz} — pick it up`
              : !maxHr ? 'Add your age or max HR in iStride for zones'
              : 'Enter your pulse to see your zone'}
          </Text>
          {maxHr ? <Text style={[s.tileSub, { color: '#D4D4D8' }]}>Zone {tz} is {zoneRange(tz, maxHr).join('–')} bpm</Text> : null}
        </View>
      </Panel>
      <PulseEntry last={e.spotHr?.bpm ?? null} onSave={enterHeartRate} />
      <Row>
        <Tile label="In zone" accent={ink.rose} value="--" sub="needs a strap" color="#4ADE80" />
        <Tile label="Pace" accent={ink.rose} value={calculatePace(shownSpeed(e), u, paceMax(e))} sub={`/${distUnit(u)}`} />
        <Tile label="Steps" accent={ink.rose} value={steps ? steps.toLocaleString() : '--'} />
        <Tile label="kcal" accent={ink.rose} value={kcal(e)} sub="burned" />
      </Row>
      <MapToggle setup={setup} line={line} />
    </>
  );
};

// ── HIIT ────────────────────────────────────────────────────────────────────
export const HiitDash: React.FC<DashProps> = ({ e, setup, line, now }) => {
  const u = e.cfg.unit;
  const plan = e.hiitPlan;
  if (!plan) return null;
  const manual = !!plan.manual;
  const at = manual ? null : hiitPhaseAt(hiitPhases(plan), e.elapsedTime);
  const phase = at?.phase ?? null;
  const mk = manual ? (e.hiitManual?.kind ?? null) : phase?.kind ?? null;
  const isWork = mk === 'work';
  const bg = isWork ? '#9A3412' : mk === 'rest' ? '#115E59' : ink.panel;
  const phaseSecs = manual ? (e.hiitManual ? Math.floor((now - e.hiitManual.since) / 1000) : 0) : phase && at ? phase.secs - at.remaining : 0;
  const sprints = e.intervals.filter((i) => i.type === 'SPRINT');
  const title = manual ? (e.hiitManual ? (isWork ? 'Sprint' : plan.restLabel) : 'Ready') : at && at.index === -1 ? 'Done' : phase?.label ?? 'Warm-up';
  const floor = e.hiitRoundsFloor();
  return (
    <>
      <Panel style={{ backgroundColor: bg, alignItems: 'center' }}>
        <Text style={[s.tileLabel, { color: '#FED7AA', letterSpacing: 2 }]}>
          {manual ? (e.hiitManual ? `Round ${e.hiitManual.round}` : 'Tap to start your first sprint')
            : phase?.round ? `Round ${phase.round} of ${plan.rounds}` : at?.index === -1 ? 'Workout complete' : `${plan.rounds} ${plan.rounds === 1 ? 'sprint' : 'sprints'}`}
        </Text>
        <Text style={{ color: ink.text, fontSize: 52, fontWeight: '900', fontStyle: 'italic', textTransform: 'uppercase' }} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
        <Text style={[s.big, { fontSize: 96, lineHeight: 100, letterSpacing: 0, fontStyle: 'normal' }]}>
          {manual ? clockOf(phaseSecs) : at && at.index >= 0 ? clockOf(at.remaining) : clockOf(0)}
        </Text>
        {!manual && phase && (
          <View style={[s.bar, { backgroundColor: 'rgba(255,255,255,0.15)' }]}><View style={[s.barFill, { width: `${Math.min(100, (phaseSecs / phase.secs) * 100)}%`, backgroundColor: ink.text }]} /></View>
        )}
        {!manual && at?.next && (
          <Text style={[s.tileLabel, { color: '#FDE68A', fontSize: 14 }]}>Next: {at.next.label}{at.next.round ? ` ${at.next.round}` : ''} · {at.next.secs}s</Text>
        )}
        {/* Rounds, changeable mid-workout (not once the cool-down starts). */}
        {!manual && phase && phase.kind !== 'cooldown' && (
          <Row style={{ alignItems: 'center', marginTop: 6 }}>
            <Text style={[s.tileLabel, { color: '#FED7AA' }]}>Rounds</Text>
            <Nudge label="Fewer rounds" text="−" onPress={() => adjustHiitRounds(-1)} disabled={plan.rounds <= floor} />
            <Text style={[s.gaugeValue, { fontSize: 30, width: 48, textAlign: 'center' }]}>{plan.rounds}</Text>
            <Nudge label="More rounds" text="+" onPress={() => adjustHiitRounds(1)} disabled={plan.rounds >= 40} />
          </Row>
        )}
        {manual && (
          <DarkButton title={isWork ? `Start ${plan.restLabel.toLowerCase()}` : 'Start sprint'} onPress={toggleHiit}
            bg={isWork ? ink.teal : '#F97316'} fg="#09090B" style={{ alignSelf: 'stretch', minHeight: 72 }} textStyle={{ fontSize: 24, fontStyle: 'italic' }} />
        )}
      </Panel>
      <Row>
        <Tile label="Speed" accent={ink.orange} value={formatSpeed(shownSpeed(e), u)} sub={speedUnit(u).toLowerCase()} />
        <Tile label={isWork ? 'Sprint top' : 'Best sprint'} accent={ink.orange} color={ink.amber}
          value={isWork ? formatSpeed(e.hiit.maxSpeed, u) : sprints.length ? formatSpeed(Math.max(...sprints.map((x) => x.maxSpeed)), u) : '--'} sub={speedUnit(u).toLowerCase()} />
        <Tile label="Sprints" accent={ink.orange} value={`${sprints.length}${manual ? '' : `/${plan.rounds}`}`} sub="done" />
        <Tile label="kcal" accent={ink.orange} value={kcal(e)} sub="burned" />
      </Row>
      <Row><HrTile e={e} now={now} accent={ink.orange} /></Row>
      {e.intervals.length > 0 && (
        <Panel>
          <Row><Text style={[s.tileLabel, { flex: 2, color: ink.faint }]}>Interval</Text><Text style={[s.tileLabel, { flex: 1, color: ink.faint, textAlign: 'center' }]}>Time</Text><Text style={[s.tileLabel, { flex: 1, color: ink.faint, textAlign: 'center' }]}>Dist</Text><Text style={[s.tileLabel, { flex: 1, color: ink.faint, textAlign: 'right' }]}>Top</Text></Row>
          {e.intervals.slice().reverse().slice(0, 8).map((iv) => (
            <Row key={iv.id}>
              <Text style={{ flex: 2, fontSize: 15, fontWeight: '900', color: iv.type === 'SPRINT' ? ink.orange : '#5EEAD4' }}>{iv.label ?? iv.type}{iv.round ? ` ${iv.round}` : ''}</Text>
              <Text style={{ flex: 1, fontSize: 15, color: '#E4E4E7', textAlign: 'center' }}>{clockOf(iv.duration)}</Text>
              <Text style={{ flex: 1, fontSize: 15, color: '#E4E4E7', textAlign: 'center' }}>{u === 'imperial' ? `${Math.round((iv.distance * METERS_TO_FEET) / 3)} yd` : `${Math.round(iv.distance)} m`}</Text>
              {/* Top speed is a sprint's number: a recovery's "top" is just the sprint winding down. */}
              <Text style={{ flex: 1, fontSize: 15, color: ink.amber, textAlign: 'right' }}>{iv.type === 'SPRINT' ? formatSpeed(iv.maxSpeed, u) : '—'}</Text>
            </Row>
          ))}
        </Panel>
      )}
      <Gauges e={e} setup={setup} />
      <PulseEntry last={e.spotHr?.bpm ?? null} onSave={enterHeartRate} />
      <MapToggle setup={setup} line={line} />
    </>
  );
};

/** Screen-on mode: three numbers, high contrast, readable on handlebars in sunlight. */
export const SimpleDash: React.FC<DashProps> = ({ e }) => {
  const u = e.cfg.unit;
  const ride = e.kind === 'ride';
  return (
    <View style={{ gap: 6, paddingVertical: 8 }}>
      <Big value={ride ? formatSpeed(shownSpeed(e), u) : calculatePace(shownSpeed(e), u, paceMax(e))} unit={ride ? speedUnit(u) : `min / ${distUnit(u)}`} color="#FFFFFF" size={150} />
      <Big value={distanceText(e)} unit={distUnit(u)} color="#FFFFFF" size={96} />
      <Big value={formatClock(e.elapsedTime)} unit="time" color="#FFFFFF" size={96} />
    </View>
  );
};

export const dashTitle = (mode: RunMode) => modeTitle(mode);
