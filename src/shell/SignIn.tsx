// The sign-in screen: shown over everything while no one is signed in, so a
// link that opened the app still lands where it pointed once they sign in.

import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signIn } from './auth';
import { MAIN_APP_URL } from './config';
import { HttpError } from './http';
import { font, radius, themed, useTheme } from './theme';
import { Body, Button, Card } from './ui';

const useStyles = themed((t) => StyleSheet.create({
  page: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: t.bg, zIndex: 10 },
  fill: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
  body: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  brand: { fontFamily: font.display, fontSize: 52, lineHeight: 52, color: t.text, textTransform: 'uppercase' },
  ai: { color: t.accent },
  sub: { fontFamily: font.displayBold, fontSize: 22, letterSpacing: 3, color: t.dim, textTransform: 'uppercase', marginBottom: 6 },
  input: {
    backgroundColor: t.card, borderRadius: radius.button, paddingHorizontal: 16, paddingVertical: 16,
    fontSize: 16, color: t.text, ...t.raised,
  },
}));

export function SignIn({ notice }: { notice?: string | null }) {
  const s = useStyles();
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof HttpError && e.status === 401
        ? 'That email and password don’t match an EmbraceHealthAI account.'
        : 'Couldn’t reach EmbraceHealthAI. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.page}>
      <LinearGradient
        colors={[t.mode === 'dark' ? 'rgba(20,184,166,0.28)' : 'rgba(20,184,166,0.18)', 'transparent']}
        style={s.glow}
        pointerEvents="none"
      />
      <SafeAreaView style={s.fill}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.fill}>
          <View style={s.body}>
            <Text style={s.brand}>EmbraceHealth<Text style={s.ai}>AI</Text></Text>
            <Text style={s.sub}>Companion</Text>
            <Body muted>Sign in with your EmbraceHealthAI account. Opening the Companion from EmbraceHealthAI or iStride signs you in automatically.</Body>

            <TextInput
              style={s.input}
              placeholder="Email"
              placeholderTextColor={t.faint}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              keyboardAppearance={t.mode}
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={s.input}
              placeholder="Password"
              placeholderTextColor={t.faint}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              keyboardAppearance={t.mode}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
            {(error || notice) && <Card tone="danger"><Body>{error || notice}</Body></Card>}
            <Button title="Sign in" onPress={submit} busy={busy} />
            <Button kind="ghost" title="Forgot password or new here?" onPress={() => Linking.openURL(MAIN_APP_URL)} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
