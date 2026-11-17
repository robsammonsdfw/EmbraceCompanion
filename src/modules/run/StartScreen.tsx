// ============================================================================
// /run/start — where a go.embracehealth.ai/run/start link lands.
//   With a setup (the link's `setup`): one card with the activity, route
//   preview, goal and gear the member chose on iStride's setup screen, then
//   Start.
//   Without one (opened from the Companion's Home, or the setup expired): the
//   modes as tiles; Start begins with the web's defaults.
// Start asks for location the first time (plain words first), and for motion
// on foot (step counting), then starts tracking and opens the dashboard.
// ============================================================================

import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pedometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ActivityMap } from '@/shell/ActivityMap';
import { RUN_APP_URL } from '@/shell/config';
import { finish as openLink, safeReturnTo } from '@/shell/links';
import { PermissionCard } from '@/shell/PermissionCard';
import { colors, radius } from '@/shell/theme';
import { Body, Button, Card, Label, Screen, Title } from '@/shell/ui';
import { retryUpload, useUpload } from '@/shell/uploads';

import { activityLabel, EXERCISE_MODES, kindOfMode, modeTitle, RUN_MODES } from './calc/activityTypes';
import { calculatePace, formatClock, MPS_TO_KPH, MPS_TO_MPH } from './calc/constants';
import { hiitPlanSummary } from './calc/hiit';
import { isRunMode, RunMode, type Unit } from './calc/types';
import { currentLive, interruptedActivity, startActivity, useLive } from './liveRun';
import { Help, HelperLayer, HelperPill, useHelperScreen } from './helper/ui';
import { RecoveryCard } from './RecoveryCard';
import { defaultSetup, loadSetup, type RunSetup } from './setup';
import { finishedActivities, forgetActivity, getPref, setPref, type Activity } from './store';

/** What each mode is, as on iStride's tiles. */
const SUBTITLE: Record<RunMode, string> = {
  [RunMode.ACADEMY]: 'AI Coach & Drills',
  [RunMode.TRAIL]: 'Elevation & Off-Road',
  [RunMode.TRACK]: 'Split & Lap Focus',
  [RunMode.ENDURANCE]: 'Long Distance Fueling',
  [RunMode.CASUAL]: 'Calorie Burning Mode',
  [RunMode.HIIT]: 'Sprint & Walk Intervals',
  [RunMode.CYCLING]: 'Speed, Climbing & Ride Burn',
  [RunMode.WALKING]: 'Steps, Pace & Distance',
  [RunMode.HEART_WALK]: 'Pulse & Zone 2 Training',
};
const ALL_MODES: RunMode[] = [...RUN_MODES, ...EXERCISE_MODES.filter((m) => !RUN_MODES.includes(m))];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const timeOf = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** The goal, in a line or two. */
const goalLines = (s: RunSetup): string[] => {
  const kind = kindOfMode(s.mode);
  const per = s.unit === 'imperial' ? 1609.34 : 1000;
  const u = s.unit === 'imperial' ? 'mi' : 'km';
  const out: string[] = [];
  if (s.target_distance_m > 0) out.push(`${(s.target_distance_m / per).toFixed(2)} ${u}${s.planned_route.length > 1 ? ' on your route' : ''}`);
  else out.push(kind === 'ride' ? 'Open ride, no distance target' : kind === 'walk' || kind === 'heartwalk' ? 'Open walk, no distance target' : 'Open run, no distance target');
  if (s.target_speed_mps) {
    out.push(kind === 'ride'
      ? `Target ${(s.target_speed_mps * (s.unit === 'imperial' ? MPS_TO_MPH : MPS_TO_KPH)).toFixed(1)} ${s.unit === 'imperial' ? 'mph' : 'kph'}`
      : `Target pace ${calculatePace(s.target_speed_mps, s.unit, 3600)} /${u}`);
    if (s.target_distance_m > 0) out.push(`Finish in about ${formatClock(s.target_distance_m / s.target_speed_mps)}`);
  }
  if (kind === 'hiit' && s.hiit) out.push(`${s.hiit.name}: ${hiitPlanSummary(s.hiit)}`);
  if (kind === 'heartwalk') out.push(`Stay in heart-rate zone ${s.target_zone ?? 2}`);
  return out;
};

/** A finished activity whose upload may still be waiting. */
function UploadRow({ a }: { a: Activity }) {
  const upload = useUpload(a.clientRunId);
  const [gone, setGone] = useState(false);
  if (gone || !upload) return null;
  const runId = (upload.result as { id?: number } | null)?.id ?? null;
  const what = `${activityLabel(a.setup.mode)} at ${timeOf(a.startedAt)}`;
  if (upload.status === 'done' && runId !== null) {
    return (
      <Card tone="teal">
        <Title>{what}: saved</Title>
        <Button title="Open its report in iStride" onPress={() => { forgetActivity(a.clientRunId); setGone(true); void openLink(`${RUN_APP_URL}?section=report&run=${runId}`); }} />
        <Button kind="secondary" title="Dismiss" onPress={() => { forgetActivity(a.clientRunId); setGone(true); }} />
      </Card>
    );
  }
  if (upload.status === 'failed') {
    return (
      <Card tone="danger">
        <Title>{what}: not saved yet</Title>
        <Body>It&apos;s safe on your phone. {upload.error ?? ''}</Body>
        <Button title="Try again" onPress={() => retryUpload(a.clientRunId)} />
      </Card>
    );
  }
  return (
    <Card tone="orange">
      <Title>{what}: saved on your phone</Title>
      <Body>It will upload when you&apos;re back online.</Body>
    </Card>
  );
}

type Ask = 'location' | 'motion' | null;

export default function StartScreen() {
  const params = useLocalSearchParams<{ setup?: string; mode?: string; return_to?: string }>();
  const setupId = first(params.setup) ?? null;
  const linkMode = (() => { const m = String(first(params.mode) ?? '').toUpperCase(); return isRunMode(m) ? m : null; })();
  const returnTo = safeReturnTo(params.return_to);

  const live = useLive();
  const [setup, setSetup] = useState<RunSetup | null>(null);
  const [loading, setLoading] = useState(!!setupId);
  const [mode, setMode] = useState<RunMode>(linkMode ?? RunMode.CASUAL);
  const [unit, setUnit] = useState<Unit>(() => (getPref('unit') === 'metric' ? 'metric' : 'imperial'));
  const [cuesOn, setCuesOn] = useState(() => getPref('cues') !== 'off');
  const [ask, setAsk] = useState<Ask>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useHelperScreen('start');

  // An activity already running: straight to its dashboard.
  const running = !!live && live.engine.finishedAt === null;
  useEffect(() => { if (running) router.replace('/run/live'); }, [running]);

  useEffect(() => {
    if (!setupId) { setSetup(null); setLoading(false); return; }
    let on = true;
    setLoading(true);
    loadSetup(setupId)
      .then((s) => { if (on) { setSetup(s); if (s) setMode(s.mode); } })
      .catch(() => { if (on) setSetup(null); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [setupId]);

  const chosen = setup?.mode ?? mode;
  const kind = kindOfMode(chosen);
  const name = modeTitle(chosen);

  /** Starts once every permission question is settled. */
  const go = async (countSteps: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      if (currentLive() && currentLive()!.engine.finishedAt === null) { router.replace('/run/live'); return; }
      const use = setup ?? (await defaultSetup(mode, unit));
      setPref('cues', cuesOn ? 'on' : 'off');
      setPref('steps', countSteps ? 'on' : 'off');
      await startActivity({ setup: use, returnTo, cuesOn, countSteps });
      router.replace('/run/live');
    } catch (e) {
      setProblem(`Couldn't start tracking: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  /** Start: location first, then (on foot) motion, each with its plain words before the system asks. */
  const start = async () => {
    setProblem(null);
    const loc = await Location.getForegroundPermissionsAsync().catch(() => null);
    if (!loc?.granted) { setAsk('location'); return; }
    await afterLocation();
  };
  const afterLocation = async () => {
    if (kind === 'ride') { setAsk(null); await go(false); return; }
    const available = await Pedometer.isAvailableAsync().catch(() => false);
    if (!available) { setAsk(null); await go(false); return; }
    const motion = await Pedometer.getPermissionsAsync().catch(() => null);
    if (motion?.granted) { setAsk(null); await go(true); return; }
    setAsk('motion');
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: name }} />
      <HelperPill />
      <RecoveryCard />
      {finishedActivities().map((a) => <UploadRow key={a.clientRunId} a={a} />)}

      {loading ? (
        <Card><Body muted>Getting your setup from iStride…</Body></Card>
      ) : setup ? (
        <Card>
          <Label>{kind === 'run' ? `${name} run` : activityLabel(setup.mode)}</Label>
          <Title>{name}</Title>
          <Body muted>{SUBTITLE[setup.mode]}</Body>
          {setup.planned_route.length > 1 && (
            <ActivityMap route={[]} planned={setup.planned_route.map(([lat, lng]) => [lng, lat])} basemap="voyager" follow={false} style={{ height: 180 }} />
          )}
          <View style={styles.rows}>
            <Label>Goal</Label>
            {goalLines(setup).map((g) => <Body key={g}>{g}</Body>)}
          </View>
          {(setup.gear_names.gear || setup.gear_names.ride_shoes || setup.gear_names.kit) && (
            <View style={styles.rows}>
              <Label>Gear</Label>
              {setup.gear_names.gear && <Body>{kind === 'ride' ? 'Bike' : 'Shoes'}: {setup.gear_names.gear}</Body>}
              {setup.gear_names.ride_shoes && <Body>Cycling shoes: {setup.gear_names.ride_shoes}</Body>}
              {setup.gear_names.kit && <Body>Wearing: {setup.gear_names.kit}</Body>}
            </View>
          )}
        </Card>
      ) : (
        <>
          {setupId && (
            <Card tone="orange">
              <Body>Your setup from iStride couldn&apos;t be found (they last a day). You can start with the usual defaults: no route, no target, your default gear.</Body>
            </Card>
          )}
          <Card>
            <Label>Activity</Label>
            <View style={styles.tiles}>
              {ALL_MODES.map((m) => (
                <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: m === mode }} onPress={() => setMode(m)}
                  style={({ pressed }) => [styles.tile, m === mode && styles.tileOn, pressed && { opacity: 0.8 }]}>
                  <Text style={[styles.tileTitle, m === mode && { color: '#fff' }]}>{modeTitle(m)}</Text>
                  <Text style={[styles.tileNote, m === mode && { color: colors.tealSoft }]}>{SUBTITLE[m]}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.switchRow}>
              <Body>Kilometers</Body>
              <Switch value={unit === 'metric'} onValueChange={(v) => { const u: Unit = v ? 'metric' : 'imperial'; setUnit(u); setPref('unit', u); }}
                trackColor={{ true: colors.teal, false: colors.line }} />
            </View>
            <Body muted>No route, no target and your default gear, the same as starting on iStride with nothing chosen. To pick a route, gear or a goal, start from iStride.</Body>
          </Card>
        </>
      )}

      {!loading && (
        <Card>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Body>Spoken cues</Body>
              <Body muted>Splits and coaching through your headphones, with the phone locked.</Body>
            </View>
            <Switch value={cuesOn} onValueChange={setCuesOn} trackColor={{ true: colors.teal, false: colors.line }} />
          </View>
        </Card>
      )}

      {ask === 'location' && <Help id="companion.permission"><PermissionCard kind="location" onReady={() => { void afterLocation(); }} /></Help>}
      {ask === 'motion' && (
        <>
          <Help id="companion.permission"><PermissionCard kind="motion" onReady={() => { setAsk(null); void go(true); }} /></Help>
          <Button kind="secondary" title="Start without counting steps" onPress={() => { setAsk(null); void go(false); }} disabled={busy} />
        </>
      )}
      {problem && <Card tone="danger"><Body>{problem}</Body></Card>}

      {/* One activity at a time: an interrupted one is resumed, finished or discarded first (the card above). */}
      {!loading && ask === null && !interruptedActivity() && (
        <Help id="companion.start">
          <Button title={`Start ${activityLabel(chosen).toLowerCase()}`} onPress={() => { void start(); }} busy={busy} />
        </Help>
      )}
      {returnTo && <Button kind="secondary" title="Back to iStride" onPress={() => { void openLink(returnTo); }} disabled={busy} />}
      <HelperLayer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 2, marginTop: 4 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', flexGrow: 1, backgroundColor: colors.page, borderRadius: radius.button, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 2 },
  tileOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  tileTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
  tileNote: { fontSize: 12, fontWeight: '600', color: colors.muted },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
