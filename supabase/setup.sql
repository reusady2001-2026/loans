-- =====================================================================================================================
-- Loan Debt Service Hub 3.0.0 — the shared database (Supabase).
--
-- Run this whole file once in the Supabase project's SQL editor. It is safe to run again after an update: it only
-- adds what is missing and replaces the functions.
--
-- Every rule is checked HERE, on the server, so no copy of the app can get around it:
--   * a group's data is seen only by its members;
--   * a view-only member can't change anything;
--   * every change carries a typed reason, and the change record keeps who / when / why / old -> new, field by field;
--   * a field the group's admin changed can be changed by a member only with the admin's approval (the approval
--     code, or a request the admin approves);
--   * only the person who started a chat can continue it;
--   * only the maintainer creates groups and names their admin.
-- The app reaches the data only through the lds_* functions below; the tables themselves are closed to it.
-- =====================================================================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
revoke all on schema app from public;

-- ---- people ----------------------------------------------------------------------------------------------------------

-- The company that maintains the app. Add a maintainer with:  insert into app.maintainers(email) values ('name@company.com');
create table if not exists app.maintainers (
  email text primary key check (email = lower(email))
);

create table if not exists app.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by text
);
-- the newest app version that has saved in the group: an older app's automatic work isn't taken
alter table app.groups add column if not exists app_version text;

-- One person belongs to one group. One admin per group; everyone else is an editor or view-only.
create table if not exists app.members (
  email text primary key check (email = lower(email)),
  group_id uuid not null references app.groups(id) on delete cascade,
  user_id uuid unique,
  name text,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  approval_hash text,      -- the admin's approval code (hashed)
  offline_hash text,       -- the admin's offline code (hashed)
  added_at timestamptz not null default now(),
  added_by text,
  seq bigint not null default 0
);
create unique index if not exists members_one_admin on app.members(group_id) where role = 'admin';
create index if not exists members_group on app.members(group_id);

-- Every write anywhere takes the next number, so "anything new since N?" is one cheap question.
create sequence if not exists app.seq;

-- ---- the data ----------------------------------------------------------------------------------------------------------

-- The app's records (loans.json, each property's profile / assumptions / general data / history ...), one row per file.
-- content null = deleted.
create table if not exists app.records (
  group_id uuid not null references app.groups(id) on delete cascade,
  path text not null,
  content jsonb,
  version bigint not null default 1,
  seq bigint not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_name text,
  primary key (group_id, path)
);
create index if not exists records_seq on app.records(group_id, seq);

-- Every other file (documents and the text read from them) is kept in storage at "<group id>/<path>". Files are added,
-- never replaced (each saved file has its own name); the property's list of documents is a record like any other, so
-- adding or removing a document is a change with its reason, and the admin's lock applies to it.

-- The change record: one row per field changed.
create table if not exists app.changes (
  id bigserial primary key,
  group_id uuid not null references app.groups(id) on delete cascade,
  batch uuid not null,
  path text not null,
  field text not null,
  old jsonb,
  new jsonb,
  by_id uuid,
  by_name text,
  by_role text,
  kind text not null,            -- person | app | start | approved | offline | restore
  approved_by text,
  request_id uuid,
  reason text not null,
  at timestamptz not null default now()
);
create index if not exists changes_group on app.changes(group_id, id desc);
create index if not exists changes_path on app.changes(group_id, path, id desc);

-- Fields the admin changed last. A member needs the admin's approval to change them.
create table if not exists app.locks (
  group_id uuid not null references app.groups(id) on delete cascade,
  path text not null,
  field text not null,
  admin_name text,
  at timestamptz not null default now(),
  primary key (group_id, path, field)
);

-- Fields that never lock: stamps the app writes on every save (when / by whom), so an admin's save doesn't lock
-- every later save. Each pattern is a regular expression matched against the field.
create table if not exists app.lock_free (
  pattern text primary key
);
insert into app.lock_free(pattern) values
  ('(^|\.)(updatedAt|savedAt|changedAt|changedBy|modifiedAt|computedAt|lastSaved|ts)$')
on conflict do nothing;

-- A member's change waiting for the admin.
create table if not exists app.requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references app.groups(id) on delete cascade,
  items jsonb not null,          -- [{path, base_version, base, content}]
  fields jsonb not null,         -- [{path, field, old, new}] what it changes, for the admin to read
  reason text not null,
  by_id uuid,
  by_name text,
  at timestamptz not null default now(),
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'rejected')),
  decided_by text,
  decided_at timestamptz,
  note text,
  seq bigint not null
);
create index if not exists requests_group on app.requests(group_id, seq);

-- The assistant's chats. Everyone in the group reads them; only the owner continues one.
create table if not exists app.chats (
  group_id uuid not null references app.groups(id) on delete cascade,
  id text not null,
  scope text not null,           -- the property's key, or the portfolio
  owner_id uuid,
  owner_name text,
  title text,
  content jsonb,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  seq bigint not null,
  primary key (group_id, id)
);
create index if not exists chats_seq on app.chats(group_id, seq);

-- The daily backup: each group's records (the document lists among them) and chats as they were that day. Kept 30 days.
-- The stored files themselves are never replaced or removed by members, so the backup's lists still point at them.
create table if not exists app.backups (
  group_id uuid not null references app.groups(id) on delete cascade,
  day date not null,
  records jsonb,
  chats jsonb,
  taken_at timestamptz not null default now(),
  primary key (group_id, day)
);

alter table app.maintainers enable row level security;
alter table app.groups      enable row level security;
alter table app.members     enable row level security;
alter table app.records     enable row level security;
alter table app.changes     enable row level security;
alter table app.locks       enable row level security;
alter table app.lock_free   enable row level security;
alter table app.requests    enable row level security;
alter table app.chats       enable row level security;
alter table app.backups     enable row level security;

-- ---- helpers (not reachable from the app) -------------------------------------------------------------------------------

create or replace function app.my_email() returns text language sql stable as $$
  select lower(nullif(auth.jwt() ->> 'email', ''))
$$;

-- The signed-in person's membership: linked by their id, or by their (proven) email until lds_hello links the id.
create or replace function app.me() returns app.members language sql stable security definer set search_path = '' as $$
  select m.* from app.members m
   where auth.uid() is not null and (m.user_id = auth.uid() or (m.user_id is null and m.email = app.my_email()))
   order by (m.user_id = auth.uid()) desc nulls last limit 1
$$;

create or replace function app.is_maintainer() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.maintainers x where x.email = app.my_email())
$$;

create or replace function app.need_member() returns app.members language plpgsql stable security definer set search_path = '' as $$
declare m app.members;
begin
  m := app.me();
  if m.email is null then raise exception 'not_member' using errcode = 'P0001', hint = 'You are not in a group.'; end if;
  return m;
end $$;

-- Writes inside one group take turns, so the change numbers of a group are handed out in the order the writes land:
-- "everything after N" never skips a change that was still being saved.
create or replace function app.turn(g uuid) returns void language sql as $$
  select pg_advisory_xact_lock(hashtextextended(g::text, 7))
$$;

-- "3.0.12" -> {3,0,12}, for comparing app versions
create or replace function app.ver(v text) returns int[] language sql immutable as $$
  select coalesce(array_agg(x::int order by o), '{}') from unnest(string_to_array(regexp_replace(coalesce(v, ''), '[^0-9.]', '', 'g'), '.')) with ordinality t(x, o) where x <> ''
$$;

-- A field's path inside a record: keys joined by ".", list items that carry an "id" written as [id].
create or replace function app.key_part(k text) returns text language sql immutable as $$
  select replace(replace(replace(k, '\', '\\'), '.', '\.'), '[', '\[')
$$;

-- Every leaf of a JSON value with its field path. Lists whose items all carry a distinct "id" (or "_id", as loans do)
-- are followed item by item (so a change to one loan is that loan's change); any other list is one value.
create or replace function app.list_key(j jsonb) returns text language sql immutable as $$
  select k from (values (1, 'id'), (2, '_id')) v(o, k)
   where jsonb_array_length(j) > 0
     and (select bool_and(jsonb_typeof(e) = 'object' and jsonb_typeof(e -> v.k) in ('string', 'number'))
                 and count(distinct e -> v.k) = count(*) from jsonb_array_elements(j) e)
   order by o limit 1
$$;
create or replace function app.leaves(j jsonb, prefix text default '') returns table(field text, val jsonb)
language plpgsql immutable as $$
declare k text; v jsonb; lk text;
begin
  if j is null then return; end if;
  if jsonb_typeof(j) = 'object' and j <> '{}'::jsonb then
    for k, v in select e.key, e.value from jsonb_each(j) e loop
      return query select * from app.leaves(v, case when prefix = '' then app.key_part(k) else prefix || '.' || app.key_part(k) end);
    end loop;
    return;
  end if;
  if jsonb_typeof(j) = 'array' then
    lk := app.list_key(j);
    if lk is not null then
      for v in select e from jsonb_array_elements(j) e loop
        return query select * from app.leaves(v, prefix || '[' || app.key_part(v ->> lk) || ']');
      end loop;
      return;
    end if;
  end if;
  field := prefix; val := j; return next;
end $$;

-- What changed between two versions of a record, field by field.
create or replace function app.diff(a jsonb, b jsonb) returns table(field text, old jsonb, new jsonb)
language sql immutable as $$
  with x as (select * from app.leaves(a)), y as (select * from app.leaves(b))
  select coalesce(x.field, y.field), x.val, y.val
    from x full outer join y on x.field = y.field
   where x.val is distinct from y.val
$$;

create or replace function app.lockable(f text) returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from app.lock_free p where f ~ p.pattern)
$$;

-- Does field f of record p hold the admin's lock (the field itself, a field inside it, or the field it sits in)?
create or replace function app.locked(g uuid, p text, f text) returns text language sql stable security definer set search_path = '' as $$
  select l.admin_name from app.locks l
   where l.group_id = g and l.path = p
     and (l.field = f or f = '' or l.field = ''
          or left(f, length(l.field) + 1) in (l.field || '.', l.field || '[')
          or left(l.field, length(f) + 1) in (f || '.', f || '['))
   limit 1
$$;

create or replace function app.code_ok(g uuid, code text, which text) returns text language plpgsql stable security definer set search_path = '' as $$
declare a app.members; h text;
begin
  if coalesce(code, '') = '' then return null; end if;
  select * into a from app.members where group_id = g and role = 'admin';
  h := case when which = 'offline' then a.offline_hash else a.approval_hash end;
  if h is null or extensions.crypt(code, h) <> h then return null; end if;
  return coalesce(a.name, a.email);
end $$;

-- ---- signing in -----------------------------------------------------------------------------------------------------------

-- Called after every sign-in: links the person to the group an admin (or the maintainer) added their email to,
-- and says who they are.
create or replace function public.lds_hello() returns jsonb language plpgsql security definer set search_path = '' as $$
declare m app.members; g app.groups; adm app.members;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  perform app.turn(x.group_id) from app.members x where x.email = app.my_email() or x.user_id = auth.uid();
  update app.members set user_id = null where user_id = auth.uid() and email <> app.my_email();
  update app.members set user_id = auth.uid(), seq = nextval('app.seq') where email = app.my_email() and user_id is distinct from auth.uid();
  m := app.me();
  if m.email is null then
    return jsonb_build_object('member', false, 'email', app.my_email(), 'maintainer', app.is_maintainer());
  end if;
  select * into g from app.groups where id = m.group_id;
  select * into adm from app.members where group_id = m.group_id and role = 'admin';
  return jsonb_build_object(
    'member', true, 'maintainer', app.is_maintainer(),
    'user_id', auth.uid(), 'email', m.email, 'name', coalesce(m.name, m.email), 'role', m.role,
    'group_id', g.id, 'group_name', g.name,
    'admin_name', coalesce(adm.name, adm.email),
    'has_approval_code', adm.approval_hash is not null,
    -- the admin's own app keeps this to check the offline code with no connection
    'offline_hash', case when m.role = 'admin' then m.offline_hash end);
end $$;

-- ---- reading: everything new since the last answer -------------------------------------------------------------------

create or replace function public.lds_pull(since bigint default 0, max_rows int default 500) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m app.members; recs jsonb; cts jsonb; rqs jsonb; mem jsonb; hi bigint; top bigint; lim int; n int;
begin
  m := app.need_member();
  since := coalesce(since, 0);
  lim := least(greatest(coalesce(max_rows, 500), 1), 2000);
  -- the newest change of this group that has landed (writes of a group take turns, so nothing below it is still open)
  select greatest(since,
           (select max(seq) from app.records  where group_id = m.group_id),
           (select max(seq) from app.chats    where group_id = m.group_id),
           (select max(seq) from app.requests where group_id = m.group_id),
           (select max(seq) from app.members  where group_id = m.group_id)) into hi;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'), count(*), max(r.seq) into recs, n, top from (
    select path, content, version, seq, updated_at, updated_by_name from app.records
     where group_id = m.group_id and seq > since and seq <= hi order by seq limit lim) r;
  if n < lim then top := hi; end if;
  top := coalesce(top, hi);
  select coalesce(jsonb_agg(to_jsonb(c) order by c.seq), '[]') into cts from (
    select id, scope, owner_id, owner_name, title, content, deleted, created_at, updated_at, seq from app.chats
     where group_id = m.group_id and seq > since and seq <= top order by seq) c;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.seq), '[]') into rqs from (
    select id, items, fields, reason, by_id, by_name, at, status, decided_by, decided_at, note, seq from app.requests
     where group_id = m.group_id and seq > since and seq <= top
       and (m.role = 'admin' or by_id = auth.uid()) order by seq) q;
  select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(x.name, x.email), 'role', x.role,
            'email', case when m.role = 'admin' then x.email end, 'linked', x.user_id is not null) order by x.role, x.name), '[]')
    into mem from app.members x where x.group_id = m.group_id;
  return jsonb_build_object('records', recs, 'chats', cts, 'requests', rqs, 'members', mem,
                            'more', n >= lim, 'seq', top, 'role', m.role);
end $$;

-- ---- writing a change ------------------------------------------------------------------------------------------------------

-- items: [{path, base_version, content}] — content null deletes the record. base_version is the version the person
-- started from (0 for a new record); if someone saved in between, nothing is written and the answer lists the
-- conflicts, so the app can fold the other save in and send again.
-- kind: person (a person's change), app (automatic work, stamped as the app on the person's behalf),
--       start (the group's starting data — admin only, locks nothing), offline (the admin's offline changes),
--       approved (the admin applying a member's request: request_id).
drop function if exists public.lds_save(jsonb, text, text, text, uuid);
create or replace function public.lds_save(items jsonb, reason text, kind text default 'person',
                                           approval_code text default null, request_id uuid default null,
                                           app_version text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m app.members; it jsonb; cur app.records; p text; newc jsonb; bv bigint;
  conflicts jsonb := '[]'; blocked jsonb := '[]'; results jsonb := '[]';
  approver text; batch uuid := gen_random_uuid(); s bigint; d record; who text; rq app.requests; lk text; gv text;
begin
  m := app.need_member(); perform app.turn(m.group_id);
  who := coalesce(m.name, m.email);
  if m.role = 'viewer' then raise exception 'view_only' using errcode = 'P0001', hint = 'You can only view this group''s data.'; end if;
  if coalesce(btrim(reason), '') = '' then raise exception 'reason_required' using errcode = 'P0001', hint = 'Type why you made this change.'; end if;
  if kind not in ('person', 'app', 'start', 'offline', 'approved') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if kind in ('start', 'offline', 'approved') and m.role <> 'admin' then raise exception 'admin_only' using errcode = 'P0001'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then raise exception 'nothing_to_save' using errcode = 'P0001'; end if;
  select g.app_version into gv from app.groups g where g.id = m.group_id;
  if kind = 'app' and app.ver(app_version) < app.ver(gv) then
    return jsonb_build_object('ok', false, 'old_app', true, 'newest', gv);
  end if;
  if app_version is not null and (gv is null or app.ver(app_version) > app.ver(gv)) then
    update app.groups g set app_version = lds_save.app_version where g.id = m.group_id;
  end if;
  if kind = 'approved' then
    select * into rq from app.requests where id = request_id and group_id = m.group_id for update;
    if rq.id is null or rq.status <> 'waiting' then raise exception 'request_not_waiting' using errcode = 'P0001'; end if;
  end if;

  -- 1. every item must start from the version on the server
  for it in select * from jsonb_array_elements(items) loop
    p := it ->> 'path';
    if coalesce(p, '') = '' or p like '/%' or p like '%..%' then raise exception 'bad_path' using errcode = 'P0001'; end if;
    bv := coalesce((it ->> 'base_version')::bigint, 0);
    select * into cur from app.records where group_id = m.group_id and path = p for update;
    if coalesce(cur.version, 0) <> bv then
      conflicts := conflicts || jsonb_build_object('path', p, 'version', cur.version, 'content', cur.content, 'by', cur.updated_by_name);
    end if;
  end loop;
  if jsonb_array_length(conflicts) > 0 then return jsonb_build_object('ok', false, 'conflicts', conflicts); end if;

  -- 2. a member's change to what the admin changed needs the admin's approval
  if m.role = 'editor' and kind = 'person' then
    for it in select * from jsonb_array_elements(items) loop
      p := it ->> 'path';
      select * into cur from app.records where group_id = m.group_id and path = p;
      for d in select * from app.diff(cur.content, case when it -> 'content' = 'null'::jsonb then null else it -> 'content' end) loop
        lk := app.locked(m.group_id, p, d.field);
        if lk is not null and app.lockable(d.field) then
          blocked := blocked || jsonb_build_object('path', p, 'field', d.field, 'old', d.old, 'new', d.new, 'admin', lk);
        end if;
      end loop;
    end loop;
    if jsonb_array_length(blocked) > 0 then
      approver := app.code_ok(m.group_id, approval_code, 'approval');
      if approver is null then
        return jsonb_build_object('ok', false, 'needs_approval', blocked, 'wrong_code', coalesce(approval_code, '') <> '');
      end if;
    end if;
  end if;
  if kind = 'approved' then approver := who; end if;

  -- 3. write, and record every field that changed
  for it in select * from jsonb_array_elements(items) loop
    p := it ->> 'path';
    newc := case when it -> 'content' = 'null'::jsonb then null else it -> 'content' end;
    select * into cur from app.records where group_id = m.group_id and path = p;
    -- nothing but time stamps differs: no change
    if cur.path is not null and (cur.content is not distinct from newc
        or (cur.content is not null and newc is not null
            and not exists (select 1 from app.diff(cur.content, newc) x where app.lockable(x.field)))) then
      results := results || jsonb_build_object('path', p, 'version', cur.version, 'seq', cur.seq, 'unchanged', true);
      continue;
    end if;
    if cur.path is null and newc is null then continue; end if;
    s := nextval('app.seq');
    insert into app.records as r (group_id, path, content, version, seq, updated_at, updated_by, updated_by_name)
         values (m.group_id, p, newc, 1, s, now(), auth.uid(), who)
    on conflict (group_id, path) do update
       set content = excluded.content, version = r.version + 1, seq = excluded.seq,
           updated_at = now(), updated_by = auth.uid(), updated_by_name = who;
    for d in select * from app.diff(cur.content, newc) loop
      insert into app.changes(group_id, batch, path, field, old, new, by_id, by_name, by_role, kind, approved_by, request_id, reason)
           values (m.group_id, batch, p, d.field, d.old, d.new,
                   case when kind = 'approved' then rq.by_id else auth.uid() end,
                   case when kind = 'approved' then rq.by_name else who end,
                   case when kind = 'approved' then 'editor' else m.role end,
                   kind, approver, rq.id, case when kind = 'approved' then rq.reason else reason end);
      -- the admin's own change (or one the admin approved) locks the field for members; the starting data and
      -- automatic work lock nothing
      if app.lockable(d.field) and ((m.role = 'admin' and kind in ('person', 'offline', 'approved')) or approver is not null) then
        insert into app.locks(group_id, path, field, admin_name, at) values (m.group_id, p, d.field, coalesce(approver, who), now())
        on conflict (group_id, path, field) do update set admin_name = excluded.admin_name, at = now();
      end if;
    end loop;
    if newc is null then delete from app.locks where group_id = m.group_id and path = p; end if;
    select * into cur from app.records where group_id = m.group_id and path = p;
    results := results || jsonb_build_object('path', p, 'version', cur.version, 'seq', cur.seq);
  end loop;

  if kind = 'approved' then
    update app.requests set status = 'approved', decided_by = who, decided_at = now(), seq = nextval('app.seq') where id = rq.id;
  end if;
  return jsonb_build_object('ok', true, 'batch', batch, 'results', results, 'approved_by', approver);
end $$;

-- ---- asking the admin -----------------------------------------------------------------------------------------------------

create or replace function public.lds_request(items jsonb, reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m app.members; it jsonb; cur app.records; f jsonb := '[]'; d record; id uuid;
begin
  m := app.need_member(); perform app.turn(m.group_id);
  if m.role <> 'editor' then raise exception 'editor_only' using errcode = 'P0001'; end if;
  if coalesce(btrim(reason), '') = '' then raise exception 'reason_required' using errcode = 'P0001'; end if;
  for it in select * from jsonb_array_elements(items) loop
    select * into cur from app.records where group_id = m.group_id and path = it ->> 'path';
    for d in select * from app.diff(cur.content, case when it -> 'content' = 'null'::jsonb then null else it -> 'content' end) loop
      f := f || jsonb_build_object('path', it ->> 'path', 'field', d.field, 'old', d.old, 'new', d.new);
    end loop;
  end loop;
  insert into app.requests(group_id, items, fields, reason, by_id, by_name, seq)
       values (m.group_id, items, f, reason, auth.uid(), coalesce(m.name, m.email), nextval('app.seq'))
    returning requests.id into id;
  return jsonb_build_object('ok', true, 'id', id, 'fields', f);
end $$;

-- The admin turns a request down (approving goes through lds_save with kind 'approved', so the admin's app can fold
-- the request into whatever changed since it was sent).
create or replace function public.lds_reject(request_id uuid, note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m app.members;
begin
  m := app.need_member(); perform app.turn(m.group_id);
  if m.role <> 'admin' then raise exception 'admin_only' using errcode = 'P0001'; end if;
  update app.requests set status = 'rejected', decided_by = coalesce(m.name, m.email), decided_at = now(), note = lds_reject.note,
         seq = nextval('app.seq')
   where id = request_id and group_id = m.group_id and status = 'waiting';
  if not found then raise exception 'request_not_waiting' using errcode = 'P0001'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---- files -------------------------------------------------------------------------------------------------------------

-- The storage rules: a member reads the group's folder; an editor or the admin adds to it; only the admin replaces or
-- deletes a stored file (removing a document from a property is a change to its list, so the file stays for the backup).
create or replace function app.file_ok(name text, op text) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare m app.members; g text;
begin
  m := app.me();
  if m.email is null then return false; end if;
  g := split_part(name, '/', 1);
  if g <> m.group_id::text or length(name) <= length(g) + 1 or name like '%..%' then return false; end if;
  if op = 'read' then return true; end if;
  if op = 'add' then return m.role in ('admin', 'editor'); end if;
  return m.role = 'admin';
end $$;

insert into storage.buckets(id, name, public) values ('lds-files', 'lds-files', false) on conflict (id) do nothing;
drop policy if exists "lds read"   on storage.objects;
drop policy if exists "lds add"    on storage.objects;
drop policy if exists "lds change" on storage.objects;
drop policy if exists "lds delete" on storage.objects;
create policy "lds read"   on storage.objects for select to authenticated using (bucket_id = 'lds-files' and app.file_ok(name, 'read'));
create policy "lds add"    on storage.objects for insert to authenticated with check (bucket_id = 'lds-files' and app.file_ok(name, 'add'));
create policy "lds change" on storage.objects for update to authenticated using (bucket_id = 'lds-files' and app.file_ok(name, 'change'));
create policy "lds delete" on storage.objects for delete to authenticated using (bucket_id = 'lds-files' and app.file_ok(name, 'change'));

-- ---- chats ---------------------------------------------------------------------------------------------------------------

create or replace function public.lds_chat_save(id text, scope text, title text, content jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare m app.members; cur app.chats; s bigint;
begin
  m := app.need_member(); perform app.turn(m.group_id);
  if coalesce(id, '') = '' then raise exception 'bad_chat' using errcode = 'P0001'; end if;
  select * into cur from app.chats c where c.group_id = m.group_id and c.id = lds_chat_save.id for update;
  if cur.id is not null and cur.owner_id is distinct from auth.uid() then
    raise exception 'not_your_chat' using errcode = 'P0001', hint = 'Only the person who started this chat can continue it.';
  end if;
  s := nextval('app.seq');
  insert into app.chats as c (group_id, id, scope, owner_id, owner_name, title, content, seq)
       values (m.group_id, id, coalesce(scope, ''), auth.uid(), coalesce(m.name, m.email), title, content, s)
  on conflict (group_id, id) do update
     set scope = excluded.scope, title = excluded.title, content = excluded.content, deleted = false,
         updated_at = now(), seq = excluded.seq;
  return jsonb_build_object('ok', true, 'seq', s);
end $$;

-- A chat is deleted by the person who started it, or by the admin.
create or replace function public.lds_chat_delete(id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m app.members; cur app.chats;
begin
  m := app.need_member(); perform app.turn(m.group_id);
  select * into cur from app.chats c where c.group_id = m.group_id and c.id = lds_chat_delete.id for update;
  if cur.id is null then return jsonb_build_object('ok', true); end if;
  if cur.owner_id is distinct from auth.uid() and m.role <> 'admin' then
    raise exception 'not_your_chat' using errcode = 'P0001';
  end if;
  update app.chats c set deleted = true, content = null, updated_at = now(), seq = nextval('app.seq')
   where c.group_id = m.group_id and c.id = lds_chat_delete.id;
  return jsonb_build_object('ok', true);
end $$;

-- A property renamed: its chats follow it (editors and the admin).
create or replace function public.lds_chat_move(from_scope text, to_scope text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m app.members; n int;
begin
  m := app.need_member(); perform app.turn(m.group_id);
  if m.role = 'viewer' then raise exception 'view_only' using errcode = 'P0001'; end if;
  update app.chats set scope = to_scope, seq = nextval('app.seq'), updated_at = now()
   where group_id = m.group_id and scope = from_scope;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'moved', n);
end $$;

-- ---- the change history ------------------------------------------------------------------------------------------------------

create or replace function public.lds_history(path_prefix text default '', before_id bigint default null, max_rows int default 200) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m app.members; out jsonb;
begin
  m := app.need_member();
  select coalesce(jsonb_agg(to_jsonb(c) order by c.id desc), '[]') into out from (
    select id, batch, path, field, old, new, by_name, by_role, kind, approved_by, reason, at from app.changes
     where group_id = m.group_id and path like coalesce(path_prefix, '') || '%' and (before_id is null or id < before_id)
     order by id desc limit least(greatest(coalesce(max_rows, 200), 1), 1000)) c;
  return out;
end $$;

-- ---- the admin --------------------------------------------------------------------------------------------------------------

create or replace function public.lds_member_set(email text, name text, role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare m app.members; e text := lower(btrim(email)); other app.members;
begin
  m := app.need_member(); perform app.turn(m.group_id);
  if m.role <> 'admin' then raise exception 'admin_only' using errcode = 'P0001'; end if;
  if role not in ('editor', 'viewer') then raise exception 'bad_role' using errcode = 'P0001', hint = 'A member is an editor or view-only.'; end if;
  if e = '' or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email' using errcode = 'P0001'; end if;
  if e = m.email then raise exception 'not_yourself' using errcode = 'P0001'; end if;
  select * into other from app.members x where x.email = e;
  if other.email is not null and other.group_id <> m.group_id then
    raise exception 'in_another_group' using errcode = 'P0001', hint = 'This email is already in another group.';
  end if;
  insert into app.members as x (email, group_id, name, role, added_by, seq)
       values (e, m.group_id, nullif(btrim(name), ''), role, m.email, nextval('app.seq'))
  on conflict (email) do update set name = coalesce(excluded.name, x.name), role = excluded.role, seq = excluded.seq;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.lds_member_remove(email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m app.members; e text := lower(btrim(email));
begin
  m := app.need_member(); perform app.turn(m.group_id);
  if m.role <> 'admin' then raise exception 'admin_only' using errcode = 'P0001'; end if;
  if e = m.email then raise exception 'not_yourself' using errcode = 'P0001'; end if;
  delete from app.members x where x.email = e and x.group_id = m.group_id and x.role <> 'admin';
  return jsonb_build_object('ok', true);
end $$;

-- The admin sets the approval code (typed on a member's screen to approve on the spot) and the offline code (to keep
-- changing data on the admin's own computer with no connection). Either may be left as it is (null).
create or replace function public.lds_admin_codes(approval_code text default null, offline_code text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m app.members;
begin
  m := app.need_member(); perform app.turn(m.group_id);
  if m.role <> 'admin' then raise exception 'admin_only' using errcode = 'P0001'; end if;
  if approval_code is not null and length(approval_code) < 6 then raise exception 'code_too_short' using errcode = 'P0001', hint = 'At least 6 characters.'; end if;
  if offline_code is not null and length(offline_code) < 6 then raise exception 'code_too_short' using errcode = 'P0001', hint = 'At least 6 characters.'; end if;
  update app.members set
    approval_hash = coalesce(case when approval_code is not null then extensions.crypt(approval_code, extensions.gen_salt('bf', 10)) end, approval_hash),
    offline_hash  = coalesce(case when offline_code  is not null then extensions.crypt(offline_code,  extensions.gen_salt('bf', 10)) end, offline_hash),
    seq = nextval('app.seq')
   where email = m.email;
  return jsonb_build_object('ok', true, 'offline_hash', (select offline_hash from app.members where email = m.email));
end $$;

-- ---- the maintainer ------------------------------------------------------------------------------------------------------------

create or replace function public.lds_groups() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_maintainer() then raise exception 'maintainer_only' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'created_at', g.created_at,
            'admin', (select jsonb_build_object('email', a.email, 'name', a.name, 'linked', a.user_id is not null)
                        from app.members a where a.group_id = g.id and a.role = 'admin'),
            'members', (select count(*) from app.members x where x.group_id = g.id)) order by g.created_at), '[]')
            from app.groups g);
end $$;

create or replace function public.lds_group_create(name text, admin_email text, admin_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(admin_email)); gid uuid;
begin
  if not app.is_maintainer() then raise exception 'maintainer_only' using errcode = 'P0001'; end if;
  if coalesce(btrim(name), '') = '' then raise exception 'name_required' using errcode = 'P0001'; end if;
  if e = '' or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email' using errcode = 'P0001'; end if;
  if exists (select 1 from app.members x where x.email = e) then
    raise exception 'in_another_group' using errcode = 'P0001', hint = 'This email is already in a group.';
  end if;
  insert into app.groups(name, created_by) values (btrim(name), app.my_email()) returning id into gid;
  insert into app.members(email, group_id, name, role, added_by, seq)
       values (e, gid, nullif(btrim(admin_name), ''), 'admin', app.my_email(), nextval('app.seq'));
  return jsonb_build_object('ok', true, 'id', gid);
end $$;

-- Name a new admin for a group; the old admin stays in the group as an editor.
create or replace function public.lds_group_admin(group_id uuid, admin_email text, admin_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(admin_email)); other app.members;
begin
  if not app.is_maintainer() then raise exception 'maintainer_only' using errcode = 'P0001'; end if;
  if not exists (select 1 from app.groups g where g.id = lds_group_admin.group_id) then raise exception 'no_group' using errcode = 'P0001'; end if;
  perform app.turn(lds_group_admin.group_id);
  select * into other from app.members x where x.email = e;
  if other.email is not null and other.group_id <> lds_group_admin.group_id then
    raise exception 'in_another_group' using errcode = 'P0001';
  end if;
  update app.members x set role = 'editor', approval_hash = null, offline_hash = null, seq = nextval('app.seq')
   where x.group_id = lds_group_admin.group_id and x.role = 'admin' and x.email <> e;
  insert into app.members as x (email, group_id, name, role, added_by, seq)
       values (e, lds_group_admin.group_id, nullif(btrim(admin_name), ''), 'admin', app.my_email(), nextval('app.seq'))
  on conflict (email) do update set role = 'admin', name = coalesce(excluded.name, x.name), seq = excluded.seq;
  return jsonb_build_object('ok', true);
end $$;

-- ---- the daily backup -------------------------------------------------------------------------------------------------------------

create or replace function app.daily_backup() returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into app.backups(group_id, day, records, chats, taken_at)
  select g.id, current_date,
         (select coalesce(jsonb_object_agg(r.path, r.content), '{}') from app.records r where r.group_id = g.id and r.content is not null),
         (select coalesce(jsonb_agg(to_jsonb(c) - 'group_id'), '[]') from app.chats c where c.group_id = g.id and not c.deleted),
         now()
    from app.groups g
  on conflict (group_id, day) do update set records = excluded.records, chats = excluded.chats, taken_at = now();
  delete from app.backups where day < current_date - 30;
end $$;

create or replace function public.lds_backups() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m app.members;
begin
  m := app.need_member();
  if m.role <> 'admin' then raise exception 'admin_only' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('day', b.day, 'taken_at', b.taken_at,
            'records', (select count(*) from jsonb_object_keys(b.records))) order by b.day desc), '[]')
            from app.backups b where b.group_id = m.group_id);
end $$;

-- The admin puts the group's records back as they were on a backup day. Every field it changes is recorded with the
-- admin's reason, like any other change.
create or replace function public.lds_backup_restore(day date, reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m app.members; b app.backups; p text; c jsonb; cur app.records; d record; batch uuid := gen_random_uuid(); n int := 0; who text;
begin
  m := app.need_member(); perform app.turn(m.group_id); who := coalesce(m.name, m.email);
  if m.role <> 'admin' then raise exception 'admin_only' using errcode = 'P0001'; end if;
  if coalesce(btrim(reason), '') = '' then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into b from app.backups x where x.group_id = m.group_id and x.day = lds_backup_restore.day;
  if b.day is null then raise exception 'no_backup' using errcode = 'P0001'; end if;
  for p in select r.path from app.records r where r.group_id = m.group_id and r.content is not null and not (b.records ? r.path)
           union select k from jsonb_object_keys(b.records) k loop
    c := b.records -> p;
    select * into cur from app.records r where r.group_id = m.group_id and r.path = p for update;
    if cur.content is not distinct from c then continue; end if;
    for d in select * from app.diff(cur.content, c) loop
      insert into app.changes(group_id, batch, path, field, old, new, by_id, by_name, by_role, kind, reason)
           values (m.group_id, batch, p, d.field, d.old, d.new, auth.uid(), who, m.role, 'restore',
                   'Backup of ' || to_char(lds_backup_restore.day, 'YYYY-MM-DD') || ' put back: ' || reason);
    end loop;
    insert into app.records as r (group_id, path, content, version, seq, updated_at, updated_by, updated_by_name)
         values (m.group_id, p, c, 1, nextval('app.seq'), now(), auth.uid(), who)
    on conflict (group_id, path) do update set content = excluded.content, version = r.version + 1, seq = excluded.seq,
         updated_at = now(), updated_by = auth.uid(), updated_by_name = who;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'records', n);
end $$;

-- Every day at 03:00 UTC, when pg_cron is on (Supabase: Database -> Extensions -> pg_cron).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'lds-daily-backup';
    perform cron.schedule('lds-daily-backup', '0 3 * * *', 'select app.daily_backup()');
  end if;
exception when others then
  raise notice 'pg_cron is not available here; the daily backup is not scheduled (%).', sqlerrm;
end $$;

-- ---- who may call what ----------------------------------------------------------------------------------------------------------

revoke all on all functions in schema app from public, anon, authenticated;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'lds\_%' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
-- the storage rules run as the signed-in person and call this one helper
grant usage on schema app to authenticated;
grant execute on function app.file_ok(text, text) to authenticated;
