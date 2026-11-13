-- ═══════════════════════════════════════════════════════════════════════════
-- SpindleOps — esquema do Supabase
-- Cole este arquivo inteiro em: Supabase → SQL Editor → New query → Run.
-- Pode ser executado mais de uma vez (idempotente).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Perfis dos usuários (1 por conta de login). O primeiro cadastro vira Master;
--    os seguintes ficam "pending" até o Master liberar o perfil.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  name text not null default '',
  role text not null default 'pending' check (role in ('pending', 'master', 'logistics', 'office')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2) Dados do app: um documento JSON por registro, agrupado por coleção
--    (employees, projects, purchaseOrders, ...). Espelha a camada de repositórios do app.
create table if not exists public.records (
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  primary key (collection, id)
);
create index if not exists records_collection_idx on public.records (collection);

-- Perfil efetivo de quem está chamando (null se pendente/inativo).
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active and role <> 'pending'
$$;

-- Cria o perfil automaticamente no cadastro.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    case when exists (select 1 from public.profiles) then 'pending' else 'master' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Carimbo de alteração.
create or replace function public.touch_record() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_record();

-- 3) Segurança (Row Level Security)
alter table public.profiles enable row level security;
alter table public.records enable row level security;

drop policy if exists "profiles: ver o próprio" on public.profiles;
create policy "profiles: ver o próprio" on public.profiles for select to authenticated
  using (id = auth.uid());
drop policy if exists "profiles: equipe vê todos" on public.profiles;
create policy "profiles: equipe vê todos" on public.profiles for select to authenticated
  using (public.my_role() is not null);
drop policy if exists "profiles: master altera" on public.profiles;
create policy "profiles: master altera" on public.profiles for update to authenticated
  using (public.my_role() = 'master') with check (public.my_role() = 'master');

drop policy if exists "records: equipe lê" on public.records;
create policy "records: equipe lê" on public.records for select to authenticated
  using (public.my_role() is not null);
drop policy if exists "records: equipe grava" on public.records;
create policy "records: equipe grava" on public.records for insert to authenticated
  with check (public.my_role() is not null);
drop policy if exists "records: equipe altera" on public.records;
create policy "records: equipe altera" on public.records for update to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);
drop policy if exists "records: equipe exclui" on public.records;
create policy "records: equipe exclui" on public.records for delete to authenticated
  using (public.my_role() is not null);

-- 4) Tempo real (todos veem as alterações dos outros na hora)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'records') then
    alter publication supabase_realtime add table public.records;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
