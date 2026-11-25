// ============================================================================
// /run/live — the live activity dashboard, and what follows Stop.
//   running   the dashboard for the activity's kind, Pause, then Resume / Stop.
//             The camera button beside Pause opens Runcam over the numbers.
//   Stop      "Finish this activity?" → Finish and save, Keep going, Discard
//   finished  Saving… → Saved → Done opens the activity's report in iStride
// Opened with no activity in memory (the app was closed mid-activity), it
// offers to resume or finish the one that was in progress.
// ============================================================================

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { font } from '@/shell/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RUN_APP_URL } from '@/shell/config';
import { finish as openLink } from '@/shell/links';
import { Ionicons } from '@/shell/ui';
import { processUploads, retryUpload, useUpload } from '@/shell/uploads';

import { activityLabel, modeTitle } from './calc/activityTypes';
import { formatClock } from './calc/constants';
import { RunMode } from './calc/types';
import { CasualDash, distanceText, HeartWalkDash, HiitDash, MapPanel, RideWalkDash, RunDash, SimpleDash, WeatherPanel, type DashProps } from './Dashboards';
import { PulseCheck } from './HeartRate';
import { noteScrollY, setScroll } from './helper/core';
import type { ScreenId } from './helper/guides';
import { Help, HelperLayer, HelperPill, useHelperScreen } from './helper/ui';
import { activeSteps, clearLive, discardActivity, finishActivity, pause, resume, useLive } from './liveRun';
import { closePanel, openPanel, usePanel } from './panels';
import { Chip, DarkButton, distUnit, ink, Panel, Row, runStyles, RunThemed, s } from './parts';
import { RecoveryCard } from './RecoveryCard';
import { RuncamPanel } from './runcam/Runcam';
import { sendWaitingShots, shotsStillSending } from './runcam/shots';
import { forgetActivity, getPref, setPref } from './store';

const KEEP_AWAKE = 'run-dashboard';

const gpsChip = (accuracy: number | null, ready: boolean, lastFixAt: number | null, now: number, paused: boolean) => {
  if (paused) return { text: 'Paused', bg: ink.amberBg, fg: ink.amber };
  if (lastFixAt === null || accuracy === null) return { text: 'Finding GPS…', bg: ink.amberBg, fg: ink.amber };
  if (!ready) return { text: `Finding GPS… ±${Math.round(accuracy)}m`, bg: ink.amberBg, fg: ink.amber };
  if (now - lastFixAt > 30_000) return { text: 'GPS waiting', bg: ink.line, fg: ink.dim };
  if (accuracy <= 10) return { text: `GPS strong ±${Math.round(accuracy)}m`, bg: ink.tealBg, fg: ink.tealSoft };
  if (accuracy <= 25) return { text: `GPS good ±${Math.round(accuracy)}m`, bg: ink.tealBg, fg: ink.tealSoft };
  if (accuracy <= 50) return { text: `GPS fair ±${Math.round(accuracy)}m`, bg: ink.amberBg, fg: ink.amber };
  return { text: `GPS weak ±${Math.round(accuracy)}m`, bg: ink.redBg, fg: ink.red };
};

export default function LiveScreen() {
  return <RunThemed><LiveDashboard /></RunThemed>;
}

function LiveDashboard() {
  const live = useLive();
  const [busy, setBusy] = useState(false);
  // Screen-on mode: on by default for rides, off for the rest; the member's last choice per kind is kept.
  const kind = live?.engine.kind ?? null;
  const [screenOn, setScreenOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!kind) return;
    const saved = getPref(`screenOn.${kind}`);
    setScreenOn(saved === null ? kind === 'ride' : saved === '1');
  }, [kind]);
  const finished = live ? live.engine.finishedAt !== null : false;
  const panel = usePanel();
  // Helper Mode: which screen this is, and the scrolling area it may scroll to a control in.
  const mode = live?.activity.setup.mode ?? null;
  const helperScreen: ScreenId | null = !live || finished ? null
    : kind === 'hiit' ? 'live.hiit' : kind === 'ride' ? 'live.ride' : kind === 'walk' ? 'live.walk' : kind === 'heartwalk' ? 'live.heartwalk'
    : mode === RunMode.CASUAL ? 'live.casual' : mode === RunMode.ACADEMY ? 'live.academy' : mode === RunMode.TRAIL ? 'live.trail'
    : mode === RunMode.TRACK ? 'live.track' : 'live.run';
  useHelperScreen(helperScreen);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { setScroll(scrollRef); return () => { setScroll(null); closePanel(); }; }, []);
  useEffect(() => {
    if (screenOn && live && !finished) { void activateKeepAwakeAsync(KEEP_AWAKE); return () => { void deactivateKeepAwake(KEEP_AWAKE); }; }
    return undefined;
  }, [screenOn, !!live, finished]);

  if (!live) {
    return (
      <SafeAreaView style={st.page} edges={['bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Activity' }} />
        <View style={st.pad}>
          <RecoveryCard onNothing={() => router.replace('/run/start')} />
        </View>
      </SafeAreaView>
    );
  }

  const e = live.engine;
  const setup = live.activity.setup;
  const now = e.clock;
  const title = modeTitle(setup.mode);

  if (finished) return <Finished clientRunId={live.activity.clientRunId} title={title} />;

  const walkKind = e.kind === 'walk' || e.kind === 'heartwalk';
  const props: DashProps = { e, setup, line: live.line, steps: live.counter ? activeSteps(live) : walkKind ? null : 0, cadence: live.cadence, now };
  const chip = gpsChip(e.gpsAccuracy, e.gpsReady, e.lastFixAt, now, e.isPaused);
  const accent = e.kind === 'ride' ? ink.green : e.kind === 'hiit' ? ink.orange : e.kind === 'heartwalk' ? ink.rose : e.kind === 'walk' ? ink.sky : setup.mode === RunMode.CASUAL ? ink.purple : ink.tealSoft;

  const stop = async () => {
    setBusy(true);
    try { await finishActivity(); } finally { setBusy(false); }
  };
  const discard = () =>
    Alert.alert('Discard this activity?', "It won't be saved, and it can't be brought back.", [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { void discardActivity().then(() => router.replace('/run/start')); } },
    ]);

  // Runcam: one tap from every dashboard, pinned beside Pause. Tapping it again closes the camera.
  const camOpen = panel === 'cam';
  const runcam = (
    <Help id="companion.runcam.open">
      <Pressable accessibilityRole="button" accessibilityLabel={camOpen ? 'Close Runcam' : 'Open Runcam, the camera'}
        onPress={() => (camOpen ? closePanel() : openPanel('cam'))} disabled={busy}
        style={({ pressed }) => [st.cam, e.isPaused && { width: 66 }, camOpen && { backgroundColor: ink.tealBg, borderColor: ink.tealSoft }, (pressed || busy) && { opacity: 0.6 }]}>
        <Ionicons name={camOpen ? 'close' : 'camera'} size={30} color={camOpen ? ink.tealSoft : ink.text} />
        <Text style={[st.camText, camOpen && { color: ink.tealSoft }]}>Runcam</Text>
      </Pressable>
    </Help>
  );

  return (
    <SafeAreaView style={st.page} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title }} />
      <Help id="runs.live.stats">
      <View style={st.header}>
        <View>
          <Text style={[s.tileLabel, { color: accent }]}>{title}</Text>
          <Text style={st.clock}>{formatClock(e.elapsedTime)}</Text>
        </View>
        {e.kind === 'run' && setup.mode !== RunMode.CASUAL && (
          <View style={{ alignItems: 'center' }}>
            <Text style={[s.tileLabel, { color: ink.faint }]}>Calories</Text>
            <Text style={[st.clock, { color: ink.orange }]}>{e.cfg.body.weight > 0 ? Math.round(e.caloriesBurned) : '--'}</Text>
          </View>
        )}
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Chip text={chip.text} bg={chip.bg} fg={chip.fg} />
          <Text style={[st.clock, { color: accent, fontSize: 36 }]}>{distanceText(e)} <Text style={{ fontSize: 16, color: ink.dim }}>{distUnit(e.cfg.unit)}</Text></Text>
        </View>
      </View>
      </Help>

      <View style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} contentContainerStyle={st.body} scrollEventThrottle={64} onScroll={(ev) => noteScrollY(ev.nativeEvent.contentOffset.y)}>
        <HelperPill />
        <Help id="companion.screenOn">
        <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: ink.dim, fontSize: 14, fontWeight: '800', flex: 1 }}>Keep the screen on, big numbers</Text>
          <Switch value={!!screenOn} onValueChange={(v) => { setScreenOn(v); setPref(`screenOn.${e.kind}`, v ? '1' : '0'); }}
            trackColor={{ true: ink.teal, false: ink.line }} />
        </Row>
        </Help>
        {screenOn ? <SimpleDash {...props} />
          : e.kind === 'hiit' ? <HiitDash {...props} />
          : e.kind === 'heartwalk' ? <HeartWalkDash {...props} />
          : e.kind === 'ride' || e.kind === 'walk' ? <RideWalkDash {...props} />
          : setup.mode === RunMode.CASUAL ? <CasualDash {...props} />
          : <RunDash {...props} />}
      </ScrollView>
      {/* The expanded map, the route weather, the pulse check or Runcam, over the numbers; Pause stays below. */}
      {panel && (
        <View style={StyleSheet.absoluteFill}>
          {panel === 'map' ? <MapPanel e={e} line={live.line} />
            : panel === 'pulse' ? <PulseCheck />
            : panel === 'cam' ? <RuncamPanel e={e} clientRunId={live.activity.clientRunId} />
            : <WeatherPanel setup={setup} />}
        </View>
      )}
      </View>

      {/* Pause, then Resume and Stop: pinned, large enough for gloves. */}
      <View style={st.controls}>
        {e.isPaused ? (
          // As on iStride: Pause, then Stop finishes and saves. Pausing first is
          // the guard against a stray tap, so there's no extra question.
          <View style={{ gap: 8 }}>
            <Row>
              {runcam}
              <Help id="runs.live.pause" style={{ flex: 1 }}>
                <DarkButton title="Resume" onPress={resume} bg={ink.teal} fg={ink.onTeal} style={st.controlIn} textStyle={st.controlText} disabled={busy} />
              </Help>
              <Help id="runs.live.stop" style={{ flex: 1 }}>
                <DarkButton title={busy ? 'Saving…' : 'Stop'} onPress={stop} bg={ink.red} fg="#FFFFFF" style={st.controlIn} textStyle={st.controlText} disabled={busy} />
              </Help>
            </Row>
            <DarkButton title="Discard this activity" onPress={discard} fg={ink.dim} disabled={busy} style={{ minHeight: 40, paddingVertical: 6, borderWidth: 0, backgroundColor: 'transparent' }} textStyle={{ fontSize: 12 }} />
          </View>
        ) : (
          <Row>
            {runcam}
            <Help id="runs.live.pause" style={{ flex: 1 }}>
              <DarkButton title="Pause" onPress={pause} bg={ink.text} fg={ink.bg} style={st.controlIn} textStyle={st.controlText} />
            </Help>
          </Row>
        )}
      </View>
      <HelperLayer />
    </SafeAreaView>
  );
}

/** After Stop: the save, then Done to the report in iStride. */
function Finished({ clientRunId, title }: { clientRunId: string; title: string }) {
  const live = useLive();
  const upload = useUpload(clientRunId);
  const e = live?.engine;
  const runId = (upload?.result as { id?: number } | null)?.id ?? null;
  const done = upload?.status === 'done' && runId !== null;
  const failed = upload?.status === 'failed';
  // Tried and still waiting: no signal, or the server is busy. It retries by itself.
  const waiting = upload?.status === 'pending' && (upload.attempts > 0 || !!upload.error);

  const leave = (to: string | null) => {
    if (done) forgetActivity(clientRunId);
    clearLive();
    if (to) void openLink(to); else router.replace('/');
  };
  // The activity has its id in iStride: Runcam photos ticked for it go up now,
  // and the report waits for them, up to 10 seconds, so they're already in it.
  const [photosLate, setPhotosLate] = useState(false);
  useEffect(() => {
    if (!done) return undefined;
    void sendWaitingShots();
    const t = setTimeout(() => setPhotosLate(true), 10_000);
    return () => clearTimeout(t);
  }, [done]);
  const sendingPhotos = done && !photosLate ? shotsStillSending(clientRunId) : 0;
  // The upload queue sends what was waiting when it last started, so with more
  // than one photo it's asked again as each one arrives.
  useEffect(() => { if (sendingPhotos > 0) void processUploads(); }, [sendingPhotos]);
  // Saved: straight back to iStride on this activity's report, as if it had
  // been tracked there. No tap.
  const reportUrl = done && sendingPhotos === 0 ? `${RUN_APP_URL}?section=report&run=${runId}` : null;
  useEffect(() => {
    if (!reportUrl) return;
    forgetActivity(clientRunId);
    void openLink(reportUrl);
    // The Companion goes back to its first page behind iStride.
    const t = setTimeout(() => { clearLive(); router.replace('/'); }, 1500);
    return () => clearTimeout(t);
  }, [reportUrl, clientRunId]);

  return (
    <SafeAreaView style={st.page} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={st.body}>
        <Text style={[st.question, { fontFamily: font.display, fontSize: 44, color: ink.tealSoft, textTransform: 'uppercase' }]}>{activityLabel(live?.activity.setup.mode)} finished</Text>
        {e && (
          <Row>
            <Panel style={{ flex: 1, alignItems: 'center' }}><Text style={[s.tileLabel, { color: ink.faint }]}>Distance</Text><Text style={st.total}>{distanceText(e)} <Text style={{ fontSize: 16, color: ink.faint }}>{distUnit(e.cfg.unit)}</Text></Text></Panel>
            <Panel style={{ flex: 1, alignItems: 'center' }}><Text style={[s.tileLabel, { color: ink.faint }]}>Time</Text><Text style={st.total}>{formatClock(e.elapsedTime)}</Text></Panel>
          </Row>
        )}
        <Panel style={failed ? { borderColor: ink.red } : undefined}>
          <Text style={{ color: ink.text, fontSize: 18, fontWeight: '900' }}>
            {done ? (sendingPhotos > 0 ? 'Saved. Adding your Runcam photos…' : 'Saved. Opening your report in iStride…') : failed ? "This activity hasn't saved" : waiting ? 'Saved on your phone' : 'Saving…'}
          </Text>
          <Text style={{ color: ink.dim, fontSize: 15, lineHeight: 21 }}>
            {done ? 'Your report is ready in iStride: your heart rate after the activity, the AI coach, your gear and photos.'
              : failed ? `It's safe on your phone. ${upload?.error ?? ''}`
              : waiting ? "It will upload when you're back online."
              : 'Sending your activity to iStride.'}
          </Text>
          {failed && <DarkButton title="Try again" onPress={() => retryUpload(clientRunId)} bg={ink.red} fg="#FFFFFF" style={st.tall} />}
        </Panel>
        {done
          ? <DarkButton title="Open my report" onPress={() => leave(`${RUN_APP_URL}?section=report&run=${runId}`)} bg={ink.teal} fg={ink.onTeal} style={st.control} textStyle={st.controlText} />
          : <DarkButton title="Close" onPress={() => leave(null)} style={st.tall} />}
        {!done && <Text style={{ color: ink.faint, fontSize: 13, textAlign: 'center' }}>You can close this. The activity stays on your phone until it has uploaded, and shows under Activity when it has.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = runStyles(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: ink.bg },
  pad: { padding: 16, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: ink.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ink.line },
  clock: { color: ink.text, fontFamily: font.display, fontSize: 38, lineHeight: 42, fontVariant: ['tabular-nums'] },
  body: { padding: 12, gap: 12, paddingBottom: 24 },
  controls: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink.line, backgroundColor: ink.bg },
  control: { flex: 1, minHeight: 84, borderRadius: 26 },
  controlIn: { minHeight: 84, borderRadius: 26, borderWidth: 0 },
  cam: { width: 84, minHeight: 84, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: ink.panel, borderWidth: 1, borderColor: ink.line },
  camText: { color: ink.dim, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  controlText: { fontFamily: font.display, fontSize: 32, fontWeight: 'normal', letterSpacing: 1 },
  tall: { minHeight: 64 },
  question: { color: ink.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  total: { color: ink.text, fontFamily: font.display, fontSize: 44, lineHeight: 48, fontVariant: ['tabular-nums'] },
}));
