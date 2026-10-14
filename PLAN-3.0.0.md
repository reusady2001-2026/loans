# 3.0.0 — One shared database: the plan

*Written 2026-10-13 from the operator's answers. Status: shipped 2026-10-14.*

**Progress (2026-10-13):** A–F built and tested against a real PostgreSQL with a stand-in for Supabase's web API
(unit: rules 80, merge 25, sync 51; e2e: the real app, three people on three computers). G (version, docs, the
check list) waits on the real Supabase project — see `SUPABASE-SETUP.md`.

---

## 1. The operator's rules

1. **Groups.** The company that maintains the app (the *maintainer*) creates a group and names its admin.
   **Joining (the operator, 2026-10-13):** a person opens the app → Create an account → types the organization's name
   (after 3 letters, up to 5 names that start with it appear to pick from — not a dropdown) → full name, email,
   password → Sign up → waits. The group's admin gets a pop-up in the app **and** an email, and approves or turns it
   down in either. Approved: the person gets an email to confirm their address, then joins as an editor (the admin
   can change anyone's status in Members and codes). Turned down: an email says so. The admin never types an email
   or makes an account. The confirmation link ends on a page "your email is confirmed — go back to the app".
2. **People in a group.** One admin. Everyone else is an **editor** or **view-only**; the admin decides who is which.
   Every member sees everything in the group — nothing in the app is hidden from a member.
3. **Groups are separate.** Nobody sees another group's data.
4. **A typed reason on every change.** The record keeps who, when, why and what (old → new).
5. **Two people change the same thing.** Between members, the later save wins. A thing the **admin** changed can be
   changed by a member only with the admin's approval: typed on the spot, or by a request that pops up for the admin
   the moment the admin opens the app.
6. **Chats.** Everyone in the group can read every chat, tagged with who wrote it. Only the person who started a chat
   can keep talking in it.
7. **Offline.** The app keeps a picture of the group's data and refreshes it live. Offline, the last picture is the
   current data until the connection is back. Offline is **view-only** — except for the admin, with an offline code
   only the admin has.
8. **Opening the app.** It always opens on the Portfolio dashboard. Nothing unsaved is kept; no window reopens.
9. **First data.** The operator's PC holds the first shared copy. Later groups start empty and their admin brings the
   starting data.
10. **Many users.** No small limit on the number of people.
11. **Daily backup.**
12. **The files already on each computer are left untouched.**
13. **Hosting: Supabase.**

## 2. Decisions made in the plan (the operator can change any of them)

- **Approving on the spot uses an approval code, not the admin's sign-in password.** A sign-in password typed on
  members' screens would let anyone who learns it sign in as the admin. The change is recorded as
  "made by B, approved by the admin". *(Raised before; not answered.)*
- **The admin's offline changes win** when they go up after reconnecting; anything they overwrite stays in the record.
- **One reason per save.** Changing five fields of a loan and saving asks once.
- **A change waiting for approval doesn't take effect.** The old value stays in use, marked "waiting for approval";
  the person who asked sees the answer when the admin decides.
- **The assistant follows the rules of the person using it.** For a view-only person it answers but changes nothing;
  for an editor its changes need a reason and, where the admin made the last change, the admin's approval.
- **Chats are not changes** — no reason is asked to talk to the assistant.
- **One person belongs to one group.**
- **The maintainer manages groups and admins**, not a group's data.
- **Email is proven before anyone gets in.** The confirmation email goes out only after the admin approves; nobody
  signs in with an email they haven't confirmed.
- **The emails go through the app's own Gmail account** (the Gmail API, permission to send only), from a small
  function on Supabase (`supabase/functions/lds-join`). The admin's email buttons open a web page on the app's GitHub
  Pages site that asks for one more click: email scanners open links by themselves, and a link that approved on
  opening would let a scanner approve anyone.
- **Asking to join never changes an existing account's password.** If the email already has an account, the
  password typed must be its password (or use "Forgot your password?"); otherwise anyone could take over an account
  by asking to join with its email.
- **At most 20 requests wait per group**, and one per email, so nobody can flood an admin's mailbox.
- **Live refresh = the app asks the server "anything new?" every few seconds.** Supabase's own library needs a newer
  Electron than the app runs (it requires Node 22; the app's Electron has Node 20), so the app talks to Supabase
  through a small client of its own.
- **Removing a document takes it off the property's list** (a change, with its reason). The stored file itself stays,
  so a backup can bring it back; only the admin deletes stored files.
- **An app older than the newest one in the group doesn't send automatic work**, so two versions of the app can't
  keep recomputing the same numbers back and forth.
- **The admin's own changes lock what they changed — the starting data and automatic work don't.** Otherwise the
  first upload would make every field the admin's, and every member's change would need approval.
- **Pooled loans stay inside their loan.** The "Also secures" list and the releases are tracked change by change like
  every other field, so they don't need tables of their own.

## 3. How it works

- **The server (Supabase)** holds the database and the files. Every rule — groups, roles, reasons, the admin's lock,
  approvals, chat ownership — is checked **on the server**, not only in the app, so an old or changed copy of the app
  can't get around it.
- **Each computer keeps a picture** of its group's data in its own folder, laid out the way the app keeps data today.
  The screens keep reading it as they do now. The old local data stays where it is, untouched.
- **Saving.** A change goes into a **pending bar**: what changed, and a box for the reason. Save sends it to the
  server; Undo drops it. Nobody else sees a change until it is saved.
- **Two people at once.** The app sends what the person changed, not the whole file, so two people changing different
  things never undo each other. On the same thing, the later save wins — unless the admin made the last change.
- **Live.** Every few seconds the app asks the server for anything new since the last answer and updates the picture
  and the screen.
- **Offline.** A banner: "Offline — view only — data as of <time>". Saving is off; the assistant is off (it needs the
  internet). The admin can enter the offline code to keep changing; those changes wait and go up on reconnect.

## 4. What moves to the server

From a map of every place the app keeps data today (2.9.17):

| Kept today, on each computer | In 3.0.0 |
|---|---|
| `loans.json` — every loan | One shared record. Each loan is followed by its id, field by field, so two people changing two loans never collide. |
| Each property's `profile.json`, `assumptions.json`, `general-data.json` (NOIs, T12 readings and reviews, file parts, what to push) and `history.json` | One shared record each. |
| Each property's documents (the originals and the text read from them) and their list | The files go to storage; the list is a shared record. |
| Chats | Shared, each with who started it. |
| Portfolio targets, custom T12 categories, "not a duplicate" pairs (kept in the window's browser settings today) | One shared settings record. |

**Stays on each computer:** the rates fetched from the web, the OCR cache, the reading queue, the logs, the
Underwriting tab's working copy, the AI settings and Claude sign-in, the local backups.

**What the map showed, and what 3.0.0 does about it:**
- About 42 places on the screens and 33 assistant actions save data, but they all go through about 8 writers in the
  app. The shared database hooks in at those 8 writers, so every save point is covered without changing each one.
- About 15 places write with no click: start-up checks, recomputing after an update, T12 re-reads, repricing a
  floating rate. They need no reason; they are stamped "the app, on <person>'s computer". A view-only person's
  app, an offline app, and an app older than the newest one in the group don't send them.
- Automatic saves that differ only in a time stamp (general data stamps `updatedAt` on every save) count as no
  change, so opening the app doesn't flood the change record.
- Chats have no author today; 3.0.0 adds who started each one.
- Today every change history says "You"; 3.0.0 writes the person's name.
- Renaming a property moves its files and chats today; in 3.0.0 the move is a change like any other.
- The app's own records are saved under a new file name each time; the shared copy follows them by what they are
  (profile, assumptions, …), not by file name.

## 4b. How the picture is kept on each computer

- `userData/cloud/<group>/data/` — the picture: laid out exactly like today's data, so every screen reads it as now.
- `userData/cloud/<group>/server/` — the server's copy of each record, the base that unsaved changes are measured
  from. On opening, the picture is rebuilt from it, so nothing unsaved survives a restart.
- Today's data (`loans.json`, `documents/`, `chats/` in `userData`) is never touched. The first upload only reads it.

## 5. The parts

| Part | What it builds | How it is tested |
|---|---|---|
| **A** | The server: groups, members and roles, maintainers, the records, the change record (who / when / why / old → new), the admin's lock, approval requests, chats, file rules, the daily backup. One SQL file for Supabase. A local test bed: a real PostgreSQL and a stand-in for Supabase's sign-in, functions and file storage. | Every rule on the real database: a group can't read another group; a viewer can't write; no reason, no save; the admin's lock; the approval code; a request and its answer; only a chat's owner continues it; the daily backup. |
| **B** | Sign-in. The picture per group, live refresh, offline detection and the offline banner. | The app against the test bed: sign in, data appears; a change made elsewhere shows up; the server stops → offline banner, last picture shown, saving off. |
| **C** | Saving with a reason: the pending bar, sending only what changed, later save wins, view-only for viewers and offline, automatic app work stamped as the app. | Two app windows as two people: different fields both kept; same field, later wins; a viewer can't change anything; no reason, nothing saved. |
| **D** | The admin: members (status, remove; people join by asking — the admin approves in the app or by email), the approval code, approval requests popping up for the admin, the answer back to the requester, the offline code. | A member changes what the admin changed → asked for the code or a request; the admin opens the app → the request pops up; offline admin changes go up on reconnect. |
| **E** | Shared chats (owner can continue, others read) and shared files (documents and the text read from them). | Person B sees A's chat but can't type in it; a file A uploads opens on B's computer. |
| **F** | The maintainer screen (create a group, name its admin), the first upload (this computer's data → a group's starting copy, local files untouched), the daily backup, a change-history screen (who / when / why). | Create a group, upload the starting data, compare every number with the local app; the history lists each change with its reason. |
| **G** | Version 3.0.0, the reference doc, the full test suite, the draft PR — **not merged**. The check list part for the real installed app needs the real Supabase project. | Full unit + e2e suite. |

## 5b. Testing on the real project (the operator, 2026-10-14)
The operator is the only tester and uses one computer; no other person or computer is used for testing. Offline and
two computers at once are therefore not tested on the real project (they are covered by the automatic tests only).

## 6. What the operator will need to do later (not now)

- **Create the Supabase project** and send its address and its public key (the "anon" key — it is meant to be in the
  app). Never send the "service_role" key.
- **Run the setup SQL** in Supabase's SQL editor (step-by-step instructions come with it).
- **Email:** Gmail for Supabase's own emails (the password code) and the Gmail API for the joining emails, and the
  joining function — step by step in `SUPABASE-SETUP.md`.
- **Add the maintainer** (one line in the SQL editor, with the maintainer's email).

## 7. Not in 3.0.0

- Yardi ingestion (after 3.0.0).
- Cleaning up old code (at the final version, before a public release).
- Code signing, installer size, combining separate phase files (by design for now).
