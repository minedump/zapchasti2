-- Шаблоны сообщений: библиотека одно-кликовых AI-действий для оператора в
-- разделе "Чаты" (третья колонка, под заказами). Оператор жмёт шаблон,
-- опционально отвечает на уточняющий вопрос, и система прогоняет
-- context (+ промпт выбранной команды, если есть) через AI одним запросом.
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  context text not null,
  command_id uuid references public.bot_commands(id) on delete set null,
  ask_extra boolean not null default false,
  extra_question text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists message_templates_command_idx on public.message_templates (command_id);

alter table public.message_templates enable row level security;

drop policy if exists "Admins manage message templates" on public.message_templates;
create policy "Admins manage message templates" on public.message_templates for all to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');
