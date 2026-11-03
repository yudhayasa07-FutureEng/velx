-- Migration: Add user_id to tasks and ai_messages, update RLS to per-user isolation
-- Run this in Supabase SQL Editor AFTER the first migration

-- 1. Add user_id column (nullable first so existing rows don't break)
alter table public.tasks
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.ai_messages
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Drop old open-access policies
drop policy if exists "allow_all_tasks" on public.tasks;
drop policy if exists "allow_all_messages" on public.ai_messages;
drop policy if exists "allow_all_projects" on public.projects;
drop policy if exists "allow_all_blueprints" on public.project_blueprints;

-- 3. Private per-user RLS: each user only sees and modifies their own rows
create policy "tasks_owner"
  on public.tasks for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "messages_owner"
  on public.ai_messages for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 4. Block all anonymous access
create policy "tasks_deny_anon"
  on public.tasks for all
  to anon
  using (false);

create policy "messages_deny_anon"
  on public.ai_messages for all
  to anon
  using (false);

-- 5. Remove from Realtime publication (no longer needed)
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tasks') then
    alter publication supabase_realtime drop table public.tasks;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ai_messages') then
    alter publication supabase_realtime drop table public.ai_messages;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'projects') then
    alter publication supabase_realtime drop table public.projects;
  end if;
end $$;

-- 6. Remove the old demo seed data (it has no user_id and would be invisible anyway)
delete from public.ai_messages where user_id is null;
delete from public.tasks where user_id is null;
delete from public.projects where id = '00000000-0000-0000-0000-000000000001';
