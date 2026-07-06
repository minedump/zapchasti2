-- Таблица профилей (админы и клиенты)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  avatar_url text,
  full_name text,
  role text check (role in ('admin', 'customer')) default 'customer',
  telegram_id bigint unique,
  updated_at timestamptz default now()
);

-- Таблица чатов
create table if not exists public.chats (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  telegram_chat_id bigint unique not null,
  customer_name text,
  status text check (status in ('bot_processing', 'operator_needed', 'closed')) default 'bot_processing',
  ai_metadata jsonb default '{"step": "start", "retry_count": 0, "collected_data": {}}'::jsonb,
  last_message_at timestamptz default now()
);

-- Таблица сообщений
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  chat_id uuid references public.chats(id) on delete cascade not null,
  sender_id uuid references public.profiles(id),
  content text not null,
  is_from_bot boolean default false,
  is_ai_generated boolean default false,
  metadata jsonb default '{}'::jsonb
);

-- Конструктор команд
create table if not exists public.bot_commands (
  id uuid default gen_random_uuid() primary key,
  command text unique not null,
  prompt_template text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Включаем RLS
alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.bot_commands enable row level security;

-- Политики безопасности
create policy "Admins can manage everything" on public.profiles for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Admins can manage chats" on public.chats for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Admins can manage messages" on public.messages for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Admins can manage commands" on public.bot_commands for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

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

create trigger on_new_message
  after insert on public.messages
  for each row execute procedure public.handle_new_message();
