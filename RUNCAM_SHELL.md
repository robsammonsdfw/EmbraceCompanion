# Runcam: what the shell provides (phase 1)

For the iStride session, which builds Runcam in `src/modules/run/`. Written Nov 23, 2026 by the
main app session, from `RUNCAM_PLAN.md` section 6.

**Status: built and typechecked, not yet run on a phone.** Rob's proof (Settings › Runcam proof in a
test build) decides whether the clip export is fast enough. Don't build phase 4 on `exportClip`
until he reports the result.

## The pieces

| File | What it gives you |
|---|---|
| `src/shell/RunCamera.tsx` | `<RunCamera ref active facing onError>` with `takePhoto()`, `startClip({ maxSeconds, onStarted })`, `stopClip()`. Children are drawn over the preview. |
| `src/shell/media.ts` | `saveToPhotos(path)`, `shareFile(path, mimeType)`, `exportClip(…, onProgress)`, `fileUri()`, `filePath()` |
| `src/shell/DrawingHost.tsx` | `<DrawingHost ref script onReady onError>` with `ask(message)`: the hidden web page for the share drawing code |
| `src/shell/permissions.ts` | `ensurePhotoSave()` |
| `src/shell/PermissionCard.tsx` | kinds `runcam` (the camera, Runcam wording) and `photos` (save to Photos) |
| `src/shell/build.ts` | `TEST_BUILD`: true in test builds, false in the store build |
| `src/shell/RuncamProof.tsx` | The proof screen. It uses every piece above once; read it as the worked example. |

Each file's header explains how to call it.

## Where this differs from the request

1. **Overlays need a place and a size, and their total area is limited.**
   `exportClip` overlays are `{ path, startMs, endMs, x, y, width, height }` in the exported clip's
   pixels (left out, a picture covers the whole frame). The export library refuses when the areas
   of all the pictures add up to more than about 16 million pixels on an iPhone, and less on
   Android: the app's memory limit ÷ 32, about 8 million on a phone with a 256 MB limit.
   - Thirty full-frame 1080×1920 pictures are 62 million: refused.
   - Thirty 1000×200 strips plus the name are 6 million: fine.

   So draw the numbers as a strip, not as a full frame, and keep 30 × width × height under about
   6 million.
2. **`exportClip` resolves with `{ path, seconds, bytes, durationMs }`.** It also trims each
   picture's end time to the clip's real length, because a "30 second" clip is rarely exactly
   30,000 ms and the library refuses a picture that runs past the end.
3. **`startClip()` resolves when the clip has finished**, with `{ path, ended }`: `'stopped'`,
   `'max'` (it reached `maxSeconds`) or `'cut'` (the phone interrupted it and what was recorded was
   kept). `stopClip()` resolves with the same clip. `onStarted` runs when frames are being written:
   start logging the numbers there.
4. **`saveToPhotos()` resolves with `'saved'`, `'denied'` or `'blocked'`.** It asks for the
   save-only permission itself the first time. Show `<PermissionCard kind="photos" />` first.
5. **The Runcam shots route isn't there yet.** `src/app/run/shots.tsx` would export
   `@/modules/run/runcam/Shots`, which doesn't exist, and a route to a missing file breaks the
   build. When you add `Shots`, also add that one-line route file and
   `<Stack.Screen name="run/shots" options={{ title: 'Runcam shots' }} />` in `src/app/_layout.tsx`.
   Change nothing else in `src/app/`.
6. **Test builds use the `preview` profile, not `development`.** A development build only runs
   while it's connected to a computer, which doesn't work on a run. `TEST_BUILD` is true on
   `preview`.

## Things to know

- **Paths.** The camera returns plain paths (`/var/…/clip.mp4`). Expo's file tools want
  `file://` addresses. Everything in `media.ts` takes either.
- **What's over the preview isn't in the photo or clip.** The recorder writes the camera's own
  picture. Lay the numbers on afterwards.
- **Clips have no sound.** The microphone isn't used and the member's music keeps playing.
- **The photo is a JPEG**, about 1440×2560 when the phone offers it.
- **The drawing page.** Your script sets `window.companionHandle = (message) => answer` (or a
  Promise of one). Messages and answers are JSON. A picture comes back as base64 text
  (`canvas.toDataURL('image/png').split(',')[1]`); write it with
  `file.write(base64, { encoding: 'base64' })`.
- **Photos permission.** iPhone: "add only". Android 13 and later: nothing to ask. Android 7–12:
  storage. The app never reads the library, and the Android read permissions are blocked in
  `app.config.js`.
- **Camera only while the Companion is on screen.** Keep the screen awake while Runcam is open.
- **Version 1.1.0.** Over-the-air updates published from `main` now reach only 1.1.0 builds.
