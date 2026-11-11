import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// Defines the location task before the system delivers points to it.
import '@/shell/location';
import { colors } from '@/shell/theme';

// A tool opened from a link still has Home behind it, so Back works.
export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
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
        <Stack.Screen name="index" options={{ title: 'EmbraceHealthAI' }} />
        <Stack.Screen name="run/start" options={{ title: 'Activity' }} />
        <Stack.Screen name="run/live" options={{ title: 'Activity' }} />
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
