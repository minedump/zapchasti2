-- Таблица статусов заказов
create table if not exists public.order_statuses (
  id uuid default gen_random_uuid() primary key,
  name text unique not null,
  color text default '#cbd5e1',
  is_system boolean default false,
  created_at timestamptz default now()
);

-- Таблица меток (тегов)
create table if not exists public.tags (
  id uuid default gen_random_uuid() primary key,
  name text unique not null,
  color text default '#3b82f6',
  created_at timestamptz default now()
);

-- Связующая таблица для меток заказов
create table if not exists public.order_tags (
  order_id uuid references public.orders(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (order_id, tag_id)
);

-- Добавляем колонку статуса в заказы (ссылка на таблицу статусов)
alter table public.orders add column if not exists status_id uuid references public.order_statuses(id);

-- Наполняем системными статусами
insert into public.order_statuses (name, color, is_system)
values 
  ('Новый', '#3b82f6', true),
  ('Согласован', '#f59e0b', true),
  ('Выполнен', '#10b981', true)
on conflict (name) do nothing;

-- Включаем RLS и Realtime
alter table public.order_statuses enable row level security;
alter table public.tags enable row level security;
alter table public.order_tags enable row level security;

alter publication supabase_realtime add table public.order_statuses;
alter publication supabase_realtime add table public.tags;
alter publication supabase_realtime add table public.order_tags;

-- Политики (только админы)
create policy "Admins manage statuses" on public.order_statuses for all using ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins manage tags" on public.tags for all using ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins manage order_tags" on public.order_tags for all using ((select role from public.profiles where id = auth.uid()) = 'admin');
