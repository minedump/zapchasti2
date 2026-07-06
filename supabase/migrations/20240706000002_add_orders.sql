-- Таблица заказов
create table if not exists public.orders (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  chat_id uuid references public.chats(id) on delete cascade not null,
  order_number serial,
  data jsonb not null,
  status text default 'new'
);

-- Включаем RLS и Realtime
alter table public.orders enable row level security;
alter publication supabase_realtime add table public.orders;

-- Политики
create policy "Admins can manage orders" on public.orders
  for all to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "Service role can insert orders" on public.orders
  for insert with check (true);
