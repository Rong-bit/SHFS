#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SHFS portable mail-host launcher.

Bundled layout (next to this script, or inside PyInstaller extract dir):
  node/node.exe
  dist/server.cjs
  dist/index.html
  dist/assets/...

Sets cwd to that root and runs: node dist/server.cjs
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path


def app_root() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    # Dev / portable folder: scripts/../portable-staging or sibling of exe
    here = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve().parent
    if (here / "dist" / "server.cjs").is_file():
        return here
    if (here.parent / "dist" / "server.cjs").is_file():
        return here.parent
    return here


def node_exe(root: Path) -> Path:
    candidates = [
        root / "node" / "node.exe",
        root / "node.exe",
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "nodejs" / "node.exe",
    ]
    for p in candidates:
        if p.is_file():
            return p
    return candidates[0]


def wait_open(port: int, timeout: float = 60.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1.0):
                webbrowser.open("http://127.0.0.1:%s" % port)
                return
        except OSError:
            time.sleep(0.4)


def main() -> int:
    root = app_root()
    port = int(os.environ.get("PORT", "3000"))
    server_js = root / "dist" / "server.cjs"
    node = node_exe(root)

    print("========================================")
    print("  SHFS Mail Host (portable)")
    print("========================================")
    print("Root:", root)
    print("Node:", node)
    print("Server:", server_js)
    print("URL:  http://localhost:%s" % port)
    print("LAN IP will be printed by Node after start.")
    print("Keep this window open.")
    print("")

    if not server_js.is_file():
        print("[ERROR] dist/server.cjs missing. Rebuild portable package.")
        input("Press Enter to close...")
        return 1
    if not node.is_file():
        print("[ERROR] node.exe missing in package.")
        input("Press Enter to close...")
        return 1

    env = os.environ.copy()
    env["PORT"] = str(port)
    env["NODE_ENV"] = "production"

    threading.Thread(target=wait_open, args=(port,), daemon=True).start()
    try:
        proc = subprocess.run(
            [str(node), str(server_js)],
            cwd=str(root),
            env=env,
        )
        code = proc.returncode
    except KeyboardInterrupt:
        code = 0
        print("\nStopped.")
    print("")
    input("Press Enter to close...")
    return int(code or 0)


if __name__ == "__main__":
    sys.exit(main())
