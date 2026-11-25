// Addresses the Companion talks to.

/** The main EmbraceHealthAI API (EmbraceMacro's Lambda). */
export const MAIN_API_URL = 'https://xmpbc16u1f.execute-api.us-west-1.amazonaws.com/default';

/** iStride's API (TempoRun's Lambda): VITE_API_URL in the run.embracehealth.ai Amplify app. */
export const RUN_API_URL: string | null = 'https://u3hejmxncufr6t4izpvjs2bvca0zowea.lambda-url.us-west-1.on.aws';

/** Where "Open EmbraceHealthAI" and "Open iStride" go. */
export const MAIN_APP_URL = 'https://app.embracehealth.ai/';
export const RUN_APP_URL = 'https://run.embracehealth.ai/';

/**
 * CARTO basemap key: the same value as VITE_CARTO_API_KEY in the
 * run.embracehealth.ai Amplify app. It comes from the EAS environment variable
 * EXPO_PUBLIC_CARTO_API_KEY, written into the app when it's built or updated.
 * It's visible in iStride's web pages anyway, so it isn't a secret. Without it
 * the map tiles carry CARTO's "API key required" watermark.
 */
export const CARTO_API_KEY = process.env.EXPO_PUBLIC_CARTO_API_KEY ?? '';

/**
 * Sency auth key, for Advanced MSK Health (src/modules/msk). It comes from the
 * EAS environment variable EXPO_PUBLIC_SENCY_AUTH_KEY, written into the app
 * when it's built or updated. Sency's SDK needs it on the phone, so it can't be
 * kept on the server. Without it the check says it isn't set up yet.
 */
export const SENCY_AUTH_KEY = process.env.EXPO_PUBLIC_SENCY_AUTH_KEY ?? '';
