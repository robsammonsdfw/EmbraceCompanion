// Plain words before the system asks for a permission (COMPANION_APP_PLAN.md
// §2.7). Show it where the permission is first needed; it calls onReady once
// the permission is granted, and offers Settings when it was turned off.

import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';

import { ensureBluetooth } from './heartRate';
import { ensureMicrophone } from './micListen';
import { ensureCamera, ensureLocation, ensureMotion, type PermissionResult } from './permissions';
import { useTheme } from './theme';
import { Body, Button, Card, Ionicons, Title, type IconName } from './ui';

const COPY = {
  location: {
    icon: 'navigate' as IconName,
    title: 'Allow your location',
    body: 'The Companion uses your location to track your route, distance and pace, including while your phone is locked. It’s only used during activities you start.',
    ask: ensureLocation,
  },
  motion: {
    icon: 'footsteps' as IconName,
    title: 'Allow motion',
    body: 'The Companion counts your steps during walks with your phone’s motion sensor.',
    ask: ensureMotion,
  },
  bluetooth: {
    icon: 'bluetooth' as IconName,
    title: 'Allow Bluetooth',
    body: 'The Companion connects to your heart-rate monitor (a chest strap, or a WHOOP set to broadcast) and reads your heart rate during activities, including while your phone is locked.',
    ask: ensureBluetooth,
  },
  camera: {
    icon: 'camera' as IconName,
    title: 'Allow the camera',
    body: 'For a pulse check, rest a fingertip over the back camera and light. The Companion reads the colour changes in your fingertip. Nothing is recorded or saved.',
    ask: ensureCamera,
  },
  microphone: {
    icon: 'mic' as IconName,
    title: 'Allow the microphone',
    body: 'The Companion listens to your music for a few seconds to find its beat. Nothing is recorded or saved, and your music keeps playing.',
    ask: ensureMicrophone,
  },
} as const;

export function PermissionCard({ kind, onReady }: { kind: keyof typeof COPY; onReady: () => void }) {
  const t = useTheme();
  const copy = COPY[kind];
  const [result, setResult] = useState<PermissionResult | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setBusy(true);
    try {
      const r = await copy.ask();
      setResult(r);
      if (r === 'granted') onReady();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card tone={result && result !== 'granted' ? 'danger' : 'teal'}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={copy.icon} size={22} color={result && result !== 'granted' ? t.red : t.accent} />
        </View>
        <Title style={{ flex: 1 }}>{copy.title}</Title>
      </View>
      <Body>{copy.body}</Body>
      {result === 'blocked'
        ? <Button title="Open Settings" onPress={() => Linking.openSettings()} />
        : <Button title={result === 'denied' ? 'Try again' : 'Continue'} onPress={ask} busy={busy} />}
    </Card>
  );
}
