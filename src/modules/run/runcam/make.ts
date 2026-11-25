// ============================================================================
// Runcam: making a shot, redrawing it, and adding its photo to the activity.
// The steps between the camera, the drawing page (drawing.ts) and the shots
// kept on the phone (shots.ts). No screen here.
// ============================================================================

import { File } from 'expo-file-system';

import { activityLabel } from '../calc/activityTypes';
import type { RunEngine } from '../calc/engine';
import { getPref, setPref } from '../store';
import { FIRST_DESIGN, photoMissing, type DesignChoice, type Drawer } from './drawing';
import { shotDraw } from './numbers';
import { addToActivity, keepOffActivity, keepShot, newShotId, photoFile, redrawShot, type Shot } from './shots';

const ADD_PREF = 'runcam.add';
/** The member's last choice for "Add to this activity's photos". Off until they tick it. */
export const addByDefault = () => getPref(ADD_PREF) === '1';

const deviceZone = (): string | null => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
};

/** Runs a drawing that needs the photo; if the page has let it go, hands it over again and tries once more. */
const withPhoto = async <T,>(drawer: Drawer, id: string, work: () => Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (e) {
    if (!photoMissing(e)) throw e;
    const file = photoFile(id);
    if (!file.exists) throw new Error('This shot’s photo is no longer on the phone.');
    await drawer.photo(id, await file.base64());
    return work();
  }
};

/** The design name of a shot whose numbers couldn't be drawn: its picture is the photo as taken. */
export const PLAIN = 'plain';

/**
 * A photo was just taken: reads the numbers as they are this second, draws
 * them on, and keeps the shot. `cameraPath` is where the camera left the photo.
 * If the drawing fails the photo is still kept, as taken (design PLAIN); More
 * designs draws the numbers on later.
 */
export const makeShot = async (drawer: Drawer, o: { cameraPath: string; engine: RunEngine; clientRunId: string }): Promise<Shot> => {
  // The numbers first, so they are the ones on screen when the button was pressed.
  const draw = shotDraw(o.engine, o.clientRunId, deviceZone());
  const takenAt = Date.now();
  const id = newShotId();
  const uri = o.cameraPath.startsWith('file://') ? o.cameraPath : `file://${o.cameraPath}`;
  const photo = await new File(uri).base64();
  let card: { design: string; jpeg: string };
  try {
    await drawer.photo(id, photo);
    card = await drawer.card(id, FIRST_DESIGN, draw);
  } catch {
    card = { design: PLAIN, jpeg: photo };
  }
  const shot = await keepShot({
    id, clientRunId: o.clientRunId, takenAt, label: activityLabel(o.engine.cfg.mode), design: card.design, draw,
    cameraPath: o.cameraPath, pictureBase64: card.jpeg,
  });
  if (!addByDefault() || card.design === PLAIN) return shot;
  // Ticked last time: this one goes to the activity's photos too.
  try { await addToActivity(id, await drawer.upload(id)); return { ...shot, upload: 'waiting' }; } catch { return shot; }
};

/** Every design this shot's numbers can fill, each with a small picture of it. */
export const designsFor = (drawer: Drawer, shot: Shot): Promise<DesignChoice[]> => drawer.designs(shot.draw);

/** Redraws the shot's picture in another design. */
export const redrawIn = async (drawer: Drawer, shot: Shot, design: string): Promise<Shot> => {
  const card = await withPhoto(drawer, shot.id, () => drawer.card(shot.id, design, shot.draw));
  return redrawShot(shot, card.design, card.jpeg);
};

/**
 * "Add to this activity's photos", ticked or unticked. The choice is
 * remembered for the next shot. Resolves with the shot as it now stands;
 * unticking a photo that has already been sent changes nothing.
 */
export const setAddToActivity = async (drawer: Drawer, shot: Shot, on: boolean): Promise<Shot> => {
  setPref(ADD_PREF, on ? '1' : '0');
  if (on) {
    if (shot.upload !== 'none') return shot;
    await addToActivity(shot.id, await withPhoto(drawer, shot.id, () => drawer.upload(shot.id)));
    return { ...shot, upload: 'waiting' };
  }
  return keepOffActivity(shot.id) ? { ...shot, upload: 'none' } : shot;
};
