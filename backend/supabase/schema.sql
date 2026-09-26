-- ============================================================
--  notas-pwa - SCHEMA do Supabase (Postgres)
-- ============================================================
--  COMO USAR (2 caminhos, o resultado e o mesmo):
--    a) Cole este arquivo INTEIRO no SQL Editor do Supabase
--       (Dashboard > SQL Editor > New query > Run); ou
--    b) Rode `python -m backend.scripts.migrar` com SUPABASE_DB_URL no .env.
--  O script E IDEMPOTENTE: pode rodar quantas vezes quiser.
--
--  REGRAS DO DESENHO (ver secao 2.2 do plano):
--   - Toda tabela de conteudo tem `user_id` + `rev` + `updated_at` + `deleted_at`.
--   - A chave primaria e SEMPRE composta com `user_id` (isolamento por conta).
--   - Exclusao e SOFT DELETE (`deleted_at`): precisa propagar entre aparelhos.
--   - `rev` e SEMPRE do servidor, via `proximo_rev(user_id)` ATOMICO.
--   - O payload do cliente vive em UMA coluna jsonb por tabela
--     (`dados`, `valor` ou `ranges`). As colunas "nomeadas" do plano
--     (nome, pasta_id, conteudo_html, grafo, ...) sao GERADAS a partir desse
--     jsonb - existem para consulta/indice, sem duplicar dado no codigo.
--   - RLS LIGADA em todas: `using (user_id = auth.uid())`.
--     O backend usa `service_role` (passa por cima), mas SEMPRE filtra pelo
--     `user_id` da sessao; a RLS protege quem usar a chave anon no navegador.
--  O backend NUNCA envia chave alguma do Supabase para o front.
-- ============================================================
-- 💾 [INÍCIO: BACKEND - SCHEMA SUPABASE]

-- ---------------------------------------------------------------------------
-- 1) profiles - usuario do GoTrue (mesmo id de auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
    id        uuid primary key,
    email     text not null,
    criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) contadores + proximo_rev - o `rev` global por usuario (secao 2.5-1)
-- ---------------------------------------------------------------------------
create table if not exists public.contadores (
    user_id uuid primary key,
    rev     bigint not null default 0
);

-- `proximo_rev` e ATOMICO: dois aparelhos salvando ao mesmo tempo nao podem
-- receber o mesmo `rev` (risco R4 do plano).
create or replace function public.proximo_rev(p_user_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
    insert into public.contadores as c (user_id, rev)
    values (p_user_id, 1)
    on conflict (user_id) do update set rev = c.rev + 1
    returning rev;
$$;

-- ---------------------------------------------------------------------------
-- 3) pastas - workspaces (notas-pwa-mapas-pastas)
-- ---------------------------------------------------------------------------
create table if not exists public.pastas (
    user_id    uuid not null,
    id         text not null,
    dados      jsonb not null default '{}'::jsonb,
    nome       text generated always as (dados->>'nome') stored,
    ordem      integer generated always as ((dados->>'ordem')::integer) stored,
    rev        bigint not null default 1,
    updated_at timestamptz not null default now(),
    criado_em  timestamptz not null default now(),
    deleted_at timestamptz,
    primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- 4) notas - metadados dos chips + conteudo_html (notas-pwa-notes + conteudo)
-- ---------------------------------------------------------------------------
create table if not exists public.notas (
    user_id       uuid not null,
    id            text not null,
    dados         jsonb not null default '{}'::jsonb,
    pasta_id      text generated always as (dados->>'pasta_id') stored,
    nome          text generated always as (dados->>'nome') stored,
    accent        text generated always as (dados->>'accent') stored,
    conteudo_html text generated always as (dados->>'conteudo_html') stored,
    rev           bigint not null default 1,
    updated_at    timestamptz not null default now(),
    criado_em     timestamptz not null default now(),
    deleted_at    timestamptz,
    primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- 5) mapas - indice + grafo completo (notas-pwa-mapas + notas-pwa-mapa-<id>)
-- ---------------------------------------------------------------------------
create table if not exists public.mapas (
    user_id    uuid not null,
    id         text not null,
    dados      jsonb not null default '{}'::jsonb,
    pasta_id   text generated always as (dados->>'pasta_id') stored,
    nome       text generated always as (dados->>'nome') stored,
    grafo      jsonb generated always as (dados->'grafo') stored,
    rev        bigint not null default 1,
    updated_at timestamptz not null default now(),
    criado_em  timestamptz not null default now(),
    deleted_at timestamptz,
    primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- 6) configuracoes - TODA chave `notas-pwa-*` que nao tem tabela propria
--    (decisao n. 5: "tudo"). O nome da chave local e preservado em `chave`.
-- ---------------------------------------------------------------------------
create table if not exists public.configuracoes (
    user_id    uuid not null,
    chave      text not null,
    valor      jsonb not null default '{}'::jsonb,
    rev        bigint not null default 1,
    updated_at timestamptz not null default now(),
    criado_em  timestamptz not null default now(),
    deleted_at timestamptz,
    primary key (user_id, chave)
);

-- ---------------------------------------------------------------------------
-- 7) modelos - notas-pwa-templates (tipo=nota) e notas-pwa-mapa-templates (tipo=mapa)
-- ---------------------------------------------------------------------------
create table if not exists public.modelos (
    user_id    uuid not null,
    id         text not null,
    dados      jsonb not null default '{}'::jsonb,
    tipo       text generated always as (dados->>'tipo') stored,
    nome       text generated always as (dados->>'nome') stored,
    payload    jsonb generated always as (dados->'payload') stored,
    rev        bigint not null default 1,
    updated_at timestamptz not null default now(),
    criado_em  timestamptz not null default now(),
    deleted_at timestamptz,
    primary key (user_id, id),
    constraint modelos_tipo_check check (tipo is null or tipo in ('nota', 'mapa'))
);

-- ---------------------------------------------------------------------------
-- 8) ativos + ativos_anotacoes - anexos (binario no Storage) e seus destaques
-- ---------------------------------------------------------------------------
create table if not exists public.ativos (
    user_id      uuid not null,
    id           text not null,
    dados        jsonb not null default '{}'::jsonb,
    nome         text generated always as (dados->>'nome') stored,
    mime         text generated always as (dados->>'mime') stored,
    tamanho      bigint generated always as ((dados->>'tamanho')::bigint) stored,
    storage_path text generated always as (dados->>'storage_path') stored,
    rev          bigint not null default 1,
    updated_at   timestamptz not null default now(),
    criado_em    timestamptz not null default now(),
    deleted_at   timestamptz,
    primary key (user_id, id)
);

create table if not exists public.ativos_anotacoes (
    user_id    uuid not null,
    ativo_id   text not null,
    ranges     jsonb not null default '[]'::jsonb,
    rev        bigint not null default 1,
    updated_at timestamptz not null default now(),
    criado_em  timestamptz not null default now(),
    deleted_at timestamptz,
    primary key (user_id, ativo_id)
);

-- ---------------------------------------------------------------------------
-- 9) INDICES (delta por rev + listagens do app)
-- ---------------------------------------------------------------------------
create index if not exists pastas_user_rev_idx on public.pastas (user_id, rev);
create index if not exists pastas_user_ordem_idx on public.pastas (user_id, ordem);
create index if not exists notas_user_rev_idx on public.notas (user_id, rev);
create index if not exists notas_user_updated_idx on public.notas (user_id, updated_at desc);
create index if not exists mapas_user_rev_idx on public.mapas (user_id, rev);
create index if not exists mapas_user_updated_idx on public.mapas (user_id, updated_at desc);
create index if not exists configuracoes_user_rev_idx on public.configuracoes (user_id, rev);
create index if not exists modelos_user_rev_idx on public.modelos (user_id, rev);
create index if not exists modelos_user_tipo_idx on public.modelos (user_id, tipo);
create index if not exists ativos_user_rev_idx on public.ativos (user_id, rev);
create index if not exists ativos_user_updated_idx on public.ativos (user_id, updated_at desc);
create index if not exists ativos_anotacoes_user_rev_idx on public.ativos_anotacoes (user_id, rev);

-- ---------------------------------------------------------------------------
-- 10) RLS - ligada em TODAS as tabelas de conteudo.
--     O backend usa `service_role` (passa por cima da RLS), mas SEMPRE filtra
--     pelo `user_id` da sessao. A policy existe para o caso de a chave `anon`
--     ser usada por um cliente: ai `user_id = auth.uid()` e o limite.
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.contadores        enable row level security;
alter table public.pastas            enable row level security;
alter table public.notas             enable row level security;
alter table public.mapas             enable row level security;
alter table public.configuracoes     enable row level security;
alter table public.modelos           enable row level security;
alter table public.ativos            enable row level security;
alter table public.ativos_anotacoes  enable row level security;

drop policy if exists profiles_dono on public.profiles;
create policy profiles_dono on public.profiles
    for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists contadores_dono on public.contadores;
create policy contadores_dono on public.contadores
    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists pastas_dono on public.pastas;
create policy pastas_dono on public.pastas
    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notas_dono on public.notas;
create policy notas_dono on public.notas
    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists mapas_dono on public.mapas;
create policy mapas_dono on public.mapas
    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists configuracoes_dono on public.configuracoes;
create policy configuracoes_dono on public.configuracoes
    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists modelos_dono on public.modelos;
create policy modelos_dono on public.modelos
    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ativos_dono on public.ativos;
create policy ativos_dono on public.ativos
    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ativos_anotacoes_dono on public.ativos_anotacoes;
create policy ativos_anotacoes_dono on public.ativos_anotacoes
    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 11) PERMISSOES - o app NUNCA usa a chave anon hoje, mas a RLS acima so faz
--     sentido se `authenticated` puder tocar as tabelas. Concedido tabela por
--     tabela (nunca "all tables") para nao afetar outras apps do mesmo projeto.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles          to authenticated;
grant select, insert, update, delete on public.contadores        to authenticated;
grant select, insert, update, delete on public.pastas            to authenticated;
grant select, insert, update, delete on public.notas             to authenticated;
grant select, insert, update, delete on public.mapas             to authenticated;
grant select, insert, update, delete on public.configuracoes     to authenticated;
grant select, insert, update, delete on public.modelos           to authenticated;
grant select, insert, update, delete on public.ativos            to authenticated;
grant select, insert, update, delete on public.ativos_anotacoes  to authenticated;
grant execute on function public.proximo_rev(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 12) CONFERENCIA - rode e confira: devem aparecer as 9 tabelas abaixo.
-- ---------------------------------------------------------------------------
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'contadores', 'pastas', 'notas', 'mapas',
                     'configuracoes', 'modelos', 'ativos', 'ativos_anotacoes')
order by table_name;
-- 💾 [FIM: BACKEND - SCHEMA SUPABASE]
