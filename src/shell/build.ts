// Which kind of build this is.

import * as Updates from 'expo-updates';

/**
 * True in builds made for testing, false in the App Store and Google Play
 * build. Test-only screens check this, so they never show to members.
 *
 * It goes by the build profile in eas.json (its update channel):
 *   preview      a test build installed from a link            → true
 *   testflight   a test build that goes through TestFlight     → true
 *   production   the build submitted to the stores             → false
 * A development build running from a computer is also a test build.
 */
export const TEST_BUILD = __DEV__ || (Updates.channel != null && Updates.channel !== 'production');
