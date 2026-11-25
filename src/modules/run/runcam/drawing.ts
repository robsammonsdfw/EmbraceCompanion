// ============================================================================
// Runcam's drawing: the numbers go onto a photo with iStride's own share
// drawing code, run in the shell's hidden page (shell/DrawingHost.tsx), so a
// Runcam picture looks like a share card made in iStride or the main app.
//
//   DRAWING_SCRIPT   what the hidden page runs: the share kit
//                    (shareKit.generated.ts, built from iStride) and the
//                    handler below
//   makeDrawer(ask)  typed calls over the page's ask()
//
// What the handler answers (all JSON):
//   { kind: 'photo', id, data }            remember this photo (base64 JPEG)   → { width, height }
//   { kind: 'card', id, design, … }        the photo with a design over it     → { design, jpeg }
//   { kind: 'designs', … }                 every design these numbers can fill → [{ id, name, thumb }]
//   { kind: 'upload', id }                 the photo alone, small enough to add
//                                          to the activity's photos in iStride → a data address
//   { kind: 'forget', id }                 let the photo go                    → true
// A picture is always Story size (1080 × 1920), the shape of the camera's photo.
// ============================================================================

import type { ShotDraw } from './numbers';
import { SHARE_ICON, SHARE_KIT } from './shareKit.generated';

/** The design a new shot gets: three numbers in a row, low on the picture. */
export const FIRST_DESIGN = 'trio';
/** The longest side of a photo added to an activity (iStride stores photos in the database). */
const UPLOAD_EDGE = 1280;

const HANDLER = `
(function () {
  var K = window.ShareKit;
  var photos = {};
  var icon = null;
  var iconReady = new Promise(function (done) {
    var i = new Image();
    i.onload = function () { icon = i; done(); };
    i.onerror = function () { done(); };
    i.src = ${JSON.stringify(SHARE_ICON)};
  });
  var open = function (src) {
    return new Promise(function (ok, no) {
      var i = new Image();
      i.onload = function () { ok(i); };
      i.onerror = function () { no(new Error('That photo could not be opened.')); };
      i.src = src;
    });
  };
  var known = function (id) {
    var img = photos[id];
    if (!img) throw new Error('photo-missing');
    return img;
  };
  // The activity so far, with the three live numbers first. The whole-activity
  // pace is dropped so a picture never carries two different paces.
  var content = function (m) {
    var c = K.buildActivityContent(m.run, { unit: m.unit, shown: new Set(), words: '', city: null, zones: [] });
    var lead = m.lead || [];
    var taken = { pace: true, speed: true };
    lead.forEach(function (f) { taken[f.key] = true; });
    c.facts = lead.concat(c.facts.filter(function (f) { return !taken[f.key]; }));
    return c;
  };
  var offered = function (c) { return K.activityDesignsFor('card', 'activity', c); };
  window.companionHandle = function (m) {
    if (m.kind === 'photo') {
      return open('data:image/jpeg;base64,' + m.data).then(function (img) {
        photos[m.id] = img;
        return { width: img.naturalWidth, height: img.naturalHeight };
      });
    }
    if (m.kind === 'card') {
      return iconReady.then(function () {
        var img = known(m.id);
        var c = content(m);
        var all = offered(c);
        var d = all.filter(function (g) { return g.id === m.design; })[0] || all[0];
        if (!d) throw new Error('There are no numbers to put on the picture yet.');
        var canvas = document.createElement('canvas');
        K.renderCard(canvas, {
          size: 'story', background: K.BACKGROUNDS[0], photo: img, photoW: img.naturalWidth, photoH: img.naturalHeight,
          design: d, data: c, color: null, font: 'sans', position: 'bottom', icon: icon
        });
        return { design: d.id, jpeg: canvas.toDataURL('image/jpeg', 0.9).split(',')[1] };
      });
    }
    if (m.kind === 'designs') {
      var c = content(m);
      return offered(c).map(function (d) {
        var canvas = document.createElement('canvas');
        canvas.width = 360; canvas.height = 236;
        K.renderThumb(canvas, d, c, 'sans');
        return { id: d.id, name: d.name, thumb: canvas.toDataURL('image/png').split(',')[1] };
      });
    }
    if (m.kind === 'upload') {
      var img = known(m.id);
      var k = Math.min(1, ${UPLOAD_EDGE} / Math.max(img.naturalWidth, img.naturalHeight));
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * k); canvas.height = Math.round(img.naturalHeight * k);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.78);
    }
    if (m.kind === 'forget') { delete photos[m.id]; return true; }
    throw new Error('Unknown request.');
  };
})();`;

// The kit declares `var ShareKit`; it is also put on window, so the handler finds it
// however the page happens to run this text.
export const DRAWING_SCRIPT = `${SHARE_KIT}\nwindow.ShareKit = ShareKit;\n${HANDLER}`;

export interface DesignChoice { id: string; name: string; /** A small PNG of the design, drawn in white, as base64. */ thumb: string }

type Ask = <T>(message: unknown, timeoutMs?: number) => Promise<T>;

export interface Drawer {
  /** Hands the page a photo (base64 JPEG) to draw on. */
  photo: (id: string, data: string) => Promise<{ width: number; height: number }>;
  /** The photo with a design over it, as a base64 JPEG, and the design that was used. */
  card: (id: string, design: string, draw: ShotDraw) => Promise<{ design: string; jpeg: string }>;
  designs: (draw: ShotDraw) => Promise<DesignChoice[]>;
  /** The photo alone as a data address, small enough to add to the activity. */
  upload: (id: string) => Promise<string>;
  forget: (id: string) => void;
}

/** True when the page no longer has the photo (it was reloaded, or the shot is from an earlier day). */
export const photoMissing = (e: unknown) => e instanceof Error && e.message.includes('photo-missing');

export const makeDrawer = (ask: Ask): Drawer => ({
  // A photo is a few megabytes of text: give it longer than a drawing.
  photo: (id, data) => ask({ kind: 'photo', id, data }, 30000),
  card: (id, design, draw) => ask({ kind: 'card', id, design, ...draw }),
  designs: (draw) => ask({ kind: 'designs', ...draw }),
  upload: (id) => ask({ kind: 'upload', id }),
  forget: (id) => { void ask({ kind: 'forget', id }).catch(() => undefined); },
});
