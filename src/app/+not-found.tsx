import { Redirect } from 'expo-router';

// Links to tools this version doesn't have open Home (COMPANION_APP_FOR_APPS.md §2).
export default function NotFound() {
  return <Redirect href="/" />;
}
