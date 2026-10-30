# Fitma Tick

Desktop time + activity tracker for the Fitma team (Windows & macOS). It counts
active work time, measures activity, and takes periodic screenshots, then sends
everything to the **Fitma Workspace** — the same Google Apps Script backend the
portal already uses. It replaces WebWork Tracker.

## How it connects
The app talks to the Workspace web app (`/exec`) using actions already built into
the backend:

| Action | What it does |
|---|---|
| `login` | Employee signs in with their Fitma email + password → gets a device token |
| `projects` | Returns that employee's assigned projects (for the picker) |
| `ingest` | Uploads active work time segments → the Workspace `TimeEntries` sheet |
| `screenshot` | Uploads a screenshot (base64 JPEG) + activity % → the Workspace Drive |

Time is sent as UTC timestamps; the Workspace engine converts to Asia/Colombo time.

## Behaviour
- **Sign in** with the same credentials as the Workspace (employees only, not admin).
- **Pick a project**, press **Start**. A timer runs in the system tray / menu bar.
- **Auto-pause** after 5 minutes with no keyboard/mouse (idle time isn't counted).
- **Screenshots** every ~10 minutes (whole screen, all monitors) while tracking.
- **Activity %** measured from input over each screenshot interval.
- Keeps running in the tray when the window is closed; **Quit** from the tray stops it.

## Build (installers)
Cross-platform installers are built by **GitHub Actions** on real Windows + macOS
runners — see `.github/workflows/build.yml`. Go to the repo's **Actions** tab →
**Build Fitma Tick** → **Run workflow**; download the installers from the run's
artifacts when it finishes.

Builds are **unsigned** for now, so the OS shows a one-time security prompt on
first launch (Windows: *More info → Run anyway*; macOS: right-click → *Open*).
Code signing (Apple Developer + a Windows certificate) can be added later as CI
secrets with no code changes.

### Local build (optional)
Needs Node 20+. On a Windows machine run `npm install && npm run dist:win`; on a
Mac run `npm install && npm run dist:mac`. Output lands in `dist/`.

## Run in development
```
npm install
npm start
```

## Config
The backend URL is set in `src/main.js` (`DEFAULT_BASE_URL`). No per-user config
is needed — employees just sign in.
