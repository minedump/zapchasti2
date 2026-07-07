-- Исправляем политики для order_statuses, tags, order_tags

-- 1. Удаляем старые политики (в т.ч. те, что создаёт этот же файл ниже —
-- чтобы миграцию можно было безопасно перезапустить после частичного применения)
drop policy if exists "Admins manage statuses" on public.order_statuses;
drop policy if exists "Admins manage tags" on public.tags;
drop policy if exists "Admins manage order_tags" on public.order_tags;

drop policy if exists "Authenticated users read statuses" on public.order_statuses;
drop policy if exists "Admins insert statuses" on public.order_statuses;
drop policy if exists "Admins update statuses" on public.order_statuses;
drop policy if exists "Admins delete statuses" on public.order_statuses;

drop policy if exists "Authenticated users read tags" on public.tags;
drop policy if exists "Admins insert tags" on public.tags;
drop policy if exists "Admins update tags" on public.tags;
drop policy if exists "Admins delete tags" on public.tags;

drop policy if exists "Authenticated users manage order_tags" on public.order_tags;

drop policy if exists "Admins can manage orders" on public.orders;
drop policy if exists "Authenticated users read orders" on public.orders;
drop policy if exists "Authenticated users update orders" on public.orders;
drop policy if exists "Admins insert delete orders" on public.orders;

-- 2. order_statuses
-- Читать могут все авторизованные (операторы видят статусы в дропдауне)
create policy "Authenticated users read statuses"
  on public.order_statuses for select
  to authenticated
  using (true);

-- Создавать могут только не-системные статусы
create policy "Admins insert statuses"
  on public.order_statuses for insert
  to authenticated
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    and is_system = false
  );

-- Обновлять цвет/название можно только у не-системных
create policy "Admins update statuses"
  on public.order_statuses for update
  to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    and is_system = false
  )
  with check (is_system = false);

-- Удалять можно только не-системные
create policy "Admins delete statuses"
  on public.order_statuses for delete
  to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    and is_system = false
  );

-- 3. tags
create policy "Authenticated users read tags"
  on public.tags for select
  to authenticated
  using (true);

create policy "Admins insert tags"
  on public.tags for insert
  to authenticated
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "Admins update tags"
  on public.tags for update
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check (true);

create policy "Admins delete tags"
  on public.tags for delete
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- 4. order_tags — все авторизованные могут управлять метками заказов
-- (операторы назначают/снимают метки прямо из интерфейса)
create policy "Authenticated users manage order_tags"
  on public.order_tags for all
  to authenticated
  using (true)
  with check (true);

-- 5. orders — обновление status_id доступно всем авторизованным
-- (операторы меняют статус заказа из дропдауна)
create policy "Authenticated users read orders"
  on public.orders for select
  to authenticated
  using (true);

create policy "Authenticated users update orders"
  on public.orders for update
  to authenticated
  using (true)
  with check (true);

create policy "Admins insert delete orders"
  on public.orders for all
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');
