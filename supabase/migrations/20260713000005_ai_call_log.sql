-- Журнал обращений к AI: одна строка на каждый вызов DeepSeek — для отладки
-- промптов (сейчас неудачный вызов просто молча падает в console.error).
-- Промпт/ответ хранятся усечёнными (см. chatAgent.ts).
create table if not exists public.ai_call_log (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.chats(id) on delete set null,
  command_id uuid references public.bot_commands(id) on delete set null,
  source text not null check (source in ('command', 'default', 'template', 'forward')),
  duration_ms integer,
  prompt text,
  response text,
  status text not null check (status in ('ok', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ai_call_log_created_idx on public.ai_call_log (created_at desc);

alter table public.ai_call_log enable row level security;

drop policy if exists "Authenticated read ai call log" on public.ai_call_log;
create policy "Authenticated read ai call log" on public.ai_call_log for select to authenticated using (true);
