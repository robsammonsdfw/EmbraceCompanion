// ============================================================================
// /run/live — the live activity dashboard, and what follows Stop.
//   running   the dashboard for the activity's kind, Pause, then Resume / Stop
//   Stop      "Finish this activity?" → Finish and save, Keep going, Discard
//   finished  Saving… → Saved → Done opens the activity's report in iStride
// Opened with no activity in memory (the app was closed mid-activity), it
// offers to resume or finish the one that was in progress.
// ============================================================================

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RUN_APP_URL } from '@/shell/config';
import { finish as openLink } from '@/shell/links';
import { retryUpload, useUpload } from '@/shell/uploads';

import { activityLabel, modeTitle } from './calc/activityTypes';
import { formatClock } from './calc/constants';
import { RunMode } from './calc/types';
import { CasualDash, distanceText, HeartWalkDash, HiitDash, RideWalkDash, RunDash, SimpleDash, type DashProps } from './Dashboards';
import { activeSteps, clearLive, discardActivity, finishActivity, pause, resume, useLive } from './liveRun';
import { Chip, DarkButton, distUnit, ink, Panel, Row, s } from './parts';
import { RecoveryCard } from './RecoveryCard';
import { forgetActivity, getPref, setPref } from './store';

const KEEP_AWAKE = 'run-dashboard';

const gpsChip = (accuracy: number | null, ready: boolean, lastFixAt: number | null, now: number, paused: boolean) => {
  if (paused) return { text: 'Paused', bg: '#422006', fg: ink.amber };
  if (lastFixAt === null || accuracy === null) return { text: 'Finding GPS…', bg: '#422006', fg: ink.amber };
  if (!ready) return { text: `Finding GPS… ±${Math.round(accuracy)}m`, bg: '#422006', fg: ink.amber };
  if (now - lastFixAt > 30_000) return { text: 'GPS waiting', bg: '#27272A', fg: ink.dim };
  if (accuracy <= 10) return { text: `GPS strong ±${Math.round(accuracy)}m`, bg: '#052E2B', fg: ink.tealSoft };
  if (accuracy <= 25) return { text: `GPS good ±${Math.round(accuracy)}m`, bg: '#052E2B', fg: '#5EEAD4' };
  if (accuracy <= 50) return { text: `GPS fair ±${Math.round(accuracy)}m`, bg: '#422006', fg: ink.amber };
  return { text: `GPS weak ±${Math.round(accuracy)}m`, bg: '#450A0A', fg: '#FCA5A5' };
};

export default function LiveScreen() {
  const live = useLive();
  const [confirming, setConfirming] = useState(false);
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
  useEffect(() => {
    if (screenOn && live && !finished) { void activateKeepAwakeAsync(KEEP_AWAKE); return () => { void deactivateKeepAwake(KEEP_AWAKE); }; }
    return undefined;
  }, [screenOn, !!live, finished]);

  if (!live) {
    return (
      <SafeAreaView style={st.page} edges={['bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Activity' }} />
        <View style={st.pad}>
          <RecoveryCard dark onNothing={() => router.replace('/run/start')} />
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
    try { await finishActivity(); } finally { setBusy(false); setConfirming(false); }
  };
  const discard = () =>
    Alert.alert('Discard this activity?', "It won't be saved, and it can't be brought back.", [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { void discardActivity().then(() => router.replace('/run/start')); } },
    ]);

  return (
    <SafeAreaView style={st.page} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title }} />
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

      <ScrollView contentContainerStyle={st.body}>
        <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: ink.dim, fontSize: 14, fontWeight: '800', flex: 1 }}>Keep the screen on, big numbers</Text>
          <Switch value={!!screenOn} onValueChange={(v) => { setScreenOn(v); setPref(`screenOn.${e.kind}`, v ? '1' : '0'); }}
            trackColor={{ true: ink.teal, false: ink.line }} />
        </Row>
        {screenOn ? <SimpleDash {...props} />
          : e.kind === 'hiit' ? <HiitDash {...props} />
          : e.kind === 'heartwalk' ? <HeartWalkDash {...props} />
          : e.kind === 'ride' || e.kind === 'walk' ? <RideWalkDash {...props} />
          : setup.mode === RunMode.CASUAL ? <CasualDash {...props} />
          : <RunDash {...props} />}
      </ScrollView>

      {/* Pause, then Resume and Stop: pinned, large enough for gloves. */}
      <View style={st.controls}>
        {confirming ? (
          <Panel>
            <Text style={st.question}>Finish this activity?</Text>
            <Text style={{ color: ink.dim, fontSize: 15, textAlign: 'center' }}>{formatClock(e.elapsedTime)} · {distanceText(e)} {distUnit(e.cfg.unit)}</Text>
            <DarkButton title="Finish and save" onPress={stop} bg={ink.teal} fg="#042F2E" style={st.tall} disabled={busy} />
            <DarkButton title="Keep going" onPress={() => setConfirming(false)} style={st.tall} disabled={busy} />
            <DarkButton title="Discard" onPress={discard} fg={ink.rose} disabled={busy} />
          </Panel>
        ) : e.isPaused ? (
          <Row>
            <DarkButton title="Resume" onPress={resume} bg={ink.teal} fg="#042F2E" style={st.control} textStyle={st.controlText} />
            <DarkButton title="Stop" onPress={() => setConfirming(true)} bg={ink.red} fg="#FFFFFF" style={st.control} textStyle={st.controlText} />
          </Row>
        ) : (
          <DarkButton title="Pause" onPress={pause} bg="#FFFFFF" fg="#000000" style={st.control} textStyle={st.controlText} />
        )}
      </View>
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

  return (
    <SafeAreaView style={st.page} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={st.body}>
        <Text style={[st.question, { fontSize: 34, color: ink.tealSoft, fontStyle: 'italic', textTransform: 'uppercase' }]}>{activityLabel(live?.activity.setup.mode)} finished</Text>
        {e && (
          <Row>
            <Panel style={{ flex: 1, alignItems: 'center' }}><Text style={[s.tileLabel, { color: ink.faint }]}>Distance</Text><Text style={st.total}>{distanceText(e)} <Text style={{ fontSize: 16, color: ink.faint }}>{distUnit(e.cfg.unit)}</Text></Text></Panel>
            <Panel style={{ flex: 1, alignItems: 'center' }}><Text style={[s.tileLabel, { color: ink.faint }]}>Time</Text><Text style={st.total}>{formatClock(e.elapsedTime)}</Text></Panel>
          </Row>
        )}
        <Panel style={failed ? { borderColor: ink.red } : undefined}>
          <Text style={{ color: ink.text, fontSize: 18, fontWeight: '900' }}>
            {done ? 'Saved' : failed ? "This activity hasn't saved" : waiting ? 'Saved on your phone' : 'Saving…'}
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
          ? <DarkButton title="Done" onPress={() => leave(`${RUN_APP_URL}?section=report&run=${runId}`)} bg={ink.teal} fg="#042F2E" style={st.control} textStyle={st.controlText} />
          : <DarkButton title="Close" onPress={() => leave(null)} style={st.tall} />}
        {!done && <Text style={{ color: ink.faint, fontSize: 13, textAlign: 'center' }}>You can close this. The activity stays on your phone until it has uploaded, and shows under Activity when it has.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: ink.bg },
  pad: { padding: 16, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#18181B' },
  clock: { color: ink.text, fontSize: 32, fontWeight: '900', fontStyle: 'italic', fontVariant: ['tabular-nums'] },
  body: { padding: 12, gap: 12, paddingBottom: 24 },
  controls: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', backgroundColor: ink.bg },
  control: { flex: 1, minHeight: 84, borderRadius: 24 },
  controlText: { fontSize: 26, fontStyle: 'italic' },
  tall: { minHeight: 64 },
  question: { color: ink.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  total: { color: ink.text, fontSize: 36, fontWeight: '900', fontVariant: ['tabular-nums'] },
});
