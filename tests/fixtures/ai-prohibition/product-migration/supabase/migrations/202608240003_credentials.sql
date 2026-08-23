create table public.ai_credentials (
  id uuid primary key,
  secret_ref text not null
);
