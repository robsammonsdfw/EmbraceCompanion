import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold_Italic,
  useFonts,
} from '@expo-google-fonts/barlow-condensed';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { loadSession, useSession } from '@/shell/auth';
import { useLinkSignIn } from '@/shell/linkSignIn';
// Defines the location task before the system delivers points to it.
import '@/shell/location';
import { SignIn } from '@/shell/SignIn';
import { useTheme } from '@/shell/theme';
import { Ionicons } from '@/shell/ui';
import { processUploads, startUploads } from '@/shell/uploads';

// A tool opened from a link still has Home behind it, so Back works.
export const unstable_settings = { initialRouteName: 'index' };

// Keep the splash up until the fonts are in, so numbers never jump.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const t = useTheme();
  const session = useSession();
  const link = useLinkSignIn();
  const [fontsLoaded, fontError] = useFonts({ BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold_Italic });

  useEffect(() => {
    void loadSession();
    return startUploads();
  }, []);

  useEffect(() => { if (fontsLoaded || fontError) void SplashScreen.hideAsync().catch(() => undefined); }, [fontsLoaded, fontError]);

  // Uploads wait while signed out; send them as soon as someone signs in.
  useEffect(() => { if (session) void processUploads(); }, [session]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.statusBar} />
      <Stack
        screenOptions={{
          headerTintColor: t.accent,
          headerTitleStyle: { color: t.text, fontWeight: '800' },
          headerStyle: { backgroundColor: t.bg },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: '',
            headerRight: () => (
              <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push('/settings')} hitSlop={12}>
                <Ionicons name="settings-outline" size={24} color={t.text} />
              </Pressable>
            ),
          }}
        />
        <Stack.Screen name="run/start" options={{ title: 'Activity' }} />
        <Stack.Screen name="run/live" options={{ title: 'Activity' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
      </Stack>

      {session === undefined || link.working ? (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} size="large" />
        </View>
      ) : session === null ? (
        <SignIn notice={link.problem} />
      ) : null}
    </View>
  );
}
