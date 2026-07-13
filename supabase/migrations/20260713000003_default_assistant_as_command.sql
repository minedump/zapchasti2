-- Дефолтный ассистент переезжает из bot_settings в bot_commands: это обычная
-- команда с флагом is_default, которая отвечает, когда бот включён, но активной
-- команды нет. Так весь "мозг" бота управляется в одном разделе "Команды AI"
-- (бейдж, заказы чата, база знаний — всё как у обычных команд).

alter table public.bot_commands add column if not exists is_default boolean not null default false;

-- Сообщение "надо подумать": если заполнено, отправляется клиенту сразу,
-- до обращения к AI (пустое = не отправлять).
alter table public.bot_commands add column if not exists thinking_message text;

-- Какие статьи базы знаний подставлять в промпт команды:
--   none     — не подставлять (по умолчанию),
--   all      — все активные статьи,
--   selected — только выбранные (таблица command_knowledge).
alter table public.bot_commands add column if not exists knowledge_mode text not null default 'none'
  check (knowledge_mode in ('none', 'all', 'selected'));

-- Не больше одной дефолтной команды на канал (null-канал считаем отдельным «any»).
create unique index if not exists bot_commands_one_default_idx
  on public.bot_commands ((coalesce(channel, 'any'))) where is_default;

-- Переносим текущий промпт/бейдж ассистента из bot_settings в команду-строку.
-- Прежнее поведение "дополнять всеми активными статьями базы знаний"
-- сохраняем через knowledge_mode = 'all'.
do $$
declare
  v_prompt text;
  v_badge text;
begin
  select value into v_prompt from public.bot_settings where key = 'default_assistant_prompt';
  select value into v_badge from public.bot_settings where key = 'default_assistant_badge';

  if not exists (select 1 from public.bot_commands where is_default) then
    insert into public.bot_commands (description, prompt_template, is_active, is_default, badge, knowledge_mode)
    values ('Ассистент по умолчанию', coalesce(v_prompt, 'Ты помощник.'), true, true, v_badge, 'all');
  end if;

  delete from public.bot_settings where key in ('default_assistant_prompt', 'default_assistant_badge');
end $$;
