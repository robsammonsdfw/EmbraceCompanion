import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MAIN_APP_URL } from '@/shell/links';
import { colors, radius } from '@/shell/theme';
import { Body, Button, Card, Label, Screen } from '@/shell/ui';

const TOOLS = [
  { href: '/run/start', title: 'Run', note: 'Proof 2 · tracking with the screen locked' },
  { href: '/scan', title: 'Body scan', note: 'Proof 3 · the scanner in the app' },
  { href: '/msk', title: 'Form check', note: 'Proof 4 · Sency' },
] as const;

export default function Home() {
  const lastLink = Linking.useLinkingURL();
  return (
    <Screen>
      <View style={styles.tiles}>
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} asChild>
            <Pressable style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
              <Text style={styles.tileTitle}>{t.title}</Text>
              <Text style={styles.tileNote}>{t.note}</Text>
            </Pressable>
          </Link>
        ))}
      </View>

      <Button kind="secondary" title="Open EmbraceHealthAI" onPress={() => Linking.openURL(MAIN_APP_URL)} />

      <Card>
        <Label>Test build · Proof 1</Label>
        <Body>Last link that opened the app:</Body>
        <Text selectable style={styles.mono}>{lastLink ?? 'None yet. Tap a go.embracehealth.ai link in Safari or Chrome.'}</Text>
      </Card>

      <Body muted>EmbraceHealthAI Companion {Constants.expoConfig?.version}</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { gap: 12 },
  tile: { backgroundColor: colors.teal, borderRadius: radius.card, padding: 20, gap: 4 },
  pressed: { opacity: 0.85 },
  tileTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  tileNote: { color: '#E6F7F4', fontSize: 13, fontWeight: '600' },
  mono: { fontFamily: 'Courier', fontSize: 13, color: colors.ink },
});
