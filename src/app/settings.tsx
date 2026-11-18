import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, View } from 'react-native';

import { signOut, useSession } from '@/shell/auth';
import { MAIN_APP_URL, RUN_APP_URL } from '@/shell/config';
import { font, setThemeMode, themed, useTheme, useThemeMode, type ThemeMode } from '@/shell/theme';
import { Body, Button, Card, Label, ListRow, Screen, Segmented } from '@/shell/ui';

type Status = 'Allowed' | 'Not allowed' | 'Not asked yet';
const describe = (p: { granted: boolean; status: string }): Status =>
  p.granted ? 'Allowed' : p.status === 'undetermined' ? 'Not asked yet' : 'Not allowed';

const APPEARANCE: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Automatic' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const useStyles = themed((t) => StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: font.display, fontSize: 26, color: t.accent },
  who: { flex: 1, gap: 2 },
  name: { fontSize: 18, fontWeight: '800', color: t.text },
  email: { fontSize: 14, color: t.dim },
  version: { textAlign: 'center', fontSize: 12, color: t.faint },
}));

export default function Settings() {
  const s = useStyles();
  const t = useTheme();
  const mode = useThemeMode();
  const session = useSession();
  const [location, setLocation] = useState<Status | null>(null);
  const [motion, setMotion] = useState<Status | null>(null);

  const refresh = useCallback(async () => {
    setLocation(describe(await Location.getForegroundPermissionsAsync()));
    setMotion(describe(await Pedometer.getPermissionsAsync()));
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const confirmSignOut = () =>
    Alert.alert('Sign out of the Companion?', 'Activities that haven’t uploaded yet stay on this phone and upload after you sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { void signOut(); } },
    ]);

  const member = session?.member;
  const initials = (member?.firstName || member?.email || '?').slice(0, 1).toUpperCase();
  const blocked = location === 'Not allowed' || motion === 'Not allowed';
  const fixHint = (v: Status | null) => (v === 'Not allowed' ? () => Linking.openSettings() : undefined);

  return (
    <Screen>
      <Card>
        <View style={s.account}>
          <View style={s.avatar}><Text style={s.initials}>{initials}</Text></View>
          <View style={s.who}>
            <Text style={s.name} numberOfLines={1}>{member?.firstName || 'Signed in'}</Text>
            <Text style={s.email} numberOfLines={1}>{member?.email ?? ''}</Text>
          </View>
        </View>
      </Card>

      <Label>Appearance</Label>
      <Segmented options={APPEARANCE} value={mode} onChange={setThemeMode} />
      <Body muted style={{ fontSize: 13 }}>Automatic follows your phone’s light or dark setting.</Body>

      <Label>Permissions</Label>
      <Card style={{ paddingVertical: 4 }}>
        <ListRow icon="navigate-outline" title="Location" sub="Tracks your route during activities" value={location ?? '…'} onPress={fixHint(location)} />
        <ListRow icon="footsteps-outline" tint={t.sky} title="Motion" sub="Counts your steps on walks" value={motion ?? '…'} onPress={fixHint(motion)} last />
      </Card>
      {blocked && <Button kind="secondary" icon="settings-outline" title="Fix in Settings" onPress={() => Linking.openSettings()} />}

      <Label>Apps</Label>
      <Card style={{ paddingVertical: 4 }}>
        <ListRow icon="speedometer-outline" title="Open iStride" onPress={() => Linking.openURL(RUN_APP_URL)} />
        <ListRow icon="heart-outline" tint={t.orange} title="Open EmbraceHealthAI" onPress={() => Linking.openURL(MAIN_APP_URL)} last />
      </Card>

      <Button kind="danger" icon="log-out-outline" title="Sign out" onPress={confirmSignOut} />

      <Body style={s.version}>
        EmbraceHealthAI Companion {Constants.expoConfig?.version}
        {Updates.updateId ? ` · update ${Updates.updateId.slice(0, 8)}` : ''}
      </Body>
    </Screen>
  );
}
