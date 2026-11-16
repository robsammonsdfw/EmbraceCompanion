// The sign-in screen: shown over everything while no one is signed in, so a
// link that opened the app still lands where it pointed once they sign in.

import * as Linking from 'expo-linking';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signIn } from './auth';
import { MAIN_APP_URL } from './config';
import { HttpError } from './http';
import { colors, radius } from './theme';
import { Body, Button, Card } from './ui';

export function SignIn({ notice }: { notice?: string | null }) {
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
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <View style={styles.body}>
          <Text style={styles.brand}>EmbraceHealthAI</Text>
          <Text style={styles.sub}>Companion</Text>
          <Body muted>Sign in with your EmbraceHealthAI account, or open the Companion from EmbraceHealthAI or iStride and you’ll be signed in for you.</Body>

          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
          {(error || notice) && <Card tone="danger"><Body>{error || notice}</Body></Card>}
          <Button title="Sign in" onPress={submit} busy={busy} />
          <Button kind="secondary" title="Forgot password or new here? Open EmbraceHealthAI" onPress={() => Linking.openURL(MAIN_APP_URL)} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.page, zIndex: 10 },
  fill: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  brand: { fontSize: 30, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 18, fontWeight: '700', color: colors.tealDark, marginTop: -10 },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.button,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: colors.ink,
  },
});
