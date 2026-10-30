# Fitma Tick — Fitma's time tracker

Fitma Tick is Fitma's own desktop time tracker. It is original software written
for Fitma — not a copy of another product. It does the same jobs your team is
used to: it counts worked time while a person chooses to track, takes a few
screenshots at random during each 10‑minute window, measures an activity level
from keyboard and mouse use, and sends it all to the Fitma Workspace.

It is **not hidden**. The window clearly shows when it is running and that
screenshots are on, and it only tracks between **Start** and **Stop**. Each
person signs in with the same email and password they use for the workspace.

## What's here

| File | What it is |
|---|---|
| `fitma_tick.py` | The whole app |
| `requirements.txt` | The three libraries it needs |
| `build_windows.bat` | Builds `Fitma Tick.exe` on a Windows PC |
| `build_mac.sh` | Builds `Fitma Tick.app` on a Mac |
| `assets/fitma.png` | Logo |

## Before you build (once)

1. Deploy the workspace first (see README‑GAS.md) and copy its web‑app link,
   the one ending in `/exec`.
2. Open `fitma_tick.py` in any text editor, find the line near the top:
   `DEFAULT_EXEC_URL = ""`
   and put your link between the quotes, e.g.
   `DEFAULT_EXEC_URL = "https://script.google.com/macros/s/AKfy..../exec"`.
   (If you skip this, the app simply asks each person for the link once.)

## Build it (one command per operating system)

Installers can't be cross‑built: build the Windows app on a Windows PC and the
Mac app on a Mac. Both just need Python 3.10+ installed (python.org).

- **Windows:** double‑click `build_windows.bat`. The app appears in `dist\Fitma Tick.exe`.
- **Mac:** open Terminal in this folder and run `./build_mac.sh`. The app appears
  in `dist/Fitma Tick.app` (zipped as `Fitma Tick (Mac).zip`).

## Give it to the team

1. Upload `Fitma Tick.exe` and/or `Fitma Tick (Mac).zip` to Google Drive and set
   each to **"Anyone with the link"**.
2. In the workspace, go to **Settings ▸ Fitma Tick download links** and paste the
   links. The **Fitma Tick** page in the workspace then offers the downloads to
   everyone.

## Using it (what the team does)

1. Download and install from the workspace's **Fitma Tick** page.
2. Open Fitma Tick, sign in with their workspace email + password.
3. Press **Start tracking** when they begin work, **Stop** when they finish.
   Their hours and screenshots reach the workspace automatically; if the internet
   drops, time is queued and sent when it returns.

### Mac permission note
macOS asks each Mac user to allow Fitma Tick under **System Settings ▸ Privacy &
Security ▸ Input Monitoring** and **Accessibility** (so it can measure activity),
and **Screen Recording** (so it can take screenshots). Approve those once and
restart the app. Time tracking still works even if activity permission is
declined. Because the app isn't signed with an Apple developer certificate, the
first open is via **right‑click ▸ Open ▸ Open**.

## Notes
- Idle: after 5 minutes with no keyboard or mouse, tracking pauses and resumes on
  the next activity, so idle time isn't counted.
- Screenshots are downscaled JPEGs kept in a **"Fitma Workspace Screenshots"**
  folder in info.fitma@gmail.com's Drive, and shown to the admin under
  **Screenshots** in the workspace.
