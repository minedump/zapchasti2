-- 1. Цель триггера: не только фиксированный чат, но и чат самого заказа
--    (клиенту), а также режим "без пересылки" — только обработка заказа
--    промптом (например, дописать причину отмены из контекста диалога).
alter table public.order_forward_rules alter column target_chat_id drop not null;
alter table public.order_forward_rules add column if not exists target_type text not null default 'chat'
  check (target_type in ('chat', 'order_chat', 'none'));

-- Для цели "конкретный чат" сам чат обязателен.
alter table public.order_forward_rules drop constraint if exists order_forward_rules_chat_target_check;
alter table public.order_forward_rules add constraint order_forward_rules_chat_target_check
  check (target_type <> 'chat' or target_chat_id is not null);

-- 2. Глубина контекста диалога для команды: вся переписка чата (по умолчанию,
--    как было) или только сообщения с момента запуска текущей команды.
alter table public.bot_commands add column if not exists history_scope text not null default 'all'
  check (history_scope in ('all', 'command'));
