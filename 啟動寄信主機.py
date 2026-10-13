#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SHFS 巡堂寄信主機（Python 版，可選）

校內若未安裝 Python，請改雙擊 start-mail-host.bat 或 啟動寄信主機.bat。
"""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "3000"))


def log(msg: str) -> None:
    print(msg, flush=True)


def pause() -> None:
    if sys.platform.startswith("win"):
        try:
            input("\n按 Enter 關閉視窗…")
        except EOFError:
            pass


def which(cmd: str):
    return shutil.which(cmd)


def run_npm(args, *, check: bool = True) -> int:
    npm = which("npm")
    if not npm:
        raise RuntimeError("找不到 npm。請安裝 Node.js：https://nodejs.org/")
    use_shell = sys.platform.startswith("win")
    cmdline = [npm, *args]
    log("\n>> npm " + " ".join(args))
    completed = subprocess.run(
        subprocess.list2cmdline(cmdline) if use_shell else cmdline,
        cwd=str(ROOT),
        shell=use_shell,
    )
    if check and completed.returncode != 0:
        raise RuntimeError("npm %s 失敗（代碼 %s）" % (" ".join(args), completed.returncode))
    return completed.returncode


def local_ips():
    ips = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ips.append(s.getsockname()[0])
    except OSError:
        pass
    return ips


def wait_and_open_browser(timeout_sec: float = 60.0) -> None:
    deadline = time.time() + timeout_sec
    url = "http://127.0.0.1:%s" % PORT
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=1.0):
                webbrowser.open(url)
                return
        except OSError:
            time.sleep(0.5)
    log("（尚未偵測到服務，請手動開啟 %s）" % url)


def main() -> int:
    if sys.platform.startswith("win"):
        try:
            os.system("chcp 65001 >nul")
        except Exception:
            pass

    log("=" * 44)
    log("  SHFS 巡堂寄信主機（Python）")
    log("=" * 44)
    log("專案目錄：%s" % ROOT)
    log("")

    if not (ROOT / "package.json").is_file():
        log("[錯誤] 找不到 package.json。")
        log("請把本程式放在完整專案根目錄，並用 git pull 更新。")
        return 1

    if not which("node") and not which("nodejs"):
        log("[錯誤] 找不到 Node.js：https://nodejs.org/")
        return 1
    if not which("npm"):
        log("[錯誤] 找不到 npm。")
        return 1

    try:
        if not (ROOT / "node_modules").is_dir():
            log("首次執行：npm install …")
            run_npm(["install"])

        log("正在建置 npm run build …")
        run_npm(["run", "build"])

        ips = local_ips()
        log("")
        log("請保持視窗開啟。操作網址：")
        log("  http://localhost:%s" % PORT)
        for ip in ips:
            log("  http://%s:%s" % (ip, PORT))
        log("（不要開 github.io；API 根網址留空）")
        log("")

        threading.Thread(target=wait_and_open_browser, daemon=True).start()
        return run_npm(["start"], check=False)
    except RuntimeError as e:
        log("[錯誤] %s" % e)
        return 1
    except KeyboardInterrupt:
        log("\n已中斷。")
        return 0


if __name__ == "__main__":
    code = main()
    pause()
    sys.exit(code)
