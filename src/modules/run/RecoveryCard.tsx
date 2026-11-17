// "Resume or finish the run you started at 6:42 AM?" — shown when the app is
// opened and an activity was in progress (the app was closed, or the phone
// restarted). Both screens of the Run module show it.

import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { ensureLocation } from '@/shell/permissions';
import { Body, Button, Card, Title } from '@/shell/ui';

import { activityLabel, kindOfMode } from './calc/activityTypes';
import { discardActivity, finishActivity, interruptedActivity, recoverActivity, useLive } from './liveRun';
import { getPref } from './store';

const timeOf = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function RecoveryCard({ onNothing }: { dark?: boolean; onNothing?: () => void }) {
  useLive();
  const a = interruptedActivity();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; settings: boolean } | null>(null);

  useEffect(() => { if (!a && !busy) onNothing?.(); }, [a, busy, onNothing]);
  if (!a) return null;

  const what = activityLabel(a.setup.mode).toLowerCase();
  const countSteps = kindOfMode(a.setup.mode) !== 'ride' && getPref('steps') !== 'off';

  const resume = async () => {
    setBusy(true);
    try {
      const allowed = await ensureLocation();
      if (allowed !== 'granted') { setProblem({ text: 'The Companion needs your location to keep tracking.', settings: allowed === 'blocked' }); return; }
      if (await recoverActivity(true, countSteps)) router.replace('/run/live');
      else setProblem({ text: `That ${what} can't be added to any more. Finish it to save what was tracked.`, settings: false });
    } catch (e) {
      setProblem({ text: `Couldn't resume: ${(e as Error).message}`, settings: false });
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    setBusy(true);
    try {
      await recoverActivity(false, false);
      await finishActivity();
      router.replace('/run/live');
    } catch (e) {
      setProblem({ text: `Couldn't finish it: ${(e as Error).message}`, settings: false });
    } finally {
      setBusy(false);
    }
  };
  const discard = () =>
    Alert.alert(`Discard this ${what}?`, "It won't be saved, and it can't be brought back.", [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { void discardActivity(); } },
    ]);

  return (
    <Card tone="orange">
      <Title>Resume or finish the {what} you started at {timeOf(a.startedAt)}?</Title>
      <Body>It was still in progress when the Companion closed. Everything tracked so far is on your phone.</Body>
      {problem && <Body>{problem.text}</Body>}
      {problem?.settings && <Button kind="secondary" title="Open Settings" onPress={() => Linking.openSettings()} />}
      <Button title="Resume" onPress={resume} busy={busy} />
      <Button kind="secondary" title="Finish and save" onPress={finish} disabled={busy} />
      <Button kind="secondary" title="Discard" onPress={discard} disabled={busy} />
    </Card>
  );
}
