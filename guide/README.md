# The in-app Guide

Settings → **Guide** → *Open the guide* opens a window laid out like the Claude Code docs (the operator,
2026-10-26):
- the pages in groups on the left;
- a search at the top (Ctrl K);
- the page in the middle;
- "On this page" on the right.

It opens on the **Overview**. Previous / Next at the foot of every page follow the menu. A picture opens full size
when clicked; Esc closes it, then the guide.

There are two kinds of page:
- **How-to** (the Gatsby how-to shape): one task. Each has:
  - a title that reads after "How to";
  - a one-line description and a short intro (what and why);
  - "Before you start";
  - numbered steps, one action each, with a picture only where the screen changes and numbered markers only on what
    the step points at;
  - notes, tips and warnings;
  - "Next steps".
- **Reference**: what every control on a screen does, picture by picture, each with numbered markers and their
  explanations (beside the picture on a wide window, under it on a narrow one).

## Files

- `guide-viewer.js` — the window. `index.html` loads it, and it reads `guide/guide.json`.
- `guide/spec/index.js` — the menu's groups and the Overview page, written by hand. Its chapter files, in capture
  order:
  - `guide/spec/<chapter>.js` — one per area of the app;
  - each lists its pages: how to reach each screen, the picture's area, the markers and the words.
- `guide/capture.js` + `guide/helpers.js` — drive the app (Electron + Playwright) through every page and take the
  pictures. They write `guide/img/<chapter>/*.jpg`, then `guide/data/<chapter>.json`, then `guide/guide.json` (every
  page, in the menu's order).
- `guide/fixtures/` — made-up answers for the scripted stand-in Claude (`test/fixtures/fake-claude-push.js`).

The pictures use the app's built-in sample loans and made-up files only, never anyone's real T12, rent roll or
agreement. Retake them whenever a screen changes:

```
xvfb-run -a -s "-screen 0 1920x3000x24" node guide/capture.js                          # every chapter
xvfb-run -a -s "-screen 0 1920x3000x24" node guide/capture.js refinance                # one (or more) chapters
xvfb-run -a -s "-screen 0 1920x3000x24" node guide/capture.js refinance --no-merge     # several at once: merge after
node guide/capture.js --merge                                                           # only rebuild guide/guide.json
```

A step whose screen or marker isn't there any more stops the run and names the step, so a guide that doesn't match
the app fails here instead of showing an old picture.

Tests:
- `test/guide.test.js` checks `guide.json`:
  - every page in the spec was captured;
  - every link, card and "Next steps" opens a real page;
  - every picture exists, and every marker sits on its picture;
  - a how-to step has at most 5 markers.
- `test/e2e/guide.e2e.js` opens the guide in the app.

## Writing a page

```js
module.exports = {
  id: "loan", env: (udata) => ({ /* extra environment for the app */ }), setup: async (h) => { /* once, first */ },
  pages: [
    { id: "add-a-loan", kind: "howto", group: "Loans", title: "Add a loan",
      description: "One sentence: what this page gets done.",
      intro: "What the task achieves and why — two or three sentences.",
      before: ["A real prerequisite."],
      sections: [
        { title: "Open the form", text: "An optional lead-in.",
          steps: [
            { text: "Click **Add Loan**.",
              go: async (h) => { /* how to reach the screen */ },
              shot: "view" | "#cssSelector" | { sel: "#x", nth: 0 },     // only where the screen changes
              marks: [ { sel: "#btn", label: "Add Loan", text: "Opens the form." } ],   // only what the step points at
              tip: "A shortcut." }
          ],
          note: "Something worth knowing." }
      ],
      next: [ { page: "edit-a-loan", text: "Change it later." } ] },
    { id: "ref-loan-form", kind: "reference", group: "Reference", title: "The loan form", description: "…",
      sections: [ { title: "Loan terms", views: [ { title: "…", text: "…", go, shot, marks: [ /* every control */ ] } ] } ] }
  ]
};
```

- Words: `**Bold**` for a button's or a field's name, exactly as the app shows it. `[words](page-id)` or
  `[words](page-id#section-id)` links to another page.
- Plain, short sentences. One action per step. Say what each button **does**, and what happens after.
- `h` (guide/helpers.js) has:
  - clicking and typing: `click`, `jsClick`, `clickText`, `fill`, `select`, `hover`, `key`;
  - moving around: `scroll`, `top`, `home`, `newTab`, `openLoan(/name/)`, `loanId`, `uwProperty(key)`;
  - files and pages: `js`, `wait`, `xlsx(grid, name)`, `uwUpload(file)`, `closeModals`, `calm`.

  `h.acceptDialogs = [/regex/]` accepts the confirm boxes whose text matches.
- Selectors are Playwright's: CSS, `text=…`, `:has-text("…")`, and `>> xpath=…` chains.
