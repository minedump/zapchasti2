-- Отмечает промпты, которые при использовании в пересылке (order_forward_rules)
-- должны продолжаться как обычная многоходовая команда — ждать ответ
-- получателя и завершиться тегом <RESULT> — а не быть одноразовой
-- трансформацией текста. См. src/lib/orderForwarding.ts.
alter table public.bot_commands
  add column if not exists starts_dialog boolean not null default false;
