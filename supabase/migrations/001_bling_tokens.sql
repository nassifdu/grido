create table if not exists bling_tokens (
  id                uuid        primary key default gen_random_uuid(),
  bling_user_id     text        not null unique,
  access_token_enc  text        not null,
  refresh_token_enc text        not null,
  expires_at        timestamptz not null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- RLS is enabled, but all access goes through the service role key in Route Handlers,
-- so no public policies are added — service role bypasses RLS by design.
alter table bling_tokens enable row level security;
