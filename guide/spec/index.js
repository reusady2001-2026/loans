/* The Guide's chapters, in the order the guide lists them (one per tab or area of the app). Each chapter file
   describes its topics and steps: how to reach each screen, what the picture shows, and a numbered marker on every
   button with what it does. `node guide/capture.js` takes the pictures from these. */
"use strict";
const fs = require("fs"), path = require("path");
const ORDER = ["start", "home", "loan", "property", "underwriting", "proforma", "refinance", "calendar", "health", "documents", "assistant", "settings", "cloud"];
module.exports = {
  intro: "Pick the tab or screen you need help with. Each topic walks you through it step by step: a picture of the real screen, a number on every button, and what each one does. Use Back and Next (or the ← → keys); click a picture to see it full size.",
  note: "The pictures come from the app itself, taken with the app’s own sample loans and made-up files (a made-up T12, rent roll and agreement) — never your real tenants. Claude’s answers in the pictures are made-up examples.",
  chapters: ORDER.filter(id => fs.existsSync(path.join(__dirname, id + ".js"))).map(id => require("./" + id + ".js"))
};
