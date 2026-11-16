import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, View } from 'react-native';

import { signOut, useSession } from '@/shell/auth';
import { MAIN_APP_URL, RUN_APP_URL } from '@/shell/config';
import { colors } from '@/shell/theme';
import { Body, Button, Card, Label, Screen } from '@/shell/ui';

type Status = 'Allowed' | 'Not allowed' | 'Not asked yet';
const describe = (p: { granted: boolean; canAskAgain: boolean; status: string }): Status =>
  p.granted ? 'Allowed' : p.status === 'undetermined' ? 'Not asked yet' : 'Not allowed';

export default function Settings() {
  const session = useSession();
  const [location, setLocation] = useState<Status | null>(null);
  const [motion, setMotion] = useState<Status | null>(null);

  const refresh = useCallback(async () => {
    setLocation(describe(await Location.getForegroundPermissionsAsync()));
    setMotion(describe(await Pedometer.getPermissionsAsync()));
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const confirmSignOut = () =>
    Alert.alert('Sign out of the Companion?', 'Activities that haven’t uploaded yet stay on this phone and upload after you sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { void signOut(); } },
    ]);

  const member = session?.member;
  return (
    <Screen>
      <Card>
        <Label>Signed in as</Label>
        <Body>{member ? [member.firstName, member.email].filter(Boolean).join(' · ') : '—'}</Body>
        <Button kind="danger" title="Sign out" onPress={confirmSignOut} />
      </Card>

      <Card>
        <Label>Permissions</Label>
        <View style={styles.row}><Text style={styles.name}>Location</Text><Text style={styles.value}>{location ?? '…'}</Text></View>
        <View style={styles.row}><Text style={styles.name}>Motion (steps)</Text><Text style={styles.value}>{motion ?? '…'}</Text></View>
        {(location === 'Not allowed' || motion === 'Not allowed') && (
          <Button kind="secondary" title="Fix in Settings" onPress={() => Linking.openSettings()} />
        )}
      </Card>

      <Button kind="secondary" title="Open EmbraceHealthAI" onPress={() => Linking.openURL(MAIN_APP_URL)} />
      <Button kind="secondary" title="Open iStride" onPress={() => Linking.openURL(RUN_APP_URL)} />

      <Body muted>
        EmbraceHealthAI Companion {Constants.expoConfig?.version}
        {Updates.updateId ? ` · update ${Updates.updateId.slice(0, 8)}` : ''}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  name: { fontSize: 15, color: colors.ink },
  value: { fontSize: 15, fontWeight: '700', color: colors.muted },
});
