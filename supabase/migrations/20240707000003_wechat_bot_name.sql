-- Какой именно WeChat-бот-аккаунт (bot_name на шлюзе) обслуживает этот чат —
-- нужно, чтобы при ответе оператора знать, через какой аккаунт слать
-- (аккаунтов может быть несколько, см. wechat-worker).
alter table public.chats
  add column if not exists wechat_bot_name text;
