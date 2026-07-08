-- Статус оплаты заказа — независим от order_statuses (тот описывает стадию
-- обработки: Новый/Согласован/Выполнен, это про сам факт оплаты).
alter table public.orders
  add column if not exists is_paid boolean not null default false;
