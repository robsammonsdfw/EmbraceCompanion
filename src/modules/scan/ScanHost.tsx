// ============================================================================
// The body scanner, hosted: scan.embracehealth.ai in a WebView with the camera.
// Phase 0, Proof 3 uses this as is: can a real Prism scan finish in here?
// The scanner's session owns this folder from Phase 4 (COMPANION_APP_FOR_APPS.md §5.2),
// adding the sign-in code and the "View results" step.
//
// Messages from the page (window.ReactNativeWebView.postMessage(JSON)):
//   { type: 'scan.complete', scanId }   the scan finished and was saved
//   { type: 'close' }                   the member is done
//   { type: 'haptic', style }           success | warning | light
// ============================================================================

import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { finish, safeReturnTo } from '@/shell/links';
import { ensureCamera, type PermissionResult } from '@/shell/permissions';
import { colors } from '@/shell/theme';
import { Body, Button, Card, Screen, Title } from '@/shell/ui';

const SCANNER_URL = 'https://scan.embracehealth.ai/';

const haptic = (style: unknown) => {
  if (style === 'warning') return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  if (style === 'light') return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

export default function ScanHost() {
  useKeepAwake();
  const params = useLocalSearchParams<{ return_to?: string; section?: string; scan?: string }>();
  const returnTo = safeReturnTo(params.return_to);
  const [camera, setCamera] = useState<PermissionResult | null>(null);
  const [savedScan, setSavedScan] = useState<string | null>(null);

  useEffect(() => { ensureCamera().then(setCamera); }, []);

  const url = (() => {
    const u = new URL(SCANNER_URL);
    u.searchParams.set('in', 'companion');
    if (params.section) u.searchParams.set('section', String(params.section));
    if (params.scan) u.searchParams.set('scan', String(params.scan));
    return u.toString();
  })();

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: { type?: string; scanId?: unknown; style?: unknown };
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === 'scan.complete') { setSavedScan(String(msg.scanId ?? '')); haptic('success'); }
    else if (msg.type === 'haptic') haptic(msg.style);
    else if (msg.type === 'close') finish(returnTo);
  };

  if (camera === null) return <Screen><Body muted>Getting the camera ready…</Body></Screen>;

  if (camera !== 'granted') {
    return (
      <Screen>
        <Card tone="danger">
          <Title>The body scan needs your camera</Title>
          <Body>Allow camera access for the EmbraceHealthAI Companion to scan.</Body>
          {camera === 'blocked'
            ? <Button title="Open Settings" onPress={() => Linking.openSettings()} />
            : <Button title="Try again" onPress={() => ensureCamera().then(setCamera)} />}
        </Card>
        <Button kind="secondary" title="Done" onPress={() => finish(returnTo)} />
      </Screen>
    );
  }

  return (
    <View style={styles.fill}>
      <WebView
        source={{ uri: url }}
        style={styles.fill}
        onMessage={onMessage}
        // Camera inside the page, without a second prompt from the WebView.
        mediaCapturePermissionGrantType="grant"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        originWhitelist={['https://*']}
      />
      <View style={styles.bar}>
        {savedScan !== null && <Body>Scan saved.</Body>}
        <Button kind="secondary" title="Done" onPress={() => finish(returnTo)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.page },
  bar: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card },
});
