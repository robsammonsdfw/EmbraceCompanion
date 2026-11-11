// ============================================================================
// Links in and out (COMPANION_APP_PLAN.md §2.1, §2.3)
//   In:  https://go.embracehealth.ai/<tool>?return_to=…&h=… opens the matching
//        screen under src/app (Expo Router maps the path), so a tool screen
//        reads its params with useLocalSearchParams.
//   Out: Done opens return_to — only on our three web apps — or the main app.
// ============================================================================

import * as Linking from 'expo-linking';

export const MAIN_APP_URL = 'https://app.embracehealth.ai/';

const RETURN_HOSTS = new Set(['app.embracehealth.ai', 'run.embracehealth.ai', 'scan.embracehealth.ai']);

/** return_to, if it's one of our web apps (or localhost in development). */
export const safeReturnTo = (raw: string | string[] | undefined): string | null => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol === 'https:' && RETURN_HOSTS.has(u.host)) return u.toString();
    if (__DEV__ && u.protocol === 'http:' && u.hostname === 'localhost') return u.toString();
  } catch {
    // not an address
  }
  return null;
};

/** Done: back to the page the member came from, or the main app. */
export const finish = (returnTo: string | null) => Linking.openURL(returnTo ?? MAIN_APP_URL);
