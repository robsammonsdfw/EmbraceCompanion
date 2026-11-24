// ============================================================================
// Photos and clips the member made: save one to Photos, open the phone's share
// menu with one, and lay timed pictures over a clip (Runcam's numbers).
//
//   await saveToPhotos(path)                → 'saved' | 'denied' | 'blocked'
//   await shareFile(path, 'video/mp4')
//   await exportClip({ input, output, width, height, overlays }, onProgress)
//
// Paths. The camera hands back plain paths ("/var/…/clip.mp4"); Expo's file
// tools want addresses ("file:///var/…"). Everything here takes either, and
// fileUri() / filePath() convert when a caller needs one form.
//
// Nothing here uploads anything. A file leaves the phone only through the
// share menu, when the member picks somewhere to send it.
// ============================================================================

import { File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { createExport, getMediaInfo, deleteGeneratedFile, type VideoOverlay } from 'react-native-nitro-media-kit';

import { ensurePhotoSave } from './permissions';

/** "file:///…" for a path or an address. */
export const fileUri = (path: string) => (path.startsWith('file://') ? path : `file://${path}`);
/** A plain path for a path or an address. */
export const filePath = (path: string) => (path.startsWith('file://') ? decodeURIComponent(path.slice('file://'.length)) : path);

/**
 * Saves a photo or clip to the member's photo library. Asks for the save-only
 * permission the first time (it never reads the library). Show
 * <PermissionCard kind="photos" /> first to explain it in plain words.
 */
export const saveToPhotos = async (path: string): Promise<'saved' | 'denied' | 'blocked'> => {
  const allowed = await ensurePhotoSave();
  if (allowed !== 'granted') return allowed;
  await MediaLibrary.saveToLibraryAsync(fileUri(path));
  return 'saved';
};

// What an iPhone calls each kind of file; it uses this to pick which apps to offer.
const UTI: Record<string, string> = {
  'image/jpeg': 'public.jpeg',
  'image/png': 'public.png',
  'video/mp4': 'public.mpeg-4',
  'video/quicktime': 'com.apple.quicktime-movie',
};

/** Opens the phone's own share menu with one file. Resolves when the menu closes. */
export const shareFile = async (path: string, mimeType: string): Promise<void> => {
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone has no share menu.');
  await Sharing.shareAsync(fileUri(path), { mimeType, UTI: UTI[mimeType] });
};

/**
 * A picture laid over a clip from startMs up to (not including) endMs.
 * x, y, width and height are in the exported clip's pixels, from the top left;
 * left out, the picture covers the whole frame.
 *
 * Keep them small. The export refuses when the areas of all the pictures add
 * up to more than about 16 million pixels on an iPhone, and less on Android
 * (the app's memory limit ÷ 32: about 8 million on a 256 MB phone). Thirty
 * full-frame 1080×1920 pictures are 62 million; thirty 1000×200 strips are 6.
 * At most 32 pictures in one export.
 */
export type ClipOverlay = {
  path: string;
  startMs: number;
  endMs: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type ExportedClip = {
  /** Where the finished clip is: the `output` asked for. */
  path: string;
  /** How long the export took. */
  seconds: number;
  bytes: number;
  durationMs: number;
};

/**
 * Writes a copy of `input` at width × height (cropped to fill) with the
 * pictures laid over it, as an H.264 MP4 with no sound, at `output`. The work
 * runs off the JavaScript thread; onProgress gets 0 to 1.
 */
export const exportClip = async (
  o: { input: string; output: string; width: number; height: number; overlays: ClipOverlay[] },
  onProgress?: (fraction: number) => void,
): Promise<ExportedClip> => {
  const started = Date.now();
  const input = filePath(o.input);
  // A picture may not run past the end of the clip, and a "30 second" clip is
  // rarely exactly 30,000 ms: trim each to the clip's real length.
  const info = await getMediaInfo(input);
  const durationMs = info.media?.durationMs ?? 0;
  if (!info.ok || durationMs <= 0) throw new Error(info.error?.message || 'That clip can’t be read.');
  const overlays: VideoOverlay[] = o.overlays
    .filter((v) => v.startMs < durationMs && v.endMs > v.startMs)
    .map((v) => ({
      kind: 'image',
      uri: filePath(v.path),
      x: v.x ?? 0,
      y: v.y ?? 0,
      width: v.width ?? o.width,
      height: v.height ?? o.height,
      startMs: Math.max(0, v.startMs),
      endMs: Math.min(v.endMs, durationMs),
    }));
  const job = createExport(
    input,
    {
      geometry: { width: o.width, height: o.height, fit: 'cover' },
      overlays,
      video: { codec: 'h264', maxFps: 30 },
      audio: 'mute',
    },
    (p) => { if (p.fraction != null) onProgress?.(p.fraction); },
  );
  const done = await job.result();
  // The library writes into its own folder; move the clip to where it was asked for.
  const made = new File(fileUri(done.outputUri));
  const target = new File(fileUri(o.output));
  if (target.exists) target.delete();
  await made.copy(target);
  await deleteGeneratedFile(done.outputUri).catch(() => false);
  onProgress?.(1);
  return {
    path: filePath(target.uri),
    seconds: (Date.now() - started) / 1000,
    bytes: target.size,
    durationMs: done.media.durationMs ?? durationMs,
  };
};
