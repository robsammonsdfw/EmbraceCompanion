// ============================================================================
// Phase 0, Proof 2: does a run keep tracking with the screen locked?
// A test screen on the shell's location service. iStride's session replaces
// this folder with the real run dashboard in Phase 3 (COMPANION_APP_FOR_APPS.md §4.2).
// ============================================================================

import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { finish, safeReturnTo } from '@/shell/links';
import {
  activeSession,
  isTracking,
  resumeTracking,
  sessionStats,
  startTracking,
  stopTracking,
  type TrackSession,
  type TrackStats,
} from '@/shell/location';
import { ensureAndroidNotifications, ensureLocation } from '@/shell/permissions';
import { Body, Button, Card, Label, Screen, Stat, Title } from '@/shell/ui';

const NOTICE = { title: 'Run in progress', body: 'EmbraceHealthAI Companion is tracking your route.' };

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};
const timeOf = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function TrackingTest() {
  const params = useLocalSearchParams<{ return_to?: string }>();
  const returnTo = safeReturnTo(params.return_to);

  const [session, setSession] = useState<TrackSession | null>(null);
  const [tracking, setTracking] = useState(false);
  const [stats, setStats] = useState<TrackStats | null>(null);
  const [finished, setFinished] = useState<{ session: TrackSession; stats: TrackStats } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; settings: boolean } | null>(null);

  const refresh = useCallback(async () => {
    const s = activeSession();
    setSession(s);
    setTracking(await isTracking());
    setStats(s ? sessionStats(s.id) : null);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 1000);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [refresh]);

  const allowed = async () => {
    const result = await ensureLocation();
    if (result === 'granted') { setProblem(null); return true; }
    setProblem({
      text: 'The Companion needs your location to track a run.',
      settings: result === 'blocked',
    });
    return false;
  };

  const start = async () => {
    setBusy(true);
    try {
      if (!(await allowed())) return;
      await ensureAndroidNotifications();
      setFinished(null);
      await startTracking(NOTICE);
      await refresh();
    } catch (e) {
      setProblem({ text: `Couldn't start tracking: ${(e as Error).message}`, settings: false });
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    try {
      if (!(await allowed())) return;
      await resumeTracking(NOTICE);
      await refresh();
    } catch (e) {
      setProblem({ text: `Couldn't resume tracking: ${(e as Error).message}`, settings: false });
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      if (session) setFinished({ session, stats: sessionStats(session.id) });
      await stopTracking();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const interrupted = session && !tracking;
  const shown = session && stats ? { session, stats } : finished;

  return (
    <Screen>
      <Card tone="teal">
        <Label>Test build · Proof 2</Label>
        <Title>Run with the screen locked</Title>
        <Body>
          Tap Start, lock the phone and put it in your pocket. Walk or run for 30 minutes, then come back here.
          Write down your battery % before you start and when you finish.
        </Body>
        <Body muted>It passes if Longest gap stays under 10 seconds and the distance looks right.</Body>
      </Card>

      {problem && (
        <Card tone="danger">
          <Body>{problem.text}</Body>
          {problem.settings && <Button kind="secondary" title="Open Settings" onPress={() => Linking.openSettings()} />}
        </Card>
      )}

      {interrupted && (
        <Card tone="orange">
          <Title>Tracking stopped</Title>
          <Body>
            The run you started at {timeOf(session.startedAt)} stopped when the app was closed
            {stats?.lastPointAt ? ` (last point at ${timeOf(stats.lastPointAt)})` : ''}.
          </Body>
          <Button title="Resume" onPress={resume} busy={busy} />
          <Button kind="secondary" title="Finish it" onPress={stop} disabled={busy} />
        </Card>
      )}

      {shown && (
        <Card>
          <Label>{tracking ? 'Tracking' : 'Last test'}</Label>
          <View style={styles.grid}>
            <Stat label="Time" value={clock((shown.session.stoppedAt ?? (tracking ? now : shown.stats.lastPointAt ?? now)) - shown.session.startedAt)} />
            <Stat label="Distance" value={`${(shown.stats.distanceM / 1609.344).toFixed(2)} mi`} />
            <Stat label="Points" value={String(shown.stats.points)} />
            <Stat label="Longest gap" value={`${shown.stats.longestGapS} s`} />
          </View>
          {tracking && shown.stats.lastPointAt && (
            <Body muted>Last point {Math.round((now - shown.stats.lastPointAt) / 1000)} s ago</Body>
          )}
        </Card>
      )}

      {tracking ? (
        <Button kind="danger" title="Stop" onPress={stop} busy={busy} />
      ) : (
        !interrupted && <Button title="Start" onPress={start} busy={busy} />
      )}
      <Button kind="secondary" title="Done" onPress={() => finish(returnTo)} disabled={tracking} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, columnGap: 12 },
});
