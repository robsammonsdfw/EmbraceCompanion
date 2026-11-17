// ============================================================================
// The coach's voice, with the screen locked.
//
// iStride's server voice (POST /generate-speech, the one the web uses) when it
// answers quickly; the phone's own voice (shell/speech) when it doesn't, or
// with no signal. A phrase the server has made once is kept on the phone, so
// the next time it plays at once and works offline. Cues we know are coming
// are fetched ahead.
//
// Playing the server's audio (and the HIIT beeps) needs to write a sound file,
// which uses expo-file-system. It's inside every Expo build, but it isn't in
// this app's package.json yet, so it's loaded carefully: if it isn't there,
// every cue uses the phone's voice and the beeps are skipped.
// ============================================================================

import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { istride } from '@/shell/api';
import { prepareAudio, speak, stopSpeaking } from '@/shell/speech';

type FsFile = { uri: string; exists: boolean; create?: () => void; write: (data: Uint8Array) => unknown };
type Fs = { File: new (...parts: unknown[]) => FsFile; Paths: { cache: unknown } };

let fsChecked = false;
let fsModule: Fs | null = null;
const files = (): Fs | null => {
  if (!fsChecked) {
    fsChecked = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const m = require('expo-file-system') as Partial<Fs>;
      fsModule = m.File && m.Paths?.cache ? (m as Fs) : null;
    } catch {
      fsModule = null;
    }
  }
  return fsModule;
};

/** How long to wait for the server's voice before the phone speaks instead. */
const SERVER_WAIT_MS = 1500;
const SERVER_DEADLINE_MS = 15000;
let serverRetryAt = 0;

const hash = (text: string) => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return `${h.toString(16)}-${text.length}`;
};

const base64ToBytes = (b64: string): Uint8Array => {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** 16-bit mono PCM wrapped as a WAV file. */
const wav = (pcm: Uint8Array, sampleRate: number): Uint8Array => {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i); };
  text(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
};

/** A short tone, like the web's HIIT beeps. */
const tone = (freq: number, ms: number, sampleRate = 22050): Uint8Array => {
  const n = Math.floor((sampleRate * ms) / 1000);
  const pcm = new Uint8Array(n * 2);
  const v = new DataView(pcm.buffer);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Quick fade in and out so it doesn't click.
    const env = Math.min(1, i / (sampleRate * 0.02), (n - i) / (sampleRate * 0.03));
    v.setInt16(i * 2, Math.round(Math.sin(2 * Math.PI * freq * t) * 0.5 * env * 32767), true);
  }
  return wav(pcm, sampleRate);
};

type Sound = { uri: string; ms: number };
const ready = new Map<string, Sound>();

const saveSound = async (name: string, bytes: Uint8Array, ms: number): Promise<Sound | null> => {
  const fs = files();
  if (!fs) return null;
  try {
    const file = new fs.File(fs.Paths.cache, name);
    if (!file.exists) file.create?.();
    await file.write(bytes);
    const sound = { uri: file.uri, ms };
    ready.set(name, sound);
    return sound;
  } catch {
    return null;
  }
};

const cached = (name: string): Sound | null => {
  const hit = ready.get(name);
  if (hit) return hit;
  const fs = files();
  if (!fs) return null;
  try {
    const file = new fs.File(fs.Paths.cache, name);
    // The length isn't known for a file from an earlier day: a typical cue.
    if (file.exists) { const s = { uri: file.uri, ms: 4000 }; ready.set(name, s); return s; }
  } catch { /* not there */ }
  return null;
};

const inflight = new Map<string, Promise<Sound | null>>();
const fromServer = (text: string): Promise<Sound | null> => {
  const name = `cue-${hash(text)}.wav`;
  const have = cached(name);
  if (have) return Promise.resolve(have);
  if (!files() || Date.now() < serverRetryAt) return Promise.resolve(null);
  const running = inflight.get(name);
  if (running) return running;
  const p = (async () => {
    try {
      const r = await Promise.race([
        istride<{ audioData?: string; sampleRate?: number }>('/generate-speech', { method: 'POST', body: { text } }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('slow')), SERVER_DEADLINE_MS)),
      ]);
      if (!r?.audioData) throw new Error('no audio');
      const rate = Number(r.sampleRate) || 24000;
      const pcm = base64ToBytes(r.audioData);
      return await saveSound(name, wav(pcm, rate), (pcm.length / 2 / rate) * 1000);
    } catch (e) {
      // After a failure, use the phone's voice for a while instead of failing on every cue.
      serverRetryAt = Date.now() + ((e as Error).message === 'slow' ? 60 : 300) * 1000;
      return null;
    } finally {
      inflight.delete(name);
    }
  })();
  inflight.set(name, p);
  return p;
};

let player: AudioPlayer | null = null;
/** Sounds play one after another, never on top of each other. */
let queue: Promise<void> = Promise.resolve();

const play = (sound: Sound) => {
  queue = queue.then(async () => {
    try {
      await prepareAudio();
      if (!player) player = createAudioPlayer(null);
      player.replace({ uri: sound.uri });
      player.play();
      await new Promise<void>((r) => setTimeout(r, sound.ms + 150));
    } catch { /* silent rather than stuck */ }
  });
};

/** Says a cue: the server's voice if it's ready within a moment, else the phone's. */
export const say = async (text: string) => {
  const late = new Promise<null>((r) => setTimeout(() => r(null), SERVER_WAIT_MS));
  const sound = await Promise.race([fromServer(text), late]);
  if (sound) play(sound);
  else queue = queue.then(() => speak(text)).catch(() => undefined);
};

/** A beep (HIIT). Skipped when sound files can't be written. */
export const beep = async (freq: number, ms: number) => {
  const name = `tone-${freq}-${ms}.wav`;
  const sound = cached(name) ?? (await saveSound(name, tone(freq, ms), ms));
  if (sound) play({ ...sound, ms });
};

/** Fetches cues we know are coming, one at a time, so they play on time. */
export const prefetch = async (texts: string[]) => {
  for (const t of texts) {
    if (!files() || Date.now() < serverRetryAt) return;
    await fromServer(t);
  }
};

export const hush = () => {
  stopSpeaking();
  try { player?.pause(); } catch { /* nothing playing */ }
};
