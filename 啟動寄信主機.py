#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SHFS 巡堂寄信主機啟動程式（校內常開電腦用）

用法：
  雙擊本檔，或：python 啟動寄信主機.py

啟動後請用瀏覽器開啟 http://這台IP:3000（不要開 github.io）。
寄信設定「寄信 API 根網址」請留空。
"""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "3000"))


def log(msg: str) -> None:
    print(msg, flush=True)


def which(cmd: str) -> str | None:
    return shutil.which(cmd)


def run_npm(args: list[str], *, check: bool = True) -> int:
    npm = which("npm")
    if not npm:
        raise RuntimeError(
            "找不到 npm。請先安裝 Node.js：https://nodejs.org/ （建議 LTS）"
        )
    # Windows 上 npm 常是 .cmd，需 shell
    use_shell = sys.platform.startswith("win")
    cmd = [npm, *args] if not use_shell else subprocess.list2cmdline([npm, *args])
    log(f"\n>> {' '.join(args) if isinstance(cmd, list) else cmd}")
    completed = subprocess.run(
        cmd,
        cwd=str(ROOT),
        shell=use_shell,
    )
    if check and completed.returncode != 0:
        raise RuntimeError(f"指令失敗（結束碼 {completed.returncode}）：npm {' '.join(args)}")
    return completed.returncode


def local_ips() -> list[str]:
    ips: list[str] = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            ips.append(s.getsockname()[0])
    except OSError:
        pass
    try:
        host = socket.gethostname()
        for info in socket.getaddrinfo(host, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    return ips


def wait_and_open_browser(timeout_sec: float = 45.0) -> None:
    deadline = time.time() + timeout_sec
    url = f"http://127.0.0.1:{PORT}"
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=1.0):
                webbrowser.open(url)
                return
        except OSError:
            time.sleep(0.5)
    log(f"（尚未偵測到埠 {PORT}，請稍後手動開啟 {url}）")


def main() -> int:
    if sys.platform.startswith("win"):
        try:
            # 讓 Windows 主控台較易顯示中文
            os.system("chcp 65001 >nul")
        except Exception:
            pass

    log("=" * 44)
    log("  SHFS 巡堂寄信主機")
    log("=" * 44)
    log(f"專案目錄：{ROOT}")
    log("")
    log("請保持本視窗開啟。")
    log("操作時請開：http://這台IP:3000")
    log("（不要開 github.io；寄信 API 根網址請留空）")
    log("")

    if not which("node") and not which("nodejs"):
        log("[錯誤] 找不到 Node.js，請先安裝：https://nodejs.org/")
        return 1
    if not which("npm"):
        log("[錯誤] 找不到 npm。")
        return 1

    try:
        if not (ROOT / "node_modules").is_dir():
            log("首次執行：正在 npm install …")
            run_npm(["install"])

        log("正在建置（npm run build）…")
        run_npm(["run", "build"])

        ips = local_ips()
        log("")
        log("即將啟動服務。其他電腦可開：")
        if ips:
            for ip in ips:
                log(f"  http://{ip}:{PORT}")
        else:
            log(f"  http://<這台區網IP>:{PORT}")
        log(f"本機亦可開：http://localhost:{PORT}")
        log("")

        # 背景等 server 起來再開瀏覽器
        if sys.platform.startswith("win"):
            import threading

            threading.Thread(target=wait_and_open_browser, daemon=True).start()
        else:
            import threading

            threading.Thread(target=wait_and_open_browser, daemon=True).start()

        # 前景擋住：npm start
        code = run_npm(["start"], check=False)
        log("")
        log("服務已結束。")
        return code
    except RuntimeError as e:
        log(f"[錯誤] {e}")
        return 1
    except KeyboardInterrupt:
        log("\n已中斷。")
        return 0


if __name__ == "__main__":
    code = main()
    if sys.platform.startswith("win"):
        try:
            input("\n按 Enter 關閉視窗…")
        except EOFError:
            pass
    sys.exit(code)
