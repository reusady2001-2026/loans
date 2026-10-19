# The in-app Guide

Settings → **Guide** → *Open the guide* opens a window: pick a tab (a chapter), then a topic; a topic is a walkthrough
of steps — a picture of the real app with a numbered marker on every button, and what each number does.

- `guide-viewer.js` — the window (loaded by `index.html`; reads `guide/guide.json`).
- `guide/spec/<chapter>.js` — what each chapter shows: its topics and steps (how to reach each screen, the picture's
  area, the markers and the words). `guide/spec/index.js` — the chapters' order.
- `guide/capture.js` + `guide/helpers.js` — drive the app (Electron + Playwright) through every step and take the
  pictures: `guide/img/<chapter>/*.jpg`, `guide/data/<chapter>.json`, then `guide/guide.json` (all chapters).
- `guide/fixtures/` — made-up answers for the scripted stand-in Claude (`test/fixtures/fake-claude-push.js`).

The pictures use the app's built-in sample loans and made-up files only — never anyone's real T12, rent roll or
agreement. Retake them whenever a screen changes:

```
xvfb-run -a -s "-screen 0 1920x3000x24" node guide/capture.js              # every chapter
xvfb-run -a -s "-screen 0 1920x3000x24" node guide/capture.js refinance    # one (or more) chapters
node guide/capture.js --merge                                               # only rebuild guide/guide.json
```

A step whose screen or marker isn't there any more stops the run and names the step (a guide that doesn't match the
app fails here instead of showing an old picture). `test/guide.test.js` checks `guide.json` (every picture exists,
every marker sits on its picture); `test/e2e/guide.e2e.js` opens the guide in the app.

## Writing a chapter

```js
module.exports = {
  id: "calendar", title: "Maturity & Reset Calendar", intro: "One line: what this tab is for.",
  env: (udata) => ({ /* extra environment for the app, e.g. LDS_FAKE_CHAT_FILE */ }),
  setup: async (h) => { /* once, before the first topic: made-up data, open the tab */ },
  topics: [
    { id: "read", title: "Read the calendar", intro: "One line.", before: async (h) => {},
      steps: [
        { title: "The months", text: "What you are looking at, in plain words.",
          go: async (h) => { await h.newTab("calendar"); },          // how to get to the screen
          shot: "view" | "#cssSelector" | { sel: "#x", nth: 0 },    // the whole window, or one area (a card, a pop-up)
          marks: [ { sel: "#btn", label: "The button's name", text: "What it does.", optional: false } ],
          cover: true }                                              // this picture on the chapter's card
      ] }
  ]
};
```

- Plain, short words; say what each button **does**, and what happens after.
- A marker on every button, box and figure in the picture that someone could ask about.
- `h` (guide/helpers.js): `click`, `jsClick`, `clickText`, `fill`, `select`, `hover`, `scroll`, `top`, `key`, `js`,
  `wait`, `home`, `newTab`, `openLoan(/name/)`, `loanId`, `uwProperty(key)`, `xlsx(grid, name)`, `uwUpload(file)`,
  `closeModals`, `calm`; `h.acceptDialogs = [/regex/]` accepts the confirm boxes whose text matches.
- Selectors are Playwright's: CSS, `text=…`, `:has-text("…")`, and `>> xpath=…` chains.
