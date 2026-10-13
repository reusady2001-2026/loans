# Setting up the shared database (3.0.0)

What to do once, in Supabase, before the app can use the shared database. Until then the app keeps working on each
computer's own data, exactly like 2.9.17.

## 1. Create the project
1. Sign in to **supabase.com** → **New project**. Pick a region near the team (for a US team: East US).
2. Wait until it says the project is ready.
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key. Send these two to be put in the
   app (`cloud-config.json`). The anon key is meant to be inside the app.
   **Never send the `service_role` key** — it bypasses every rule.

## 2. Run the setup
1. **SQL Editor → New query**, paste the whole of `supabase/setup.sql`, **Run**. It creates the tables, the rules
   and the file storage. Running it again later is safe (an update only adds what is missing).
2. **Database → Extensions**: turn on **pg_cron**, then run `setup.sql` once more — that schedules the daily backup
   (03:00 UTC, kept 30 days).

## 3. The maintainer
In the SQL Editor, with your own email:

```sql
insert into app.maintainers(email) values ('you@company.com');
```

## 4. Sign-in emails
1. **Authentication → Sign In / Providers → Email**: on, with **Confirm email** on. Admins add people by email, so the
   email has to be proven before it gets anyone into a group.
2. **Authentication → URL Configuration → Site URL**: the company's web site. The confirmation link opens it after
   confirming (the app itself has no web page).
3. **Authentication → Emails → Templates → Reset Password**: put the code in the email, e.g.
   `Your code to set a new password: {{ .Token }}`. The app's "Forgot your password?" asks for that 6-digit code
   (a desktop app can't open the email's link).
4. **Authentication → Emails → SMTP Settings**: the company's email sender. Supabase's own sender only sends a
   handful of emails an hour — enough to test, not for a team.

## 5. Files
**Storage → Settings**: the largest file allowed. Loan agreements can be large; set it above the biggest file you
keep (the free plan stops at 50 MB a file).

## 6. The first group
1. Open the app (the version with the project's address in it) → **Create an account** with the maintainer email →
   confirm the email → **Sign in**. The maintainer sees **Groups**.
2. Create the group, with its admin's email (it can be your own).
3. **Check again** → the group opens. It is empty: **Upload this computer's data** makes this computer's loans,
   properties, documents and chats the group's starting data. Nothing on this computer changes.
4. **Account → Members and codes**: add the people (editor or view only) and set your approval and offline codes.
   Each person creates an account with the email you added, confirms it, and signs in.

## Plan notes
- The free plan pauses a project that isn't used for a week and has no daily backups of its own; for the team's real
  data use a paid plan. The app's own daily backup (step 2) works on both.
