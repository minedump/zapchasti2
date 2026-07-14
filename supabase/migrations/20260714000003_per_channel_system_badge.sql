-- Бейдж системных сообщений становится поканальным: свой для Telegram и
-- свой для WeChat (раньше был один глобальный system_message_badge).
-- Существующее значение переносится в оба канала, старый ключ удаляется.
insert into public.bot_settings (key, value)
select 'system_message_badge_telegram', value from public.bot_settings where key = 'system_message_badge'
on conflict (key) do nothing;

insert into public.bot_settings (key, value)
select 'system_message_badge_wechat', value from public.bot_settings where key = 'system_message_badge'
on conflict (key) do nothing;

delete from public.bot_settings where key = 'system_message_badge';
