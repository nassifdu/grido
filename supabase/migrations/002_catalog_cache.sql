create table if not exists bling_produtos (
  id bigint primary key,
  data jsonb not null,
  synced_at timestamptz default now()
);

alter table bling_produtos enable row level security;

create table if not exists bling_variacoes (
  id bigint primary key,
  id_produto_pai bigint not null,
  data jsonb not null,
  synced_at timestamptz default now()
);

create index if not exists bling_variacoes_pai_idx on bling_variacoes (id_produto_pai);

alter table bling_variacoes enable row level security;
