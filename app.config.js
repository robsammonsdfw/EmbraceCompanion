// EmbraceHealthAI Companion — see docs in EmbraceMacro: COMPANION_APP_PLAN.md.
// Plain JavaScript on purpose: every tool that reads it (EAS CLI included)
// can load it, whatever its Node version.
// ios/ and android/ are generated from this file at build time (Continuous
// Native Generation). Never create or edit them by hand.

const BUNDLE_ID = 'ai.embracehealth.companion';
const LINK_HOST = 'go.embracehealth.ai';

/** @type {import('expo/config').ExpoConfig} */
const config = {
  owner: 'rsammons',
  name: 'EmbraceHealthAI Companion',
  slug: 'embracehealthai-companion',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  // For development builds only. The web apps never open the Companion with
  // this scheme; they use https://go.embracehealth.ai links.
  scheme: 'embracehealthai',
  // Light and dark: the app follows the phone unless the member picks one in Settings.
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    associatedDomains: [`applinks:${LINK_HOST}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        'For a pulse check, the Companion reads the colour of your fingertip over the back camera and light. Nothing is recorded or saved.',
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
    // Steps on walks (Android 10+); the camera for the pulse check.
    permissions: ['android.permission.ACTIVITY_RECOGNITION', 'android.permission.CAMERA'],
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
        dark: { backgroundColor: '#000000', image: './assets/images/splash-icon.png' },
      },
    ],
    [
      'expo-location',
      {
        // Runs are started in the app, so "While Using" is all we ask for.
        locationWhenInUsePermission:
          'The Companion tracks your route, distance and pace during activities you start, including while your phone is locked.',
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: 'The Companion counts your steps during walks.',
        isIosBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        androidForegroundServiceIcon: './assets/images/notification-icon.png',
      },
    ],
    'expo-sqlite',
    ['expo-secure-store', { faceIDPermission: false }],
    // Spoken cues keep playing with the screen locked (adds the audio background mode on iPhone).
    ['expo-audio', { enableBackgroundPlayback: true, microphonePermission: false }],
    ['expo-sensors', { motionPermission: 'The Companion counts your steps during walks.' }],
    '@maplibre/maplibre-react-native',
    // Heart-rate straps, with readings while the phone is locked during an activity.
    [
      'react-native-ble-plx',
      {
        isBackgroundEnabled: true,
        modes: ['central'],
        neverForLocation: true,
        bluetoothAlwaysPermission:
          'The Companion connects to your heart-rate monitor and reads your heart rate during activities you start.',
      },
    ],
    // Listening to your music for its beat. Recording only: no extra background
    // mode or Android service (expo-audio already keeps spoken cues going).
    [
      'react-native-audio-api',
      {
        iosBackgroundMode: false,
        androidForegroundService: false,
        androidPermissions: ['android.permission.RECORD_AUDIO'],
        iosMicrophonePermission:
          'The Companion listens to your music for a few seconds to find its beat. Nothing is recorded or saved.',
      },
    ],
  ],
  experiments: {
    reactCompiler: true,
  },
  extra: {
    // Expo project @rsammons/embracehealthai-companion
    eas: { projectId: '9923e540-a501-4491-8006-c4aca8f5c796' },
  },
  // Over-the-air updates (EAS Update): JavaScript-only changes reach installed
  // builds without a rebuild. A build only takes updates made for its own
  // app version, so a version bump needs a new build.
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    url: 'https://u.expo.dev/9923e540-a501-4491-8006-c4aca8f5c796',
  },
};

module.exports = config;
