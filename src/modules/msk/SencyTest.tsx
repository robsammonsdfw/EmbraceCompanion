// ============================================================================
// Phase 0, Proof 4: does Sency's React Native package open an assessment and
// return results? Phase 5 turns this into the form check (pick an exercise,
// save to the main API's form-check save).
// The API key comes from the SENCY_API_KEY build variable (app.config.ts).
// ============================================================================

import { configure, SMWorkoutLibrary, startAssessment } from '@sency/react-native-smkit-ui';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { finish, safeReturnTo } from '@/shell/links';
import { ensureCamera } from '@/shell/permissions';
import { Body, Button, Card, Label, Screen, Title } from '@/shell/ui';

const apiKey = String(Constants.expoConfig?.extra?.sencyApiKey ?? '');

let configured: Promise<string> | null = null;
const ready = () => {
  if (!configured) configured = configure(apiKey).catch((e) => { configured = null; throw e; });
  return configured;
};

export default function SencyTest() {
  const params = useLocalSearchParams<{ return_to?: string }>();
  const returnTo = safeReturnTo(params.return_to);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ didFinish: boolean; summary: string } | null>(null);
  const [problem, setProblem] = useState<{ text: string; settings: boolean } | null>(null);

  const run = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const camera = await ensureCamera();
      if (camera !== 'granted') {
        setProblem({ text: 'The form check needs your camera.', settings: camera === 'blocked' });
        return;
      }
      await ready();
      setResult(await startAssessment(SMWorkoutLibrary.AssessmentTypes.Fitness, true, null, false, '', null));
    } catch (e) {
      setProblem({ text: `Sency: ${(e as Error).message}`, settings: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card tone="teal">
        <Label>Test build · Proof 4</Label>
        <Title>Sency form check</Title>
        <Body>Start a Fitness assessment, finish it, and check that results show below.</Body>
      </Card>

      {!apiKey && (
        <Card tone="danger">
          <Body>This build has no Sency API key, so Sency can't start.</Body>
        </Card>
      )}

      {problem && (
        <Card tone="danger">
          <Body>{problem.text}</Body>
          {problem.settings && <Button kind="secondary" title="Open Settings" onPress={() => Linking.openSettings()} />}
        </Card>
      )}

      <Button title="Start assessment" onPress={run} busy={busy} disabled={!apiKey} />

      {result && (
        <Card>
          <Label>{result.didFinish ? 'Finished' : 'Stopped early'}</Label>
          <Text selectable numberOfLines={40}>{result.summary}</Text>
        </Card>
      )}

      <Button kind="secondary" title="Done" onPress={() => finish(returnTo)} />
    </Screen>
  );
}
