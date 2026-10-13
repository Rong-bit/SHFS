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
    # Windows: npm is npm.cmd — CreateProcess needs shell=True
    use_shell = sys.platform.startswith("win")
    subprocess.run(cmd, cwd=str(ROOT), check=True, shell=use_shell)


def _assert_portable_server(server: Path, index: Path) -> None:
    if not server.is_file() or not index.is_file():
        raise RuntimeError("portable build missing dist/server.cjs or index.html")
    size = server.stat().st_size
    print("dist/server.cjs size:", size)
    # Bundled express/nodemailer is ~1MB+; external-only builds are tiny
    if size < 50_000:
        raise RuntimeError(
            "dist/server.cjs looks too small; express may still be external "
            "(use npm run build:portable)"
        )


def ensure_dist() -> None:
    """
    Prefer dist/ from a prior `npm run build:portable` (Actions does this).
    Otherwise install + build. server.cjs MUST bundle express/nodemailer
    (no node_modules in the portable zip).
    """
    server = ROOT / "dist" / "server.cjs"
    index = ROOT / "dist" / "index.html"
    if server.is_file() and index.is_file():
        print("dist/ already present")
        _assert_portable_server(server, index)
        return

    print("Installing deps / building portable dist ...")
    if (ROOT / "package-lock.json").is_file():
        run(["npm", "ci"])
    else:
        run(["npm", "install"])
    # vite assets + fully-bundled server (not --packages=external)
    run(["npm", "run", "build:portable"])
    _assert_portable_server(server, index)


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
setlocal EnableExtensions
cd /d "%~dp0"
title SHFS Mail Host
echo Starting SHFS mail host...
echo After start, the real LAN URL will be printed
echo   e.g. http://192.168.x.x:3000
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
for %%A in ("dist\\server.cjs") do set "SERVER_SIZE=%%~zA"
if not defined SERVER_SIZE set "SERVER_SIZE=0"
rem Bundled express/nodemailer is ~1.5MB+; old external builds are tiny
if %SERVER_SIZE% LSS 500000 (
  echo [ERROR] dist\\server.cjs is too small ^(%SERVER_SIZE% bytes^).
  echo This package is OLD and missing express.
  echo Delete this folder, then re-download Artifact
  echo "SHFS-MailHost-Windows" from the latest successful
  echo Actions run: Build portable mail host ^(Windows^).
  echo Expected server.cjs size is about 1.5 MB or larger.
  pause
  exit /b 1
)
echo server.cjs size: %SERVER_SIZE% bytes
start "" "http://localhost:3000"
"node\\node.exe" "dist\\server.cjs"
echo.
pause
"""
    data = content.replace("\n", "\r\n").encode("ascii")
    (out / "start.bat").write_bytes(data)


def write_package_info(out: Path, server_size: int) -> None:
    (out / "PACKAGE.txt").write_text(
        "SHFS Mail Host (portable)\r\n"
        "=========================\r\n"
        "start.bat / SHFSMailHost.exe\r\n"
        "Open http://localhost:3000\r\n"
        "\r\n"
        "server.cjs must be ~1.5MB+ (express bundled).\r\n"
        "server.cjs bytes: %s\r\n"
        "If start fails with Cannot find module express,\r\n"
        "you have an OLD zip - delete it and re-download.\r\n"
        % server_size,
        encoding="ascii",
        newline="\r\n",
    )


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
    server_size = (OUT / "dist" / "server.cjs").stat().st_size
    write_package_info(OUT, server_size)
    readme = OUT / "README.txt"
    readme.write_text(
        "SHFS Mail Host (portable)\r\n"
        "=========================\r\n"
        "1. Double-click start.bat  (or SHFSMailHost.exe if present)\r\n"
        "2. Keep the window open\r\n"
        "3. This PC: http://localhost:3000\r\n"
        "4. Others: use the LAN URL printed after start\r\n"
        "   (e.g. http://192.168.x.x:3000)\r\n"
        "5. Do not use github.io for sending mail\r\n"
        "6. server.cjs should be about 1.5MB+ (see PACKAGE.txt)\r\n",
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
