-- VELX Production & Real-Time Migration
-- Enables real-time database publication and public portfolio access via Supabase

-- 1. Create Tables
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  description text not null default '',
  status text not null default 'To do',
  priority text not null default 'Medium',
  phase text not null default 'General',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  time text not null default to_char(now(), 'HH24:MI'),
  created_at timestamptz not null default now()
);

create table if not exists public.project_blueprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'approved',
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 2. Enable Row Level Security (RLS)
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.ai_messages enable row level security;
alter table public.project_blueprints enable row level security;

-- 3. RLS Policies: Allow portfolio visitors (anon & authenticated) full interactive access
drop policy if exists "allow_all_projects" on public.projects;
create policy "allow_all_projects" on public.projects for all using (true) with check (true);

drop policy if exists "allow_all_tasks" on public.tasks;
create policy "allow_all_tasks" on public.tasks for all using (true) with check (true);

drop policy if exists "allow_all_messages" on public.ai_messages;
create policy "allow_all_messages" on public.ai_messages for all using (true) with check (true);

drop policy if exists "allow_all_blueprints" on public.project_blueprints;
create policy "allow_all_blueprints" on public.project_blueprints for all using (true) with check (true);

-- 4. Enable Full Replica Identity for Supabase Realtime
alter table public.projects replica identity full;
alter table public.tasks replica identity full;
alter table public.ai_messages replica identity full;

-- 5. Add to Supabase Realtime Publication
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'projects') then
    alter publication supabase_realtime add table public.projects;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tasks') then
    alter publication supabase_realtime add table public.tasks;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ai_messages') then
    alter publication supabase_realtime add table public.ai_messages;
  end if;
end $$;

-- 6. Seed Initial Real Live Project Data
insert into public.projects (id, name, description, status)
values ('00000000-0000-0000-0000-000000000001', 'VELX Platform', 'Platform universal berbasis AI untuk merancang, mengeksekusi, dan menyelesaikan proyek nyata dengan bimbingan kontekstual secara real-time.', 'active')
on conflict (id) do nothing;

insert into public.tasks (id, project_id, title, description, status, priority, phase)
values
  ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Tentukan Cakupan Proyek VELX', 'Konfirmasi target pengguna, hasil akhir, dan batasan rilis pertama.', 'Done', 'High', 'Planning'),
  ('11111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Desain Core Workspace Real-Time', 'Bangun dashboard utama, kontrol tugas live, dan sinkronisasi real-time.', 'In progress', 'High', 'Design'),
  ('11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Integrasi Supabase & Realtime Publication', 'Siapkan tabel PostgreSQL, publication supabase_realtime, dan WebSocket channel.', 'Review', 'High', 'Build'),
  ('11111111-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Bangun AI Context Memory Assistant', 'Menjawab pertanyaan berbasis konteks proyek dan memecah blocker pekerjaan.', 'To do', 'High', 'Build'),
  ('11111111-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Deploy ke Vercel & Publikasi Portofolio', 'Konfigurasi environment variables, verifikasi build, dan publish ke publik.', 'To do', 'Medium', 'Launch')
on conflict (id) do nothing;

insert into public.ai_messages (id, project_id, role, content, time)
values
  ('22222222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'assistant', 'Selamat datang di VELX Real-Time Project Assistant! Sistem ini terhubung langsung ke Supabase PostgreSQL database dengan sinkronisasi live real-time.', '10:00'),
  ('22222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'user', 'Bagaimana cara memverifikasi bahwa sinkronisasi real-time berfungsi?', '10:01'),
  ('22222222-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'assistant', 'Buka web ini di dua tab atau browser berbeda. Saat Anda mengubah status tugas atau mengirim pesan, perubahan akan langsung muncul di tab lain tanpa refresh halaman!', '10:01')
on conflict (id) do nothing;
