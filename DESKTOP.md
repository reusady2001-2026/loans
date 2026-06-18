# Loan Debt Service Hub — Desktop (Electron)

The app runs as an offline desktop program. All loan data is stored locally on
the PC; the only thing that ever touches the internet is the optional **live
rate fetch** (US Treasury / SOFR / Fed Funds), done quietly in the background.
When offline, the app uses the last fetched values or whatever you typed.

Everything else (Tailwind styling, the Excel engine) is **vendored in `vendor/`**,
so there are no CDN downloads and the app works with no connection.

## Run it (development)

Requires **Node.js** only — no admin rights needed if Node is installed
per-user (e.g. the Node `.zip`, or `fnm` / `volta` / `scoop`).

```bash
npm install      # downloads Electron locally into node_modules (no admin)
npm start        # opens the app in a desktop window
```

## Build a Windows app

```bash
npm run build:win            # → release/  : a single PORTABLE .exe (no install, no admin to run)
npm run build:win-installer  # → release/  : a per-user NSIS installer (no admin)
```

- **Portable** = one `.exe` you double-click; nothing is installed. Best when
  admin rights are restricted.
- The NSIS installer is configured `perMachine: false`, so it installs into the
  user profile without admin.

> Note: building a Windows `.exe` is easiest **on Windows**. To build it without
> any local toolchain, a GitHub Actions workflow can produce the portable `.exe`
> as a downloadable artifact — ask and it can be added.

## Files

- `index.html` — the entire app (UI + Actual/360 engine + refi calculator).
- `vendor/` — Tailwind and SheetJS, bundled for offline use.
- `main.js` — the Electron shell (just hosts `index.html` in a window).
- `package.json` — scripts + electron-builder packaging config.

The same `index.html` still opens directly in a browser (with the `vendor/`
folder alongside) if you ever want the no-Electron fallback.
