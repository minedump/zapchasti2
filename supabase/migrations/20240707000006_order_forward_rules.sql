-- Триггеры пересылки заказов + расширение bot_commands для повторного
-- использования промптов (не только слэш-команды в чате) и бейджей на
-- сообщениях.

-- 1. bot_commands: command теперь необязателен (промпт может существовать
-- только для пересылки, без слэш-триггера в чате), + канал (null = любой)
-- + бейдж, который показывается на сообщениях, сгенерированных этим промптом.
alter table public.bot_commands alter column command drop not null;
alter table public.bot_commands add column if not exists channel text check (channel in ('telegram', 'wechat'));
alter table public.bot_commands add column if not exists badge text;

-- 2. Бейдж для сообщений оператора через конкретный WeChat-аккаунт
-- (задаётся вместе с именем при подключении/редактировании аккаунта).
alter table public.wechat_account_labels add column if not exists badge text;

-- 3. Бейдж на сообщении — показывается в интерфейсе чата вместо/вместе с
-- жёстко зашитыми "AI"/"Система".
alter table public.messages add column if not exists badge text;

-- 4. Дефолтные бейджи для системных сообщений и ответов агента по умолчанию
-- (когда нет активной команды — ей неоткуда взять свой бейдж).
insert into public.bot_settings (key, value) values
  ('default_assistant_badge', 'AI'),
  ('system_message_badge', 'Система')
on conflict (key) do nothing;

-- 5. Правила пересылки: срабатывает, когда order.status_id становится
-- trigger_status_id (включая самый первый инсерт заказа со статусом "Новый").
create table if not exists public.order_forward_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  trigger_status_id uuid not null references public.order_statuses(id) on delete cascade,
  target_chat_id uuid not null references public.chats(id) on delete cascade,
  prompt_id uuid references public.bot_commands(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Условия одного правила объединяются через И.
create table if not exists public.order_forward_conditions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.order_forward_rules(id) on delete cascade,
  field_path text not null,
  operator text not null check (operator in ('equals', 'contains', 'is_empty', 'is_not_empty')),
  value text,
  created_at timestamptz not null default now()
);

-- Журнал: одна строка на каждое фактическое срабатывание правила.
create table if not exists public.order_forward_log (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.order_forward_rules(id) on delete set null,
  order_id uuid references public.orders(id) on delete cascade,
  chat_id uuid references public.chats(id) on delete set null,
  status text not null check (status in ('ok', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists order_forward_rules_trigger_status_idx on public.order_forward_rules (trigger_status_id);
create index if not exists order_forward_conditions_rule_idx on public.order_forward_conditions (rule_id);
create index if not exists order_forward_log_order_idx on public.order_forward_log (order_id);

alter table public.order_forward_rules enable row level security;
alter table public.order_forward_conditions enable row level security;
alter table public.order_forward_log enable row level security;

drop policy if exists "Admins manage forward rules" on public.order_forward_rules;
create policy "Admins manage forward rules" on public.order_forward_rules for all to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

drop policy if exists "Admins manage forward conditions" on public.order_forward_conditions;
create policy "Admins manage forward conditions" on public.order_forward_conditions for all to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

drop policy if exists "Authenticated read forward log" on public.order_forward_log;
create policy "Authenticated read forward log" on public.order_forward_log for select to authenticated using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_forward_rules'
  ) then
    alter publication supabase_realtime add table public.order_forward_rules;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_forward_log'
  ) then
    alter publication supabase_realtime add table public.order_forward_log;
  end if;
end $$;
