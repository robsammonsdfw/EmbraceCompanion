# EmbraceHealthAI Companion — working in this repo

The phone app (React Native, Expo SDK 58) that the EmbraceHealthAI web apps open for what a
website can't do. Version 1 is iStride's live activity dashboard (runs, rides, walks; tracking with
the screen locked) and phone alerts for all three apps. The body scanner and Sency come later.

- **The plan:** `COMPANION_APP_PLAN.md`.
- **What each app adds:** `COMPANION_APP_FOR_APPS.md`.

Both live in the EmbraceMacro repo (`docs/`) and the EmbraceMainApp Project.

Read `AGENTS.md` too. It's Expo's own guidance: check the SDK 58 docs before using an Expo API, and
never hand-edit `ios/` or `android/`.

## Who owns what
| Folder | Owner |
|---|---|
| `src/app/`, `src/shell/`, `app.config.ts`, `eas.json`, `go-site/` | Main app (EmbraceMacro) session |
| `src/modules/run/` | iStride session |

- **Other folders.** A module session changes only its own folder. If it needs something from the
  shell (a new service, permission, library or route), it asks Rob, and the main app session adds
  it.
- **Native changes.** New native libraries and permissions need a new build and store review, so
  they're planned.
- **One session at a time.** Only one session works in this repo at a time. Always `git pull`
  before editing.

## Rules
- Commit and push straight to `main`.
- `npm run typecheck` must pass before every push. It enforces zero unused declarations.
- Brand in anything members see: **EmbraceHealthAI** (never "EmbraceHealth" or "Embrace Health").
  The app is "EmbraceHealthAI Companion".
- Add packages with the versions in `node_modules/expo/bundledNativeModules.json` when they're
  listed there. `npx expo install` can't reach Expo's servers from Claude's workspace.
- Never put a sign-in token in a URL. Never store one outside `expo-secure-store`.
- Secrets are EAS environment variables, never committed.
