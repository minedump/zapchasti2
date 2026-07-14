-- Непрочитанные сообщения + уведомления по чату.
--  unread_count       — счётчик входящих от клиента, инкрементится DB-триггером,
--                       сбрасывается фронтом при открытии чата;
--  last_message_preview — текст последнего сообщения для списка чатов;
--  notify_on_message  — колокольчик на чате: браузерное уведомление оператору
--                       на каждое входящее сообщение клиента в этот чат.
alter table public.chats add column if not exists unread_count integer not null default 0;
alter table public.chats add column if not exists last_message_preview text;
alter table public.chats add column if not exists notify_on_message boolean not null default false;

-- Расширяем существующий триггер last_message_at: превью — от любого сообщения,
-- счётчик непрочитанных — только от входящих клиентских (не бот и не оператор).
create or replace function public.handle_new_message()
returns trigger as $$
begin
  update public.chats
  set last_message_at = now(),
      last_message_preview = left(new.content, 140),
      unread_count = case
        when new.is_from_bot = false and new.sender_id is null then unread_count + 1
        else unread_count
      end
  where id = new.chat_id;
  return new;
end;
$$ language plpgsql;
