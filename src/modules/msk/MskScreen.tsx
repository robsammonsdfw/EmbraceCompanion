// ============================================================================
// Advanced MSK Health  (opened by https://go.embracehealth.ai/msk)
// ============================================================================
// The main app opens this from Body + Fitness › Form Checker › Advanced MSK
// Health. It runs one of Sency's guided movement checks with the camera and
// shows the result. The check itself is Sency's own full-screen session
// (sency.ts); this screen is what comes before and after it.
//
// Link params:  type       body360 (the default), fitness, strength or cardio
//               return_to  the web page Done goes back to
// ============================================================================

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/shell/auth';
import { TEST_BUILD } from '@/shell/build';
import { finish as openLink, safeReturnTo } from '@/shell/links';
import { PermissionCard } from '@/shell/PermissionCard';
import { hasCamera } from '@/shell/permissions';
import { font, themed, useTheme } from '@/shell/theme';
import { Body, Button, Card, GradientCard, Label, ListRow, Screen, Title } from '@/shell/ui';

import { isCheckKind, prepare, problemText, runCheck, sencyAvailability, type CheckKind, type CheckResult } from './sency';
import { lastCheck, saveCheck, type SavedCheck } from './store';

const COPY: Record<CheckKind, { title: string; note: string; minutes: string }> = {
  body360: {
    title: 'Advanced MSK Health',
    note: 'Four guided movements: a side bend, a single-leg balance, an overhead squat and a toe touch. It scores your mobility, balance and control.',
    minutes: 'About 4 minutes',
  },
  fitness: {
    title: 'Fitness check',
    note: 'An overhead squat, then a minute each of pushups, squats and plank.',
    minutes: 'About 4 minutes',
  },
  strength: {
    title: 'Strength check',
    note: 'A minute each of pushups, squats and plank.',
    minutes: 'About 4 minutes',
  },
  cardio: {
    title: 'Cardio check',
    note: 'Jumping jacks and ski jumps in rounds that get longer.',
    minutes: 'About 3 minutes',
  },
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const when = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const useStyles = themed((t) => StyleSheet.create({
  heroLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.6, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' },
  heroTitle: { fontFamily: font.display, fontSize: 42, lineHeight: 42, color: '#FFFFFF', textTransform: 'uppercase' },
  heroNote: { fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.92)' },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  score: { fontFamily: font.display, fontSize: 64, lineHeight: 64, color: t.accent, fontVariant: ['tabular-nums'] },
  outOf: { fontSize: 14, fontWeight: '700', color: t.dim, paddingBottom: 10 },
  movement: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
  movementName: { flex: 1, fontSize: 15, fontWeight: '600', color: t.text },
  movementScore: { fontFamily: font.displayBold, fontSize: 22, color: t.text, fontVariant: ['tabular-nums'] },
  small: { fontSize: 13, lineHeight: 19, color: t.dim },
}));

function Scores({ check }: { check: CheckResult }) {
  const s = useStyles();
  return (
    <>
      {check.score !== null && (
        <View style={s.scoreRow}>
          <Text style={s.score}>{check.score}</Text>
          <Text style={s.outOf}>out of 100</Text>
        </View>
      )}
      {check.movements.map((m, i) => (
        <View key={`${m.name}-${i}`} style={s.movement}>
          <Text style={s.movementName}>{m.name}</Text>
          {m.score !== null && <Text style={s.movementScore}>{m.score}</Text>}
        </View>
      ))}
    </>
  );
}

export default function MskScreen() {
  const s = useStyles();
  const t = useTheme();
  const params = useLocalSearchParams<{ type?: string; return_to?: string }>();
  const asked = String(first(params.type) ?? '').toLowerCase();
  const kind: CheckKind = isCheckKind(asked) ? asked : 'body360';
  const returnTo = safeReturnTo(params.return_to);
  const copy = COPY[kind];

  const member = useSession()?.member;
  const [available] = useState(sencyAvailability);
  const [askCamera, setAskCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [last, setLast] = useState<SavedCheck | null>(null);

  // Sign the SDK in and fetch its models while the member reads the screen.
  useEffect(() => {
    if (available === 'ready') prepare().catch(() => undefined);
  }, [available]);

  useEffect(() => {
    if (member) setLast(lastCheck(member.id, kind));
  }, [member, kind]);

  const open = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await runCheck(kind);
      // Leaving before the first movement leaves nothing worth keeping.
      if (member && (r.finished || r.movements.length > 0)) saveCheck(member.id, kind, r);
      setResult(r);
    } catch (e) {
      setProblem(problemText(e));
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    setResult(null);
    if (!hasCamera()) { setAskCamera(true); return; }
    void open();
  };

  const done = () => {
    if (returnTo) { void openLink(returnTo); return; }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (available !== 'ready') {
    return (
      <Screen>
        <Card tone="orange">
          <Title>{available === 'needs-build' ? 'Update the Companion app' : 'Not set up yet'}</Title>
          <Body>
            {available === 'needs-build'
              ? 'Advanced MSK Health needs the newest version of the EmbraceHealthAI Companion. Update the app, then open this again.'
              : 'Advanced MSK Health isn’t switched on in this version of the Companion yet.'}
          </Body>
          {TEST_BUILD && (
            <Body muted style={s.small}>
              {available === 'needs-build'
                ? 'Test build note: this build was made before Sency’s SDK was added. Install a new build.'
                : 'Test build note: EXPO_PUBLIC_SENCY_AUTH_KEY had no value when this build or update was made.'}
            </Body>
          )}
        </Card>
        <Button kind="secondary" title={returnTo ? 'Back to EmbraceHealthAI' : 'Back'} onPress={done} />
      </Screen>
    );
  }

  return (
    <Screen>
      <GradientCard colors={t.gradientDeep} style={{ minHeight: 170, justifyContent: 'flex-end' }}>
        <Text style={s.heroLabel}>{copy.minutes}</Text>
        <Text style={s.heroTitle}>{copy.title}</Text>
        <Text style={s.heroNote}>{copy.note}</Text>
      </GradientCard>

      {result?.finished && (
        <Card tone="teal">
          <Title>Check complete</Title>
          <Scores check={result} />
          <Button title={returnTo ? 'Back to EmbraceHealthAI' : 'Done'} onPress={done} />
        </Card>
      )}
      {result && !result.finished && (
        <Card tone="orange">
          <Title>Check not finished</Title>
          <Body>You left before the last movement, so there’s no score. Start again when you’re ready.</Body>
        </Card>
      )}
      {problem && (
        <Card tone="danger">
          <Title>That didn’t work</Title>
          <Body>{problem}</Body>
        </Card>
      )}

      {askCamera
        ? <PermissionCard kind="movement" onReady={() => { setAskCamera(false); void open(); }} />
        : <Button icon="play" title={result?.finished ? 'Do it again' : 'Start the check'} onPress={start} busy={busy} />}
      {busy && <Body muted style={s.small}>Getting the check ready. The first time takes a little longer.</Body>}

      <Label>Before you start</Label>
      <Card style={{ paddingVertical: 4 }}>
        <ListRow icon="phone-portrait-outline" title="Stand your phone up" sub="Lean it upright against something steady, on the floor or a low table" />
        <ListRow icon="resize-outline" tint={t.sky} title="Step back" sub="Until your whole body is in view, head to feet" />
        <ListRow icon="sunny-outline" tint={t.amber} title="Face the light" sub="Light in front of you, not behind" />
        <ListRow icon="volume-high-outline" tint={t.green} title="Turn the sound up" sub="A voice guides you through each movement" last />
      </Card>

      {last && !result?.finished && (
        <>
          <Label>Your last check · {when(last.at)}</Label>
          <Card>
            <Scores check={last} />
          </Card>
        </>
      )}

      <Body muted style={s.small}>
        For fitness and wellness use only. It isn’t a medical device and doesn’t diagnose or treat anything. Stop if a movement hurts.
      </Body>
    </Screen>
  );
}
