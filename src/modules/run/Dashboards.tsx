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
// Controls are wrapped in <Help id> so Helper Mode can point at them; the ids
// are iStride's. Not here yet: listening to the song through the microphone
// (tap the beat instead), the camera pulse check and heart-rate straps. Each
// needs a native piece from the shell.
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ActivityMap, type LngLat } from '@/shell/ActivityMap';

import { ACADEMY_TOTAL, academyPhaseAt } from './calc/academy';
import { modeTitle } from './calc/activityTypes';
import {
  calculateGAP, calculatePace, FOOD_BURNS, formatClock, formatSpeed, METERS_TO_FEET, METERS_TO_KM, METERS_TO_MILES, MPS_TO_KPH, MPS_TO_MPH,
} from './calc/constants';
import type { RunEngine } from './calc/engine';
import { ZONES, zoneOf, zoneRange } from './calc/heartZones';
import { hiitPhaseAt, hiitPhases } from './calc/hiit';
import { bpmFromTaps, stepsPerBeatFor } from './calc/tempo';
import { RunMode, TrainingZone } from './calc/types';
import { Help } from './helper/ui';
import {
  adjustHiitRounds, adjustTargetDistance, adjustTargetSpeed, applySong, dismissOffRoute, enterHeartRate, logGel, logSip, reroute, toggleHiit,
} from './liveRun';
import { closePanel, openPanel } from './panels';
import { Big, DarkButton, distUnit, FuelGauge, HydrationGauge, ink, Nudge, Panel, PulseEntry, Row, s, speedUnit, Tile } from './parts';
import type { RouteWeather, RunSetup } from './setup';

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
    <Help id="runs.live.targetSpeed">
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
    </Help>
  );
};

const TargetDistance: React.FC<{ e: RunEngine }> = ({ e }) => {
  const per = e.cfg.unit === 'imperial' ? 1609.34 : 1000;
  const u = distUnit(e.cfg.unit);
  const has = e.targetDistance > 0;
  const reached = has && e.totalDistance >= e.targetDistance;
  return (
    <Help id="runs.live.targetDistance">
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
    </Help>
  );
};

const Gauges: React.FC<{ e: RunEngine; setup: RunSetup }> = ({ e, setup }) => (
  <Row>
    <FuelGauge startCalories={setup.fuel.start_kcal} consumed={e.caloriesConsumed} burned={e.caloriesBurned} hasWeight={e.cfg.body.weight > 0}
      unit={e.cfg.unit} fasted={setup.fuel.fasted} onGel={logGel} />
    <HydrationGauge lost={e.fluidLostMl} intake={e.fluidIntakeMl} hasWeight={e.cfg.body.weight > 0} onSip={logSip} />
  </Row>
);

/** The route being followed (the one from setup, or the latest reroute), as the map wants it. */
const planned = (e: RunEngine): LngLat[] => e.plannedRoute.map((p) => [p.lng, p.lat]);

const RouteMap: React.FC<{ e: RunEngine; line: LngLat[] }> = ({ e, line }) => (
  <Help id="runs.live.map">
    <View style={{ gap: 8 }}>
      <ActivityMap route={line} planned={planned(e)} basemap="dark" follow style={{ height: 260 }} />
      <Help id="runs.live.mapExpand">
        <DarkButton title="Expand" onPress={() => openPanel('map')} fg={ink.dim} />
      </Help>
    </View>
  </Help>
);

const MapToggle: React.FC<{ e: RunEngine; line: LngLat[] }> = ({ e, line }) => {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Help id="exercise.live.mapToggle">
        <DarkButton title={open ? 'Hide map' : 'Show map'} onPress={() => setOpen((v) => !v)} fg={ink.dim} />
      </Help>
      {open && <RouteMap e={e} line={line} />}
    </View>
  );
};

/** The map, full screen (Expand). Pause stays under it. */
export const MapPanel: React.FC<{ e: RunEngine; line: LngLat[] }> = ({ e, line }) => (
  <View style={{ flex: 1, backgroundColor: ink.bg }}>
    <ActivityMap route={line} planned={planned(e)} basemap="dark" follow style={{ flex: 1, borderRadius: 0 }} />
    <View style={{ padding: 12 }}>
      <Help id="runs.live.mapClose">
        <DarkButton title="Close" onPress={closePanel} />
      </Help>
    </View>
  </View>
);

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

const OffRoute: React.FC<{ e: RunEngine }> = ({ e }) => {
  const [busy, setBusy] = useState(false);
  if (!e.isOffRoute || e.plannedRoute.length === 0) return null;
  return (
    <Help id="runs.live.offRoute">
      <Panel style={{ backgroundColor: '#431407', borderColor: '#F97316' }}>
        <Text style={{ color: ink.text, fontSize: 16, fontWeight: '900' }}>You&apos;re off your route</Text>
        <Text style={{ color: '#FED7AA', fontSize: 13 }}>Reroute for a new way to the finish.</Text>
        <Row>
          <Help id="runs.live.reroute" style={{ flex: 1 }}>
            <DarkButton title={busy ? 'Finding…' : 'Reroute'} disabled={busy} bg="#F97316" fg="#000000"
              onPress={() => { setBusy(true); void reroute().finally(() => setBusy(false)); }} />
          </Help>
          <DarkButton title="Dismiss" onPress={dismissOffRoute} bg="#7C2D12" fg="#FED7AA" style={{ flex: 1 }} disabled={busy} />
        </Row>
      </Panel>
    </Help>
  );
};

/** iStride's weatherCodeLabel (TempoRun services/weatherService.ts). */
const weatherCodeLabel = (code: number): { label: string; icon: string } => {
  if (code === 0) return { label: 'Clear', icon: '☀️' };
  if (code <= 2) return { label: 'Partly cloudy', icon: '⛅' };
  if (code === 3) return { label: 'Overcast', icon: '☁️' };
  if (code <= 48) return { label: 'Fog', icon: '🌫️' };
  if (code <= 57) return { label: 'Drizzle', icon: '🌦️' };
  if (code <= 67) return { label: 'Rain', icon: '🌧️' };
  if (code <= 77) return { label: 'Snow', icon: '🌨️' };
  if (code <= 82) return { label: 'Showers', icon: '🌧️' };
  if (code <= 86) return { label: 'Snow showers', icon: '🌨️' };
  return { label: 'Thunderstorm', icon: '⛈️' };
};

const ageOf = (savedAt: number) => {
  const mins = Math.round((Date.now() - savedAt) / 60000);
  return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
};

/** The button that opens the route weather checked in iStride before starting. */
const Weather: React.FC<{ setup: RunSetup }> = ({ setup }) =>
  setup.weather_report?.data ? (
    <Help id="runs.live.weather">
      <DarkButton title="🌤 Weather" onPress={() => openPanel('weather')} fg={ink.sky} />
    </Help>
  ) : null;

const RELATION = {
  headwind: { bg: '#3B1113', fg: ink.rose, arrow: '↓', label: 'Headwind' },
  tailwind: { bg: '#062B28', fg: ink.tealSoft, arrow: '↑', label: 'Tailwind' },
  crosswind: { bg: '#3A2A06', fg: ink.amber, arrow: '→', label: 'Crosswind' },
} as const;

/** The full route weather report, as iStride shows it (components/RouteWeatherPanel.tsx WeatherReport). */
export const WeatherPanel: React.FC<{ setup: RunSetup }> = ({ setup }) => {
  const stored = setup.weather_report;
  if (!stored?.data) return null;
  const data: RouteWeather = stored.data;
  const { segments, summary, unitLabels } = data;
  const cond = segments[0] ? weatherCodeLabel(segments[0].weatherCode) : { label: '', icon: '' };
  return (
    <View style={{ flex: 1, backgroundColor: ink.bg }}>
      <Row style={{ alignItems: 'center', padding: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.tileLabel, { color: ink.sky }]}>Route weather</Text>
          <Text style={{ color: ink.dim, fontSize: 13 }}>{stored.route_name} · checked {ageOf(stored.saved_at)}</Text>
        </View>
        <Help id="runs.live.weatherClose">
          <DarkButton title="Close" onPress={closePanel} />
        </Help>
      </Row>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Help id="runs.live.weatherPanel">
          <Panel>
            <Row>
              <Tile label="Temp" value={`${summary.tempMin}${summary.tempMax !== summary.tempMin ? `–${summary.tempMax}` : ''}${unitLabels.temp}`}
                sub={`feels ${summary.apparentMin}${summary.apparentMax !== summary.apparentMin ? `–${summary.apparentMax}` : ''}`} />
              <Tile label="Sky" value={cond.icon} sub={cond.label} />
              <Tile label="Gusts" value={`${summary.maxGust}`} sub={`${unitLabels.speed}${summary.precipMaxProb > 0 ? ` · ${summary.precipMaxProb}% precip` : ''}`} />
            </Row>
            <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' }}>
              {summary.headwindPct > 0 && <View style={{ width: `${summary.headwindPct}%`, backgroundColor: '#EF4444' }} />}
              {summary.crosswindPct > 0 && <View style={{ width: `${summary.crosswindPct}%`, backgroundColor: '#F59E0B' }} />}
              {summary.tailwindPct > 0 && <View style={{ width: `${summary.tailwindPct}%`, backgroundColor: '#14B8A6' }} />}
            </View>
            <Row>
              {summary.headwindPct > 0 && <Text style={{ color: ink.rose, fontSize: 13, fontWeight: '800' }}>{summary.headwindPct}% head</Text>}
              {summary.crosswindPct > 0 && <Text style={{ color: ink.amber, fontSize: 13, fontWeight: '800' }}>{summary.crosswindPct}% cross</Text>}
              {summary.tailwindPct > 0 && <Text style={{ color: ink.tealSoft, fontSize: 13, fontWeight: '800' }}>{summary.tailwindPct}% tail</Text>}
            </Row>
          </Panel>
        </Help>
        <Panel>
          {summary.advice.map((line, i) => (
            <Text key={line} style={{ color: '#E4E4E7', fontSize: 15, lineHeight: 21 }}>
              {i === 0 && <Text style={{ fontWeight: '900', color: ink.text }}>Race plan · </Text>}{line}
            </Text>
          ))}
        </Panel>
        <Text style={[s.tileLabel, { color: ink.faint }]}>By stretch</Text>
        {segments.map((sg) => {
          const r = RELATION[sg.relation] ?? RELATION.crosswind;
          return (
            <View key={`${sg.fromUnit}-${sg.toUnit}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: r.bg, borderRadius: 14, padding: 12 }}>
              <View style={{ width: 70 }}>
                <Text style={{ color: ink.text, fontSize: 14, fontWeight: '900' }}>
                  {sg.fromUnit === sg.toUnit ? `${unitLabels.distance === 'mi' ? 'Mile' : 'Km'} ${sg.fromUnit}` : `${sg.fromUnit}–${sg.toUnit}`}
                </Text>
                <Text style={{ color: ink.dim, fontSize: 12 }}>{new Date(sg.atTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#E4E4E7', fontSize: 13 }}>Heading {sg.travelCompass} · wind from {sg.windFromCompass} at {sg.windSpeed} {unitLabels.speed}</Text>
                <Text style={{ color: ink.dim, fontSize: 12 }}>{sg.temp}{unitLabels.temp} · gusts {sg.windGust}{sg.confidence === 'reduced' ? ' · terrain may alter wind here' : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: r.fg, fontSize: 13, fontWeight: '900' }}>{r.arrow} {r.label}</Text>
                <Text style={{ color: r.fg, fontSize: 12, fontWeight: '800' }}>{sg.alongComponent > 0 ? '+' : ''}{sg.alongComponent} {unitLabels.speed}</Text>
              </View>
            </View>
          );
        })}
        <Text style={{ color: ink.faint, fontSize: 12, lineHeight: 17 }}>Forecast, not measurement. Wind can differ in canyons and along ridgelines where models smooth the terrain.</Text>
      </ScrollView>
    </View>
  );
};

const TAPS_NEEDED = 8;
/**
 * Pace to the song: tap the beat and the target pace follows it, so each
 * step lands on the beat (iStride's SongPaceControl, by tapping; listening
 * through the microphone needs a native piece).
 */
const SongPace: React.FC<{ e: RunEngine; cadence: number }> = ({ e, cadence }) => {
  const taps = useRef<number[]>([]);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [count, setCount] = useState(0);
  const [result, setResult] = useState<{ bpm: number; cadence: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => () => { if (idle.current) clearTimeout(idle.current); }, []);
  const finishTaps = () => {
    const bpm = bpmFromTaps(taps.current);
    taps.current = [];
    setCount(0);
    if (!bpm) { setProblem('Those taps were uneven. Tap steadily on each beat, at least 6 times.'); return; }
    const steps = Math.round(bpm * stepsPerBeatFor(bpm, cadence > 100 ? cadence : result?.cadence ?? 165));
    setProblem(null);
    setResult({ bpm, cadence: steps });
    applySong(bpm, steps);
  };
  const tap = () => {
    taps.current.push(Date.now());
    setCount(taps.current.length);
    if (idle.current) clearTimeout(idle.current);
    if (taps.current.length >= TAPS_NEEDED) finishTaps();
    else idle.current = setTimeout(finishTaps, 2500);
  };
  const u = e.cfg.unit;
  return (
    <Help id="runs.live.song">
      <Panel>
        <DarkButton title={count > 0 ? `Tap on each beat · ${count}/${TAPS_NEEDED}` : '♪ Tap the beat of your song'} onPress={tap} bg="#2E1065" fg="#DDD6FE" style={{ minHeight: 64 }} />
        {result && e.targetSpeed ? (
          <Text style={{ color: '#DDD6FE', fontSize: 14, textAlign: 'center' }}>
            {result.bpm} beats a minute · {result.cadence} steps a minute · target pace now {calculatePace(e.targetSpeed, u)} /{distUnit(u)}
          </Text>
        ) : (
          <Text style={[s.tileSub, { fontSize: 12 }]}>Changed songs? Tap along and your target pace moves to its beat.</Text>
        )}
        {problem && <Text style={{ color: ink.orange, fontSize: 13, textAlign: 'center' }}>{problem}</Text>}
      </Panel>
    </Help>
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
        <Help id="runs.live.paceTiles" style={{ alignSelf: 'stretch', marginTop: 6 }}>
        <Row>
          <Tile label="Pace" value={calculatePace(shownSpeed(e), u, paceMax(e))} sub={`Target ${e.targetSpeed ? calculatePace(e.targetSpeed, u) : '--'}`} />
          <Tile label="Finish" value={f.projected !== null ? formatClock(f.projected) : '--'} sub={`Target ${f.target !== null ? formatClock(f.target) : '--'}`} color={f.behind ? ink.orange : ink.text} />
          <Tile label="Avg pace" value={e.elapsedTime > 0 && e.totalDistance > 0 ? calculatePace(avgSpeed(e), u) : '-:--'} sub={`/${distUnit(u)}`} color={ink.indigo} />
        </Row>
        </Help>
      </Panel>
      <TargetDistance e={e} />
      <SongPace e={e} cadence={cadence} />
      <OffRoute e={e} />
      {academy && (
        <Help id="runs.live.academy">
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
        </Help>
      )}
      {e.cfg.mode === RunMode.TRAIL && (
        <Help id="runs.live.trail">
        <Row>
          <Tile label="Elev gain" accent={ink.green} value={climb(e)} sub={u === 'imperial' ? 'ft' : 'm'} />
          <Tile label="Altitude" accent={ink.green} value={e.currentAltitude ? Math.round(u === 'imperial' ? e.currentAltitude * METERS_TO_FEET : e.currentAltitude) : '--'} sub={u === 'imperial' ? 'ft' : 'm'} />
          <Tile label="Grade" accent={ink.green} value={`${Math.round(e.currentGradient)}%`} />
          <Tile label="GAP" accent={ink.green} value={calculatePace(calculateGAP(e.currentSpeed, e.currentGradient), u)} />
        </Row>
        </Help>
      )}
      {e.cfg.mode === RunMode.TRACK && (
        <Row>
          <Tile label="Lap" accent={ink.tealSoft} value={e.splits.length + 1} sub="in progress" />
          <Tile label={e.trainingZone === TrainingZone.ANAEROBIC ? 'Sprint' : e.trainingZone === TrainingZone.AEROBIC ? 'Recovery' : 'Rest'} accent={ink.tealSoft}
            value={clockOf(e.currentPhaseDuration)} sub="this phase" color={e.trainingZone === TrainingZone.ANAEROBIC ? ink.indigo : ink.text} />
        </Row>
      )}
      <Splits e={e} />
      <RouteMap e={e} line={line} />
      <Row>
        <Help id="runs.live.hr" style={{ flex: 1, flexDirection: 'row' }}>
          <Tile label={hr?.fresh ? 'HR' : 'Rest HR'} accent={ink.rose} value={hr?.fresh ? hr.bpm : (setup.hr_pre?.bpm ?? '--')}
            sub={hr?.fresh ? `${hr.age}s ago` : setup.hr_pre ? 'before start' : 'enter below'} />
        </Help>
        <Help id="runs.live.spm" style={{ flex: 1, flexDirection: 'row' }}>
          <Tile label="SPM" accent={ink.purple} value={cadence || '--'} sub="cadence" />
        </Help>
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
      <Help id="runs.live.casual" style={{ alignItems: 'center', paddingVertical: 18 }}>
        <Text style={[s.tileLabel, { color: '#D8B4FE', letterSpacing: 3 }]}>{setup.pause_weight_loss ? 'Calorie burn' : 'Weight loss mode'}</Text>
        <Big value={e.cfg.body.weight > 0 ? String(total) : '--'} unit="Calories burned" color={ink.purple} size={128} />
      </Help>
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
        <Help id="exercise.live.speed" style={{ alignSelf: 'stretch', marginTop: 6 }}>
        <Row>
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
        </Help>
      </Panel>
      <TargetDistance e={e} />
      <OffRoute e={e} />
      <Help id="exercise.live.tiles">
      <Row>
        {ride
          ? <Tile label="Grade" accent={accent} value={`${Math.round(e.currentGradient)}%`} />
          : <Tile label="Avg pace" accent={accent} value={avgSpeed(e) > 0.1 ? calculatePace(avgSpeed(e), u, paceMax(e)) : '-:--'} sub={`/${distUnit(u)}`} />}
        <Tile label="Climb" accent={accent} value={climb(e)} sub={u === 'imperial' ? 'ft' : 'm'} />
        <Tile label="kcal" accent={accent} value={kcal(e)} sub="burned" />
        <HrTile e={e} now={now} accent={accent} />
      </Row>
      </Help>
      <Splits e={e} />
      <RouteMap e={e} line={line} />
      <Gauges e={e} setup={setup} />
      <PulseEntry last={e.spotHr?.bpm ?? null} onSave={enterHeartRate} />
      <Weather setup={setup} />
    </>
  );
};

// ── Heart Walk ──────────────────────────────────────────────────────────────
export const HeartWalkDash: React.FC<DashProps> = ({ e, line, steps, now }) => {
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
      <Help id="exercise.live.zone">
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
      </Help>
      <PulseEntry last={e.spotHr?.bpm ?? null} onSave={enterHeartRate} />
      <Help id="exercise.live.tiles">
      <Row>
        <Tile label="In zone" accent={ink.rose} value="--" sub="needs a strap" color="#4ADE80" />
        <Tile label="Pace" accent={ink.rose} value={calculatePace(shownSpeed(e), u, paceMax(e))} sub={`/${distUnit(u)}`} />
        <Tile label="Steps" accent={ink.rose} value={steps ? steps.toLocaleString() : '--'} />
        <Tile label="kcal" accent={ink.rose} value={kcal(e)} sub="burned" />
      </Row>
      </Help>
      <MapToggle e={e} line={line} />
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
      <Help id="exercise.live.hiitCard">
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
          <Help id="exercise.live.sprint" style={{ alignSelf: 'stretch' }}>
            <DarkButton title={isWork ? `Start ${plan.restLabel.toLowerCase()}` : 'Start sprint'} onPress={toggleHiit}
              bg={isWork ? ink.teal : '#F97316'} fg="#09090B" style={{ minHeight: 72 }} textStyle={{ fontSize: 24, fontStyle: 'italic' }} />
          </Help>
        )}
      </Panel>
      </Help>
      <Help id="exercise.live.tiles">
      <Row>
        <Tile label="Speed" accent={ink.orange} value={formatSpeed(shownSpeed(e), u)} sub={speedUnit(u).toLowerCase()} />
        <Tile label={isWork ? 'Sprint top' : 'Best sprint'} accent={ink.orange} color={ink.amber}
          value={isWork ? formatSpeed(e.hiit.maxSpeed, u) : sprints.length ? formatSpeed(Math.max(...sprints.map((x) => x.maxSpeed)), u) : '--'} sub={speedUnit(u).toLowerCase()} />
        <Tile label="Sprints" accent={ink.orange} value={`${sprints.length}${manual ? '' : `/${plan.rounds}`}`} sub="done" />
        <Tile label="kcal" accent={ink.orange} value={kcal(e)} sub="burned" />
      </Row>
      </Help>
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
      <MapToggle e={e} line={line} />
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
