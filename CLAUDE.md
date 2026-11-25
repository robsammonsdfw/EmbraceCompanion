# EmbraceHealthAI Companion — working in this repo

The phone app (React Native, Expo SDK 58) that the EmbraceHealthAI web apps open for what a
website can't do. Version 1 is iStride's live activity dashboard (runs, rides, walks; tracking with
the screen locked) and phone alerts for all three apps. Advanced MSK Health (Sency's movement
checks) was added Nov 24, 2026. The body scanner comes later.

- **The plan:** `COMPANION_APP_PLAN.md`.
- **What each app adds:** `COMPANION_APP_FOR_APPS.md`.

Both live in the EmbraceMacro repo (`docs/`) and the EmbraceMainApp Project.

Read `AGENTS.md` too. It's Expo's own guidance: check the SDK 58 docs before using an Expo API, and
never hand-edit `ios/` or `android/`.

## Who owns what
| Folder | Owner |
|---|---|
| `src/app/`, `src/shell/`, `app.config.js`, `eas.json`, `go-site/` | Main app (EmbraceMacro) session |
| `src/modules/run/` | iStride session |
| `src/modules/msk/`, `plugins/withSencyPods.js` | SencyMSK session |

- **Other folders.** A module session changes only its own folder. If it needs something from the
  shell (a new service, permission, library or route), it asks Rob, and the main app session adds
  it.
- **Native changes.** New native libraries and permissions need a new build and store review, so
  they're planned.
- **One session at a time.** Only one session works in this repo at a time. Always `git pull`
  before editing.

## Advanced MSK Health (Sency)
- **What it is.** `https://go.embracehealth.ai/msk` opens `src/modules/msk/MskScreen.tsx`. The main
  app links to it from Body + Fitness › Form Checker › Advanced MSK Health.
- **The SDK.** `@sency/react-native-smkit-ui`, pinned to an exact version. Only
  `src/modules/msk/sency.ts` imports it. The build settings it needs are in `app.config.js`
  (`expo-build-properties`) and `plugins/withSencyPods.js`.
- **The key.** EAS environment variable `EXPO_PUBLIC_SENCY_AUTH_KEY`, set for every environment
  (development, preview, production). Without it the screen says "Not set up yet".
- **Older builds.** A build made before the SDK was added shows "Update the Companion app" on that
  screen. Everything else in it works as before.
- **Not verified here.** Claude's workspace can't run an iPhone or Android build, and Sency's own
  demo app runs this package on React Native's old architecture, which this app doesn't have. The
  first build on Expo's servers is the test.

## Rules
- Commit and push straight to `main`.
- `npm run typecheck` must pass before every push. It enforces zero unused declarations.
- Brand in anything members see: **EmbraceHealthAI** (never "EmbraceHealth" or "Embrace Health").
  The app is "EmbraceHealthAI Companion".
- Add packages with the versions in `node_modules/expo/bundledNativeModules.json` when they're
  listed there. `npx expo install` can't reach Expo's servers from Claude's workspace.
- Never put a sign-in token in a URL. Never store one outside `expo-secure-store`.
- Secrets are EAS environment variables, never committed.

## Look: light and dark
The app has a light and a dark theme (`src/shell/theme.ts`). The member picks Automatic, Light or
Dark in Settings.
- **Shell screens:** use `useTheme()` for colours and `themed((t) => StyleSheet.create(...))` for
  style sheets. Use the shared pieces in `src/shell/ui.tsx`: Screen, Card, GradientCard, Button,
  ListRow, Segmented, Hero, Stat.
- **Run module live screen:** read colours from `ink`, and make style sheets with
  `runStyles(() => StyleSheet.create(...))` (both in `src/modules/run/parts.tsx`). `<RunThemed>`
  keeps them current.
- **Never hard-code a colour.** Every colour comes from the theme, except white text on a vivid
  fill, which stays white in both themes.
- **Numbers and headlines** use `font.display` (Barlow Condensed ExtraBold Italic). Don't combine
  it with `fontWeight` or `fontStyle`.
