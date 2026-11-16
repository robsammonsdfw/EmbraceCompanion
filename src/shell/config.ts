// Addresses the Companion talks to.

/** The main EmbraceHealthAI API (EmbraceMacro's Lambda). */
export const MAIN_API_URL = 'https://xmpbc16u1f.execute-api.us-west-1.amazonaws.com/default';

/**
 * iStride's API (TempoRun's Lambda) — the same address as VITE_API_URL in the
 * run.embracehealth.ai Amplify app. Null until it's filled in; istride() says so.
 */
export const RUN_API_URL: string | null = null;

/** Where "Open EmbraceHealthAI" and "Open iStride" go. */
export const MAIN_APP_URL = 'https://app.embracehealth.ai/';
export const RUN_APP_URL = 'https://run.embracehealth.ai/';

/**
 * CARTO basemap key (VITE_CARTO_API_KEY in the run.embracehealth.ai Amplify
 * app). It's in iStride's web pages already, so it isn't secret. Without it
 * the map tiles carry CARTO's "API key required" watermark.
 */
export const CARTO_API_KEY = '';
