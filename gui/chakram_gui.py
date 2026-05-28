"""
chakram_gui.py — Desktop wallet and node manager for Chakram (CHK).
Self-contained: finds binary, handles onboarding, starts node automatically.
Requires: pip3 install customtkinter requests pillow
"""

import customtkinter as ctk
import requests
import subprocess
import threading
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

RPC_BASE  = "http://localhost:18339"
POLL_SECS = 5
VERSION   = "v0.1.7"


# ── Binary detection ───────────────────────────────────────────────────────────

def get_binary_path():
    if hasattr(sys, '_MEIPASS'):
        for name in ['chakram', 'chakram.exe']:
            p = os.path.join(sys._MEIPASS, name)
            if os.path.exists(p):
                return p

    script_dir = os.path.dirname(os.path.abspath(__file__))
    for search_dir in [script_dir, os.path.dirname(script_dir)]:
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
    return os.path.isfile(os.path.expanduser("~/.chakram/testnet/wallet.json"))


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


# ── Main application ───────────────────────────────────────────────────────────

class ChakramApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("⬡ Chakram — Kerala's Digital Coin")
        self.geometry("900x650")
        self.resizable(False, False)
        self.configure(fg_color=BG)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._node_proc        = None
        self._we_started_node  = False
        self._mining           = False
        self._password         = "chakram"
        self._binary           = None
        self._poll_stop        = threading.Event()
        self._address          = ""
        self._last_mined_block = None
        self._last_tx_count    = 0

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
                    [self._binary, "wallet", "new", "--testnet", "--password", pwd],
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

        cmd = [self._binary, "node", "--testnet", "--password", self._password]
        if mine:
            cmd.append("--mine")

        self._node_proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setpgrp if sys.platform != "win32" else None,
        )
        self._mining = mine
        if mine:
            self._last_mined_block = None

        threading.Thread(target=self._drain_stdout,
                         args=(self._node_proc,), daemon=True).start()

    def _drain_stdout(self, proc):
        try:
            for raw in proc.stdout:
                line = raw.decode('utf-8', errors='replace').strip()
                low = line.lower()
                if 'mined' in low or ('block' in low and '#' in line):
                    m = re.search(r'#(\d+)', line)
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
        # Status bar — pack first to anchor at bottom
        sb = ctk.CTkFrame(self, fg_color=BG3, corner_radius=0, height=26)
        sb.pack(side="bottom", fill="x")
        sb.pack_propagate(False)
        self._statusbar = ctk.CTkLabel(
            sb, text=f"Chakram Testnet  |  Height: —  |  Peers: —  |  {VERSION}",
            font=("Courier New", 10), text_color=TEXT2)
        self._statusbar.pack(side="left", padx=12, pady=4)

        # Section 1: Node status
        top = ctk.CTkFrame(self, fg_color=BG2, corner_radius=10)
        top.pack(fill="x", padx=16, pady=(14, 6))

        title_row = ctk.CTkFrame(top, fg_color="transparent")
        title_row.pack(fill="x", padx=16, pady=(12, 2))
        ctk.CTkLabel(title_row, text="⬡ CHAKRAM",
                     font=("Courier New", 28, "bold"), text_color=GOLD).pack(side="left")
        self._status_dot = ctk.CTkLabel(title_row, text="●",
                                         font=("Courier New", 18), text_color=RED)
        self._status_dot.pack(side="right", padx=(0, 4))
        self._status_label = ctk.CTkLabel(title_row, text="Connecting…",
                                           font=("Courier New", 12), text_color=TEXT2)
        self._status_label.pack(side="right", padx=(0, 8))

        ctk.CTkLabel(top, text="ചക്രം — Kerala's Digital Coin",
                     font=("Courier New", 12), text_color=TEXT2).pack(anchor="w", padx=16)

        stats_row = ctk.CTkFrame(top, fg_color="transparent")
        stats_row.pack(fill="x", padx=16, pady=(6, 4))
        self._stat_height = self._stat_box(stats_row, "Height",  "—")
        self._stat_peers  = self._stat_box(stats_row, "Peers",   "—")
        self._stat_net    = self._stat_box(stats_row, "Network", "—")

        addr_row = ctk.CTkFrame(top, fg_color="transparent")
        addr_row.pack(fill="x", padx=16, pady=(2, 4))
        ctk.CTkLabel(addr_row, text="Address:", font=("Courier New", 12),
                     text_color=TEXT2).pack(side="left")
        self._addr_label = ctk.CTkLabel(addr_row, text="—",
                                         font=("Courier New", 12), text_color=GOLD)
        self._addr_label.pack(side="left", padx=8)
        ctk.CTkButton(addr_row, text="Copy", width=60, height=26,
                      fg_color=BG3, hover_color=BORDER, text_color=TEXT2,
                      font=("Courier New", 11), command=self._copy_address).pack(side="left")

        bal_row = ctk.CTkFrame(top, fg_color="transparent")
        bal_row.pack(fill="x", padx=16, pady=(4, 10))
        self._balance_label = ctk.CTkLabel(bal_row, text="— CHK",
                                            font=("Courier New", 22, "bold"), text_color=GOLD)
        self._balance_label.pack(side="left")
        self._mining_label = ctk.CTkLabel(bal_row, text="Not Mining",
                                           font=("Courier New", 12), text_color=TEXT2)
        self._mining_label.pack(side="left", padx=20)
        self._mine_btn = ctk.CTkButton(bal_row, text="Start Mining",
                                        width=130, height=30,
                                        fg_color=BG3, hover_color=BORDER,
                                        text_color=TEXT2, font=("Courier New", 12),
                                        command=self._toggle_mining)
        self._mine_btn.pack(side="right")

        # Section 2: Send + transaction history
        mid = ctk.CTkFrame(self, fg_color=BG2, corner_radius=10)
        mid.pack(fill="x", padx=16, pady=6)

        ctk.CTkLabel(mid, text="Send CHK", font=("Courier New", 14, "bold"),
                     text_color=TEXT2).pack(anchor="w", padx=16, pady=(10, 6))

        send_row = ctk.CTkFrame(mid, fg_color="transparent")
        send_row.pack(fill="x", padx=16, pady=(0, 4))
        ctk.CTkLabel(send_row, text="To:", font=("Courier New", 12),
                     text_color=TEXT2, width=50).pack(side="left")
        self._to_entry = ctk.CTkEntry(send_row, placeholder_text="CK1…",
                                       fg_color=BG3, border_color=BORDER,
                                       text_color=TEXT, font=("Courier New", 12), width=350)
        self._to_entry.pack(side="left", padx=(4, 12))
        ctk.CTkLabel(send_row, text="Amount:", font=("Courier New", 12),
                     text_color=TEXT2).pack(side="left")
        self._amt_entry = ctk.CTkEntry(send_row, placeholder_text="0.000000",
                                        fg_color=BG3, border_color=BORDER,
                                        text_color=TEXT, font=("Courier New", 12), width=110)
        self._amt_entry.pack(side="left", padx=4)
        ctk.CTkLabel(send_row, text="CHK", font=("Courier New", 12),
                     text_color=TEXT2).pack(side="left", padx=4)

        send_btm = ctk.CTkFrame(mid, fg_color="transparent")
        send_btm.pack(fill="x", padx=16, pady=(2, 4))
        ctk.CTkButton(send_btm, text="Send", fg_color=GOLD, hover_color=GOLD_HOVER,
                      text_color="#000", font=("Courier New", 13, "bold"),
                      command=self._do_send, width=90, height=30).pack(side="left")
        self._send_result = ctk.CTkLabel(send_btm, text="",
                                          font=("Courier New", 11), text_color=TEXT2,
                                          wraplength=700)
        self._send_result.pack(side="left", padx=12)

        ctk.CTkFrame(mid, fg_color=BORDER, height=1, corner_radius=0
                     ).pack(fill="x", padx=16, pady=(4, 0))
        ctk.CTkLabel(mid, text="Recent Transactions",
                     font=("Courier New", 12, "bold"), text_color=TEXT2
                     ).pack(anchor="w", padx=16, pady=(6, 2))
        self._tx_frame = ctk.CTkFrame(mid, fg_color="transparent")
        self._tx_frame.pack(fill="x", padx=16, pady=(0, 8))
        ctk.CTkLabel(self._tx_frame, text="No transactions yet",
                     font=("Courier New", 11), text_color=TEXT2).pack(anchor="w")

        # Section 3: Recent blocks
        bot = ctk.CTkFrame(self, fg_color=BG2, corner_radius=10)
        bot.pack(fill="both", expand=True, padx=16, pady=(6, 8))

        ctk.CTkLabel(bot, text="Recent Blocks", font=("Courier New", 13, "bold"),
                     text_color=TEXT2).pack(anchor="w", padx=16, pady=(8, 4))

        hdr = ctk.CTkFrame(bot, fg_color=BG3, corner_radius=4)
        hdr.pack(fill="x", padx=16, pady=(0, 2))
        for col_name, w in [("Height", 80), ("Hash", 200), ("Age", 120), ("Txs", 50)]:
            ctk.CTkLabel(hdr, text=col_name, width=w, font=("Courier New", 11),
                         text_color=TEXT2, anchor="w").pack(side="left", padx=6, pady=3)

        self._blocks_frame = ctk.CTkScrollableFrame(bot, fg_color="transparent",
                                                     corner_radius=0)
        self._blocks_frame.pack(fill="both", expand=True, padx=16, pady=(0, 6))

    def _stat_box(self, parent, key, val):
        f = ctk.CTkFrame(parent, fg_color=BG3, corner_radius=6)
        f.pack(side="left", padx=(0, 8), pady=2)
        ctk.CTkLabel(f, text=key, font=("Courier New", 10),
                     text_color=TEXT2).pack(padx=10, pady=(4, 0))
        lbl = ctk.CTkLabel(f, text=val, font=("Courier New", 14, "bold"), text_color=GOLD)
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

        height = info.get("height", "—")
        peers  = info.get("peers",  "—")
        net    = str(info.get("network", "—")).capitalize()

        self._stat_height.configure(text=str(height))
        self._stat_peers.configure(text=str(peers))
        self._stat_net.configure(text=net)

        addr = info.get("wallet", "")
        self._address = addr
        self._addr_label.configure(text=trunc(addr, 28))

        if addr:
            threading.Thread(target=self._fetch_balance, args=(addr,), daemon=True).start()

        if self._mining:
            mining_txt = "⛏ Mining"
            if self._last_mined_block is not None:
                mining_txt = f"⛏ Mining — block {self._last_mined_block}"
            self._mining_label.configure(text=mining_txt, text_color=GREEN)
            self._mine_btn.configure(text="Stop Mining", fg_color=RED,
                                      hover_color="#a03030", text_color=TEXT)
        else:
            self._mining_label.configure(text="Not Mining", text_color=TEXT2)
            self._mine_btn.configure(text="Start Mining", fg_color=BG3,
                                      hover_color=BORDER, text_color=TEXT2)

        if blocks:
            self._render_blocks(blocks)
            self._render_tx_history(blocks)

        self._statusbar.configure(
            text=f"Chakram Testnet  |  Height: {height}  |  Peers: {peers}  |  {VERSION}")

    def _fetch_balance(self, addr):
        data = rpc_get(f"/address/{addr}")
        if data:
            chk = data.get("balance_chk", 0.0)
            self.after(0, self._balance_label.configure, {"text": f"{chk:,.6f} CHK"})
        else:
            self.after(0, self._balance_label.configure, {"text": "0.000000 CHK"})

    def _flash_balance(self):
        self._balance_label.configure(text_color=GREEN)
        self.after(800, lambda: self._balance_label.configure(text_color=GOLD))

    def _render_blocks(self, blocks):
        for w in self._blocks_frame.winfo_children():
            w.destroy()
        for b in blocks[:10]:
            row = ctk.CTkFrame(self._blocks_frame, fg_color="transparent", corner_radius=0)
            row.pack(fill="x", pady=1)
            for txt, w, col in [
                (str(b.get("height", "—")),       80,  GOLD),
                (trunc(b.get("hash", ""), 20),    200, TEXT2),
                (time_ago(b.get("timestamp", 0)), 120, TEXT2),
                (str(b.get("tx_count", "—")),      50, TEXT),
            ]:
                ctk.CTkLabel(row, text=txt, width=w, font=("Courier New", 11),
                             text_color=col, anchor="w").pack(side="left", padx=6)
            ctk.CTkFrame(self._blocks_frame, fg_color=BORDER, height=1,
                         corner_radius=0).pack(fill="x")

    def _render_tx_history(self, blocks):
        if not self._address:
            return
        earned = [
            (b.get("height", "?"), b.get("reward_chk", 50.0), b.get("timestamp", 0))
            for b in blocks
            if b.get("miner", "") == self._address
        ]
        if self._mining and len(earned) > self._last_tx_count:
            self._flash_balance()
        self._last_tx_count = len(earned)
        for w in self._tx_frame.winfo_children():
            w.destroy()
        if not earned:
            ctk.CTkLabel(self._tx_frame, text="No transactions yet",
                         font=("Courier New", 11), text_color=TEXT2).pack(anchor="w")
            return
        for height, reward, ts in earned[:5]:
            ctk.CTkLabel(self._tx_frame,
                         text=f"Block {height}  —  +{reward:.3f} CHK  —  {time_ago(ts)}",
                         font=("Courier New", 11), text_color=GREEN).pack(anchor="w", pady=1)

    # ═══════════════════════════════════════════════════════════════════════════
    # Actions
    # ═══════════════════════════════════════════════════════════════════════════

    def _copy_address(self):
        if self._address:
            self.clipboard_clear()
            self.clipboard_append(self._address)
            self._addr_label.configure(text="Copied!")
            self.after(1500, lambda: self._addr_label.configure(
                text=trunc(self._address, 28)))

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
               "--testnet", "--password", self._password]

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

    def _on_close(self):
        self._poll_stop.set()
        if self._we_started_node and self._node_proc and self._node_proc.poll() is None:
            if sys.platform != "win32":
                try:
                    os.killpg(os.getpgid(self._node_proc.pid), signal.SIGTERM)
                except ProcessLookupError:
                    pass
            else:
                self._node_proc.terminate()
            try:
                self._node_proc.wait(timeout=6)
            except subprocess.TimeoutExpired:
                self._node_proc.kill()
        self.destroy()


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = ChakramApp()
    app.mainloop()
