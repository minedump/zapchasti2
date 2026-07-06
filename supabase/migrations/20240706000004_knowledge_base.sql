-- Таблица базы знаний
create table if not exists public.knowledge_base (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Таблица глобальных настроек бота
create table if not exists public.bot_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Добавляем дефолтный промпт ассистента
insert into public.bot_settings (key, value)
values ('default_assistant_prompt', 'Ты — экспертный ассистент компании PromptFlow. Твоя задача — вежливо отвечать на вопросы клиентов, используя предоставленные знания о компании. Если ответа нет в базе знаний, вежливо скажи, что уточняешь информацию у оператора.')
on conflict (key) do nothing;

-- Включаем RLS и Realtime
alter table public.knowledge_base enable row level security;
alter table public.bot_settings enable row level security;

alter publication supabase_realtime add table public.knowledge_base;

-- Политики
create policy "Admins manage knowledge" on public.knowledge_base for all using ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins manage bot settings" on public.bot_settings for all using ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Public read knowledge" on public.knowledge_base for select using (is_active = true);
create policy "Public read bot settings" on public.bot_settings for select using (true);
