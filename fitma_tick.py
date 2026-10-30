#!/usr/bin/env python3
"""
Fitma Tick — Fitma's own time tracker (original software, for Fitma's team).

What it does, like the tracker the team is used to:
  * counts worked time while you choose to track,
  * takes a few screenshots at random during each 10-minute window,
  * measures an activity level from keyboard and mouse use,
  * sends everything to the Fitma Workspace (Google Apps Script web app).

It is NOT hidden: the window shows when it is running and that screenshots are on,
and it only tracks between Start and Stop. Install and sign in with the same
email and password used for the Fitma Workspace.

Core logic (Tracker) is kept free of GUI/OS libraries so it can be unit-tested.
"""

import sys, os, json, time, random, threading, base64, datetime, io, urllib.request, urllib.error

# Set this to your deployed Workspace web-app URL (…/exec) before building, so the
# team only needs to enter email + password. If left blank, the sign-in window
# asks for the workspace link once.
DEFAULT_EXEC_URL = ""

APP_NAME = "Fitma Tick"
IDLE_SECONDS = 300            # pause after 5 minutes with no keyboard/mouse
WINDOW_SECONDS = 600          # 10-minute screenshot window
SHOTS_PER_WINDOW = 3          # ~3 screenshots per 10 minutes (WebWork-like)
FLUSH_SECONDS = 120           # send tracked time every 2 minutes
ACTIVITY_NORM_PER_MIN = 220.0 # keyboard+mouse events/minute that counts as 100%
NAVY = "#283544"; STEEL = "#3f5d73"; INK = "#1e2834"; MIST = "#eef2f5"; LINE = "#d8dde0"; MUTED = "#65778a"

def config_dir():
    base = os.environ.get("APPDATA") or os.path.join(os.path.expanduser("~"), ".config")
    d = os.path.join(base, "FitmaTick")
    os.makedirs(d, exist_ok=True)
    return d

def load_config():
    try:
        with open(os.path.join(config_dir(), "config.json")) as f:
            return json.load(f)
    except Exception:
        return {}

def save_config(cfg):
    try:
        with open(os.path.join(config_dir(), "config.json"), "w") as f:
            json.dump(cfg, f)
    except Exception:
        pass

def iso(epoch):
    return datetime.datetime.fromtimestamp(epoch).astimezone().isoformat()

# -------------------- server client --------------------
class Api:
    def __init__(self, exec_url):
        self.url = exec_url.strip()

    def _post(self, payload, timeout=30):
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8")
        out = json.loads(body)
        if out.get("status", 200) >= 300:
            raise RuntimeError((out.get("body") or {}).get("error") or ("Request failed (%s)" % out.get("status")))
        return out.get("body", {})

    def login(self, email, password):
        return self._post({"action": "login", "email": email, "password": password})

    def ingest(self, device_token, entries):
        return self._post({"action": "ingest", "deviceToken": device_token, "entries": entries})

    def screenshot(self, device_token, ts, activity, jpeg_b64):
        return self._post({"action": "screenshot", "deviceToken": device_token, "ts": ts,
                           "activity": activity, "image": jpeg_b64})

# -------------------- pure tracking logic (testable) --------------------
class Tracker:
    """Fed one tick per second with the number of input events since the last tick.
    Produces time-entry chunks and decides when to take a screenshot. No I/O here."""
    def __init__(self, note_getter=lambda: "", now=None):
        self.note_getter = note_getter
        self.tracking = False
        self.idle = False
        self.session_start = None       # epoch of the open chunk
        self.last_active = None
        self.queue = []                 # finalized entries awaiting upload
        self.events_window = []         # (epoch, count) for the last 60s
        self._win_start = None
        self._shot_times = []           # pending capture epochs in this window
        self._last_flush = None

    # ---- controls ----
    def start(self, now):
        self.tracking = True; self.idle = False
        self.session_start = now; self.last_active = now
        self._last_flush = now
        self._new_window(now)

    def stop(self, now):
        self._close_open(now)
        self.tracking = False; self.idle = False; self.session_start = None

    # ---- per-second tick ----
    def tick(self, now, events):
        actions = {"capture": False}
        if not self.tracking:
            return actions
        # activity ring buffer (last 60s)
        self.events_window.append((now, events))
        self.events_window = [(t, c) for (t, c) in self.events_window if now - t < 60]
        if events > 0:
            if self.idle:                      # coming back from idle: open a fresh chunk
                self.idle = False; self.session_start = now
            self.last_active = now
        else:
            if (not self.idle) and self.last_active is not None and (now - self.last_active) >= IDLE_SECONDS:
                self._close_open(self.last_active)   # bank time up to last activity
                self.idle = True; self.session_start = None
        # screenshot windows
        if self._win_start is None or now - self._win_start >= WINDOW_SECONDS:
            self._new_window(now)
        if not self.idle:
            due = [t for t in self._shot_times if t <= now]
            if due:
                self._shot_times = [t for t in self._shot_times if t > now]
                actions["capture"] = True
        # periodic flush of banked time
        if self._last_flush is not None and now - self._last_flush >= FLUSH_SECONDS:
            self._last_flush = now
            actions["flush"] = True
        return actions

    # ---- activity 0..100 over the last 60s ----
    def activity(self):
        total = sum(c for (_, c) in self.events_window)
        span = max(1.0, (self.events_window[-1][0] - self.events_window[0][0]) if len(self.events_window) > 1 else 1.0)
        per_min = total / span * 60.0
        return int(max(0, min(100, round(per_min / ACTIVITY_NORM_PER_MIN * 100))))

    # ---- entries to upload ----
    def collect(self, now):
        self._close_open(now)
        if self.tracking and not self.idle:
            self.session_start = now     # keep tracking from here
        return list(self.queue)

    def mark_sent(self, entries):
        n = len(entries)
        self.queue = self.queue[n:]

    def today_seconds(self, now):
        start_of_day = now - (now % 1)   # placeholder; GUI computes display separately
        return None

    # ---- internals ----
    def _close_open(self, end):
        if self.session_start is not None and end > self.session_start + 1:
            self.queue.append({"start": iso(self.session_start), "end": iso(end),
                               "type": "Fitma Tick", "note": (self.note_getter() or "")[:200]})
        self.session_start = None

    def _new_window(self, now):
        self._win_start = now
        offsets = sorted(random.sample(range(0, WINDOW_SECONDS), SHOTS_PER_WINDOW))
        self._shot_times = [now + o for o in offsets]

# -------------------- OS input monitor (pynput) --------------------
class ActivityMonitor:
    def __init__(self):
        self._count = 0
        self._lock = threading.Lock()
        self._km = None; self._mm = None

    def start(self):
        try:
            from pynput import keyboard, mouse
        except Exception:
            return False
        def bump(*a):
            with self._lock: self._count += 1
        self._km = keyboard.Listener(on_press=bump)
        self._mm = mouse.Listener(on_click=lambda *a: bump(), on_scroll=lambda *a: bump(), on_move=self._moved)
        self._km.start(); self._mm.start()
        return True

    _last_move = 0
    def _moved(self, *a):
        now = time.time()
        if now - self._last_move > 0.5:    # count moves at most twice a second
            self._last_move = now
            with self._lock: self._count += 1

    def take(self):
        with self._lock:
            c = self._count; self._count = 0
        return c

    def stop(self):
        for l in (self._km, self._mm):
            try: l.stop()
            except Exception: pass

# -------------------- screen capture (mss + Pillow) --------------------
def grab_jpeg(max_w=1280, quality=50):
    import mss
    from PIL import Image
    with mss.mss() as sct:
        mon = sct.monitors[1]
        raw = sct.grab(mon)
        img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
    if img.width > max_w:
        img = img.resize((max_w, int(img.height * max_w / img.width)), Image.LANCZOS)
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("ascii")

# -------------------- GUI --------------------
def run_gui():
    import tkinter as tk
    from tkinter import ttk, messagebox

    cfg = load_config()
    api = Api(cfg.get("exec_url") or DEFAULT_EXEC_URL)
    device = cfg.get("device")   # {deviceToken, email, name}

    root = tk.Tk()
    root.title(APP_NAME)
    root.configure(bg=MIST)
    try: root.geometry("380x520")
    except Exception: pass

    state = {"tracker": None, "monitor": None, "note": tk.StringVar(), "running": False,
             "today_base": 0.0, "session_start": None, "queue_file": os.path.join(config_dir(), "queue.json")}

    # ---- styles ----
    def L(parent, text, **kw):
        return tk.Label(parent, text=text, bg=kw.pop("bg", MIST), fg=kw.pop("fg", INK), **kw)

    header = tk.Frame(root, bg=NAVY, height=64); header.pack(fill="x")
    tk.Label(header, text="▰  Fitma Tick", bg=NAVY, fg="white", font=("Helvetica", 16, "bold")).pack(side="left", padx=16, pady=16)

    body = tk.Frame(root, bg=MIST); body.pack(fill="both", expand=True, padx=20, pady=16)

    # ---- queue persistence ----
    def load_queue():
        try:
            with open(state["queue_file"]) as f: return json.load(f)
        except Exception: return []
    def save_queue(q):
        try:
            with open(state["queue_file"], "w") as f: json.dump(q, f)
        except Exception: pass

    # ---------- sign in ----------
    def show_login():
        for w in body.winfo_children(): w.destroy()
        state["running"] = False
        L(body, "Sign in", font=("Helvetica", 18, "bold")).pack(anchor="w")
        L(body, "Use your Fitma Workspace email and password.", fg=MUTED).pack(anchor="w", pady=(0, 12))
        need_url = not (cfg.get("exec_url") or DEFAULT_EXEC_URL)
        url_var = tk.StringVar(value=cfg.get("exec_url", ""))
        if need_url:
            L(body, "Workspace link (…/exec)", fg=MUTED).pack(anchor="w")
            tk.Entry(body, textvariable=url_var, width=40).pack(fill="x", pady=(0, 8))
        L(body, "Email", fg=MUTED).pack(anchor="w")
        em = tk.Entry(body, width=40); em.pack(fill="x", pady=(0, 8)); em.insert(0, cfg.get("last_email", ""))
        L(body, "Password", fg=MUTED).pack(anchor="w")
        pw = tk.Entry(body, show="•", width=40); pw.pack(fill="x", pady=(0, 10))
        msg = L(body, "", fg="#bf4439"); msg.pack(anchor="w")
        def do_login():
            u = (url_var.get() or cfg.get("exec_url") or DEFAULT_EXEC_URL).strip()
            if not u: msg.config(text="Enter the workspace link."); return
            api.url = u
            btn.config(state="disabled", text="Signing in…"); root.update_idletasks()
            try:
                r = api.login(em.get().strip(), pw.get())
            except Exception as e:
                btn.config(state="normal", text="Sign in"); msg.config(text=str(e)); return
            cfg["exec_url"] = u; cfg["device"] = {"deviceToken": r["deviceToken"], "email": em.get().strip(), "name": r.get("name", "")}
            cfg["last_email"] = em.get().strip(); save_config(cfg)
            nonlocal_device()
        btn = tk.Button(body, text="Sign in", command=do_login, bg=NAVY, fg="white", relief="flat", padx=12, pady=8)
        btn.pack(fill="x", pady=8)
        L(body, "Screenshots are captured while you track. Your admin can see them.", fg=MUTED, wraplength=320, justify="left").pack(anchor="w", pady=(8, 0))

    def nonlocal_device():
        nonlocal device
        device = cfg.get("device")
        show_main()

    # ---------- main ----------
    def show_main():
        for w in body.winfo_children(): w.destroy()
        d = cfg.get("device", {})
        L(body, "Signed in as", fg=MUTED).pack(anchor="w")
        L(body, d.get("name") or d.get("email", ""), font=("Helvetica", 14, "bold")).pack(anchor="w", pady=(0, 10))

        timer = L(body, "0h 00m", font=("Helvetica", 34, "bold")); timer.pack(anchor="w")
        status = L(body, "Stopped", fg=MUTED); status.pack(anchor="w", pady=(0, 6))
        act = L(body, "Activity 0%", fg=MUTED); act.pack(anchor="w", pady=(0, 12))

        L(body, "What are you working on? (optional)", fg=MUTED).pack(anchor="w")
        tk.Entry(body, textvariable=state["note"], width=40).pack(fill="x", pady=(0, 12))

        start_btn = tk.Button(body, text="Start tracking", bg=STEEL, fg="white", relief="flat", padx=12, pady=10,
                              font=("Helvetica", 12, "bold"))
        start_btn.pack(fill="x")
        shots_note = L(body, "When tracking, Fitma Tick takes a few screenshots each 10 minutes.", fg=MUTED, wraplength=320, justify="left")
        shots_note.pack(anchor="w", pady=(10, 0))

        foot = tk.Frame(body, bg=MIST); foot.pack(side="bottom", fill="x", pady=(16, 0))
        tk.Button(foot, text="Sign out", command=sign_out, relief="flat", bg=MIST, fg=MUTED).pack(side="left")

        def tick_ui():
            if not state["running"]: return
            trk = state["tracker"]; now = time.time()
            events = state["monitor"].take() if state["monitor"] else 0
            actions = trk.tick(now, events)
            if actions.get("capture"): threading.Thread(target=capture_and_send, args=(trk.activity(),), daemon=True).start()
            if actions.get("flush"): threading.Thread(target=flush, args=(now,), daemon=True).start()
            # display
            elapsed = state["today_base"] + ((now - state["session_start"]) if (state["session_start"] and not trk.idle) else 0)
            timer.config(text="%dh %02dm" % (elapsed // 3600, (elapsed % 3600) // 60))
            status.config(text=("Paused (idle)" if trk.idle else "Tracking — screenshots on"), fg=("#b97c12" if trk.idle else "#2e8a68"))
            act.config(text="Activity %d%%" % trk.activity())
            root.after(1000, tick_ui)

        def toggle():
            if state["running"]:
                stop_tracking(); start_btn.config(text="Start tracking", bg=STEEL)
            else:
                start_tracking(); start_btn.config(text="Stop tracking", bg="#bf4439")
        start_btn.config(command=toggle)

        def start_tracking():
            trk = Tracker(note_getter=lambda: state["note"].get()); now = time.time()
            trk.queue = load_queue()
            trk.start(now)
            state["tracker"] = trk; state["running"] = True
            state["session_start"] = now
            mon = ActivityMonitor()
            if not mon.start():
                messagebox.showwarning(APP_NAME, "Couldn't read keyboard/mouse activity. Time is still tracked. On Mac, allow Input Monitoring and Accessibility for Fitma Tick in System Settings, then restart.")
            state["monitor"] = mon
            tick_ui()

        def stop_tracking():
            now = time.time(); trk = state["tracker"]
            state["running"] = False
            if state["monitor"]: state["monitor"].stop()
            if trk:
                state["today_base"] += (now - state["session_start"]) if (state["session_start"] and not trk.idle) else 0
                trk.stop(now); flush(now)
            state["session_start"] = None

        def capture_and_send(activity):
            try:
                img = grab_jpeg()
            except Exception:
                return
            try:
                api.screenshot(cfg["device"]["deviceToken"], iso(time.time()), activity, img)
            except Exception:
                pass  # a dropped screenshot is not worth stalling the app

        def flush(now):
            trk = state["tracker"]
            if not trk: return
            entries = trk.collect(now)
            if not entries:
                save_queue(trk.queue); return
            try:
                api.ingest(cfg["device"]["deviceToken"], entries)
                trk.mark_sent(entries)
            except Exception:
                pass  # keep in queue; retried on next flush / restart
            save_queue(trk.queue)

        def _toggle_hidden(): pass
        state["_flush"] = flush

    def sign_out():
        if state["running"]:
            try: state["_flush"](time.time())
            except Exception: pass
        cfg.pop("device", None); save_config(cfg)
        show_login()

    def on_close():
        try:
            if state["running"] and state.get("_flush"):
                state["running"] = False
                if state["monitor"]: state["monitor"].stop()
                trk = state["tracker"]
                if trk: trk.stop(time.time())
                state["_flush"](time.time())
        finally:
            root.destroy()
    root.protocol("WM_DELETE_WINDOW", on_close)

    if cfg.get("device"): show_main()
    else: show_login()
    root.mainloop()

if __name__ == "__main__":
    run_gui()
