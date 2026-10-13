#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build a portable Windows mail-host folder (and optional .exe).

Output:
  release/SHFS-MailHost/
    start.bat
    SHFSMailHost.exe   (if PyInstaller available on Windows)
    node/node.exe
    dist/...

Usage (on Windows, after npm run build):
  python scripts/build_portable_mail_host.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "release" / "SHFS-MailHost"
NODE_VERSION = os.environ.get("PORTABLE_NODE_VERSION", "22.14.0")
NODE_ZIP_URL = (
    "https://nodejs.org/dist/v%s/node-v%s-win-x64.zip" % (NODE_VERSION, NODE_VERSION)
)


def run(cmd: list[str]) -> None:
    print(">>", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=str(ROOT), check=True)


def ensure_dist() -> None:
    """
    Frontend via vite; server.cjs MUST bundle express/nodemailer/dotenv
    (no node_modules in the portable zip).
    """
    print("Installing deps / building portable dist ...")
    if (ROOT / "package-lock.json").is_file():
        run(["npm", "ci"])
    else:
        run(["npm", "install"])
    # vite assets + fully-bundled server (not --packages=external)
    run(["npm", "run", "build:portable"])
    server = ROOT / "dist" / "server.cjs"
    index = ROOT / "dist" / "index.html"
    if not server.is_file() or not index.is_file():
        raise RuntimeError("portable build missing dist/server.cjs or index.html")
    # sanity: bundled file should mention express code, not only require('express')
    text = server.read_text(encoding="utf-8", errors="ignore")
    if "Cannot find module" in text:
        pass
    if "require(\"express\")" in text or "require('express')" in text:
        # still ok if also bundled; warn only when tiny
        if server.stat().st_size < 50_000:
            raise RuntimeError(
                "dist/server.cjs looks too small; express may still be external"
            )
    print("dist/server.cjs size:", server.stat().st_size)


def download_node(dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    node_exe = dest_dir / "node.exe"
    if node_exe.is_file():
        print("node.exe already at", node_exe)
        return node_exe

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        zip_path = tmp_path / "node.zip"
        print("Downloading", NODE_ZIP_URL)
        urllib.request.urlretrieve(NODE_ZIP_URL, zip_path)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp_path)
        # folder name like node-v22.14.0-win-x64
        matches = list(tmp_path.glob("node-v*-win-x64/node.exe"))
        if not matches:
            raise RuntimeError("node.exe not found inside Node zip")
        shutil.copy2(matches[0], node_exe)
    print("Copied", node_exe)
    return node_exe


def write_start_bat(out: Path) -> None:
    # ASCII only for Windows cmd
    content = """@echo off
setlocal
cd /d "%~dp0"
title SHFS Mail Host
echo Starting SHFS mail host...
echo Open http://localhost:3000
echo Keep this window open.
echo.
set PORT=3000
set NODE_ENV=production
if not exist "node\\node.exe" (
  echo [ERROR] node\\node.exe missing
  pause
  exit /b 1
)
if not exist "dist\\server.cjs" (
  echo [ERROR] dist\\server.cjs missing
  pause
  exit /b 1
)
start "" "http://localhost:3000"
"node\\node.exe" "dist\\server.cjs"
echo.
pause
"""
    data = content.replace("\n", "\r\n").encode("ascii")
    (out / "start.bat").write_bytes(data)


def copy_dist(out: Path) -> None:
    dest = out / "dist"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(ROOT / "dist", dest)


def try_pyinstaller(out: Path) -> Path | None:
    if not sys.platform.startswith("win"):
        print("Skip PyInstaller exe (not Windows)")
        return None
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print("PyInstaller not installed; skip exe (zip/folder still OK)")
        return None

    runtime = ROOT / "scripts" / "mail_host_runtime.py"
    work = out / "_pyi"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True, exist_ok=True)

    # Windows PyInstaller: --add-data "src;dest"  /  --add-binary "src;destDir"
    sep = ";" if sys.platform.startswith("win") else ":"
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--console",
        "--name",
        "SHFSMailHost",
        "--distpath",
        str(out),
        "--workpath",
        str(work / "work"),
        "--specpath",
        str(work),
        "--add-data",
        "%s%sdist" % (out / "dist", sep),
        "--add-binary",
        "%s%snode" % (out / "node" / "node.exe", sep),
        str(runtime),
    ]
    print(">>", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=str(ROOT), check=True)
    exe = out / "SHFSMailHost.exe"
    return exe if exe.is_file() else None


def main() -> int:
    print("ROOT=", ROOT)
    ensure_dist()
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    (OUT / "node").mkdir()
    download_node(OUT / "node")
    copy_dist(OUT)
    write_start_bat(OUT)
    readme = OUT / "README.txt"
    readme.write_text(
        "SHFS Mail Host (portable)\r\n"
        "=========================\r\n"
        "1. Double-click start.bat  (or SHFSMailHost.exe if present)\r\n"
        "2. Keep the window open\r\n"
        "3. Browser: http://localhost:3000\r\n"
        "4. Do not use github.io for sending mail\r\n",
        encoding="ascii",
        newline="\r\n",
    )

    exe = try_pyinstaller(OUT)
    # zip the folder
    zip_base = ROOT / "release" / "SHFS-MailHost-Windows"
    if zip_base.with_suffix(".zip").exists():
        zip_base.with_suffix(".zip").unlink()
    # exclude pyinstaller work dir from zip
    work = OUT / "_pyi"
    if work.exists():
        shutil.rmtree(work)
    shutil.make_archive(str(zip_base), "zip", root_dir=str(OUT.parent), base_dir=OUT.name)
    print("")
    print("DONE")
    print("Folder:", OUT)
    print("Zip:   ", zip_base.with_suffix(".zip"))
    if exe:
        print("Exe:   ", exe)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print("[ERROR]", e)
        raise
