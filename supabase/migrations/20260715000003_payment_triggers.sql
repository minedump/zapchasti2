-- Триггеры теперь срабатывают не только на смену статуса, но и на смену
-- отметки оплаты (тумблер "Оплачен"):
--   status — при переходе заказа в trigger_status_id (как раньше);
--   paid   — когда заказ отмечен оплаченным;
--   unpaid — когда отметка оплаты снята.
alter table public.order_forward_rules alter column trigger_status_id drop not null;
alter table public.order_forward_rules add column if not exists trigger_event text not null default 'status'
  check (trigger_event in ('status', 'paid', 'unpaid'));

-- Для событий по статусу сам статус обязателен.
alter table public.order_forward_rules drop constraint if exists order_forward_rules_status_event_check;
alter table public.order_forward_rules add constraint order_forward_rules_status_event_check
  check (trigger_event <> 'status' or trigger_status_id is not null);
