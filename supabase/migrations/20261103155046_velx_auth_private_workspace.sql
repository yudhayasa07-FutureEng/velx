-- VELX private workspace tables for Supabase Auth users.
-- Credentials are managed by Supabase Auth in auth.users; passwords are never stored here.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  description text not null default '',
  status text not null default 'To do',
  priority text not null default 'Medium',
  phase text not null default 'General',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  time text not null default to_char(now(), 'HH24:MI'),
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_created_idx
  on public.tasks (user_id, created_at);
create index if not exists ai_messages_user_created_idx
  on public.ai_messages (user_id, created_at);

alter table public.tasks enable row level security;
alter table public.ai_messages enable row level security;

revoke all on public.tasks from anon;
revoke all on public.ai_messages from anon;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.ai_messages to authenticated;

drop policy if exists "tasks_owner_only" on public.tasks;
create policy "tasks_owner_only"
  on public.tasks for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_messages_owner_only" on public.ai_messages;
create policy "ai_messages_owner_only"
  on public.ai_messages for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
