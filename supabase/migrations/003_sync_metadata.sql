create table if not exists sync_metadata (
  id uuid primary key default gen_random_uuid(),
  bling_user_id text not null unique,
  status text not null default 'idle' check (status in ('idle', 'syncing', 'done', 'error')),
  last_sync_at timestamptz,
  sync_started_at timestamptz,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table sync_metadata enable row level security;

create index if not exists sync_metadata_bling_user_id_idx on sync_metadata (bling_user_id);
