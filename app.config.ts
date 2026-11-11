import type { ExpoConfig } from 'expo/config';

// EmbraceHealthAI Companion — see docs in EmbraceMacro: COMPANION_APP_PLAN.md.
// ios/ and android/ are generated from this file at build time (Continuous
// Native Generation). Never create or edit them by hand.

const BUNDLE_ID = 'ai.embracehealth.companion';
const LINK_HOST = 'go.embracehealth.ai';

const config: ExpoConfig = {
  name: 'EmbraceHealthAI Companion',
  slug: 'embracehealthai-companion',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  // For development builds only. The web apps never open the Companion with
  // this scheme; they use https://go.embracehealth.ai links.
  scheme: 'embracehealthai',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    associatedDomains: [`applinks:${LINK_HOST}`],
    infoPlist: {
      NSCameraUsageDescription:
        'The Companion uses your camera for body scans and form checks.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['android.permission.CAMERA'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: LINK_HOST }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/images/splash-icon.png',
        imageWidth: 180,
      },
    ],
    [
      'expo-location',
      {
        // Runs are started in the app, so "While Using" is all we ask for.
        locationWhenInUsePermission:
          'The Companion tracks your route, distance and pace during runs you start.',
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        androidForegroundServiceIcon: './assets/images/notification-icon.png',
      },
    ],
    'expo-sqlite',
    'expo-secure-store',
    // Sency's iOS frameworks need use_frameworks (see plugins/withSency.js).
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    './plugins/withSency',
  ],
  experiments: {
    reactCompiler: true,
  },
  extra: {
    // Set as an EAS environment variable, never committed.
    sencyApiKey: process.env.SENCY_API_KEY ?? '',
  },
};

export default config;
