-- Связи «относится к» между позициями (для наглядности, структуру не меняют).
-- Выполнить один раз в Supabase SQL Editor.

alter table public.occurrences
  add column if not exists link_item_id uuid references public.items (id) on delete set null;

create index if not exists occurrences_link_idx on public.occurrences (link_item_id);
