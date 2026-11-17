import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { RecoveryCard } from '@/modules/run/RecoveryCard';
import { useSession } from '@/shell/auth';
import { MAIN_APP_URL, RUN_APP_URL } from '@/shell/config';
import { colors, radius } from '@/shell/theme';
import { Body, Button, Screen } from '@/shell/ui';

export default function Home() {
  const member = useSession()?.member;
  return (
    <Screen>
      {/* "Resume or finish the run you started at…", when one was cut off. */}
      <RecoveryCard />

      {member && <Body muted>Signed in as {member.firstName || member.email}</Body>}

      {/* A plain Pressable: inside <Link asChild> its style function was dropped on iPhone. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/run/start')}
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      >
        <Text style={styles.tileTitle}>Start an activity</Text>
        <Text style={styles.tileNote}>Run, ride, walk, HIIT and more, tracked with your screen locked</Text>
      </Pressable>

      <Button kind="secondary" title="Open iStride" onPress={() => Linking.openURL(RUN_APP_URL)} />
      <Button kind="secondary" title="Open EmbraceHealthAI" onPress={() => Linking.openURL(MAIN_APP_URL)} />

      <Body muted>EmbraceHealthAI Companion {Constants.expoConfig?.version}</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.teal, borderRadius: radius.card, padding: 20, gap: 4 },
  pressed: { opacity: 0.85 },
  tileTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  tileNote: { color: '#E6F7F4', fontSize: 13, fontWeight: '600' },
});
