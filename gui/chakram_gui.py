"""
chakram_gui.py — Desktop wallet and node manager for Chakram (CHK).
Self-contained: finds binary, handles onboarding, starts node automatically.
Requires: pip3 install customtkinter requests pillow
"""

import customtkinter as ctk
import requests
import subprocess
import threading
import webbrowser
import atexit
import time
import sys
import os
import signal
import re

# ── Theme ──────────────────────────────────────────────────────────────────────
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("dark-blue")

GOLD       = "#f0c040"
GOLD_HOVER = "#c9a030"
BG         = "#0a0a0f"
BG2        = "#111118"
BG3        = "#1a1a24"
TEXT       = "#e0e0e8"
TEXT2      = "#8888a0"
BORDER     = "#2a2a3a"
GREEN      = "#40c080"
RED        = "#c04040"
ORANGE     = "#ff8c00"

RPC_BASE  = "http://localhost:8339"
RPC_PORT  = 8339
PID_FILE  = os.path.expanduser("~/.chakram/mainnet/gui.pid")
POLL_SECS = 5
VERSION   = "v1.0.24"


# ── Binary detection ───────────────────────────────────────────────────────────

def get_binary_path():
    if hasattr(sys, '_MEIPASS'):
        for name in ['chakram', 'chakram.exe']:
            p = os.path.join(sys._MEIPASS, name)
            if os.path.exists(p):
                return p

    script_dir = os.path.dirname(os.path.abspath(__file__))
    for search_dir in [os.path.dirname(script_dir), script_dir]:
        for name in ['chakram-mac', 'chakram', 'chakram.exe']:
            p = os.path.join(search_dir, name)
            if os.path.exists(p) and os.access(p, os.X_OK):
                return p

    for name in ['chakram-mac', 'chakram']:
        p = os.path.join(os.path.expanduser('~/Downloads'), name)
        if os.path.exists(p) and os.access(p, os.X_OK):
            return p

    return None


# ── Helpers ────────────────────────────────────────────────────────────────────

def wallet_exists():
    return os.path.isfile(os.path.expanduser("~/.chakram/mainnet/wallet.json"))


def node_is_running():
    return rpc_get("/info") is not None


def time_ago(ts):
    d = int(time.time()) - ts
    if d < 5:    return "just now"
    if d < 60:   return f"{d}s ago"
    if d < 3600: return f"{d//60}m ago"
    return f"{d//3600}h ago"


def trunc(s, n=16):
    return s[:n] + "…" if s and len(s) > n else (s or "")


def rpc_get(path):
    try:
        r = requests.get(RPC_BASE + path, timeout=3)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


# ── Tooltip ────────────────────────────────────────────────────────────────────

class Tooltip:
    def __init__(self, widget, text):
        self._widget   = widget
        self._text     = text
        self._tip      = None
        self._after_id = None
        widget.bind("<Enter>", self._schedule)
        widget.bind("<Leave>", self._hide)

    def _schedule(self, _):
        self._cancel()
        self._after_id = self._widget.after(400, self._show)

    def _cancel(self):
        if self._after_id:
            try:
                self._widget.after_cancel(self._after_id)
            except Exception:
                pass
            self._after_id = None

    def _show(self):
        self._after_id = None
        try:
            x = self._widget.winfo_rootx() + 12
            y = self._widget.winfo_rooty() + self._widget.winfo_height() + 4
            self._tip = ctk.CTkToplevel()
            self._tip.wm_overrideredirect(True)
            self._tip.attributes("-topmost", True)
            self._tip.wm_geometry(f"+{x}+{y}")
            ctk.CTkLabel(self._tip, text=self._text, fg_color=BG3, corner_radius=4,
                         font=("Courier New", 10), text_color=TEXT2).pack(padx=8, pady=4)
            self._tip.bind("<Enter>", self._hide)
        except Exception:
            pass

    def _hide(self, _=None):
        self._cancel()
        if self._tip:
            try:
                self._tip.destroy()
            except Exception:
                pass
            self._tip = None


# ── Main application ───────────────────────────────────────────────────────────

class ChakramApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("⬡ Chakram — Kerala's Digital Coin")
        self.geometry("960x720")
        self.resizable(False, False)
        self.configure(fg_color=BG)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._node_proc        = None
        self._we_started_node  = False
        self._mining           = False
        self._password         = "chakram"
        self._binary           = None
        self._poll_stop        = threading.Event()
        self._last_blocks_hash = None

        atexit.register(self._stop_node)
        self._address          = ""
        self._last_mined_block = None
        self._last_tx_count    = 0
        self._last_balance     = -1.0

        self._build_main_ui()

        self._overlay = ctk.CTkFrame(self, fg_color=BG)
        self._overlay.place(relx=0, rely=0, relwidth=1, relheight=1)
        self._overlay_loading("Initializing…")

        self.after(200, self._startup)

    # ═══════════════════════════════════════════════════════════════════════════
    # Overlay helpers
    # ═══════════════════════════════════════════════════════════════════════════

    def _clear_overlay(self):
        for w in self._overlay.winfo_children():
            w.destroy()

    def _overlay_loading(self, msg="Starting…"):
        self._clear_overlay()
        f = ctk.CTkFrame(self._overlay, fg_color="transparent")
        f.place(relx=0.5, rely=0.5, anchor="center")
        ctk.CTkLabel(f, text="⬡ CHAKRAM",
                     font=("Courier New", 36, "bold"), text_color=GOLD).pack(pady=(0, 6))
        ctk.CTkLabel(f, text="ചക്രം — Kerala's Digital Coin",
                     font=("Courier New", 13), text_color=TEXT2).pack(pady=(0, 32))
        ctk.CTkLabel(f, text=msg, font=("Courier New", 13), text_color=TEXT2).pack()

    # ═══════════════════════════════════════════════════════════════════════════
    # Startup
    # ═══════════════════════════════════════════════════════════════════════════

    def _startup(self):
        self._binary = get_binary_path()
        if not self._binary:
            self._show_no_binary_screen()
            return
        if wallet_exists():
            self._show_password_screen()
        else:
            self._show_welcome_screen()

    # ═══════════════════════════════════════════════════════════════════════════
    # Onboarding screens
    # ═══════════════════════════════════════════════════════════════════════════

    def _show_no_binary_screen(self):
        self._clear_overlay()
        f = ctk.CTkFrame(self._overlay, fg_color="transparent")
        f.place(relx=0.5, rely=0.5, anchor="center")
        ctk.CTkLabel(f, text="⬡ CHAKRAM",
                     font=("Courier New", 32, "bold"), text_color=GOLD).pack(pady=(0, 6))
        ctk.CTkLabel(f, text="Binary not found",
                     font=("Courier New", 16, "bold"), text_color=RED).pack(pady=(12, 8))
        ctk.CTkLabel(f,
                     text="Place chakram-mac (or chakram) in the same folder\n"
                          "as this script, or in ~/Downloads.",
                     font=("Courier New", 12), text_color=TEXT2, justify="center").pack()
        ctk.CTkLabel(f, text="Download at:",
                     font=("Courier New", 12), text_color=TEXT2).pack(pady=(16, 2))
        ctk.CTkLabel(f, text="github.com/anandhu-here/chakram/releases",
                     font=("Courier New", 12), text_color=GOLD).pack()
        ctk.CTkButton(f, text="Quit", fg_color=BG3, hover_color=BORDER,
                      text_color=TEXT2, width=100, command=self.destroy).pack(pady=24)

    # ── Welcome (first time) ───────────────────────────────────────────────────

    def _show_welcome_screen(self):
        self._clear_overlay()
        f = ctk.CTkFrame(self._overlay, fg_color="transparent")
        f.place(relx=0.5, rely=0.5, anchor="center")

        ctk.CTkLabel(f, text="⬡ CHAKRAM",
                     font=("Courier New", 36, "bold"), text_color=GOLD).pack(pady=(0, 4))
        ctk.CTkLabel(f, text="ചക്രം — Kerala's Digital Coin",
                     font=("Courier New", 13), text_color=TEXT2).pack(pady=(0, 4))
        ctk.CTkLabel(f, text="Welcome! Let's set up your wallet.",
                     font=("Courier New", 14), text_color=TEXT).pack(pady=(0, 20))

        card = ctk.CTkFrame(f, fg_color=BG2, corner_radius=10)
        card.pack(padx=20)

        ctk.CTkLabel(card, text="Choose a password:",
                     font=("Courier New", 12), text_color=TEXT2
                     ).pack(anchor="w", padx=28, pady=(20, 4))
        pwd_e = ctk.CTkEntry(card, show="*", width=320, fg_color=BG3,
                              border_color=BORDER, text_color=TEXT,
                              font=("Courier New", 13))
        pwd_e.pack(padx=28, pady=(0, 12))

        ctk.CTkLabel(card, text="Confirm password:",
                     font=("Courier New", 12), text_color=TEXT2
                     ).pack(anchor="w", padx=28, pady=(0, 4))
        conf_e = ctk.CTkEntry(card, show="*", width=320, fg_color=BG3,
                               border_color=BORDER, text_color=TEXT,
                               font=("Courier New", 13))
        conf_e.pack(padx=28, pady=(0, 12))

        err_lbl = ctk.CTkLabel(card, text="", font=("Courier New", 11), text_color=RED)
        err_lbl.pack()

        ctk.CTkButton(card, text="Create My Wallet",
                      fg_color=GOLD, hover_color=GOLD_HOVER,
                      text_color="#000", font=("Courier New", 13, "bold"),
                      width=220, height=38,
                      command=lambda: self._do_create_wallet(
                          pwd_e.get(), conf_e.get(), err_lbl)
                      ).pack(pady=(8, 20))

        ctk.CTkLabel(f, text="Your password encrypts your wallet locally.",
                     font=("Courier New", 10), text_color=TEXT2).pack(pady=(10, 0))

        ctk.CTkFrame(f, fg_color=BORDER, height=1, corner_radius=0
                     ).pack(fill="x", padx=40, pady=(14, 0))
        ctk.CTkButton(f, text="Restore existing wallet →",
                      fg_color="transparent", hover_color=BG3,
                      text_color=TEXT2, font=("Courier New", 11),
                      command=self._show_restore_screen).pack(pady=(6, 0))

    def _show_restore_screen(self):
        self._clear_overlay()
        f = ctk.CTkFrame(self._overlay, fg_color="transparent")
        f.place(relx=0.5, rely=0.5, anchor="center")

        ctk.CTkLabel(f, text="Restore Wallet",
                     font=("Courier New", 26, "bold"), text_color=GOLD).pack(pady=(0, 4))
        ctk.CTkLabel(f, text="Enter your 12-word recovery phrase",
                     font=("Courier New", 12), text_color=TEXT2).pack(pady=(0, 14))

        grid = ctk.CTkFrame(f, fg_color=BG2, corner_radius=10)
        grid.pack(padx=4, pady=(0, 12))

        word_entries = []
        for i in range(12):
            row, col = divmod(i, 4)
            cell = ctk.CTkFrame(grid, fg_color="transparent")
            cell.grid(row=row, column=col, padx=8, pady=6)
            ctk.CTkLabel(cell, text=f"{i+1:2}.", font=("Courier New", 10),
                         text_color=TEXT2, width=22).pack(side="left")
            e = ctk.CTkEntry(cell, width=96, fg_color=BG3, border_color=BORDER,
                              text_color=TEXT, font=("Courier New", 12))
            e.pack(side="left")
            word_entries.append(e)

        for i, e in enumerate(word_entries[:-1]):
            next_e = word_entries[i + 1]
            e.bind("<Return>", lambda _, n=next_e: n.focus())

        pwd_frame = ctk.CTkFrame(f, fg_color="transparent")
        pwd_frame.pack(pady=(0, 4))
        ctk.CTkLabel(pwd_frame, text="New password for this machine:",
                     font=("Courier New", 11), text_color=TEXT2).pack(side="left", padx=(0, 10))
        pwd_e = ctk.CTkEntry(pwd_frame, show="*", width=180, fg_color=BG3,
                              border_color=BORDER, text_color=TEXT,
                              font=("Courier New", 12))
        pwd_e.pack(side="left")

        err_lbl = ctk.CTkLabel(f, text="", font=("Courier New", 11), text_color=RED)
        err_lbl.pack()

        btn_row = ctk.CTkFrame(f, fg_color="transparent")
        btn_row.pack(pady=(6, 0))
        ctk.CTkButton(btn_row, text="← Back",
                      fg_color=BG3, hover_color=BORDER, text_color=TEXT2,
                      font=("Courier New", 12), width=100, height=36,
                      command=self._show_welcome_screen).pack(side="left", padx=(0, 12))
        ctk.CTkButton(btn_row, text="Restore Wallet",
                      fg_color=GOLD, hover_color=GOLD_HOVER,
                      text_color="#000", font=("Courier New", 13, "bold"),
                      width=160, height=36,
                      command=lambda: self._do_restore_wallet(
                          word_entries, pwd_e.get(), err_lbl)
                      ).pack(side="left")

        word_entries[0].focus()

    def _do_restore_wallet(self, entries, pwd, err_lbl):
        words = [e.get().strip().lower() for e in entries]
        missing = [str(i + 1) for i, w in enumerate(words) if not w]
        if missing:
            err_lbl.configure(text=f"Missing words: {', '.join(missing)}", text_color=RED)
            return
        invalid = [str(i + 1) for i, w in enumerate(words)
                   if not re.match(r'^[a-z]+$', w)]
        if invalid:
            err_lbl.configure(text=f"Invalid words (numbers?): {', '.join(invalid)}",
                               text_color=RED)
            return
        if len(pwd) < 6:
            err_lbl.configure(text="Password must be at least 6 characters", text_color=RED)
            return

        mnemonic = " ".join(words)
        err_lbl.configure(text="Restoring wallet…", text_color=TEXT2)

        def run():
            try:
                res = subprocess.run(
                    [self._binary, "wallet", "recover",
                     "--mnemonic", mnemonic, "--password", pwd],
                    capture_output=True, text=True, timeout=30
                )
                output = res.stdout + res.stderr
                if res.returncode != 0 and not wallet_exists():
                    self.after(0, lambda: err_lbl.configure(
                        text=f"Failed: {output[:100]}", text_color=RED))
                    return
                self.after(0, lambda: self._proceed(pwd))
            except Exception as e:
                self.after(0, lambda: err_lbl.configure(
                    text=f"Error: {e}", text_color=RED))

        threading.Thread(target=run, daemon=True).start()

    def _do_create_wallet(self, pwd, conf, err_lbl):
        if not pwd:
            err_lbl.configure(text="Password cannot be empty", text_color=RED)
            return
        if len(pwd) < 6:
            err_lbl.configure(text="Minimum 6 characters required", text_color=RED)
            return
        if pwd != conf:
            err_lbl.configure(text="Passwords do not match", text_color=RED)
            return

        err_lbl.configure(text="Creating wallet…", text_color=TEXT2)
        self.update()

        def run():
            try:
                res = subprocess.run(
                    [self._binary, "wallet", "new", "--password", pwd],
                    capture_output=True, text=True, timeout=30
                )
                output = res.stdout + res.stderr
                if res.returncode != 0 and not wallet_exists():
                    self.after(0, lambda: err_lbl.configure(
                        text=f"Failed: {output[:80]}", text_color=RED))
                    return
                self.after(0, lambda: self._after_wallet_created(pwd, output))
            except Exception as e:
                self.after(0, lambda: err_lbl.configure(
                    text=f"Error: {e}", text_color=RED))

        threading.Thread(target=run, daemon=True).start()

    def _after_wallet_created(self, pwd, output):
        self._password = pwd
        words = self._parse_mnemonic(output)
        if words:
            self._show_mnemonic_screen(words, pwd)
        else:
            self._proceed(pwd)

    @staticmethod
    def _parse_mnemonic(output):
        for line in output.splitlines():
            line = line.strip()
            for prefix in ["Mnemonic:", "mnemonic:", "Recovery phrase:", "Seed phrase:"]:
                if line.lower().startswith(prefix.lower()):
                    line = line[len(prefix):].strip()
                    break
            words = line.split()
            if len(words) == 12 and all(re.match(r'^[a-zA-Z]+$', w) for w in words):
                return [w.lower() for w in words]
        return None

    # ── Mnemonic screen ────────────────────────────────────────────────────────

    def _show_mnemonic_screen(self, words, pwd):
        self._clear_overlay()
        f = ctk.CTkFrame(self._overlay, fg_color="transparent")
        f.place(relx=0.5, rely=0.5, anchor="center")

        ctk.CTkLabel(f, text="⚠  Write These 12 Words Down NOW",
                     font=("Courier New", 17, "bold"), text_color=ORANGE).pack(pady=(0, 4))
        ctk.CTkLabel(f,
                     text="This is the ONLY way to recover your wallet if you forget your password.",
                     font=("Courier New", 11), text_color=TEXT2).pack(pady=(0, 14))

        grid = ctk.CTkFrame(f, fg_color=BG2, corner_radius=10)
        grid.pack(fill="x", pady=(0, 14), padx=4)

        for i, word in enumerate(words):
            row, col = divmod(i, 4)
            grid.columnconfigure(col, weight=1)
            cell = ctk.CTkFrame(grid, fg_color=BG3, corner_radius=6)
            cell.grid(row=row, column=col, padx=8, pady=7, sticky="ew")
            ctk.CTkLabel(cell, text=f"{i+1}.", font=("Courier New", 10),
                         text_color=TEXT2).pack(side="left", padx=(8, 4), pady=7)
            ctk.CTkLabel(cell, text=word, font=("Courier New", 14, "bold"),
                         text_color=GOLD).pack(side="left", padx=(0, 8), pady=7)

        checked = ctk.BooleanVar(value=False)
        cont_btn = ctk.CTkButton(
            f, text="Continue →", state="disabled",
            fg_color=BG3, hover_color=BG3, text_color=TEXT2,
            font=("Courier New", 13, "bold"), width=160, height=36,
            command=lambda: self._proceed(pwd))

        def on_toggle():
            if checked.get():
                cont_btn.configure(state="normal", fg_color=GOLD,
                                   hover_color=GOLD_HOVER, text_color="#000")
            else:
                cont_btn.configure(state="disabled", fg_color=BG3,
                                   hover_color=BG3, text_color=TEXT2)

        ctk.CTkCheckBox(f, text="I have written down all 12 words safely",
                         variable=checked, command=on_toggle,
                         font=("Courier New", 12), text_color=TEXT,
                         fg_color=GOLD, hover_color=GOLD_HOVER,
                         checkmark_color="#000").pack(pady=(0, 10))
        cont_btn.pack(pady=(0, 8))

    # ── Password screen (returning user) ──────────────────────────────────────

    def _show_password_screen(self):
        self._clear_overlay()
        f = ctk.CTkFrame(self._overlay, fg_color="transparent")
        f.place(relx=0.5, rely=0.5, anchor="center")

        ctk.CTkLabel(f, text="⬡ CHAKRAM",
                     font=("Courier New", 36, "bold"), text_color=GOLD).pack(pady=(0, 4))
        ctk.CTkLabel(f, text="Welcome back",
                     font=("Courier New", 13), text_color=TEXT2).pack(pady=(0, 24))

        card = ctk.CTkFrame(f, fg_color=BG2, corner_radius=10)
        card.pack(padx=20)

        ctk.CTkLabel(card, text="Enter your wallet password:",
                     font=("Courier New", 12), text_color=TEXT2
                     ).pack(padx=32, pady=(22, 8))
        pwd_e = ctk.CTkEntry(card, show="*", width=300, fg_color=BG3,
                              border_color=BORDER, text_color=TEXT,
                              font=("Courier New", 13))
        pwd_e.pack(padx=32, pady=(0, 8))
        pwd_e.focus()

        err_lbl = ctk.CTkLabel(card, text="", font=("Courier New", 11), text_color=RED)
        err_lbl.pack()

        def unlock():
            p = pwd_e.get()
            if not p:
                err_lbl.configure(text="Password cannot be empty")
                return
            self._proceed(p)

        ctk.CTkButton(card, text="Unlock",
                      fg_color=GOLD, hover_color=GOLD_HOVER,
                      text_color="#000", font=("Courier New", 13, "bold"),
                      width=160, height=36, command=unlock
                      ).pack(pady=(8, 22))

        pwd_e.bind("<Return>", lambda _: unlock())

    # ═══════════════════════════════════════════════════════════════════════════
    # Node management
    # ═══════════════════════════════════════════════════════════════════════════

    def _proceed(self, pwd):
        self._password = pwd
        self._overlay_loading("Connecting to Chakram node…")
        threading.Thread(target=self._connect_or_start, daemon=True).start()

    def _connect_or_start(self):
        if node_is_running():
            self._we_started_node = False
            self.after(0, self._on_node_ready)
            return

        self._kill_orphan_node()
        time.sleep(0.4)

        self._we_started_node = True
        self.after(0, lambda: self._overlay_loading("Starting Chakram node…"))
        self._launch_node(mine=False)

        deadline = time.time() + 30
        while time.time() < deadline:
            if node_is_running():
                self.after(0, self._on_node_ready)
                return
            time.sleep(1)

        self.after(0, self._show_node_timeout)

    def _launch_node(self, mine=False):
        if self._node_proc and self._node_proc.poll() is None:
            self._node_proc.terminate()
            try:
                self._node_proc.wait(timeout=6)
            except subprocess.TimeoutExpired:
                self._node_proc.kill()

        cmd = [self._binary, "node", "--password", self._password]
        if mine:
            cmd.append("--mine")

        self._node_proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setpgrp if sys.platform != "win32" else None,
        )
        self._write_pid_file()
        self._mining = mine
        if mine:
            self._last_mined_block = None

        threading.Thread(target=self._drain_stdout,
                         args=(self._node_proc,), daemon=True).start()

    def _drain_stdout(self, proc):
        try:
            for raw in proc.stdout:
                line = raw.decode('utf-8', errors='replace').strip()
                m = re.search(r'[Mm]ined block (\d+)', line)
                if m:
                    self._last_mined_block = int(m.group(1))
        except Exception:
            pass

    def _show_node_timeout(self):
        self._clear_overlay()
        f = ctk.CTkFrame(self._overlay, fg_color="transparent")
        f.place(relx=0.5, rely=0.5, anchor="center")
        ctk.CTkLabel(f, text="Node failed to start",
                     font=("Courier New", 16, "bold"), text_color=RED).pack(pady=(0, 8))
        ctk.CTkLabel(f, text="Chakram node did not respond within 30 seconds.",
                     font=("Courier New", 12), text_color=TEXT2).pack()
        ctk.CTkButton(f, text="Retry",
                      fg_color=GOLD, hover_color=GOLD_HOVER, text_color="#000",
                      width=120, height=36,
                      command=lambda: threading.Thread(
                          target=self._connect_or_start, daemon=True).start()
                      ).pack(pady=20)

    def _on_node_ready(self):
        self._overlay.place_forget()
        threading.Thread(target=self._poll_loop, daemon=True).start()

    # ═══════════════════════════════════════════════════════════════════════════
    # Main UI
    # ═══════════════════════════════════════════════════════════════════════════

    def _build_main_ui(self):
        # ── Status bar (bottom) ───────────────────────────────────────────
        sb = ctk.CTkFrame(self, fg_color=BG3, corner_radius=0, height=26)
        sb.pack(side="bottom", fill="x")
        sb.pack_propagate(False)
        self._statusbar = ctk.CTkLabel(
            sb, text=f"Chakram  |  Height: —  |  Peers: —  |  {VERSION}",
            font=("Courier New", 10), text_color=TEXT2)
        self._statusbar.pack(side="left", padx=12, pady=4)
        explorer_lbl = ctk.CTkLabel(sb, text="Block Explorer →",
                                     font=("Courier New", 10), text_color=TEXT2,
                                     cursor="hand2")
        explorer_lbl.pack(side="right", padx=12)
        explorer_lbl.bind("<Button-1>", lambda _: webbrowser.open(f"{RPC_BASE}/explorer"))
        Tooltip(explorer_lbl, "Open block explorer in browser")

        # ── Node status card (compact single row) ─────────────────────────
        top = ctk.CTkFrame(self, fg_color=BG2, corner_radius=10)
        top.pack(fill="x", padx=16, pady=(12, 4))

        top_row = ctk.CTkFrame(top, fg_color="transparent")
        top_row.pack(fill="x", padx=16, pady=(8, 0))

        ctk.CTkLabel(top_row, text="⬡ CHAKRAM",
                     font=("Courier New", 22, "bold"), text_color=GOLD).pack(side="left")
        ctk.CTkLabel(top_row, text="  ചക്രം — Kerala's Digital Coin",
                     font=("Courier New", 11), text_color=TEXT2).pack(side="left", padx=(4, 0))

        settings_btn = ctk.CTkButton(top_row, text="⚙", width=28, height=24,
                                      fg_color=BG3, hover_color=BORDER,
                                      text_color=TEXT2, font=("Courier New", 13),
                                      command=self._show_settings)
        settings_btn.pack(side="right")
        Tooltip(settings_btn, "Node settings & info")

        self._status_dot = ctk.CTkLabel(top_row, text="●",
                                         font=("Courier New", 14), text_color=RED)
        self._status_dot.pack(side="right", padx=(0, 4))
        self._status_label = ctk.CTkLabel(top_row, text="Connecting…",
                                           font=("Courier New", 10), text_color=TEXT2)
        self._status_label.pack(side="right", padx=(0, 8))

        stats_row = ctk.CTkFrame(top, fg_color="transparent")
        stats_row.pack(fill="x", padx=16, pady=(6, 8))
        self._stat_height = self._stat_box(stats_row, "Height",  "—")
        self._stat_peers  = self._stat_box(stats_row, "Peers",   "—")
        self._stat_net    = self._stat_box(stats_row, "Network", "—")
        Tooltip(self._stat_height, "Current best block height on this node")
        Tooltip(self._stat_peers,  "Connected peers right now")
        Tooltip(self._stat_net,    "Active network: testnet or mainnet")

        # Sync progress bar — packed into stats_row, hidden when synced
        self._sync_row = ctk.CTkFrame(top, fg_color="transparent")
        self._sync_label = ctk.CTkLabel(self._sync_row, text="",
                                         font=("Courier New", 10), text_color=ORANGE,
                                         width=200, anchor="w")
        self._sync_label.pack(side="left")
        self._sync_bar = ctk.CTkProgressBar(self._sync_row, height=6,
                                             fg_color=BG3, progress_color=ORANGE)
        self._sync_bar.pack(side="left", fill="x", expand=True, padx=(6, 0))
        self._sync_bar.set(0)

        # ── Balance + address card ─────────────────────────────────────────
        bal_card = ctk.CTkFrame(self, fg_color=BG2, corner_radius=10)
        bal_card.pack(fill="x", padx=16, pady=4)

        bal_inner = ctk.CTkFrame(bal_card, fg_color="transparent")
        bal_inner.pack(fill="x", padx=20, pady=(10, 10))

        bal_left = ctk.CTkFrame(bal_inner, fg_color="transparent")
        bal_left.pack(side="left", fill="x", expand=True)

        ctk.CTkLabel(bal_left, text="BALANCE",
                     font=("Courier New", 9), text_color=TEXT2).pack(anchor="w")
        self._balance_label = ctk.CTkLabel(bal_left, text="— CHK",
                                            font=("Courier New", 32, "bold"),
                                            text_color=GOLD)
        self._balance_label.pack(anchor="w")
        Tooltip(self._balance_label, "Your spendable CHK balance (confirmed UTXOs)")

        bal_right = ctk.CTkFrame(bal_inner, fg_color="transparent")
        bal_right.pack(side="right")

        addr_row = ctk.CTkFrame(bal_right, fg_color="transparent")
        addr_row.pack(anchor="e", pady=(0, 6))
        ctk.CTkLabel(addr_row, text="Address:", font=("Courier New", 10),
                     text_color=TEXT2).pack(side="left")
        self._addr_label = ctk.CTkLabel(addr_row, text="—",
                                         font=("Courier New", 10), text_color=GOLD)
        self._addr_label.pack(side="left", padx=(6, 6))
        ctk.CTkButton(addr_row, text="Copy", width=52, height=22,
                      fg_color=BG3, hover_color=BORDER, text_color=TEXT2,
                      font=("Courier New", 10),
                      command=self._copy_address).pack(side="left", padx=(0, 4))
        ctk.CTkButton(addr_row, text="Receive", width=64, height=22,
                      fg_color=BG3, hover_color=BORDER, text_color=GOLD,
                      font=("Courier New", 10),
                      command=self._show_receive).pack(side="left")
        Tooltip(addr_row, "Your wallet address — share this to receive CHK")

        mine_row = ctk.CTkFrame(bal_right, fg_color="transparent")
        mine_row.pack(anchor="e")
        self._mining_label = ctk.CTkLabel(mine_row, text="Not Mining",
                                           font=("Courier New", 10), text_color=TEXT2)
        self._mining_label.pack(side="left", padx=(0, 8))
        self._mine_btn = ctk.CTkButton(mine_row, text="Start Mining",
                                        width=118, height=26,
                                        fg_color=BG3, hover_color=BORDER,
                                        text_color=TEXT2, font=("Courier New", 11),
                                        command=self._toggle_mining)
        self._mine_btn.pack(side="left")
        Tooltip(self._mine_btn, "Mine CHK blocks to earn block rewards")

        # ── Two-column bottom section ──────────────────────────────────────
        # Left (38%): Send + Transactions   Right (62%): Recent Blocks
        bottom = ctk.CTkFrame(self, fg_color="transparent")
        bottom.pack(fill="both", expand=True, padx=16, pady=(4, 8))
        bottom.columnconfigure(0, weight=38)
        bottom.columnconfigure(1, weight=62)
        bottom.rowconfigure(0, weight=1)

        # ── Left pane ─────────────────────────────────────────────────────
        left = ctk.CTkFrame(bottom, fg_color=BG2, corner_radius=10)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 4))
        left.rowconfigure(3, weight=1)  # tx frame expands

        ctk.CTkLabel(left, text="Send CHK",
                     font=("Courier New", 12, "bold"), text_color=TEXT2
                     ).grid(row=0, column=0, sticky="w", padx=16, pady=(10, 4))

        send_fields = ctk.CTkFrame(left, fg_color="transparent")
        send_fields.grid(row=1, column=0, sticky="ew", padx=16, pady=(0, 4))

        to_row = ctk.CTkFrame(send_fields, fg_color="transparent")
        to_row.pack(fill="x", pady=(0, 4))
        ctk.CTkLabel(to_row, text="To:", font=("Courier New", 11),
                     text_color=TEXT2, width=32).pack(side="left")
        self._to_entry = ctk.CTkEntry(to_row, placeholder_text="CK1…",
                                       fg_color=BG3, border_color=BORDER,
                                       text_color=TEXT, font=("Courier New", 11))
        self._to_entry.pack(side="left", fill="x", expand=True, padx=(4, 0))

        amt_row = ctk.CTkFrame(send_fields, fg_color="transparent")
        amt_row.pack(fill="x")
        ctk.CTkLabel(amt_row, text="Amt:", font=("Courier New", 11),
                     text_color=TEXT2, width=32).pack(side="left")
        self._amt_entry = ctk.CTkEntry(amt_row, placeholder_text="0.000000",
                                        fg_color=BG3, border_color=BORDER,
                                        text_color=TEXT, font=("Courier New", 11), width=110)
        self._amt_entry.pack(side="left", padx=(4, 4))
        ctk.CTkLabel(amt_row, text="CHK", font=("Courier New", 11),
                     text_color=TEXT2).pack(side="left", padx=(0, 8))
        ctk.CTkButton(amt_row, text="Send",
                      fg_color=GOLD, hover_color=GOLD_HOVER,
                      text_color="#000", font=("Courier New", 12, "bold"),
                      command=self._do_send, width=72, height=28).pack(side="left")

        self._send_result = ctk.CTkLabel(left, text="",
                                          font=("Courier New", 10), text_color=TEXT2,
                                          wraplength=310, anchor="w")
        self._send_result.grid(row=2, column=0, sticky="ew", padx=16, pady=(2, 0))

        # Divider + tx section header
        tx_section = ctk.CTkFrame(left, fg_color="transparent")
        tx_section.grid(row=3, column=0, sticky="nsew", padx=0, pady=0)
        tx_section.rowconfigure(1, weight=1)
        tx_section.columnconfigure(0, weight=1)

        div = ctk.CTkFrame(tx_section, fg_color=BORDER, height=1, corner_radius=0)
        div.grid(row=0, column=0, sticky="ew", padx=16, pady=(6, 0))

        tx_hdr = ctk.CTkFrame(tx_section, fg_color="transparent")
        tx_hdr.grid(row=0, column=0, sticky="ew", padx=16, pady=(8, 2))
        ctk.CTkLabel(tx_hdr, text="Recent Transactions",
                     font=("Courier New", 11, "bold"), text_color=TEXT2).pack(side="left")
        ctk.CTkLabel(tx_hdr, text="received UTXOs",
                     font=("Courier New", 9), text_color=TEXT2).pack(side="right")

        self._tx_frame = ctk.CTkScrollableFrame(tx_section, fg_color="transparent",
                                                 corner_radius=0)
        self._tx_frame.grid(row=1, column=0, sticky="nsew", padx=8, pady=(0, 8))
        ctk.CTkLabel(self._tx_frame, text="No transactions yet",
                     font=("Courier New", 10), text_color=TEXT2).pack(anchor="w", padx=4)

        # ── Right pane ────────────────────────────────────────────────────
        right = ctk.CTkFrame(bottom, fg_color=BG2, corner_radius=10)
        right.grid(row=0, column=1, sticky="nsew", padx=(4, 0))

        blk_top = ctk.CTkFrame(right, fg_color="transparent")
        blk_top.pack(fill="x", padx=16, pady=(10, 2))
        ctk.CTkLabel(blk_top, text="Recent Blocks",
                     font=("Courier New", 12, "bold"), text_color=TEXT2).pack(side="left")
        ctk.CTkLabel(blk_top, text="click row to open in explorer",
                     font=("Courier New", 9), text_color=TEXT2).pack(side="right")

        hdr = ctk.CTkFrame(right, fg_color=BG3, corner_radius=4)
        hdr.pack(fill="x", padx=16, pady=(0, 2))
        for col_name, w in [("Height", 58), ("Hash", 150), ("Miner", 148), ("Age", 88), ("Txs", 40)]:
            ctk.CTkLabel(hdr, text=col_name, width=w, font=("Courier New", 10),
                         text_color=TEXT2, anchor="w").pack(side="left", padx=6, pady=3)

        self._blocks_frame = ctk.CTkScrollableFrame(right, fg_color="transparent",
                                                     corner_radius=0)
        self._blocks_frame.pack(fill="both", expand=True, padx=16, pady=(0, 6))

    def _stat_box(self, parent, key, val):
        f = ctk.CTkFrame(parent, fg_color=BG3, corner_radius=6)
        f.pack(side="left", padx=(0, 8), pady=2)
        ctk.CTkLabel(f, text=key, font=("Courier New", 9),
                     text_color=TEXT2).pack(padx=10, pady=(4, 0))
        lbl = ctk.CTkLabel(f, text=val, font=("Courier New", 13, "bold"), text_color=GOLD)
        lbl.pack(padx=10, pady=(0, 4))
        return lbl

    # ═══════════════════════════════════════════════════════════════════════════
    # Polling + UI updates
    # ═══════════════════════════════════════════════════════════════════════════

    def _poll_loop(self):
        while not self._poll_stop.is_set():
            info   = rpc_get("/info")
            blocks = rpc_get("/blocks/latest/20")
            self.after(0, self._update_ui, info, blocks)
            time.sleep(POLL_SECS)

    def _update_ui(self, info, blocks):
        if info is None:
            self._status_dot.configure(text_color=RED)
            self._status_label.configure(text="Node unreachable")
            return

        sync   = info.get("sync_status", "")
        synced = "synced" in sync.lower()
        self._status_dot.configure(text_color=GREEN if synced else ORANGE)
        self._status_label.configure(text="Synced" if synced else "Syncing…")

        height = info.get("height", 0)
        peers  = info.get("peers",  "—")
        net    = str(info.get("network", "—")).capitalize()

        self._stat_height.configure(text=str(height))
        self._stat_peers.configure(text=str(peers))
        self._stat_net.configure(text=net)

        if not synced:
            m = re.search(r'(\d+)%', sync)
            pct = int(m.group(1)) / 100.0 if m else 0.0
            self._sync_label.configure(text=sync[:38])
            self._sync_bar.set(pct)
            self._sync_row.pack(fill="x", padx=16, pady=(0, 6))
        else:
            self._sync_row.pack_forget()

        addr = info.get("wallet", "")
        self._address = addr
        self._addr_label.configure(text=trunc(addr, 26))

        if addr:
            threading.Thread(target=self._fetch_balance,      args=(addr,), daemon=True).start()
            threading.Thread(target=self._fetch_transactions, args=(addr,), daemon=True).start()

        if self._mining:
            txt = f"⛏  block {self._last_mined_block}" if self._last_mined_block else "⛏ Mining"
            self._mining_label.configure(text=txt, text_color=GREEN)
            self._mine_btn.configure(text="Stop Mining", fg_color=RED,
                                      hover_color="#a03030", text_color=TEXT)
        else:
            self._mining_label.configure(text="Not Mining", text_color=TEXT2)
            self._mine_btn.configure(text="Start Mining", fg_color=BG3,
                                      hover_color=BORDER, text_color=TEXT2)

        if blocks:
            sig = str([(b.get("height"), b.get("hash")) for b in blocks[:15]])
            if sig != self._last_blocks_hash:
                self._last_blocks_hash = sig
                self._render_blocks(blocks)
            self._check_mined_blocks(blocks)

        self._statusbar.configure(
            text=f"Chakram {net}  |  Height: {height}  |  Peers: {peers}  |  {VERSION}")

    # ── Balance ────────────────────────────────────────────────────────────────

    def _fetch_balance(self, addr):
        data = rpc_get(f"/address/{addr}")
        if data:
            chk = data.get("balance_chk", 0.0)
            self.after(0, self._apply_balance, chk)
        else:
            self.after(0, self._balance_label.configure, {"text": "0.000000 CHK"})

    def _apply_balance(self, chk):
        self._balance_label.configure(text=f"{chk:,.6f} CHK")
        if self._last_balance >= 0 and chk > self._last_balance:
            self._flash_balance_gold()
        self._last_balance = chk

    def _flash_balance_gold(self):
        self._balance_label.configure(text_color="#ffffff")
        self.after(300, lambda: self._balance_label.configure(text_color=GOLD))

    def _flash_balance_green(self):
        self._balance_label.configure(text_color=GREEN)
        self.after(800, lambda: self._balance_label.configure(text_color=GOLD))

    # ── Transaction history ────────────────────────────────────────────────────

    def _fetch_transactions(self, addr):
        utxos = rpc_get(f"/utxos/{addr}")
        self.after(0, self._render_tx_history, utxos or [])

    def _check_mined_blocks(self, blocks):
        earned = [b for b in blocks if b.get("miner", "") == self._address]
        if self._mining and len(earned) > self._last_tx_count:
            self._flash_balance_green()
        self._last_tx_count = len(earned)

    def _render_tx_history(self, utxos):
        for w in self._tx_frame.winfo_children():
            w.destroy()

        if not utxos:
            ctk.CTkLabel(self._tx_frame, text="No transactions yet",
                         font=("Courier New", 10), text_color=TEXT2
                         ).pack(anchor="w", padx=4)
            return

        sorted_utxos = sorted(utxos, key=lambda u: u.get("block_height", 0), reverse=True)
        for u in sorted_utxos:
            chk    = u.get("value_chk", 0.0)
            bh     = u.get("block_height", "?")
            coin   = u.get("is_coinbase", False)
            mature = u.get("mature", True)
            label  = "Mining reward" if coin else "Received"
            suffix = "" if mature else " (maturing…)"

            row = ctk.CTkFrame(self._tx_frame, fg_color="transparent")
            row.pack(fill="x", pady=1)
            ctk.CTkLabel(row, text=f"+{chk:.6f}",
                         font=("Courier New", 10, "bold"), text_color=GREEN,
                         width=90, anchor="w").pack(side="left", padx=(4, 0))
            ctk.CTkLabel(row, text="CHK",
                         font=("Courier New", 10), text_color=TEXT2,
                         width=32, anchor="w").pack(side="left")
            ctk.CTkLabel(row,
                         text=f"{label}{suffix} #{bh}",
                         font=("Courier New", 10),
                         text_color=TEXT2 if mature else ORANGE
                         ).pack(side="left", padx=(2, 0))

    # ── Blocks ─────────────────────────────────────────────────────────────────

    def _render_blocks(self, blocks):
        for w in self._blocks_frame.winfo_children():
            w.destroy()

        for b in blocks[:15]:
            height  = b.get("height", "—")
            hash_   = b.get("hash", "")
            miner   = b.get("miner", "—")
            ts      = b.get("timestamp", 0)
            tx_cnt  = b.get("tx_count", "—")
            is_mine = (miner == self._address)

            url = f"{RPC_BASE}/block/{height}"
            row = ctk.CTkFrame(self._blocks_frame,
                                fg_color=BG3 if is_mine else "transparent",
                                corner_radius=3, cursor="hand2")
            row.pack(fill="x", pady=1)

            for txt, w, col in [
                (str(height),        58,  GOLD),
                (trunc(hash_, 18),  150,  TEXT2),
                (trunc(miner, 20),  148,  GREEN if is_mine else TEXT2),
                (time_ago(ts),       88,  TEXT2),
                (str(tx_cnt),        40,  TEXT),
            ]:
                lbl = ctk.CTkLabel(row, text=txt, width=w, font=("Courier New", 10),
                                   text_color=col, anchor="w", cursor="hand2")
                lbl.pack(side="left", padx=6)
                lbl.bind("<Button-1>", lambda _, u=url: webbrowser.open(u))

            row.bind("<Button-1>", lambda _, u=url: webbrowser.open(u))
            ctk.CTkFrame(self._blocks_frame, fg_color=BORDER, height=1,
                         corner_radius=0).pack(fill="x")

    # ═══════════════════════════════════════════════════════════════════════════
    # Actions
    # ═══════════════════════════════════════════════════════════════════════════

    def _copy_address(self):
        if self._address:
            self.clipboard_clear()
            self.clipboard_append(self._address)
            self._addr_label.configure(text="Copied!")
            self.after(1500, lambda: self._addr_label.configure(
                text=trunc(self._address, 26)))

    def _show_receive(self):
        win = ctk.CTkToplevel(self)
        win.title("Receive CHK")
        win.geometry("500x240")
        win.configure(fg_color=BG)
        win.grab_set()
        win.focus()

        ctk.CTkLabel(win, text="Your Wallet Address",
                     font=("Courier New", 16, "bold"), text_color=GOLD
                     ).pack(pady=(22, 4))
        ctk.CTkLabel(win, text="Share this address to receive CHK",
                     font=("Courier New", 11), text_color=TEXT2).pack()

        box = ctk.CTkFrame(win, fg_color=BG3, corner_radius=8)
        box.pack(padx=28, pady=14, fill="x")
        ctk.CTkLabel(box, text=self._address or "—",
                     font=("Courier New", 13, "bold"), text_color=GOLD,
                     wraplength=440).pack(padx=16, pady=14)

        copied_lbl = ctk.CTkLabel(win, text="",
                                   font=("Courier New", 11), text_color=GREEN)
        copied_lbl.pack()

        def copy():
            self.clipboard_clear()
            self.clipboard_append(self._address)
            copied_lbl.configure(text="✓ Copied to clipboard")
            win.after(1400, win.destroy)

        ctk.CTkButton(win, text="Copy Address", width=180, height=36,
                      fg_color=GOLD, hover_color=GOLD_HOVER, text_color="#000",
                      font=("Courier New", 13, "bold"),
                      command=copy).pack(pady=(4, 0))

    def _show_settings(self):
        info = rpc_get("/info")
        win = ctk.CTkToplevel(self)
        win.title("Settings")
        win.geometry("460x310")
        win.configure(fg_color=BG)
        win.grab_set()
        win.focus()

        ctk.CTkLabel(win, text="⚙  Node Info",
                     font=("Courier New", 16, "bold"), text_color=GOLD
                     ).pack(pady=(20, 10))

        card = ctk.CTkFrame(win, fg_color=BG2, corner_radius=10)
        card.pack(fill="x", padx=24)

        data_dir = os.path.expanduser("~/.chakram/mainnet")
        net_val  = "—"
        ver_val  = "—"
        ht_val   = "—"
        if info:
            net_val = str(info.get("network", "—")).capitalize()
            ver_val = f"protocol v{info.get('version', '—')}"
            ht_val  = str(info.get("height", "—"))

        rows = [
            ("Data Directory", data_dir),
            ("Network",        net_val),
            ("Node Version",   ver_val),
            ("Chain Height",   ht_val),
            ("GUI Version",    VERSION),
        ]
        for label, value in rows:
            r = ctk.CTkFrame(card, fg_color="transparent")
            r.pack(fill="x", padx=16, pady=5)
            ctk.CTkLabel(r, text=f"{label}:", font=("Courier New", 11),
                         text_color=TEXT2, width=130, anchor="w").pack(side="left")
            ctk.CTkLabel(r, text=value, font=("Courier New", 11),
                         text_color=TEXT, anchor="w").pack(side="left")

        def open_data_dir():
            if sys.platform == "darwin":
                os.system(f"open '{data_dir}'")
            elif sys.platform.startswith("linux"):
                os.system(f"xdg-open '{data_dir}'")
            else:
                os.system(f"explorer '{data_dir}'")

        ctk.CTkButton(win, text="Open Data Folder", width=160, height=30,
                      fg_color=BG3, hover_color=BORDER, text_color=TEXT2,
                      font=("Courier New", 11),
                      command=open_data_dir).pack(pady=16)

    def _toggle_mining(self):
        self._we_started_node = True
        self._launch_node(mine=not self._mining)
        self._status_label.configure(text="Restarting node…")

    def _do_send(self):
        to_addr = self._to_entry.get().strip()
        amt_str = self._amt_entry.get().strip()

        if not to_addr.startswith("CK1"):
            self._send_result.configure(
                text="⚠ Invalid address — must start with CK1", text_color=RED)
            return
        try:
            if float(amt_str) <= 0:
                raise ValueError
        except (ValueError, TypeError):
            self._send_result.configure(text="⚠ Invalid amount", text_color=RED)
            return

        self._send_result.configure(text="Sending…", text_color=TEXT2)
        cmd = [self._binary, "send", to_addr, amt_str,
               "--password", self._password]

        def run():
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                out = res.stdout.strip() or res.stderr.strip()
                col = GREEN if res.returncode == 0 else RED
                self.after(0, self._send_result.configure, {"text": out, "text_color": col})
            except subprocess.TimeoutExpired:
                self.after(0, self._send_result.configure,
                           {"text": "⚠ Timed out", "text_color": RED})
            except Exception as e:
                self.after(0, self._send_result.configure,
                           {"text": f"⚠ {e}", "text_color": RED})

        threading.Thread(target=run, daemon=True).start()

    # ═══════════════════════════════════════════════════════════════════════════
    # Shutdown
    # ═══════════════════════════════════════════════════════════════════════════

    def _stop_node(self):
        """Kill the node we launched. Safe to call multiple times."""
        if not self._we_started_node:
            return
        proc = self._node_proc
        if proc is None or proc.poll() is not None:
            self._clear_pid_file()
            return
        if sys.platform != "win32":
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except (ProcessLookupError, OSError):
                proc.terminate()
        else:
            proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        self._node_proc = None
        self._clear_pid_file()

    def _write_pid_file(self):
        try:
            os.makedirs(os.path.dirname(PID_FILE), exist_ok=True)
            with open(PID_FILE, "w") as f:
                f.write(str(self._node_proc.pid))
        except Exception:
            pass

    def _clear_pid_file(self):
        try:
            os.remove(PID_FILE)
        except Exception:
            pass

    def _kill_orphan_node(self):
        """Kill any node left running from a previous crashed GUI session."""
        try:
            if os.path.exists(PID_FILE):
                with open(PID_FILE) as f:
                    pid = int(f.read().strip())
                try:
                    os.kill(pid, signal.SIGTERM)
                    time.sleep(0.3)
                except (ProcessLookupError, OSError):
                    pass
                self._clear_pid_file()
                return
        except Exception:
            pass

        if sys.platform == "win32":
            return
        try:
            result = subprocess.run(
                ["lsof", "-t", f"-i:{RPC_PORT}"],
                capture_output=True, text=True, timeout=3
            )
            for line in result.stdout.strip().splitlines():
                try:
                    os.kill(int(line.strip()), signal.SIGTERM)
                except (ProcessLookupError, ValueError, OSError):
                    pass
        except Exception:
            pass

    def _on_close(self):
        self._poll_stop.set()
        self._stop_node()
        self.destroy()


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = ChakramApp()
    app.mainloop()
