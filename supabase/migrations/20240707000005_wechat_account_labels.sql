-- Отдельная редактируемая "метка" WeChat-аккаунта, независимая от технического
-- bot_name (тот неизменяем — это ключ маршрутизации на шлюзе, привязанный к
-- живой сессии). Метка задаётся при подключении и может быть переименована
-- позже в разделе WeChat — при переименовании триггер сам подтягивает новое
-- имя в chats.customer_name, но только там, где имя ещё совпадает со старой
-- меткой (т.е. оператор его не менял вручную под конкретного клиента).
create table if not exists public.wechat_account_labels (
  bot_name text primary key,
  label text not null,
  updated_at timestamptz not null default now()
);

alter table public.wechat_account_labels enable row level security;

create policy "Authenticated users manage wechat account labels"
  on public.wechat_account_labels for all
  to authenticated
  using (true)
  with check (true);

create policy "Public read wechat account labels"
  on public.wechat_account_labels for select
  using (true);

create or replace function public.sync_wechat_chat_names()
returns trigger as $$
begin
  update public.chats
  set customer_name = new.label
  where wechat_bot_name = new.bot_name
    and customer_name is not distinct from old.label;
  return new;
end;
$$ language plpgsql;

create or replace trigger on_wechat_label_change
  after update of label on public.wechat_account_labels
  for each row
  when (old.label is distinct from new.label)
  execute procedure public.sync_wechat_chat_names();
