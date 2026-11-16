import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { loadSession, useSession } from '@/shell/auth';
import { useLinkSignIn } from '@/shell/linkSignIn';
// Defines the location task before the system delivers points to it.
import '@/shell/location';
import { SignIn } from '@/shell/SignIn';
import { colors } from '@/shell/theme';
import { processUploads, startUploads } from '@/shell/uploads';

// A tool opened from a link still has Home behind it, so Back works.
export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  const session = useSession();
  const link = useLinkSignIn();

  useEffect(() => {
    void loadSession();
    return startUploads();
  }, []);

  // Uploads wait while signed out; send them as soon as someone signs in.
  useEffect(() => { if (session) void processUploads(); }, [session]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.tealDark,
          headerTitleStyle: { color: colors.ink, fontWeight: '800' },
          headerStyle: { backgroundColor: colors.card },
          contentStyle: { backgroundColor: colors.page },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'EmbraceHealthAI',
            headerRight: () => (
              <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} hitSlop={12}>
                <Text style={styles.headerLink}>Settings</Text>
              </Pressable>
            ),
          }}
        />
        <Stack.Screen name="run/start" options={{ title: 'Activity' }} />
        <Stack.Screen name="run/live" options={{ title: 'Activity' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
      </Stack>

      {session === undefined || link.working ? (
        <View style={styles.cover}><ActivityIndicator color={colors.teal} size="large" /></View>
      ) : session === null ? (
        <SignIn notice={link.problem} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  headerLink: { color: colors.tealDark, fontSize: 16, fontWeight: '700' },
  cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
});
