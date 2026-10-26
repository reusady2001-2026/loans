/* Guide chapter: the Assistant (Claude) — asking, focusing on a property, asking it to do something (attach a file,
   the Approve card), saved chats (History, Compact, New chat), and the reference page for the whole window with the
   connection panel. The window takes about 80% of the app window (80vw × 85vh).
   Claude is the scripted stand-in (test/fixtures/fake-claude-push.js): every reply in these pictures is a made-up
   example written here, read from the chat file the stand-in answers from. The properties and their summaries are
   made-up ones: the how-to fills in Sample Gardens, the reference page Sample Oaks (so each card starts from empty
   fields). */
"use strict";
const path = require("path"), fs = require("fs");
const PROP = "Sample Gardens (example)", DOC = "Sample Gardens property summary.txt";
const PROP2 = "Sample Oaks (example)", DOC2 = "Sample Oaks property summary.txt";
const ASK = "Fill in Sample Gardens’ details from the attached summary.", ASK2 = "Fill in Sample Oaks’ details from the attached summary.";
const act = (o) => "```action\n" + JSON.stringify(o) + "\n```";
// the stand-in's next replies, in order
const say = (h, list) => fs.writeFileSync(path.join(h.ctx.UDATA, "chat.json"), JSON.stringify(list));
const panel = "#aiAsstModal > div";
const LOG = "#aiAsstLog";
// the bottom of the window: the property, the model, the attached files, the message box and Send
const BAR = "#aiAsstInput >> xpath=ancestor::div[contains(@class,'border-t')][1]";
const idle = (h) => h.page.waitForFunction(() => { const b = document.getElementById("aiAsstSend"); return b && /Send/.test(b.textContent) && !b.disabled; }, null, { timeout: 30000 }).catch(() => {});
const send = async (h, q) => { await h.js((t) => { const i = document.getElementById("aiAsstInput"); i.value = t; document.getElementById("aiAsstSend").click(); }, q); await h.wait(500); await idle(h); await h.wait(500); };
const typeOnly = async (h, q) => { await h.js((t) => { const i = document.getElementById("aiAsstInput"); i.value = t; i.dispatchEvent(new Event("input", { bubbles: true })); }, q); await h.wait(200); };
const showFab = async (h) => { await h.js(() => { window.__guideShowFab = true; const s = document.getElementById("guideCalm"); if (s) s.remove(); }); await h.calm(); };
const open = async (h) => { await h.js(() => { const m = document.getElementById("aiAsstModal"); if (!m || m.classList.contains("hidden")) document.getElementById("aiAsstFab").click(); }); await h.wait(600);
  await h.page.waitForFunction(() => { const r = document.getElementById("aiAsstConnRow"); return r && !/Checking/.test(r.textContent); }, null, { timeout: 20000 }).catch(() => {}); await h.wait(300); };
const newChat = async (h) => { await open(h); await h.js(() => document.getElementById("aiAsstNew").click()); await h.wait(500); };
const scrollLog = async (h) => { await h.js(() => { const l = document.getElementById("aiAsstLog"); l.scrollTop = l.scrollHeight; }); await h.wait(200); };
// a property's made-up summary attached to a new chat about it, and the request typed (not sent yet)
const attach = async (h, prop, doc, ask) => {
  await newChat(h); await h.select("#aiAsstProp", { label: prop }); await h.wait(400);
  await h.page.setInputFiles("#aiAsstFile", path.join(h.ctx.UDATA, doc)); await h.wait(1200);
  await typeOnly(h, ask);
};
// the stand-in proposes four of the property's details from its summary, then reports back after the Approve
const propose = async (h, prop, doc, d, ask, done) => {
  say(h, [
    "The summary gives four of " + prop.replace(/ \(example\)$/, "").replace(/s$/, "s’").replace(/([^’])$/, "$1’s") + " details. Here they are for your approval:\n" + act({ action: "propose_profile_change", args: { name: prop,
      changes: { residentialUnits: d.units, rentableSqFt: d.sqft, yearBuilt: d.year, manager: d.manager },
      sources: { residentialUnits: { file: doc, page: 1, quote: d.units + " apartment homes" }, rentableSqFt: { file: doc, page: 1, quote: d.sqft.toLocaleString("en-US") + " rentable square feet" },
        yearBuilt: { file: doc, page: 1, quote: "Built in " + d.year }, manager: { file: doc, page: 1, quote: "Managed by " + d.manager } } } }),
    done
  ]);
  await h.js((t) => { const i = document.getElementById("aiAsstInput"); i.value = t; document.getElementById("aiAsstSend").click(); }, ask);
  await h.page.waitForFunction(() => document.querySelectorAll("#aiAsstLog .aiAsstEditApprove:not(:disabled)").length > 0, null, { timeout: 30000 });
  await h.wait(600);
  await h.js(() => { const c = [...document.querySelectorAll("#aiAsstLog [data-asstcard]")].pop(); if (c) c.scrollIntoView({ block: "center" }); });
};
// the manager's line unticked, then Approve & apply, and the stand-in's report
const approve = async (h) => {
  await h.js(() => { const ls = [...document.querySelectorAll("#aiAsstLog .aiAsstLine")]; const m = ls.find(x => x.getAttribute("data-asstline") === "manager"); if (m && m.checked) m.click(); });
  await h.wait(200);
  await h.js(() => { const b = [...document.querySelectorAll("#aiAsstLog .aiAsstEditApprove:not(:disabled)")].pop(); if (b) b.click(); });
  await h.wait(800); await idle(h); await h.wait(600);
  await scrollLog(h);
};
const GARDENS = { units: 120, sqft: 102000, year: 1998, manager: "Harbor Property Management" };
const OAKS = { units: 84, sqft: 71500, year: 2004, manager: "Harbor Property Management" };
const history = async (h) => { await h.js(() => { const p = document.getElementById("aiAsstHistoryPanel"); if (!p || p.classList.contains("hidden")) document.getElementById("aiAsstHistoryBtn").click(); }); await h.wait(1200); };
// the buttons of the first chat in History show while the pointer is on it (as here)
const hoverFirst = async (h) => { await h.hover("#aiAsstHistList .aiAsstHistItem", 0); await h.js(() => { const g = document.querySelector("#aiAsstHistList .aiAsstHistItem [data-hpin]"); if (g) g.parentElement.style.opacity = "1"; }); };

module.exports = {
  id: "assistant",
  env: (udata) => ({ LDS_FAKE_CHAT_FILE: path.join(udata, "chat.json"), LDS_FAKE_CHAT_LOG: path.join(udata, "chat-log.jsonl") }),
  setup: async (h) => {
    fs.writeFileSync(path.join(h.ctx.UDATA, "chat.json"), "[]");
    fs.writeFileSync(path.join(h.ctx.UDATA, DOC), [
      "SAMPLE GARDENS — PROPERTY SUMMARY (made-up, for the guide)",
      "Page 1",
      "Sample Gardens is a garden-style community of 120 apartment homes on 9.4 acres.",
      "Built in 1998; 102,000 rentable square feet.",
      "Managed by Harbor Property Management since the purchase in March 2019."
    ].join("\n"));
    fs.writeFileSync(path.join(h.ctx.UDATA, DOC2), [
      "SAMPLE OAKS — PROPERTY SUMMARY (made-up, for the guide)",
      "Page 1",
      "Sample Oaks is a garden-style community of 84 apartment homes on 6.1 acres.",
      "Built in 2004; 71,500 rentable square feet.",
      "Managed by Harbor Property Management since the purchase in June 2021."
    ].join("\n"));
    await h.js((n) => window.LDS_addProperty(n), PROP); await h.wait(800);
    await h.js((n) => window.LDS_addProperty(n), PROP2); await h.wait(800);
    await h.closeModals();
    await showFab(h);
  },
  pages: [
    // ==================================================================================================================
    { id: "ask-the-assistant", kind: "howto", group: "Assistant", title: "Ask the assistant",
      description: "Open the chat, ask Claude about your loans and properties, and point it at one property.",
      intro: "The assistant is a chat with Claude about your own book. It answers from the same figures the app shows and from the files you give it. It can also search the web for the surroundings, such as a market or the weather in a given month, and names where each web fact came from.",
      before: [ "Claude connected. See [Connect Claude](connect-claude)." ],
      sections: [
        { title: "Open the assistant",
          steps: [
            { text: "Click **Assistant** at the bottom right of the window, on any tab. The chat opens over the app; what you were doing stays as it was underneath.",
              go: async (h) => { await h.home(); await showFab(h); await h.top(); },
              shot: "view",
              marks: [ { sel: "#aiAsstFab", label: "Assistant", text: "Opens the chat with Claude." } ] }
          ] },
        { title: "Ask a question",
          steps: [
            { text: "Type your question in the message box at the bottom. Plain words are fine: name a property, a lender or a date.",
              go: async (h) => { await newChat(h); await typeOnly(h, "Which loans mature in the next 24 months?"); },
              shot: "view",
              marks: [
                { sel: "#aiAsstInput", label: "Message", text: "Your question." },
                { sel: "#aiAsstSend", label: "Send", text: "Sends it to Claude." }
              ] },
            { text: "Click **Send**, or press Enter. Shift+Enter starts a new line instead." },
            { text: "Read the answer. Your question shows on the right, Claude’s answer on the left.",
              go: async (h) => {
                say(h, ["Five loans mature in the next 24 months (to October 2028):\n\n• K2 Sweetwater (FIU Residences) — January 2027\n• K2 Sweetwater (Mezz) — January 2027\n• M Lofts — May 2027\n• Legacy at Kissimmee — May 2027\n• Creekside at Grand Prairie — May 2028\n\nReatta Ranch follows in December 2028. Want me to open the refinance for any of them?"]);
                await send(h, "Which loans mature in the next 24 months?");
              },
              shot: LOG,
              marks: [
                { sel: "#aiAsstLog .justify-end > div", nth: -1, label: "Your message", text: "What you asked." },
                { sel: "#aiAsstLog .justify-start > div", nth: -1, label: "Claude’s answer", text: "Worked out from the app’s own figures. When something is missing, it says so." }
              ] },
            { text: "Ask a follow-up in the same box. The chat remembers what was said." }
          ],
          tip: "In a new chat, click one of the example questions to ask it straight away." },
        { title: "Focus on one property",
          steps: [
            { text: "Pick the property in the list under the chat. **No property — general chat** is for the whole portfolio.",
              go: async (h) => { await newChat(h); await h.select("#aiAsstProp", { label: PROP }); await h.wait(500); },
              shot: BAR,
              marks: [
                { sel: "#aiAsstProp", label: "Property", text: "The property this chat is about." },
                { sel: "#aiAsstPropDocs", label: "Its documents", text: "How many of the property’s saved files Claude can read.", optional: true }
              ] },
            { text: "Ask your question. Claude reads that property’s saved files first, and the files you attach are saved to it." }
          ],
          note: "Opening the assistant from a loan’s page picks that loan’s property for a new chat. A chat started on a property is saved with that property." },
        { title: "Close the assistant",
          steps: [
            { text: "Click **×** at the top right of the chat, or anywhere outside it. The chat stays as it is for next time." }
          ] }
      ],
      next: [
        { page: "ask-it-to-do-something", text: "Have Claude make a change, and approve it." },
        { page: "use-saved-chats", text: "Reopen an earlier conversation." },
        { page: "ref-assistant", text: "Every control in the assistant window." }
      ] },

    // ==================================================================================================================
    { id: "ask-it-to-do-something", kind: "howto", group: "Assistant", title: "Ask the assistant to do something",
      description: "Have Claude make a change in the app, from your words or from a file, and approve it.",
      intro: "Claude can add properties, fill in details, edit loans, import files, run a refinance and more. Nothing changes until you approve its card. Here it fills in a property’s details from a made-up property summary.",
      before: [ "Claude connected. See [Connect Claude](connect-claude)." ],
      sections: [
        { title: "Give Claude the file",
          steps: [
            { text: "Pick the property in the list under the chat." },
            { text: "Click the paperclip (**Attach**) and pick the file. It shows above the message box, with how much was read from it.",
              go: async (h) => { await attach(h, PROP, DOC, ASK); },
              shot: BAR,
              marks: [
                { sel: "#aiAsstAttachBtn", label: "Attach", text: "Opens your computer’s file window. Pick one or more files." },
                { sel: "#aiAsstAttachRow", label: "Attached", text: "The files going with your message. The × on a file removes it." }
              ] },
            { text: "Type what you want done with it, and click **Send**." }
          ],
          note: "Attached files are read on your computer: PDF, Word, Excel, text or pictures. When you send, the file is also saved with the property." },
        { title: "Approve the change",
          steps: [
            { text: "Read the card Claude proposes. Each line shows the value now (crossed out), the new value, and where it came from: the file, the page and a quote.",
              go: async (h) => { await propose(h, PROP, DOC, GARDENS, ASK, "Done — Sample Gardens now has 120 units, 102,000 rentable square feet and year built 1998. I left the manager as it was, as you unticked it."); },
              shot: { sel: "#aiAsstLog [data-asstcard]", nth: -1 },
              marks: [
                { sel: "#aiAsstLog [data-asstrow] .line-through", nth: -1, label: "Old → new", text: "The value now, and the value Claude proposes." },
                { sel: "#aiAsstLog [data-asstrow] > div:nth-child(2)", nth: -1, label: "Where it came from", text: "So you can check it." },
                { sel: "#aiAsstLog .aiAsstLine", nth: -1, label: "Tick box", text: "Only ticked lines are applied." },
                { sel: "#aiAsstLog .aiAsstEditApprove", nth: -1, label: "Approve & apply", text: "Makes the change." }
              ] },
            { text: "Untick any line you don’t want." },
            { text: "Click **Approve & apply**. The card shows what was done (✓), and Claude reports back.",
              go: approve,
              shot: LOG,
              marks: [
                { sel: "#aiAsstLog div.border-t.text-emerald-700", nth: -1, label: "Done", text: "What was applied, and what was left out." },
                { sel: "#aiAsstLog .justify-start > div", nth: -1, label: "Claude’s report", text: "Claude is told exactly what happened." }
              ] }
          ],
          note: "The change is saved in the field’s history as “Assistant, approved by You”. **Cancel** on the card changes nothing, and Claude is told you said no. A card that waits for you is never applied by itself." }
      ],
      next: [
        { page: "use-saved-chats", text: "Come back to this conversation later." },
        { page: "fill-in-the-profile", text: "Check or change the property’s details yourself." },
        { page: "ref-assistant", text: "Every part of the Approve card, named." }
      ] },

    // ==================================================================================================================
    { id: "use-saved-chats", kind: "howto", group: "Assistant", title: "Use saved chats",
      description: "Reopen an earlier conversation, pin, rename or delete it, and keep a long chat quick.",
      intro: "Every conversation is saved on its own, grouped by property. Reopen one to carry on where you left off, or start a new one; the old one stays in **History**.",
      sections: [
        { title: "Reopen a chat",
          steps: [
            { text: "Click **History** at the top of the assistant.",
              go: async (h) => { await open(h); await history(h); } },
            { text: "Find the chat. Type in the search box to look through every saved chat, or look under its property’s name.",
              shot: "#aiAsstHistoryPanel",
              marks: [
                { sel: "#aiAsstHistSearch", label: "Search", text: "Finds words in every saved chat." },
                { sel: "#aiAsstHistList [data-histgroup] > div", nth: 0, label: "Group", text: "The property (or Portfolio) the chats below belong to." },
                { sel: "#aiAsstHistList [data-hopen]", nth: 0, label: "A chat", text: "Its title (your first question), how many messages and when." }
              ] },
            { text: "Click the chat. It opens with its messages and its cards as they ended.",
              go: async (h) => { await h.js(() => { const b = [...document.querySelectorAll("#aiAsstHistList [data-hopen]")].find(x => /Fill in Sample Gardens/.test(x.textContent)) || document.querySelector("#aiAsstHistList [data-hopen]"); if (b) b.click(); }); await h.wait(1200);
                await h.js(() => { const c = [...document.querySelectorAll("#aiAsstLog [data-asstcard-old]")].pop(); if (c){ const l = document.getElementById("aiAsstLog"); l.scrollTop += c.getBoundingClientRect().top - l.getBoundingClientRect().top - 12; } }); await h.wait(300); },
              shot: LOG,
              marks: [
                { sel: "#aiAsstLog [data-asstcard-old]", nth: -1, label: "An old card", text: "What was proposed and what you decided. It can’t be approved again." }
              ] },
            { text: "Type your next message. The conversation carries on from where it ended." }
          ] },
        { title: "Pin, rename or delete a chat",
          steps: [
            { text: "In **History**, point at the chat. Its buttons show.",
              go: async (h) => { await history(h); await hoverFirst(h); },
              shot: "#aiAsstHistList",
              marks: [
                { sel: "#aiAsstHistList [data-hpin] >> xpath=..", nth: 0, label: "Pin, Rename, Delete", text: "The star keeps the chat at the top, the pencil gives it your own title, and the bin deletes it (after asking)." }
              ] },
            { text: "Click the star (**Pin**), the pencil (**Rename**) or the bin (**Delete**).",
              after: async (h) => { await h.js(() => document.getElementById("aiAsstHistBack").click()); await h.wait(500); } }
          ] },
        { title: "Compact a long chat",
          text: "A long conversation gets slower. **Compact** keeps the facts and frees up room.",
          steps: [
            { text: "Click **Compact** at the top of the assistant." },
            { text: "Claude writes a short brief of the conversation, with every property, figure and decision, and carries on from it.",
              go: async (h) => {
                say(h, ["Brief so far: Sample Gardens (example) — 120 units, 102,000 rentable sq ft, built 1998 (applied from the property summary, approved by you). Manager left unchanged at your request. Earlier: five loans mature by October 2028 (K2 Sweetwater senior and mezz, M Lofts, Legacy at Kissimmee, Creekside at Grand Prairie)."]);
                await h.js(() => document.getElementById("aiAsstCompact").click()); await h.wait(800); await idle(h); await h.wait(600);
                await scrollLog(h);
              },
              shot: panel,
              marks: [
                { sel: "#aiAsstCompact", label: "Compact", text: "Summarizes the chat so far." },
                { sel: "#aiAsstLog > div", nth: -1, label: "The brief", text: "What Claude keeps from here on." }
              ] }
          ],
          note: "The full messages stay in the saved chat." },
        { title: "Start a new chat",
          steps: [
            { text: "Click **New chat** at the top of the assistant. The current chat is kept in **History**, and nothing in your loans changes." }
          ] }
      ],
      next: [
        { page: "ask-the-assistant", text: "Ask about your book." },
        { page: "ref-assistant", text: "Every control in the assistant window." }
      ] },

    // ==================================================================================================================
    { id: "ref-assistant", kind: "reference", group: "Reference", title: "The assistant window",
      description: "Every control in the assistant window: the buttons on top, the chat, the property and model pickers, the message box, the Approve card, History and the connection.",
      intro: "Opened by **Assistant** at the bottom right of every tab. Each picture names its controls. Point at a number, on the picture or in the list, to find it.",
      sections: [
        { title: "The window",
          views: [
            { text: "The window takes about 80% of the app window; the app stays as it was underneath (see [Ask the assistant](ask-the-assistant#ask-a-question)). A new chat starts with a few example questions.",
              go: async (h) => { await newChat(h); await h.select("#aiAsstProp", ""); await h.wait(400); },
              shot: panel,
              marks: [
                { sel: "#aiAsstCompact", label: "Compact", text: "Shortens a long chat into a summary that keeps the facts, so Claude stays quick. Your messages stay saved." },
                { sel: "#aiAsstNew", label: "New chat", text: "Starts a fresh conversation. The current one is kept in History; nothing in your loans changes." },
                { sel: "#aiAsstHistoryBtn", label: "History", text: "Your saved conversations: open, search, rename, pin or delete them." },
                { sel: "#aiAsstClose", label: "Close", text: "Closes the window (so does clicking outside it). The chat stays as it is for next time." },
                { sel: "#aiAsstConnRow", label: "Connection", text: "Green: Claude is connected and ready. Amber: it isn’t (see “Connection” below)." },
                { sel: "#aiAsstLog .aiAsstChip", label: "Example question", text: "Click one to ask it straight away." },
                { sel: "#aiAsstProp", label: "Property", text: "Points the chat at one property, or keeps it general. Claude reads that property’s saved files first, and files you attach are saved to it." },
                { sel: "#aiAsstModelPick", label: "Model", text: "Which Claude model answers. “Automatic” lets your subscription choose; the others are the models it offers." },
                { sel: "#aiAsstEffortPick", label: "Effort", text: "How hard Claude thinks: Low is fastest, Max reasons the deepest (a little slower). High is the default." },
                { sel: "#aiAsstAttachBtn", label: "Attach", text: "Adds files to the message: PDF, Word, Excel, text or pictures. They are read on your computer." },
                { sel: "#aiAsstInput", label: "Message", text: "Your question, or what you want done. Enter sends; Shift+Enter starts a new line." },
                { sel: "#aiAsstSend", label: "Send", text: "Sends the message. While Claude works, it turns into Stop." },
                { sel: "#aiAsstSettingsToggle", label: "Connection settings", text: "How the app connects to Claude: your Claude subscription or an API key." }
              ] }
          ] },
        { title: "The chat",
          views: [
            { title: "A question and its answer",
              go: async (h) => {
                await newChat(h);
                say(h, ["Five loans mature in the next 24 months (to October 2028):\n\n• K2 Sweetwater (FIU Residences) — January 2027\n• K2 Sweetwater (Mezz) — January 2027\n• M Lofts — May 2027\n• Legacy at Kissimmee — May 2027\n• Creekside at Grand Prairie — May 2028\n\nReatta Ranch follows in December 2028. Want me to open the refinance for any of them?"]);
                await send(h, "Which loans mature in the next 24 months?");
              },
              shot: panel,
              marks: [
                { sel: "#aiAsstLog .justify-end > div", nth: -1, label: "Your message", text: "What you asked, on the right." },
                { sel: "#aiAsstLog .justify-start > div", nth: -1, label: "Claude’s answer", text: "On the left. Worked out from the app’s own figures; it never makes up a number, and says so when something is missing." },
                { sel: "#aiAsstInput", label: "Follow-up", text: "Ask the next question here; the conversation carries on." }
              ] },
            { title: "Attached files",
              text: "Files attached to a message show above the message box.",
              go: async (h) => { await attach(h, PROP2, DOC2, ASK2); },
              shot: panel,
              marks: [
                { sel: "#aiAsstAttachBtn", label: "Attach", text: "Opens your computer’s file window to pick one or more files." },
                { sel: "#aiAsstAttachRow", label: "Attached", text: "The files going with your message, and how much was read from each. The × on a file removes it." },
                { sel: "#aiAsstPropDocs", label: "Saved files", text: "How many files are already saved with this property. When you send, the attached file is saved to it too.", optional: true },
                { sel: "#aiAsstInput", label: "Message", text: "Say what you want done with the file." }
              ] }
          ] },
        { title: "The Approve card",
          views: [
            { text: "Every change Claude proposes waits on a card like this one. Nothing changes until you approve it.",
              go: async (h) => { await propose(h, PROP2, DOC2, OAKS, ASK2, "Done — Sample Oaks now has 84 units, 71,500 rentable square feet and year built 2004. I left the manager as it was, as you unticked it."); },
              shot: panel,
              marks: [
                { sel: "#aiAsstLog [data-asstcard]", nth: -1, label: "The card", text: "What Claude wants to do, line by line." },
                { sel: "#aiAsstLog .aiAsstLine", nth: -1, label: "Tick box", text: "Only ticked lines are applied; untick one to leave it out." },
                { sel: "#aiAsstLog [data-asstrow] .line-through", nth: -1, label: "Old → new", text: "The value now (crossed out; “none” when empty) and the value Claude proposes." },
                { sel: "#aiAsstLog [data-asstrow] > div:nth-child(2)", nth: -1, label: "Where it came from", text: "The file, page and quote the value was read from, so you can check it." },
                { sel: "#aiAsstLog .aiAsstEditApprove", nth: -1, label: "Approve & apply", text: "Makes the change, saved in the field’s history as “Assistant, approved by You”." },
                { sel: "#aiAsstLog .aiAsstEditCancel", nth: -1, label: "Cancel", text: "Nothing is changed; Claude is told you said no." },
                { sel: "#aiAsstSend", label: "Stop", text: "Claude is waiting for your answer. Stop ends its turn and cancels the card; nothing is changed." }
              ] },
            { title: "After you approve",
              text: "A card is used once. Cards that wait for you are never applied by themselves.",
              go: approve,
              shot: panel,
              marks: [
                { sel: "#aiAsstLog div.border-t.text-emerald-700", nth: -1, label: "Done", text: "The card is closed: it says what was applied (✓) and what was left out. Its buttons are greyed." },
                { sel: "#aiAsstLog .justify-start > div", nth: -1, label: "Claude’s report", text: "Claude is told exactly what happened, and says so." }
              ] }
          ] },
        { title: "History",
          views: [
            { text: "Every saved chat, grouped by property: the property you’re on first, then the portfolio, then the rest. Point at a chat for its buttons.",
              go: async (h) => { await history(h); await hoverFirst(h); },
              shot: panel,
              marks: [
                { sel: "#aiAsstHistSearch", label: "Search", text: "Finds words in every saved chat." },
                { sel: "[data-histmodes]", label: "This property / All", text: "Only this property’s chats, or all of them.", optional: true },
                { sel: "#aiAsstHistBack", label: "Back to chat", text: "Returns to the conversation you were in." },
                { sel: "#aiAsstHistList [data-histgroup] > div", nth: 0, label: "Group", text: "The property (or Portfolio) the chats below belong to." },
                { sel: "#aiAsstHistList [data-hopen]", nth: 0, label: "A chat", text: "Its title (your first question), how many messages and when. Click it to reopen it and carry on." },
                { sel: "#aiAsstHistList [data-hpin] >> xpath=..", nth: 0, label: "Pin, Rename, Delete", text: "Shown while the pointer is on the chat. The star (Pin) keeps it at the top; the pencil (Rename) gives it your own title; the bin (Delete) deletes the conversation (it asks first)." }
              ],
              after: async (h) => { await h.js(() => document.getElementById("aiAsstHistBack").click()); await h.wait(500); } }
          ] },
        { title: "Connection",
          views: [
            { title: "Connection settings",
              text: "**Connection settings**, under the paperclip, opens the Claude connection window: how the app connects to Claude. Signed in to your Claude subscription, nothing else is needed. The same window opens from **Settings**. See [Connect Claude](connect-claude).",
              go: async (h) => { await newChat(h); await h.js(() => document.getElementById("aiAsstSettingsToggle").click()); await h.wait(800);
                await h.page.waitForFunction(() => { const r = document.getElementById("claudeConnRow"); return r && !/Checking/.test(r.textContent); }, null, { timeout: 20000 }).catch(() => {});
                await h.js(() => { const d = document.querySelector("#claudeConnPanel details"); if (d) d.open = true; }); await h.wait(300); },
              shot: "#claudeConnModal > div",
              marks: [
                { sel: "#claudeConnRow", label: "Status", text: "Green: connected, and how. Amber: not connected, and what is missing." },
                { sel: "#claudeSignOut", label: "Sign out", text: "Signs this computer out of your Claude subscription. The assistant stops until you connect again." },
                { sel: "#claudeConnPanel details > summary", label: "Advanced — API key", text: "Opens the API-key choice, for pay-as-you-go use instead of a subscription." },
                { sel: "#claudeKeyInput", label: "Anthropic API key", text: "Paste a key from console.anthropic.com. It is kept only on this computer and never shown again." },
                { sel: "#claudeKeySave", label: "Save", text: "Saves the key and switches the app to use it." },
                { sel: "#claudeConnClose", label: "Close", text: "Closes this window." }
              ],
              after: async (h) => { await h.js(() => { const c = document.getElementById("claudeConnClose"); if (c) c.click(); }); await h.wait(300); } },
            { title: "When Claude isn’t connected",
              text: "The status turns amber, **Send** is greyed out, and the connection choices open inside the chat by themselves.",
              go: async (h) => {
                try { fs.unlinkSync(path.join(h.ctx.UDATA, "claude", "signed-in.marker")); } catch (e) {}
                await h.js(() => document.getElementById("aiAsstClose").click()); await h.wait(300);
                // on a 900-pixel window the status and the connection choices scroll inside themselves; the picture shows
                // them whole in a taller window
                await h.ctx.setSize(h.ctx.W, 1300); await h.wait(500);
                await open(h); await h.wait(500);
                await h.page.waitForSelector("#claudeSignInAsst", { timeout: 15000 });
                // the stand-in Claude names itself in the version note; the real app shows the built-in client's version
                await h.js(() => { document.querySelectorAll("#aiAsstSettings span").forEach(e => { if (e.children.length === 0 && /fake Claude Code/.test(e.textContent)) e.textContent = e.textContent.replace(/\s*·\s*0\.0\.0 \(fake Claude Code for tests\)/, ""); }); });
              },
              shot: panel,
              marks: [
                { sel: "#aiAsstConnRow", label: "Not connected", text: "What is missing, in plain words." },
                { sel: "#claudeSignInAsst", label: "Connect with your Claude subscription", text: "Opens a small sign-in window that takes you to your browser. When you finish, the status turns green." },
                { sel: '#aiAsstSettings input[name="aiAsstMode"]', nth: 0, label: "Automatic", text: "Uses your Claude subscription, and an API key if one is saved (recommended)." },
                { sel: '#aiAsstSettings input[name="aiAsstMode"]', nth: 1, label: "Claude subscription", text: "Only the subscription: no API key, no per-use billing." },
                { sel: '#aiAsstSettings input[name="aiAsstMode"]', nth: 2, label: "Anthropic API key", text: "Only an API key: pay as you go." },
                { sel: "#aiAsstKeyInput", label: "API key", text: "Paste a key here. It is kept only on this computer and never shown again." },
                { sel: "#aiAsstKeySave", label: "Save", text: "Saves the key; the status checks again." },
                { sel: "#aiAsstSend", label: "Send (greyed)", text: "Waits until Claude is connected, so a message is never lost." }
              ],
              after: async (h) => { fs.writeFileSync(path.join(h.ctx.UDATA, "claude", "signed-in.marker"), "ok"); await h.ctx.setSize(h.ctx.W, h.ctx.H); await h.wait(400); } }
          ] }
      ] }
  ]
};
