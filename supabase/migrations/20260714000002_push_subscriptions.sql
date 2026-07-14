-- Web Push подписки устройств оператора (браузер на десктопе, PWA на iPhone).
-- Одна строка на устройство/браузер; endpoint уникален. Пуш уходит на все
-- подписки при входящем сообщении в чат с включённым колокольчиком
-- (chats.notify_on_message). Протухшие подписки (404/410 от пуш-сервиса)
-- удаляются при отправке.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Пишется только серверным ключом (API-роут), чтения из браузера не нужно.
