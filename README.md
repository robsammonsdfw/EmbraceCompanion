# EmbraceHealthAI Companion

**What it is.** The EmbraceHealthAI phone app for iPhone and Android, built with React Native and
Expo SDK 58. The web apps open it with `https://go.embracehealth.ai/...` links:
- `app.embracehealth.ai`
- `run.embracehealth.ai`
- `scan.embracehealth.ai`

**Where the plan lives.** `COMPANION_APP_PLAN.md` in the EmbraceMacro repo (`docs/`) and the
EmbraceMainApp Project. Rules for working here are in `CLAUDE.md`.

## Where things are
```
src/app/            screens; the path matches the go link (/run/start, /scan, /msk)
src/shell/          links, permissions, location tracking, on-device storage, UI pieces
src/modules/run/    iStride's run dashboard (Phase 3). For now, the Proof 2 test screen
src/modules/scan/   the scanner page hosted in the app
src/modules/msk/    Sency. For now, the Proof 4 test screen
plugins/            native setup Expo doesn't do itself (Sency's pod source and Maven repo)
go-site/            go.embracehealth.ai: the "Get the Companion app" page (Amplify)
app.config.ts       app name, ids, permissions, links
eas.json            build profiles: development, preview (testers), production
```

## Current state: Phase 0 test build
**Home.** Opens three tools and shows the last link that opened the app.

**The four proofs**
1. **Links.** `go.embracehealth.ai` links open the app. This needs the well-known files, which go
   up once the Apple Team ID and Android signing fingerprint exist.
2. **Run (`/run/start`).** Tracking with the screen locked: points, distance and longest gap
   between points. It finishes or resumes a test cut off by a kill.
3. **Body scan (`/scan`).** `scan.embracehealth.ai` in a WebView with the camera.
4. **Form check (`/msk`).** A Sency Fitness assessment. It needs the `SENCY_API_KEY` EAS variable.

## Commands
```
npm install
npm run typecheck
npx eas-cli@latest build --profile development --platform all
```
