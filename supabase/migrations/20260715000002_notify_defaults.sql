-- Новые чаты создаются с включённым колокольчиком: оператор по умолчанию
-- получает уведомления о входящих, выключает точечно там, где не нужно.
alter table public.chats alter column notify_on_message set default true;
