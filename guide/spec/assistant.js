/* Guide chapter: the Assistant (Claude) — the chat window, asking, focusing on a property, Approve cards, attaching a
   document, saved chats, Compact / New chat, and the connection settings.
   Claude is the scripted stand-in (test/fixtures/fake-claude-push.js): every reply in these pictures is a made-up
   example written here, read from the chat file the stand-in answers from. The property is a made-up one. */
"use strict";
const path = require("path"), fs = require("fs");
const PROP = "Sample Gardens (example)";
const DOC = "Sample Gardens property summary.txt";
const act = (o) => "```action\n" + JSON.stringify(o) + "\n```";
// the stand-in's next replies, in order
const say = (h, list) => fs.writeFileSync(path.join(h.ctx.UDATA, "chat.json"), JSON.stringify(list));
const panel = "#aiAsstModal > div";
const idle = (h) => h.page.waitForFunction(() => { const b = document.getElementById("aiAsstSend"); return b && /Send/.test(b.textContent) && !b.disabled; }, null, { timeout: 30000 }).catch(() => {});
const send = async (h, q) => { await h.js((t) => { const i = document.getElementById("aiAsstInput"); i.value = t; document.getElementById("aiAsstSend").click(); }, q); await h.wait(500); await idle(h); await h.wait(500); };
const typeOnly = async (h, q) => { await h.js((t) => { const i = document.getElementById("aiAsstInput"); i.value = t; i.dispatchEvent(new Event("input", { bubbles: true })); }, q); await h.wait(200); };
const showFab = async (h) => { await h.js(() => { window.__guideShowFab = true; const s = document.getElementById("guideCalm"); if (s) s.remove(); }); await h.calm(); };
const open = async (h) => { await h.js(() => { const m = document.getElementById("aiAsstModal"); if (!m || m.classList.contains("hidden")) document.getElementById("aiAsstFab").click(); }); await h.wait(600);
  await h.page.waitForFunction(() => { const r = document.getElementById("aiAsstConnRow"); return r && !/Checking/.test(r.textContent); }, null, { timeout: 20000 }).catch(() => {}); await h.wait(300); };
const newChat = async (h) => { await open(h); await h.js(() => document.getElementById("aiAsstNew").click()); await h.wait(500); };

module.exports = {
  id: "assistant",
  title: "The Assistant (Claude)",
  intro: "Ask Claude about your loans and properties, or ask it to do things in the app. It reads your data and the files you give it, and every change it proposes waits on a card for your Approve.",
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
    await h.js((n) => window.LDS_addProperty(n), PROP);
    await h.wait(800);
    await showFab(h);
  },
  topics: [
    { id: "open", title: "Open the assistant", intro: "The Assistant button sits at the bottom right of every screen.",
      steps: [
        { title: "The Assistant button", text: "Click Assistant (bottom right) on any screen. The chat opens over the app; whatever you were doing stays as it was underneath.",
          go: async (h) => { await h.home(); await showFab(h); await h.top(); },
          shot: "view", cover: true,
          marks: [ { sel: "#aiAsstFab", label: "Assistant", text: "Opens the chat with Claude." } ] },
        { title: "The chat window", text: "A new chat starts with a few example questions. Everything you need is on this one window: what to ask about, the question box, and the buttons on top.",
          go: async (h) => { await open(h); },
          shot: panel,
          marks: [
            { sel: "#aiAsstCompact", label: "Compact", text: "Shortens a long chat into a summary that keeps the facts, so Claude stays quick. Your messages stay saved." },
            { sel: "#aiAsstNew", label: "New chat", text: "Starts a fresh conversation. The current one is kept in History; nothing in your loans changes." },
            { sel: "#aiAsstHistoryBtn", label: "History", text: "Your saved conversations — open, search, rename, pin or delete them." },
            { sel: "#aiAsstClose", label: "Close", text: "Closes the window. The chat stays as it is for next time." },
            { sel: "#aiAsstConnRow", label: "Connection", text: "Green: Claude is connected and ready. Amber: it isn’t — see “Connection settings” below." },
            { sel: "#aiAsstLog .aiAsstChip", label: "Example question", text: "Click one to ask it straight away." },
            { sel: "#aiAsstProp", label: "Property", text: "Point the chat at one property (or keep it general). Claude reads that property’s saved files first, and files you attach are saved to it." },
            { sel: "#aiAsstModelPick", label: "Model", text: "Which Claude model answers. “Automatic” lets your subscription choose; the others are the models it offers." },
            { sel: "#aiAsstEffortPick", label: "Effort", text: "How hard Claude thinks: Low is fastest, Max reasons the deepest (a little slower). High is the default." },
            { sel: "#aiAsstAttachBtn", label: "Attach", text: "Adds files to the message — PDF, Word, Excel, text or pictures. They are read on your computer." },
            { sel: "#aiAsstInput", label: "Message", text: "Type your question or what you want done. Enter sends; Shift+Enter starts a new line." },
            { sel: "#aiAsstSend", label: "Send", text: "Sends the message. While Claude works this button turns into Stop." },
            { sel: "#aiAsstSettingsToggle", label: "Connection settings", text: "How the app connects to Claude: your Claude subscription or an API key." }
          ] }
      ] },
    { id: "ask", title: "Ask a question", intro: "Claude answers from your own loans and properties — the same figures the app shows.",
      steps: [
        { title: "Type the question", text: "Type in the message box at the bottom, then click Send (or press Enter).",
          go: async (h) => { await newChat(h); await typeOnly(h, "Which loans mature in the next 24 months?"); },
          shot: panel,
          marks: [
            { sel: "#aiAsstInput", label: "Your question", text: "Plain words are fine — name a property, a lender or a date." },
            { sel: "#aiAsstSend", label: "Send", text: "Sends it to Claude." }
          ] },
        { title: "The answer", text: "Your question shows on the right, Claude’s answer on the left. Ask a follow-up in the same box — the chat remembers what was said.",
          go: async (h) => {
            say(h, ["Five loans mature in the next 24 months (to October 2028):\n\n• K2 Sweetwater (FIU Residences) — January 2027\n• K2 Sweetwater (Mezz) — January 2027\n• M Lofts — May 2027\n• Legacy at Kissimmee — May 2027\n• Creekside at Grand Prairie — May 2028\n\nReatta Ranch follows in December 2028. Want me to open the refinance for any of them?"]);
            await send(h, "Which loans mature in the next 24 months?");
          },
          shot: panel,
          marks: [
            { sel: "#aiAsstLog .justify-end > div", nth: -1, label: "Your message", text: "What you asked." },
            { sel: "#aiAsstLog .justify-start > div", nth: -1, label: "Claude’s answer", text: "Worked out from the app’s own figures. It never makes up a number — when something is missing it says so." },
            { sel: "#aiAsstInput", label: "Follow-up", text: "Ask the next question here; the conversation carries on." }
          ] }
      ] },
    { id: "focus", title: "Focus on a property", intro: "Pick a property and the chat is about it: Claude reads its saved documents first, and what you attach is saved to it.",
      steps: [
        { title: "Pick the property", text: "Choose a property in the list under the chat. “No property — general chat” is for the whole portfolio. A chat started on a property is saved with that property.",
          go: async (h) => { await newChat(h); await h.select("#aiAsstProp", { label: PROP }); await h.wait(500); },
          shot: panel,
          marks: [
            { sel: "#aiAsstProp", label: "Property", text: "The property this chat is about. Opening the assistant from a loan’s page picks that loan’s property for a new chat." },
            { sel: "#aiAsstPropDocs", label: "Its documents", text: "How many of the property’s saved documents Claude can read.", optional: true }
          ] }
      ] },
    { id: "approve", title: "Ask it to do something — the Approve card", intro: "Claude can add properties, fill in details, edit loans, import files, run a refinance and more — but nothing changes until you approve its card.",
      steps: [
        { title: "Attach a document", text: "Click the paperclip and pick the file (here a made-up property summary). It shows above the message box; it is read on your computer and sent with your message.",
          go: async (h) => { await newChat(h); await h.select("#aiAsstProp", { label: PROP }); await h.page.setInputFiles("#aiAsstFile", path.join(h.ctx.UDATA, DOC)); await h.wait(1200);
            await typeOnly(h, "Fill in Sample Gardens’ details from the attached summary."); },
          shot: panel,
          marks: [
            { sel: "#aiAsstAttachBtn", label: "Attach", text: "Opens your computer’s file window to pick one or more files." },
            { sel: "#aiAsstAttachRow", label: "Attached", text: "The files going with your message, and how much was read from each. The × on a file removes it." },
            { sel: "#aiAsstPropDocs", label: "Saved files", text: "How many files are already saved with this property. When you send, the attached file is saved to it too.", optional: true },
            { sel: "#aiAsstInput", label: "What to do", text: "Say what you want done with the file." }
          ] },
        { title: "The Approve card", text: "Claude proposes the change on a card: each line shows the old value, the new one and where it came from (file, page, quote). Untick a line to leave it out.",
          go: async (h) => {
            say(h, [
              "The summary gives four of Sample Gardens’ details. Here they are for your approval:\n" + act({ action: "propose_profile_change", args: { name: PROP,
                changes: { residentialUnits: 120, rentableSqFt: 102000, yearBuilt: 1998, manager: "Harbor Property Management" },
                sources: { residentialUnits: { file: DOC, page: 1, quote: "120 apartment homes" }, rentableSqFt: { file: DOC, page: 1, quote: "102,000 rentable square feet" },
                  yearBuilt: { file: DOC, page: 1, quote: "Built in 1998" }, manager: { file: DOC, page: 1, quote: "Managed by Harbor Property Management" } } } }),
              "Done — Sample Gardens now has 120 units, 102,000 rentable square feet and year built 1998. I left the manager as it was, as you unticked it."
            ]);
            await h.js(() => { const i = document.getElementById("aiAsstInput"); i.value = ""; });
            await h.js(() => { const i = document.getElementById("aiAsstInput"); i.value = "Fill in Sample Gardens’ details from the attached summary."; document.getElementById("aiAsstSend").click(); });
            await h.page.waitForFunction(() => document.querySelectorAll("#aiAsstLog .aiAsstEditApprove:not(:disabled)").length > 0, null, { timeout: 30000 });
            await h.wait(600);
            await h.js(() => { const c = [...document.querySelectorAll("#aiAsstLog [data-asstcard]")].pop(); if (c) c.scrollIntoView({ block: "center" }); });
          },
          shot: panel,
          marks: [
            { sel: "#aiAsstLog [data-asstcard]", nth: -1, label: "The card", text: "What Claude wants to do, line by line." },
            { sel: "#aiAsstLog .aiAsstLine", nth: -1, label: "Tick box", text: "Only ticked lines are applied — untick one to leave it out." },
            { sel: "#aiAsstLog [data-asstrow] .line-through", nth: -1, label: "Old → new", text: "The value now (crossed out; “none” when empty) and the value Claude proposes." },
            { sel: "#aiAsstLog [data-asstrow] > div:nth-child(2)", nth: -1, label: "Where it came from", text: "The file, page and quote the value was read from, so you can check it." },
            { sel: "#aiAsstLog .aiAsstEditApprove", nth: -1, label: "Approve & apply", text: "Makes the change, saved in the field’s history as “Assistant, approved by You”." },
            { sel: "#aiAsstLog .aiAsstEditCancel", nth: -1, label: "Cancel", text: "Nothing is changed; Claude is told you said no." },
            { sel: "#aiAsstSend", label: "Stop", text: "Claude is waiting for your answer. Stop ends its turn and cancels the card — nothing is changed." }
          ] },
        { title: "Approved — and what happened", text: "After Approve the card shows what was done (✓) and Claude reports back. Cards that wait for you are never applied by themselves; Stop cancels a waiting card.",
          go: async (h) => {
            await h.js(() => { const ls = [...document.querySelectorAll("#aiAsstLog .aiAsstLine")]; const m = ls.find(x => x.getAttribute("data-asstline") === "manager"); if (m && m.checked) m.click(); });
            await h.wait(200);
            await h.js(() => { const b = [...document.querySelectorAll("#aiAsstLog .aiAsstEditApprove:not(:disabled)")].pop(); if (b) b.click(); });
            await h.wait(800); await idle(h); await h.wait(600);
            await h.js(() => { const l = document.getElementById("aiAsstLog"); l.scrollTop = l.scrollHeight; });
          },
          shot: panel,
          marks: [
            { sel: "#aiAsstLog div.border-t.text-emerald-700", nth: -1, label: "Done", text: "The card is closed: it says what was applied (✓) and what was left out. Its buttons are greyed — a card is used once." },
            { sel: "#aiAsstLog .justify-start > div", nth: -1, label: "Claude’s report", text: "Claude is told exactly what happened and says so." }
          ] }
      ] },
    { id: "history", title: "Saved chats (History)", intro: "Every conversation is saved on its own, grouped by property — reopen one to carry on.",
      steps: [
        { title: "The list", text: "History lists every saved chat, grouped by property (the property you’re on first, then the portfolio, then the rest). Hover a chat for its buttons.",
          go: async (h) => { await h.js(() => document.getElementById("aiAsstHistoryBtn").click()); await h.wait(1200); await h.hover("#aiAsstHistList .aiAsstHistItem", 0);
            // the buttons show while the pointer is on a chat (as here)
            await h.js(() => { const g = document.querySelector("#aiAsstHistList .aiAsstHistItem [data-hpin]"); if (g) g.parentElement.style.opacity = "1"; }); },
          shot: panel,
          marks: [
            { sel: "#aiAsstHistSearch", label: "Search", text: "Finds words in every saved chat." },
            { sel: "[data-histmodes]", label: "This property / All", text: "Only this property’s chats, or all of them.", optional: true },
            { sel: "#aiAsstHistBack", label: "Back to chat", text: "Returns to the conversation you were in." },
            { sel: "#aiAsstHistList [data-histgroup] > div", nth: 0, label: "Group", text: "The property (or Portfolio) the chats below belong to." },
            { sel: "#aiAsstHistList [data-hopen]", nth: 0, label: "A chat", text: "Its title (your first question), how many messages and when. Click it to reopen and carry on." },
            { sel: "#aiAsstHistList [data-hpin]", nth: 0, label: "Pin", text: "Keeps it at the top." },
            { sel: "#aiAsstHistList [data-hren]", nth: 0, label: "Rename", text: "Gives it your own title." },
            { sel: "#aiAsstHistList [data-hdel]", nth: 0, label: "Delete", text: "Deletes the conversation (it asks first)." }
          ] },
        { title: "Reopened", text: "A reopened chat shows its messages and its cards as they ended (read only — an old card can’t be approved again). Type to carry on where you left off.",
          go: async (h) => { await h.js(() => { const b = [...document.querySelectorAll("#aiAsstHistList [data-hopen]")].find(x => /Fill in Sample Gardens/.test(x.textContent)) || document.querySelector("#aiAsstHistList [data-hopen]"); if (b) b.click(); }); await h.wait(1200);
            await h.js(() => { const c = [...document.querySelectorAll("#aiAsstLog [data-asstcard-old]")].pop(); if (c){ const l = document.getElementById("aiAsstLog"); l.scrollTop += c.getBoundingClientRect().top - l.getBoundingClientRect().top - 12; } }); await h.wait(300); },
          shot: panel,
          marks: [
            { sel: "#aiAsstLog [data-asstcard-old]", nth: -1, label: "An old card", text: "What was proposed and what you decided." },
            { sel: "#aiAsstInput", label: "Carry on", text: "Your next message continues this conversation." }
          ] }
      ] },
    { id: "compact", title: "Compact a long chat", intro: "A long conversation gets slower. Compact keeps the facts and frees up room.",
      steps: [
        { title: "Compacted", text: "Click Compact: Claude writes a short brief of the conversation (every property, figure and decision) and carries on from it. The full messages stay in the saved chat.",
          go: async (h) => {
            say(h, ["Brief so far: Sample Gardens (example) — 120 units, 102,000 rentable sq ft, built 1998 (applied from the property summary, approved by you). Manager left unchanged at your request. Earlier: five loans mature by October 2028 (K2 Sweetwater senior and mezz, M Lofts, Legacy at Kissimmee, Creekside at Grand Prairie)."]);
            await h.js(() => document.getElementById("aiAsstCompact").click()); await h.wait(800); await idle(h); await h.wait(600);
            await h.js(() => { const l = document.getElementById("aiAsstLog"); l.scrollTop = l.scrollHeight; });
          },
          shot: panel,
          marks: [
            { sel: "#aiAsstCompact", label: "Compact", text: "Summarizes the chat so far." },
            { sel: "#aiAsstLog > div", nth: -1, label: "The brief", text: "What Claude keeps from here on." }
          ] }
      ] },
    { id: "connection", title: "Connection settings", intro: "How the app reaches Claude: your Claude subscription (recommended) or an Anthropic API key.",
      steps: [
        { title: "Connected", text: "Click “Connection settings” under the Attach button. The Claude connection window shows how the app connects; signed in to your Claude subscription, nothing else is needed. (The same window opens from Settings → Claude connection.)",
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
        { title: "When Claude isn’t connected", text: "If Claude isn’t connected the status turns amber, Send is greyed out and the connection choices open inside the chat by themselves.",
          go: async (h) => {
            try { fs.unlinkSync(path.join(h.ctx.UDATA, "claude", "signed-in.marker")); } catch (e) {}
            await h.js(() => document.getElementById("aiAsstClose").click()); await h.wait(300);
            // the open settings make the chat taller than a 900-pixel window (its message box falls off the bottom), so
            // this picture is taken in a taller window
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
            { sel: '#aiAsstSettings input[name="aiAsstMode"]', nth: 1, label: "Claude subscription", text: "Only the subscription — no API key, no per-use billing." },
            { sel: '#aiAsstSettings input[name="aiAsstMode"]', nth: 2, label: "Anthropic API key", text: "Only an API key — pay as you go." },
            { sel: "#aiAsstKeyInput", label: "API key", text: "Paste a key here. It is kept only on this computer and never shown again." },
            { sel: "#aiAsstKeySave", label: "Save", text: "Saves the key; the status re-checks." },
            { sel: "#aiAsstSend", label: "Send (greyed)", text: "Waits until Claude is connected, so a message is never lost." }
          ],
          after: async (h) => { fs.writeFileSync(path.join(h.ctx.UDATA, "claude", "signed-in.marker"), "ok"); await h.ctx.setSize(h.ctx.W, h.ctx.H); await h.wait(400); } }
      ] }
  ]
};
