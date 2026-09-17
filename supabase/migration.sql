-- Scatter cloud sync schema.
--
-- Run this in your Supabase project's SQL Editor (Database > SQL Editor > New query).
-- Safe to re-run in full if something fails partway through or you need to re-apply
-- after an update - every statement is idempotent (create-if-not-exists, or
-- drop-then-create for things Postgres doesn't support "or replace" on, like
-- policies and triggers). Before or after running this, also create a Storage
-- bucket named "images" (Storage > New bucket), NOT public.
--
-- Everything here is scoped to auth.uid() via Row Level Security, so the browser talks to
-- Supabase directly with the public/client-safe key (publishable, or legacy anon) - no
-- custom backend needed for normal reads/writes.
-- The 20MB-per-user cap is enforced here, in Postgres, via triggers that reject the write
-- outright - not just a client-side check that a modified client could skip.

create extension if not exists "pgcrypto";

-- ============================================================================
-- workspaces: one row per workspace the user has synced
-- ============================================================================

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_workspace_id text not null,
  name text not null,
  data jsonb not null,
  device_id text,
  updated_at timestamptz not null default now(),
  unique (user_id, client_workspace_id)
);

create index if not exists workspaces_user_id_idx on public.workspaces(user_id);

alter table public.workspaces enable row level security;

drop policy if exists "workspaces_select_own" on public.workspaces;
create policy "workspaces_select_own" on public.workspaces
  for select using (auth.uid() = user_id);
drop policy if exists "workspaces_insert_own" on public.workspaces;
create policy "workspaces_insert_own" on public.workspaces
  for insert with check (auth.uid() = user_id);
drop policy if exists "workspaces_update_own" on public.workspaces;
create policy "workspaces_update_own" on public.workspaces
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "workspaces_delete_own" on public.workspaces;
create policy "workspaces_delete_own" on public.workspaces
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- devices: lets a user see which browsers are logged in and revoke one.
-- "Kicking" a device just sets revoked_at; each client polls its own row
-- (on load + ~every 60s) and signs itself out locally if it sees that set.
-- ============================================================================

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  label text not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create index if not exists devices_user_id_idx on public.devices(user_id);

alter table public.devices enable row level security;

drop policy if exists "devices_select_own" on public.devices;
create policy "devices_select_own" on public.devices
  for select using (auth.uid() = user_id);
drop policy if exists "devices_insert_own" on public.devices;
create policy "devices_insert_own" on public.devices
  for insert with check (auth.uid() = user_id);
drop policy if exists "devices_update_own" on public.devices;
create policy "devices_update_own" on public.devices
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "devices_delete_own" on public.devices;
create policy "devices_delete_own" on public.devices
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- usage: cached total bytes per user (workspaces jsonb + images in Storage),
-- kept current by the triggers below. Only ever written by those triggers -
-- regular users get read-only access to their own row.
-- ============================================================================

create table if not exists public.usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bytes_used bigint not null default 0
);

alter table public.usage enable row level security;

drop policy if exists "usage_select_own" on public.usage;
create policy "usage_select_own" on public.usage
  for select using (auth.uid() = user_id);

-- ============================================================================
-- quota enforcement
-- ============================================================================

create or replace function public.recompute_usage(target_user uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_bytes bigint;
  image_bytes bigint;
  total bigint;
begin
  select coalesce(sum(pg_column_size(w.data) + pg_column_size(w.name)), 0)
    into workspace_bytes
    from public.workspaces w
    where w.user_id = target_user;

  select coalesce(sum((o.metadata->>'size')::bigint), 0)
    into image_bytes
    from storage.objects o
    where o.bucket_id = 'images'
      and (storage.foldername(o.name))[1] = target_user::text;

  total := workspace_bytes + image_bytes;

  insert into public.usage (user_id, bytes_used)
  values (target_user, total)
  on conflict (user_id) do update set bytes_used = excluded.bytes_used;

  return total;
end;
$$;

revoke execute on function public.recompute_usage(uuid) from public, anon, authenticated;

create or replace function public.recompute_usage_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
begin
  if tg_table_name = 'workspaces' then
    target_user := coalesce(new.user_id, old.user_id);
  else
    target_user := coalesce(
      (storage.foldername(new.name))[1]::uuid,
      (storage.foldername(old.name))[1]::uuid
    );
  end if;

  perform public.recompute_usage(target_user);
  return coalesce(new, old);
end;
$$;

revoke execute on function public.recompute_usage_trigger() from public, anon, authenticated;

-- Rejects the write outright once the user's usage is at/over the cap - this is
-- the actual hard limit, independent of anything the client does or doesn't check.
create or replace function public.enforce_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  current_usage bigint;
  incoming_size bigint;
  cap constant bigint := 20 * 1024 * 1024; -- 20MB
begin
  if tg_table_name = 'workspaces' then
    target_user := new.user_id;
    incoming_size := pg_column_size(new.data) + pg_column_size(new.name);
    if tg_op = 'UPDATE' then
      incoming_size := incoming_size - (pg_column_size(old.data) + pg_column_size(old.name));
    end if;
  else
    target_user := (storage.foldername(new.name))[1]::uuid;
    incoming_size := coalesce((new.metadata->>'size')::bigint, 0);
  end if;

  select coalesce(bytes_used, 0) into current_usage from public.usage where user_id = target_user;

  if coalesce(current_usage, 0) + greatest(incoming_size, 0) > cap then
    raise exception 'Storage limit reached (20MB). Delete some notes, images, or workspaces first.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_quota() from public, anon, authenticated;

drop trigger if exists workspaces_quota_check on public.workspaces;
create trigger workspaces_quota_check
  before insert or update on public.workspaces
  for each row execute function public.enforce_quota();

drop trigger if exists workspaces_usage_recompute on public.workspaces;
create trigger workspaces_usage_recompute
  after insert or update or delete on public.workspaces
  for each row execute function public.recompute_usage_trigger();

-- ============================================================================
-- Storage (images bucket) - policies + the same quota triggers.
-- Create the "images" bucket via the dashboard first (Storage > New bucket,
-- name "images", public OFF), then run the rest of this file.
-- ============================================================================

drop policy if exists "images_select_own" on storage.objects;
create policy "images_select_own" on storage.objects
  for select using (
    bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "images_insert_own" on storage.objects;
create policy "images_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "images_delete_own" on storage.objects;
create policy "images_delete_own" on storage.objects
  for delete using (
    bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop trigger if exists storage_images_quota_check on storage.objects;
create trigger storage_images_quota_check
  before insert on storage.objects
  for each row when (new.bucket_id = 'images') execute function public.enforce_quota();

-- Split into separate INSERT/DELETE triggers - Postgres rejects a WHEN clause
-- that references NEW on a trigger that also fires on DELETE (no NEW row exists
-- for a delete, even though this trigger also handles INSERT where NEW does exist).
drop trigger if exists storage_images_usage_recompute_insert on storage.objects;
create trigger storage_images_usage_recompute_insert
  after insert on storage.objects
  for each row when (new.bucket_id = 'images')
  execute function public.recompute_usage_trigger();

drop trigger if exists storage_images_usage_recompute_delete on storage.objects;
create trigger storage_images_usage_recompute_delete
  after delete on storage.objects
  for each row when (old.bucket_id = 'images')
  execute function public.recompute_usage_trigger();
