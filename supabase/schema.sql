-- Схема для Supabase (Postgres). Выполнить один раз в SQL Editor.
-- После этого выполнить supabase/seed.sql (пилотное изделие) — по желанию.

-- ---------- профили и роли ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer'))
);

alter table public.profiles enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'));
$$;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- при регистрации создаём профиль с ролью «просмотр»
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 'viewer')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- изделия ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
drop policy if exists products_read on public.products;
create policy products_read on public.products for select to authenticated using (true);
drop policy if exists products_write on public.products;
create policy products_write on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- позиции ----------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  designation text,
  name text not null,
  kind text not null check (kind in ('assembly', 'assembly_bch', 'part', 'part_bch', 'purchased')),
  bch_ref text,
  supplier text,
  manufacturer_part_no text,
  comment text,
  responsible_3d text,
  due_3d date,
  responsible_dwg text,
  due_dwg date,
  stages jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- один номер ТС = одна позиция (пустые номера не уникальны)
create unique index if not exists items_designation_uniq
  on public.items (product_id, upper(btrim(designation)))
  where designation is not null and btrim(designation) <> '';
create index if not exists items_product_idx on public.items (product_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
for each row execute function public.touch_updated_at();

alter table public.items enable row level security;
drop policy if exists items_read on public.items;
create policy items_read on public.items for select to authenticated using (true);
drop policy if exists items_insert on public.items;
create policy items_insert on public.items for insert to authenticated with check (public.is_admin());
drop policy if exists items_update on public.items;
create policy items_update on public.items for update to authenticated using (public.can_edit()) with check (public.can_edit());
drop policy if exists items_delete on public.items;
create policy items_delete on public.items for delete to authenticated using (public.is_admin());

-- ---------- вхождения (структура изделия) ----------
create table if not exists public.occurrences (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  parent_id uuid references public.occurrences (id) on delete cascade deferrable initially deferred,
  item_id uuid not null references public.items (id) on delete restrict,
  qty numeric not null default 1 check (qty > 0),
  sort int not null default 0
);

-- ровно один корень на изделие
create unique index if not exists occurrences_one_root
  on public.occurrences (product_id) where parent_id is null;
create index if not exists occurrences_product_idx on public.occurrences (product_id);
create index if not exists occurrences_parent_idx on public.occurrences (parent_id);

alter table public.occurrences enable row level security;
drop policy if exists occ_read on public.occurrences;
create policy occ_read on public.occurrences for select to authenticated using (true);
drop policy if exists occ_write on public.occurrences;
create policy occ_write on public.occurrences for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- журнал ----------
create table if not exists public.events (
  id bigserial primary key,
  product_id uuid references public.products (id) on delete cascade,
  actor text,
  kind text not null default 'edit',
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists events_product_idx on public.events (product_id, created_at desc);

alter table public.events enable row level security;
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using (true);
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated with check (true);

-- ---------- права на таблицы ----------
-- Новые проекты Supabase НЕ выдают GRANT автоматически: без этого блока
-- авторизованный пользователь получает «permission denied for table profiles».
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- история живёт 30 дней (pg_cron есть в Supabase; если недоступен — чистите вручную)
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron недоступен: %', sqlerrm;
end $$;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'prune-events') then
    perform cron.unschedule('prune-events');
  end if;
  perform cron.schedule('prune-events', '15 3 * * *',
    $cron$delete from public.events where created_at < now() - interval '30 days'$cron$);
exception when others then
  raise notice 'расписание очистки не создано: %', sqlerrm;
end $$;

-- ---------- копирование структуры в новое изделие ----------
create or replace function public.clone_product_structure(src uuid, dst uuid, new_code text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'недостаточно прав';
  end if;
  if exists (select 1 from public.occurrences where product_id = dst) then
    raise exception 'в новом изделии уже есть структура';
  end if;

  create temp table if not exists _item_map (old_id uuid primary key, new_id uuid) on commit drop;
  delete from _item_map;
  insert into _item_map select id, gen_random_uuid() from public.items where product_id = src;

  insert into public.items (id, product_id, designation, name, kind, bch_ref, supplier,
                            manufacturer_part_no, comment, responsible_3d, responsible_dwg, stages)
  select m.new_id, dst, i.designation, i.name, i.kind, i.bch_ref, i.supplier,
         i.manufacturer_part_no, i.comment, i.responsible_3d, i.responsible_dwg, '{}'::jsonb
  from public.items i join _item_map m on m.old_id = i.id;

  create temp table if not exists _occ_map (old_id uuid primary key, new_id uuid) on commit drop;
  delete from _occ_map;
  insert into _occ_map select id, gen_random_uuid() from public.occurrences where product_id = src;

  insert into public.occurrences (id, product_id, parent_id, item_id, qty, sort)
  select om.new_id, dst,
         (select pom.new_id from _occ_map pom where pom.old_id = o.parent_id),
         im.new_id, o.qty, o.sort
  from public.occurrences o
  join _occ_map om on om.old_id = o.id
  join _item_map im on im.old_id = o.item_id;

  if new_code is not null then
    update public.items set designation = new_code
    where id = (select item_id from public.occurrences where product_id = dst and parent_id is null);
  end if;
end $$;

-- ---------- realtime: чтобы правки коллег приезжали сразу ----------
alter table public.items replica identity full;
alter table public.occurrences replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.occurrences;
exception when duplicate_object then null; end $$;

-- ---------- первый администратор ----------
-- После создания пользователя в Authentication → Users выполните:
--   update public.profiles set role = 'admin' where email = 'you@example.com';
