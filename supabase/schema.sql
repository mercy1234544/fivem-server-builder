-- ═══════════════════════════════════════════════════════════════════════════
-- FiveM Server Builder — Accounts & Script Access (Supabase / Postgres)
-- ───────────────────────────────────────────────────────────────────────────
-- ONE-TIME SETUP (owner):
--   1. Go to https://supabase.com → New project (free tier is plenty).
--   2. Open the project → SQL Editor → New query → paste this whole file → Run.
--   3. Authentication → Sign In / Providers → Email → turn OFF "Confirm email".
--      (Accounts are username-based, so there's no inbox to confirm.)
--   4. Project Settings → API → copy the "Project URL" and the "anon public" key,
--      and send both to me. (The anon key is meant to be public — security is
--      enforced by the Row Level Security policies below, not by hiding it.)
--   5. Create your account in the app, then run the LAST line to make yourself
--      the OWNER (highest role).
--
-- ROLE HIERARCHY:  owner  >  admin  >  user
--   • user  — normal account; can only download scripts granted to them.
--   • admin — can search accounts and grant/revoke scripts.
--   • owner — everything admins can do, PLUS promote/demote admins & owners.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Profiles: one row per account, linked to Supabase Auth ────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  email      text,                                  -- optional, for recovery/contact
  role       text not null default 'user' check (role in ('user','admin','owner')),
  created_at timestamptz not null default now()
);

-- ── 2) Entitlements: which scripts an account is allowed to download ─────────
create table if not exists public.entitlements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  script_id  text not null,                         -- matches the store item id
  granted_by uuid references public.profiles(id),   -- which admin/owner granted it
  granted_at timestamptz not null default now(),
  unique (user_id, script_id)
);

-- ── 3) Auto-create a profile when someone signs up ──────────────────────────
-- The app passes the chosen username in signup metadata; this copies it in.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || left(new.id::text, 8)),
    nullif(new.raw_user_meta_data->>'email', '')
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 4) Role helpers (security definer avoids RLS recursion) ──────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','owner') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' from public.profiles where id = auth.uid()), false);
$$;

-- ── 5) Row Level Security ────────────────────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.entitlements enable row level security;

-- Profiles: you can see your own row; admins/owners can see everyone (to search
-- by username). Only OWNERS can change roles (promote/demote admins). No one can
-- self-promote — new profiles are created by the trigger as role='user'.
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "owners update profiles" on public.profiles;
create policy "profiles read" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "owners update profiles" on public.profiles
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- Entitlements: a user sees their own; admins/owners see all. Only admins/owners
-- grant (insert) or revoke (delete).
drop policy if exists "read own or admin"         on public.entitlements;
drop policy if exists "admins grant entitlements" on public.entitlements;
drop policy if exists "admins revoke entitlements" on public.entitlements;
create policy "read own or admin" on public.entitlements
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admins grant entitlements" on public.entitlements
  for insert to authenticated with check (public.is_admin());
create policy "admins revoke entitlements" on public.entitlements
  for delete to authenticated using (public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- BOOTSTRAP OWNER — run AFTER you've created your account in the app.
-- Replace YOUR_USERNAME with the username you signed up with, then run just
-- this line in the SQL Editor:
--
--   update public.profiles set role = 'owner' where username = 'YOUR_USERNAME';
--
-- After that, promote everyone else (admins/owners) from the app's Admin Panel.
-- ═══════════════════════════════════════════════════════════════════════════
