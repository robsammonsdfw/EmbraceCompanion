// Speaking with the screen locked (spoken splits and cues). The audio session
// keeps playing in the background (UIBackgroundModes audio, from the expo-audio
// plugin in app.config.js) and lowers the member's music while speaking.

import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';

let prepared: Promise<void> | null = null;

/** Call when an activity starts. Safe to call again. */
export const prepareAudio = () => {
  if (!prepared) {
    prepared = setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
    }).catch(() => { prepared = null; });
  }
  return prepared;
};

/** Speaks with the phone's own voice. */
export const speak = async (text: string, opts: { rate?: number; language?: string } = {}) => {
  await prepareAudio();
  Speech.speak(text, { rate: opts.rate ?? 1.0, language: opts.language ?? 'en-US' });
};

export const stopSpeaking = () => Speech.stop();
