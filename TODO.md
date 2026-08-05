# TODO — Loan Debt Service Hub

Deferred / planned work.

## Excel import & export (specific-loan view)
Removed from the Specific-Loan toolbar for now — the current UX needs a
rethink. Bring it back with a cleaner flow (and decide how it should behave in
the desktop app vs. the browser build). The engine functions `exportExcel()`
and `importExcel()` are still in `index.html`, just unwired — so re-enabling is
mostly a UI job.

## Backup / Restore (whole portfolio)
Export/import the entire portfolio as a single file through the desktop app's
native Save/Open dialog — for moving between machines, sharing with a
colleague, and keeping an archive. Lower urgency: the `.exe` already persists
data on disk (Electron userData), so this is portability/sharing, not a
data-safety fix.
