# Loan Debt Service Hub

An offline desktop app for tracking commercial real‑estate loans and their debt
service. It has an Actual/360 amortization engine, editable loan records, a
Maturity & Reset calendar, a refinance calculator, live index rates (US Treasury
/ SOFR / Fed Funds, with offline fallbacks), and Excel/JSON import & export.

The entire UI and calculation engine live in `index.html`; Electron wraps it as
a self‑updating Windows desktop app. All data is stored locally on the PC.

## Quick start (development)

```bash
npm install   # installs Electron locally (no admin needed)
npm start     # opens the app in a desktop window
```

Requires Node.js only.

## Documentation

- **[DESKTOP.md](DESKTOP.md)** — running it in development, building the Windows
  installer, and how the pieces fit together (main process, preload bridge,
  vendored libraries, and the GitHub Actions release / auto‑update flow).

## Building the Windows app

```bash
npm run build:win            # portable .exe   → release/
npm run build:win-installer  # NSIS installer  → release/
```

Pushing to the release branch also builds the installer in CI and publishes it
to a GitHub Release, which the running app auto‑updates from. See
[DESKTOP.md](DESKTOP.md) for details.
