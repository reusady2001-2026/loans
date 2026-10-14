# Setting up the shared database (3.0.0)

What to do once, in Supabase (and Google), before the app can use the shared database. Until then the app keeps
working on each computer's own data, exactly like 2.9.17.

Never send or paste anywhere: Supabase's **secret / service_role** key, the Gmail **app password**, the Google
**Client ID**, **Client secret** and **refresh token**. They go only into Supabase's own settings, below.

## 1. Create the project
1. Sign in to **supabase.com** → **New project**. Pick a region near the team (for a US team: East US).
2. Wait until it says the project is ready.
3. **Project Settings → API**: the **Project URL** and the **publishable** (anon) key go into the app
   (`cloud-config.json`). They are meant to be inside the app.

## 2. Run the setup
1. **SQL Editor → New query**, paste the whole of `supabase/setup.sql`, **Run**. It creates the tables, the rules
   and the file storage. Running it again later is safe (an update only adds what is missing). Once step 9 is done,
   **every release runs it by itself** — nothing to paste again.
2. **Database → Extensions**: turn on **pg_cron**, then run `setup.sql` once more — that schedules the daily backup
   (03:00 UTC, kept 30 days).

## 3. The maintainer
1. In the SQL Editor, with your own email:
   ```sql
   insert into app.maintainers(email) values ('you@company.com');
   ```
2. The maintainer's own account (the maintainer isn't in a group, so nobody approves it):
   **Authentication → Users → Add user → Create new user**: the same email, a password, tick **Auto Confirm User**.

## 4. Sign-in emails (Supabase's own: the code for a forgotten password)
1. **Authentication → Emails → SMTP Settings**: the app's Gmail account (smtp.gmail.com, port 587, the Gmail
   address, its app password).
2. **Authentication → Emails → Templates → Reset Password**: the code in the email, e.g.
   `Your code to set a new password: {{ .Token }}` (the app asks for that 6-digit code).
3. **Authentication → Sign In / Providers → Allow new users to sign up: OFF.** People join only through the app's
   "Create an account", which asks the group's admin; with this on, anyone could make an account (it would get them
   into nothing, but each one sends an email from the app's Gmail).

## 5. Gmail for the joining emails (Google Cloud)
The joining emails (to the admin, to the person approved or turned down) are sent by the function in step 6 through
the Gmail API — Supabase's functions can't use Gmail's SMTP.
1. A Google Cloud project with the **Gmail API** turned on.
2. **OAuth consent screen**: External, **published (In production)** — in "Testing", the refresh token stops working
   after 7 days. Its home page and privacy policy are the app's GitHub Pages site (`docs/index.html`,
   `docs/privacy.html`).
3. An **OAuth client** (Web application) with the redirect `https://developers.google.com/oauthplayground`.
4. In the OAuth Playground (with "Use your own OAuth credentials" ticked), signed in as the app's Gmail account,
   the scope `https://www.googleapis.com/auth/gmail.send` → **Exchange authorization code for tokens** → the
   **refresh token**.

## 6. The joining function
1. **Edge Functions → Deploy a new function → Via Editor**. Name it exactly **`lds-join`**. Delete the sample code,
   paste the whole of `supabase/functions/lds-join/index.ts`, **Deploy function**.
2. On the function's page, turn **Verify JWT** **off** (it may read "Verify JWT with legacy secret") and save. A
   person asking to join has no account yet, and the email's buttons open a web page — with it on, both are refused
   ("401 Invalid JWT"). The function checks every request itself. **Check it is still off after every redeploy.**
3. **Edge Functions → Secrets → Add new secrets**, then **Save**:

   | Key | Value |
   |---|---|
   | `GMAIL_CLIENT_ID` | the OAuth client's Client ID |
   | `GMAIL_CLIENT_SECRET` | the OAuth client's Client secret |
   | `GMAIL_REFRESH_TOKEN` | the refresh token from step 5.4 |
   | `GMAIL_SENDER` | the app's Gmail address |

   Supabase gives the function the project's address and its own key by itself — nothing else to add.
4. The email buttons open `decide.html` and `confirm.html` on the app's GitHub Pages site (from the `docs/` folder);
   `docs/config.js` holds the function's address and the publishable key.

## 7. Files
**Storage → Settings**: the largest file allowed — **50 MB** on the free plan (its most). A bigger document still
goes up: the app stores it in pieces under that size and joins them when it is opened. The free plan holds about
1 GB of files in all; the upload pop-up shows how much this computer's data is before it starts.

## 8. The first group
1. The app (the version with the project's address in it) → sign in with the maintainer's account → **Groups** →
   the group's name, its admin's email and full name → **Create**.
   (Or in the SQL Editor: `select app.make_group('Company name', 'admin@company.com', 'Admin''s full name');`)
2. The admin opens the app → **Create an account** → types the group's first 3 letters → picks it → full name, the
   same email, a password → **Sign up**. Being named by the maintainer, no approval is needed: an email comes with
   **Confirm my email**; its page says the email is confirmed; back in the app, **Sign in**.
3. The group is empty: **Upload this computer's data** makes this computer's loans, properties, documents and chats
   the group's starting data. Nothing on this computer changes.
4. **Account → Members and codes**: set the approval and offline codes.
5. Everyone else: **Create an account** → the organization → name, email, password → **Sign up**. The admin gets a
   pop-up in the app and an email, and approves or turns it down in either. Approved: the person confirms the email
   from the link they get, and signs in as an editor (the admin can make anyone view only in Members and codes).

## 9. Updates run by themselves (once)
Every release of the app also brings the shared database up to date: GitHub runs `supabase/setup.sql` on the project
(`.github/workflows/supabase-setup.yml`), in one go — all of it or none of it. It needs one thing, once:
1. **Supabase** → the project → the **Connect** button at the top → **Session pooler** (the one that works from
   GitHub) → copy the connection string. It looks like
   `postgresql://postgres.<project ref>:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`.
2. Put the **database password** in place of `[YOUR-PASSWORD]` (the one chosen when the project was made; if it's
   lost: **Project Settings → Database → Reset database password** — the app and the joining function don't use it).
3. **GitHub** → the repository → **Settings → Environments → New environment**, name **`supabase`** →
   **Configure environment**.
4. **Deployment branches and tags** → **Selected branches and tags** → **Add deployment branch or tag rule** →
   `claude/awesome-ptolemy-4s9eez` (the release branch) → **Add rule**. Only the release can use the secret now.
5. Same page, **Environment secrets → Add environment secret**. Name: **`SUPABASE_DB_URL`**; value: the connection
   string from 2. **Add secret.** Don't paste it anywhere else.

Who can read it: nobody — GitHub never shows a secret again once saved (not even to the owner; it can only be
replaced), hides it in the logs, and never puts it in a release (the app doesn't contain it). Only the release
branch's workflow can use it; a change to that workflow reaches the release branch only through a merge you make.

After each release, **Actions → "Update the shared database (Supabase)"** shows a green tick and "The shared database
is up to date (setup version N)". A red cross means it didn't run (GitHub also emails it): fix the secret, then open
that run → **Re-run jobs**. If the database is ever behind, the app tells the admin and the maintainer (a red line
under the title bar) until it's up to date.

## Plan notes
- The free plan pauses a project that isn't used for a week and has no daily backups of its own; for the team's real
  data use a paid plan. The app's own daily backup (step 2) works on both.
- Gmail sends up to about 500 emails a day from a free account — far more than joining needs.
