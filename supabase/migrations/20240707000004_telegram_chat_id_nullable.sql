-- telegram_chat_id было NOT NULL из тех времён, когда единственным каналом
-- был Telegram. Теперь чат может принадлежать WeChat (где вместо него
-- заполнен wechat_user_id) — снимаем ограничение, иначе создание любого
-- WeChat-чата падает с "null value in column telegram_chat_id violates
-- not-null constraint".
alter table public.chats
  alter column telegram_chat_id drop not null;
