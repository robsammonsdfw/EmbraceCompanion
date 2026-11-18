// Delete my account (App Store guideline 5.1.1(v)). The main API locks the
// account at once, signs it out everywhere and erases it after 30 days
// (EmbraceMacro docs/ACCOUNT_DELETION.md). The member types DELETE to confirm.

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { HttpError, mainApi } from '@/shell/api';
import { signOut } from '@/shell/auth';
import { radius, themed, useTheme } from '@/shell/theme';
import { Body, Button, Card, Label, Screen, Title } from '@/shell/ui';

const POINTS = [
  'You’re signed out on every device right away, and you can’t sign in again. This covers EmbraceHealthAI, iStride and this app.',
  'After 30 days we erase your profile, activities, routes, meals, plans, photos, messages and other personal data.',
  'Changed your mind? Email support@embracehealth.ai within those 30 days and we’ll restore it.',
  'Records the law requires us to keep, such as purchases and lab orders, are kept without your name, email or login.',
  'Paid memberships or subscriptions aren’t cancelled by this. Cancel them where you signed up.',
];

const useStyles = themed((t) => StyleSheet.create({
  input: {
    backgroundColor: t.card, borderRadius: radius.button, paddingHorizontal: 16, paddingVertical: 16,
    fontSize: 18, fontWeight: '800', letterSpacing: 3, color: t.text, ...t.raised,
  },
}));

export default function DeleteAccount() {
  const s = useStyles();
  const t = useTheme();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim().toUpperCase() === 'DELETE';

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await mainApi('/account/delete', { method: 'POST', body: { confirm: 'DELETE' } });
      // The server already ended this session; just forget it here.
      await signOut({ alreadyEnded: true });
      router.replace('/');
    } catch (e) {
      setError(e instanceof HttpError && e.status !== 0 ? e.message : 'That didn’t go through. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Delete my account</Title>
      <Card>
        {POINTS.map((p) => <Body key={p} muted>• {p}</Body>)}
      </Card>
      <Label>Type DELETE to confirm</Label>
      <TextInput
        style={s.input}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        keyboardAppearance={t.mode}
        accessibilityLabel="Type DELETE to confirm"
      />
      {error && <Card tone="danger"><Body>{error}</Body></Card>}
      <Button kind="danger" icon="trash-outline" title="Delete my account" onPress={submit} busy={busy} disabled={!ready} />
    </Screen>
  );
}
