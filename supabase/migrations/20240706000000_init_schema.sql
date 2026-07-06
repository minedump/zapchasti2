-- Таблица профилей (админы и клиенты)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  username text unique,
  avatar_url text,
  full_name text,
  role text check (role in ('admin', 'customer')) default 'customer',
  telegram_id bigint unique,
  updated_at timestamptz default now()
);

-- ... (остальные таблицы без изменений) ...

-- Включаем RLS
alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.bot_commands enable row level security;

-- Политики безопасности
create policy "Profiles are viewable by authenticated" on public.profiles
  for select to authenticated using (true);

create policy "Users can update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id);

create policy "Public read commands" on public.bot_commands
  for select using (is_active = true);

create policy "Admins manage commands" on public.bot_commands
  for all to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "Admins manage chats" on public.chats
  for all to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "Admins manage messages" on public.messages
  for all to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Функция для автоматического создания профиля при регистрации
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'admin'); -- По умолчанию делаем админом, так как регистрация закрыта
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Функция для автоматического обновления last_message_at
create or replace function public.handle_new_message()
returns trigger as $$
begin
  update public.chats
  set last_message_at = now()
  where id = new.chat_id;
  return new;
end;
$$ language plpgsql;

create or replace trigger on_new_message
  after insert on public.messages
  for each row execute procedure public.handle_new_message();
