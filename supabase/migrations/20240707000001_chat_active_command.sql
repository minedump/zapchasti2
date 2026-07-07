-- Отдельное поле для текущей активной команды чата.
-- Раньше признаком "идёт команда" служил chats.status = 'bot_processing',
-- из-за чего блокировка "сначала завершите опрос" срабатывала даже тогда,
-- когда бот просто в режиме агента по умолчанию (без активной команды),
-- включая самый первый /start у нового чата.
alter table public.chats
  add column if not exists active_command_id uuid references public.bot_commands(id) on delete set null;

-- Добавляем chats в publication для realtime (бейдж активной команды
-- должен обновляться в списке чатов и в шапке открытого чата на лету)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chats'
  ) then
    alter publication supabase_realtime add table public.chats;
  end if;
end $$;
