-- Поддержка второго канала общения (WeChat) в дополнение к Telegram.
-- Чаты остаются в одной таблице `chats`, канал различается полем `channel`
-- и своим внешним идентификатором: telegram_chat_id (bigint) для Telegram,
-- wechat_user_id (text, вида "...@im.wechat") для WeChat — типы разные,
-- поэтому это отдельные колонки, а не переиспользование telegram_chat_id.

alter table public.chats
  add column if not exists channel text not null default 'telegram'
    check (channel in ('telegram', 'wechat'));

alter table public.chats
  add column if not exists wechat_user_id text unique;

create index if not exists chats_channel_idx on public.chats (channel);

-- Хранилище состояния SDK @wechatbot/wechatbot (реализация интерфейса Storage:
-- get/set/delete/has/clear). Один WeChat-аккаунт = одно значение bot_name,
-- под ним хранятся ключи credentials/cursor/context_tokens/typing_tickets —
-- это персистентная замена файлового FileStorage, переживает рестарт/деплой
-- воркера. Значения включают учётные данные сессии аккаунта, поэтому таблица
-- закрыта RLS без политик — доступ только через service role (worker-процесс).
create table if not exists public.wechat_bot_storage (
  bot_name text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (bot_name, key)
);

alter table public.wechat_bot_storage enable row level security;
