// ============================================================================
// Runcam shots: the photos the member took during activities, kept on this
// phone until they delete them.
//
// Each shot is a row here and up to three files in the app's own folder:
//   <id>-<design>.jpg  the picture: the photo with the numbers on it (what is
//                      shared and saved to Photos). The design is in the name
//                      so a redrawn picture is a new file; the phone would
//                      otherwise go on showing the old one from its memory.
//   <id>-photo.jpg     the camera's own photo, kept so the picture can be
//                      redrawn in another design
//   <id>-up.jpg        a smaller copy of the photo, made only when the member
//                      ticks "Add to this activity's photos"
// The row stores file names, not full paths: an iPhone moves the app's folder
// when the app is updated.
//
// Nothing here leaves the phone except a photo the member ticked. That one is
// handed to the shell's upload queue once the activity itself has saved (the
// photo is filed under the activity's id in iStride, which only exists then).
// ============================================================================

import { Directory, File, Paths } from 'expo-file-system';
import { useMemo, useSyncExternalStore } from 'react';

import { db } from '@/shell/storage';
import { enqueueUpload, getUpload } from '@/shell/uploads';

import { getActivity } from '../store';
import { shotCaption, type ShotDraw } from './numbers';

/**
 * none      stays on the phone
 * waiting   ticked; goes up once the activity has saved
 * queued    handed to the upload queue (see addedToActivity)
 */
export type ShotUpload = 'none' | 'waiting' | 'queued';

export interface Shot {
  id: string;
  clientRunId: string;
  takenAt: number;
  /** "Morning Run": what the activity is called on the shots page. */
  label: string;
  /** The design the picture is drawn in now. */
  design: string;
  /** What the picture is drawn from. */
  draw: ShotDraw;
  upload: ShotUpload;
}

type Row = {
  id: string; client_run_id: string; taken_at: number; label: string; design: string; draw_json: string; upload: string;
};

let ready = false;
const table = () => {
  if (!ready) {
    db().execSync(`
      CREATE TABLE IF NOT EXISTS run_shots (
        id TEXT PRIMARY KEY,
        client_run_id TEXT NOT NULL,
        taken_at INTEGER NOT NULL,
        label TEXT NOT NULL,
        design TEXT NOT NULL,
        draw_json TEXT NOT NULL,
        upload TEXT NOT NULL DEFAULT 'none'
      );
      CREATE INDEX IF NOT EXISTS run_shots_taken ON run_shots (taken_at);
    `);
    ready = true;
  }
  return db();
};

let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version += 1; listeners.forEach((l) => l()); };

const toShot = (r: Row): Shot => ({
  id: r.id, clientRunId: r.client_run_id, takenAt: r.taken_at, label: r.label, design: r.design,
  draw: JSON.parse(r.draw_json) as ShotDraw,
  upload: r.upload === 'waiting' || r.upload === 'queued' ? r.upload : 'none',
});

// ── Files ───────────────────────────────────────────────────────────────────

const folder = () => {
  const dir = new Directory(Paths.document, 'runcam');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
};
/** The picture with the numbers on it. */
export const pictureFile = (shot: { id: string; design: string }) => new File(folder(), `${shot.id}-${shot.design}.jpg`);
/** The camera's own photo. */
export const photoFile = (id: string) => new File(folder(), `${id}-photo.jpg`);
const uploadFile = (id: string) => new File(folder(), `${id}-up.jpg`);

const writeBase64 = async (file: File, base64: string) => {
  if (file.exists) file.delete();
  file.create();
  await file.write(base64, { encoding: 'base64' });
};
const remove = (file: File) => { try { if (file.exists) file.delete(); } catch { /* already gone */ } };

export const newShotId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ── Shots ───────────────────────────────────────────────────────────────────

/** Every shot, newest first. */
export const listShots = (): Shot[] =>
  table().getAllSync<Row>('SELECT * FROM run_shots ORDER BY taken_at DESC').map(toShot);

export const getShot = (id: string): Shot | null => {
  const r = table().getFirstSync<Row>('SELECT * FROM run_shots WHERE id = ?', id);
  return r ? toShot(r) : null;
};

/** Re-renders when a shot is added, changed or deleted. */
export const useShots = (): Shot[] => {
  const v = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => version, () => version);
  // The same list until something changes, so screens can tell when it has.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => listShots(), [v]);
};

export const shotCount = (): number => table().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM run_shots')?.n ?? 0;

/**
 * Keeps a new shot: moves the camera's photo into the app's folder, writes the
 * picture, and records it. `cameraPath` is where the camera left the photo.
 */
export const keepShot = async (o: {
  id: string; clientRunId: string; takenAt: number; label: string; design: string; draw: ShotDraw;
  cameraPath: string; pictureBase64: string;
}): Promise<Shot> => {
  const from = new File(o.cameraPath.startsWith('file://') ? o.cameraPath : `file://${o.cameraPath}`);
  const photo = photoFile(o.id);
  remove(photo);
  await from.move(photo);
  await writeBase64(pictureFile(o), o.pictureBase64);
  table().runSync(
    'INSERT INTO run_shots (id, client_run_id, taken_at, label, design, draw_json) VALUES (?, ?, ?, ?, ?, ?)',
    o.id, o.clientRunId, o.takenAt, o.label, o.design, JSON.stringify(o.draw),
  );
  emit();
  return getShot(o.id) as Shot;
};

/** The picture was redrawn in another design. */
export const redrawShot = async (shot: Shot, design: string, pictureBase64: string): Promise<Shot> => {
  await writeBase64(pictureFile({ id: shot.id, design }), pictureBase64);
  if (design !== shot.design) remove(pictureFile(shot));
  table().runSync('UPDATE run_shots SET design = ? WHERE id = ?', design, shot.id);
  emit();
  return { ...shot, design };
};

/** Deletes a shot and its files from the phone. A photo already added to an activity stays in iStride. */
export const deleteShot = (shot: Shot) => {
  remove(pictureFile(shot));
  remove(photoFile(shot.id));
  remove(uploadFile(shot.id));
  table().runSync('DELETE FROM run_shots WHERE id = ?', shot.id);
  emit();
};

/** How much room the shots take on the phone, in bytes. */
export const shotsBytes = (): number => {
  let total = 0;
  try { for (const f of folder().list()) if (f instanceof File) total += f.size; } catch { /* unreadable: say nothing */ }
  return total;
};

// ── Adding a photo to the activity in iStride ───────────────────────────────

const uploadKey = (id: string) => `runcam-photo-${id}`;

/**
 * Ticked: the photo will be added to its activity's photos. `uploadDataUrl` is
 * the smaller copy from the drawing page ("data:image/jpeg;base64,…").
 */
export const addToActivity = async (id: string, uploadDataUrl: string) => {
  await writeBase64(uploadFile(id), uploadDataUrl.slice(uploadDataUrl.indexOf(',') + 1));
  table().runSync("UPDATE run_shots SET upload = 'waiting' WHERE id = ? AND upload = 'none'", id);
  emit();
  void sendWaitingShots();
};

/** Unticked before it was sent: it stays on the phone. False when it has already been sent. */
export const keepOffActivity = (id: string): boolean => {
  const done = table().runSync("UPDATE run_shots SET upload = 'none' WHERE id = ? AND upload = 'waiting'", id).changes > 0;
  if (done) { remove(uploadFile(id)); emit(); }
  return done;
};

/** An activity that was discarded has no report to add photos to: its shots simply stay on the phone. */
export const activityDiscarded = (clientRunId: string) => {
  const waiting = table().getAllSync<{ id: string }>("SELECT id FROM run_shots WHERE client_run_id = ? AND upload = 'waiting'", clientRunId);
  if (!waiting.length) return;
  for (const w of waiting) remove(uploadFile(w.id));
  table().runSync("UPDATE run_shots SET upload = 'none' WHERE client_run_id = ? AND upload = 'waiting'", clientRunId);
  emit();
};

/** 'added' once iStride has the photo; 'failed' if it refused it; otherwise still on its way. */
export const addedToActivity = (shot: Shot): 'no' | 'waiting' | 'added' | 'failed' => {
  if (shot.upload === 'none') return 'no';
  if (shot.upload === 'waiting') return 'waiting';
  const u = getUpload(uploadKey(shot.id));
  return u?.status === 'done' ? 'added' : u?.status === 'failed' ? 'failed' : 'waiting';
};

/**
 * How many of an activity's ticked photos haven't reached iStride yet. The
 * finish screen waits for these (briefly) before opening the report, so the
 * photos are already in it.
 */
export const shotsStillSending = (clientRunId: string): number =>
  table().getAllSync<Row>("SELECT * FROM run_shots WHERE client_run_id = ? AND upload != 'none'", clientRunId)
    .map(toShot).filter((shot) => addedToActivity(shot) === 'waiting').length;

let sending = false;
/**
 * Hands every ticked photo whose activity has saved to the upload queue, as
 * POST /runs/:id/photos (the same request iStride's own photo button makes).
 * Safe to call any time; it does nothing until the activity has its id.
 */
export const sendWaitingShots = async () => {
  if (sending) return;
  sending = true;
  try {
    const waiting = table().getAllSync<Row>("SELECT * FROM run_shots WHERE upload = 'waiting' ORDER BY taken_at").map(toShot);
    let changed = false;
    for (const shot of waiting) {
      const run = getUpload(shot.clientRunId);
      const runId = run?.status === 'done' ? (run.result as { id?: number } | null)?.id : null;
      if (!runId) {
        // Never handed in to be saved, and no longer in progress (it was discarded): it stays on the phone.
        const activity = run ? null : getActivity(shot.clientRunId);
        if (!run && (!activity || activity.status === 'discarded')) {
          remove(uploadFile(shot.id));
          table().runSync("UPDATE run_shots SET upload = 'none' WHERE id = ?", shot.id);
          changed = true;
        }
        continue;
      }
      const file = uploadFile(shot.id);
      if (!file.exists) { table().runSync("UPDATE run_shots SET upload = 'none' WHERE id = ?", shot.id); changed = true; continue; }
      const base64 = await file.base64();
      enqueueUpload({
        key: uploadKey(shot.id),
        api: 'istride',
        path: `/runs/${runId}/photos`,
        // No place is sent with it: where a photo was taken is never stored, so it
        // can't show where the member lives.
        body: { photo_data: `data:image/jpeg;base64,${base64}`, caption: shotCaption(shot.draw.lead) },
      });
      // The queue keeps its own copy from here.
      table().runSync("UPDATE run_shots SET upload = 'queued' WHERE id = ?", shot.id);
      remove(file);
      changed = true;
    }
    if (changed) emit();
  } catch { /* tried again the next time it's called */ } finally {
    sending = false;
  }
};
