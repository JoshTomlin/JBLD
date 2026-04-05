create table if not exists public.jbld_sessions (
  id text primary key,
  user_key text not null,
  name text not null,
  puzzle_type text not null default '3x3 BLD',
  scramble_type text not null default '3x3',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists jbld_sessions_user_key_idx
  on public.jbld_sessions (user_key, updated_at desc);

create table if not exists public.jbld_solves (
  id text primary key,
  user_key text not null,
  session_id text not null references public.jbld_sessions(id) on delete cascade,
  recorded_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  time_solve double precision,
  memo_time double precision,
  exe_time double precision,
  fluidness double precision,
  dnf boolean not null default false,
  scramble text,
  solve_alg text,
  txt_solve text,
  link text,
  parse_error text,
  comm_stats jsonb not null default '[]'::jsonb,
  move_timeline jsonb not null default '[]'::jsonb
);

create index if not exists jbld_solves_user_key_idx
  on public.jbld_solves (user_key, recorded_at desc);

create index if not exists jbld_solves_session_id_idx
  on public.jbld_solves (session_id, recorded_at desc);

alter table public.jbld_sessions enable row level security;
alter table public.jbld_solves enable row level security;

create policy "Allow anon read/write sessions"
  on public.jbld_sessions
  for all
  using (true)
  with check (true);

create policy "Allow anon read/write solves"
  on public.jbld_solves
  for all
  using (true)
  with check (true);
