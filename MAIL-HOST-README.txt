SHFS mail host - easiest way (portable package)
==============================================

RECOMMENDED: download the portable Windows zip from GitHub Actions
  Repo -> Actions -> "Build portable mail host (Windows)"
  -> latest run -> Artifacts -> SHFS-MailHost-Windows.zip

Then:
  1. Unzip
  2. Double-click start.bat
  3. Open http://localhost:3000
  4. Keep the window open

No npm / no Python / no git pull needed on the PC that only sends mail.

------------------------------------------------
Alternative (developers): build from source
  npm ci
  npm run build:portable
  python scripts/build_portable_mail_host.py
  Output: release\SHFS-MailHost\

Do NOT test sending mail on github.io.
