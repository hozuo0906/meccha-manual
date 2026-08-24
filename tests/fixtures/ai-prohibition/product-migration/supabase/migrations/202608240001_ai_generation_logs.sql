create table public.ai_generation_logs (
  id uuid primary key,
  provider text not null,
  created_at timestamptz not null default now()
);
