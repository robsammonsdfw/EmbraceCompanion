// Which kind of build this is.

import * as Updates from 'expo-updates';

/**
 * True in builds made for testing (the preview profile, or a development
 * build running from a computer), false in the App Store and Google Play
 * build. Test-only screens check this, so they never show to members.
 */
export const TEST_BUILD = __DEV__ || (Updates.channel != null && Updates.channel !== 'production');
