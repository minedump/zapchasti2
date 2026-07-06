-- Добавляем поле avatar_color для закрепления постельного цвета за чатом
alter table public.chats
  add column if not exists avatar_color text default 'slate';
