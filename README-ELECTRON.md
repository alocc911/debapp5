# Electron packaging for Debate Map

This adds a minimal Electron wrapper so you can ship a Windows installer (.exe) to non-technical users.
The app runs offline and can load/export the same JSON snapshots you already use in the browser.

## 1) Install packaging tools (dev-only)
```powershell
npm i -D electron electron-builder concurrently wait-on cross-env
```

## 2) Add files
- Place the `electron/` folder at your project root (same level as `package.json`).
  - `electron/main.cjs`
  - `electron/preload.cjs`

## 3) Update `package.json`
Add or merge these fields:

```jsonc
{
  "main": "electron/main.cjs",
  "scripts": {
    "dev": "vite",
    "dev:electron": "concurrently -k "vite" "wait-on tcp:5173 && cross-env VITE_DEV_SERVER_URL=http://localhost:5173 electron ."",
    "build:web": "vite build",
    "build:win": "npm run build:web && electron-builder -w"
  },
  "build": {
    "appId": "com.example.debatemap",
    "productName": "Debate Map",
    "files": [
      "dist/**",
      "electron/**",
      "package.json"
    ],
    "directories": {
      "output": "release"
    },
    "win": {
      "target": ["nsis"],
      "artifactName": "DebateMap-${version}-Setup.${ext}"
    },
    "nsis": {
      "oneClick": true,
      "perMachine": false,
      "allowToChangeInstallationDirectory": false
    }
  }
}
```

> **Note:** If your `package.json` already has a `"type": "module"`, that's fine—using `*.cjs` keeps Electron's main/preload in CommonJS.

## 4) Run the desktop app in dev (optional)
```powershell
npm run dev:electron
```
This starts Vite and opens an Electron window pointing at the dev server.

## 5) Build the Windows installer
```powershell
npm run build:win
```
Output will be under `release/` (e.g., `DebateMap-1.0.0-Setup.exe`). Share that `.exe` with your users.

---

### FAQ

- **Will Save/Load still work?** Yes. The current anchor-download and file-input behavior works inside Electron and uses native file dialogs.
- **Does it work offline?** Yes, everything is local. No servers are needed to run the packaged app.
- **Do I need code signing?** For internal distribution you can skip. For broad distribution, code signing removes some Windows SmartScreen warnings.
- **Can we auto-update?** Yes, you can later add electron-updater. Not required for this first pass.
- **Smaller installer?** Consider [Tauri] later (Rust-based, tiny runtime). Electron is the simplest path now.
