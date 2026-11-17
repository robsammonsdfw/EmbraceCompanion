// ============================================================================
// Listening to a song for a few seconds (react-native-audio-api), so the Run
// module can find its beat.
//
//   listenPcm(8, (left) => …, signal) → { samples: Float32Array, sampleRate }
//
// Mono raw samples (−1…1). Music playing from another app keeps playing: the
// microphone is opened alongside it, never instead of it. Afterwards the audio
// setup goes back to the Companion's normal one (speech.ts restoreAudio), so
// spoken cues still lower the music. Nothing is saved or sent anywhere.
// Ask first with <PermissionCard kind="microphone" />.
// ============================================================================

import { Platform } from 'react-native';
import { AudioManager, AudioRecorder } from 'react-native-audio-api';

import type { PermissionResult } from './permissions';
import { restoreAudio } from './speech';

const SAMPLE_RATE = 44_100;

export const ensureMicrophone = async (): Promise<PermissionResult> => {
  const current = await AudioManager.checkRecordingPermissions();
  if (current === 'Granted') return 'granted';
  const asked = await AudioManager.requestRecordingPermissions();
  if (asked === 'Granted') return 'granted';
  // iPhone asks once; after a "Don't Allow" only Settings can change it.
  return Platform.OS === 'ios' || current === 'Denied' ? 'blocked' : 'denied';
};

let busy = false;

export const listenPcm = async (
  seconds: number,
  onSecond?: (secondsLeft: number) => void,
  signal?: AbortSignal,
): Promise<{ samples: Float32Array; sampleRate: number }> => {
  if (busy) throw new Error('Already listening.');
  if ((await AudioManager.checkRecordingPermissions()) !== 'Granted') {
    throw new Error('The Companion isn’t allowed to use the microphone. You can allow it in Settings.');
  }
  if (signal?.aborted) throw new Error('Stopped.');
  busy = true;

  const chunks: Float32Array[] = [];
  let total = 0;
  let rate = SAMPLE_RATE;
  const recorder = new AudioRecorder();
  const timers: ReturnType<typeof setTimeout>[] = [];

  try {
    // Record next to whatever is playing, without pausing or lowering it.
    AudioManager.setSystemOptions({
      ios: { category: 'playAndRecord', mode: 'measurement', options: ['mixWithOthers', 'defaultToSpeaker', 'allowBluetoothA2DP'] },
    });
    await AudioManager.setAudioSessionActivity(true);

    const ready = recorder.onAudioReady({ sampleRate: SAMPLE_RATE, bufferLength: 4_410, channelCount: 1 }, (e) => {
      rate = e.buffer.sampleRate || rate;
      const copy = new Float32Array(e.buffer.getChannelData(0));
      chunks.push(copy);
      total += copy.length;
    });
    if (ready.status === 'error') throw new Error(ready.message);

    const started = await recorder.start();
    if (started.status === 'error') throw new Error(started.message);

    await new Promise<void>((resolve, reject) => {
      const whole = Math.max(1, Math.round(seconds));
      for (let s = 1; s <= whole; s++) {
        timers.push(setTimeout(() => {
          onSecond?.(whole - s);
          if (s === whole) resolve();
        }, s * 1000));
      }
      signal?.addEventListener('abort', () => reject(new Error('Stopped.')), { once: true });
    });
  } catch (e) {
    const message = (e as Error).message || '';
    throw new Error(message === 'Stopped.' ? message : `The microphone isn’t available right now. ${message}`.trim());
  } finally {
    timers.forEach(clearTimeout);
    recorder.clearOnAudioReady();
    await recorder.stop().catch(() => undefined);
    await restoreAudio();
    busy = false;
  }

  const samples = new Float32Array(total);
  let at = 0;
  for (const c of chunks) { samples.set(c, at); at += c.length; }
  return { samples, sampleRate: rate };
};
