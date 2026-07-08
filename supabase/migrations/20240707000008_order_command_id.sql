-- Какой командой/промптом создан заказ — для отображения в интерфейсе.
-- on delete set null: удаление команды не должно удалять уже созданные заказы.
alter table public.orders
  add column if not exists command_id uuid references public.bot_commands(id) on delete set null;
