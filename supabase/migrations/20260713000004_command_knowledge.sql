-- Привязка статей базы знаний к командам (для knowledge_mode = 'selected').
create table if not exists public.command_knowledge (
  command_id uuid not null references public.bot_commands(id) on delete cascade,
  knowledge_id uuid not null references public.knowledge_base(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (command_id, knowledge_id)
);

alter table public.command_knowledge enable row level security;

drop policy if exists "Admins manage command knowledge" on public.command_knowledge;
create policy "Admins manage command knowledge" on public.command_knowledge for all to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');
