import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RecoveryCard } from '@/modules/run/RecoveryCard';
import { useSession } from '@/shell/auth';
import { MAIN_APP_URL, RUN_APP_URL } from '@/shell/config';
import { font, radius, themed, useTheme } from '@/shell/theme';
import { Body, Card, GradientCard, Ionicons, Label, ListRow, Screen, type IconName } from '@/shell/ui';

// One tap straight into the most common activities (iStride RunMode values).
const QUICK: { mode: string; title: string; icon: IconName; tint: 'accent' | 'green' | 'sky' }[] = [
  { mode: 'CASUAL', title: 'Run', icon: 'walk', tint: 'accent' },
  { mode: 'CYCLING', title: 'Ride', icon: 'bicycle', tint: 'green' },
  { mode: 'WALKING', title: 'Walk', icon: 'footsteps', tint: 'sky' },
];

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const useStyles = themed((t) => StyleSheet.create({
  hello: { fontSize: 15, fontWeight: '600', color: t.dim },
  name: { fontFamily: font.display, fontSize: 44, lineHeight: 46, color: t.text, textTransform: 'uppercase', marginTop: -2 },
  heroLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.6, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' },
  heroTitle: { fontFamily: font.display, fontSize: 46, lineHeight: 46, color: '#FFFFFF', textTransform: 'uppercase' },
  heroNote: { fontSize: 14, color: 'rgba(255,255,255,0.9)', maxWidth: '85%' },
  heroGo: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  quick: { flexDirection: 'row', gap: 10 },
  quickTile: { flex: 1, backgroundColor: t.card, borderRadius: radius.tile, paddingVertical: 18, alignItems: 'center', gap: 8, ...t.raised },
  quickIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontFamily: font.displayBold, fontSize: 18, letterSpacing: 1, color: t.text, textTransform: 'uppercase' },
  version: { textAlign: 'center', fontSize: 12, color: t.faint },
}));

export default function Home() {
  const s = useStyles();
  const t = useTheme();
  const member = useSession()?.member;
  const first = member?.firstName || member?.email?.split('@')[0] || '';

  return (
    <Screen>
      <View>
        <Text style={s.hello}>{greeting()}</Text>
        {first ? <Text style={s.name} numberOfLines={1}>{first}</Text> : null}
      </View>

      {/* "Resume or finish the run you started at…", when one was cut off. */}
      <RecoveryCard />

      <GradientCard onPress={() => router.push('/run/start')} style={{ minHeight: 190, justifyContent: 'flex-end' }}>
        <Text style={s.heroLabel}>iStride</Text>
        <Text style={s.heroTitle}>Start an{'\n'}activity</Text>
        <Text style={s.heroNote}>Run, ride, walk, HIIT and more. Keeps tracking with your screen locked.</Text>
        <View style={s.heroGo}><Ionicons name="play" size={26} color={t.gradient[0]} /></View>
      </GradientCard>

      <Label>Quick start</Label>
      <View style={s.quick}>
        {QUICK.map((q) => {
          const tint = t[q.tint];
          return (
            <Pressable key={q.mode} accessibilityRole="button" accessibilityLabel={`Start a ${q.title.toLowerCase()}`}
              onPress={() => router.push({ pathname: '/run/start', params: { mode: q.mode } })}
              style={({ pressed }) => [s.quickTile, pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] }]}>
              <View style={[s.quickIcon, { backgroundColor: `${tint}1F` }]}><Ionicons name={q.icon} size={24} color={tint} /></View>
              <Text style={s.quickText}>{q.title}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ paddingVertical: 4 }}>
        <ListRow icon="body-outline" tint={t.purple} title="Advanced MSK Health" sub="A movement check with your camera" onPress={() => router.push('/msk')} last />
      </Card>

      <Card style={{ paddingVertical: 4 }}>
        <ListRow icon="speedometer-outline" title="iStride" sub="Your runs, reports, groups and plans" onPress={() => Linking.openURL(RUN_APP_URL)} />
        <ListRow icon="heart-outline" tint={t.orange} title="EmbraceHealthAI" sub="Your health, nutrition and care" onPress={() => Linking.openURL(MAIN_APP_URL)} last />
      </Card>

      <Body style={s.version}>EmbraceHealthAI Companion {Constants.expoConfig?.version}</Body>
    </Screen>
  );
}
