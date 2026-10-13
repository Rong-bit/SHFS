SHFS mail host - home / school PC
=================================

1) Install Node.js LTS: https://nodejs.org/
   - During install, keep "Add to PATH" checked
   - After install, restart the computer (or at least close all cmd windows)

2) Open the SHFS project folder (must contain package.json)

3) Double-click:  start-mail-host.bat
   - Keep the black window open
   - Browser should open http://localhost:3000

4) If double-click fails:
   a. Double-click OPEN-CMD-HERE.bat
   b. Type these lines and press Enter after each:
        node -v
        npm -v
        npm install
        npm run build
        npm start
   c. Open browser: http://localhost:3000

5) Check log file in the same folder:
      start-mail-host.log

Do NOT test sending mail on github.io.
Leave "notify API base URL" empty when using http://localhost:3000.
