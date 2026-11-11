# EmbraceHealthAI Companion

**What it is.** The EmbraceHealthAI phone app for iPhone and Android (React Native, Expo SDK 58).
The web apps open it with `https://go.embracehealth.ai/...` links.

**Version 1 does two things:**
- **iStride's live activity dashboard.** Runs, rides and walks, tracking with the screen locked.
- **Phone alerts** for all three apps.

The body scanner and Sency form checks come in a later version.

**Docs**
- The plan: `COMPANION_APP_PLAN.md`, in the EmbraceMacro repo (`docs/`) and the EmbraceMainApp Project.
- Rules for working here: `CLAUDE.md`.

## Where things are
```
src/app/            screens; the path matches the go link (/run/start, /run/live)
src/shell/          links, permissions, location tracking, on-device storage, UI pieces
src/modules/run/    iStride's dashboard (Phase 3). For now, the Proof 2 test screen
go-site/            go.embracehealth.ai: the "Get the Companion app" page (Amplify)
app.config.ts       app name, ids, permissions, links
eas.json            build profiles: development, preview (testers), production
```

## Current state: Phase 0 test build
- **Home.** Run and Ride tests, and the last link that opened the app.
- **Proof 1: links.** `go.embracehealth.ai` links open the app. This needs the well-known files,
  which go up once the Apple Team ID and Android signing fingerprint exist.
- **Proof 2: tracking.** `/run/start` tracks with the screen locked. It shows points, distance and
  the longest gap between points. A test cut off by a kill can be resumed or finished.

## Commands
```
npm install
npm run typecheck
npx eas-cli@latest build --profile development --platform all
```
