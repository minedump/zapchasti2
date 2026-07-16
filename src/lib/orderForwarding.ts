import { supabaseAdmin } from '@/lib/supabase';
import { runPromptOnData, stripResultTags, parseResultJson, omitPrivateFields, extractNotifyTags, extractBellTag, extractBotTag, pushToOperator } from '@/lib/chatAgent';

// Применяет теги <BELL>/<BOT> из ответа триггерного промпта к чату.
async function applySwitchTags(chatId: string | null | undefined, bell?: boolean, bot?: boolean): Promise<void> {
  if (!chatId) return;
  const updates: Record<string, any> = {};
  if (bell !== undefined) updates.notify_on_message = bell;
  if (bot !== undefined) {
    updates.status = bot ? 'bot_processing' : 'operator_needed';
    if (!bot) updates.active_command_id = null;
  }
  if (Object.keys(updates).length) {
    await supabaseAdmin.from('chats').update(updates).eq('id', chatId);
  }
}
import { getSenderForChat } from '@/lib/channelSenders';
import { withBadge, stripBadgePrefix } from '@/lib/badge';

interface ForwardCondition {
  field_path: string;
  operator: 'equals' | 'contains' | 'is_empty' | 'is_not_empty';
  value: string | null;
}

interface ForwardableOrder {
  id: string;
  chat_id?: string | null;
  data: any;
  order_number?: number;
  status_id?: string;
}

function evaluateCondition(data: any, condition: ForwardCondition): boolean {
  const raw = data?.[condition.field_path];
  const isEmpty = raw === undefined || raw === null || raw === '';

  switch (condition.operator) {
    case 'is_empty': return isEmpty;
    case 'is_not_empty': return !isEmpty;
    case 'equals': return !isEmpty && String(raw).toLowerCase() === String(condition.value ?? '').toLowerCase();
    case 'contains': return !isEmpty && String(raw).toLowerCase().includes(String(condition.value ?? '').toLowerCase());
    default: return false;
  }
}

// Скрытые поля (ключи с "_") не покидают CRM ни в AI-контекстах, ни при
// пересылке "как есть".
function formatOrderData(data: any): string {
  return Object.entries(omitPrivateFields(data)).map(([key, value]) => `${key}: ${value}`).join('\n');
}

/**
 * Правило "без пересылки" (target_type = 'none'): промпт получает данные
 * заказа + диалог чата этого заказа и через <RESULT>{json}</RESULT> дописывает
 * поля в заказ (например, причину отмены из контекста переписки). Служебный
 * ключ status может переключить статус — тогда каскадом сработают правила
 * на новый статус (если он отличается от текущего, чтобы не зациклиться).
 */
async function runProcessingRule(rule: any, order: ForwardableOrder, statusId: string | null): Promise<void> {
  if (!rule.prompt_id) throw new Error('Для правила без пересылки нужен промпт');

  const { data: prompt } = await supabaseAdmin
    .from('bot_commands')
    .select('prompt_template')
    .eq('id', rule.prompt_id)
    .maybeSingle();
  if (!prompt?.prompt_template) throw new Error('Промпт правила не найден');

  let dialog = '';
  if (order.chat_id) {
    const { data: history } = await supabaseAdmin
      .from('messages')
      .select('content, is_from_bot, badge')
      .eq('chat_id', order.chat_id)
      .order('created_at', { ascending: false })
      .limit(50);
    dialog = (history ?? [])
      .reverse()
      .map((m) => `${m.is_from_bot ? 'Бот' : 'Клиент'}: ${stripBadgePrefix(m.content, m.badge)}`)
      .join('\n');
  }

  const raw = await runPromptOnData(
    prompt.prompt_template,
    { ...omitPrivateFields(order.data), order_number: order.order_number, 'ДИАЛОГ ЧАТА': dialog },
    { chatId: order.chat_id ?? null, commandId: rule.prompt_id, source: 'forward' }
  );

  const notifyTags = extractNotifyTags(raw);
  if (notifyTags.notifications.length) {
    pushToOperator(`Заказ №${order.order_number ?? ''}`.trim(), notifyTags.notifications.join(' · '), order.chat_id);
  }

  // <BELL>/<BOT> в обработке без пересылки управляют чатом заказа
  const bellTag = extractBellTag(notifyTags.text);
  const botTag = extractBotTag(bellTag.text);
  await applySwitchTags(order.chat_id, bellTag.value, botTag.value);

  const json = parseResultJson(botTag.text);
  if (!json) return; // промпт ничего не вернул — заказ не трогаем

  const extraData: Record<string, any> = { ...json };
  delete extraData.order_number;
  delete extraData.status;

  const updates: Record<string, any> = { data: { ...order.data, ...extraData } };
  let newStatusId: string | null = null;

  if (json.status) {
    const { data: statusRow } = await supabaseAdmin
      .from('order_statuses')
      .select('id')
      .ilike('name', String(json.status).trim())
      .maybeSingle();
    if (statusRow && statusRow.id !== statusId) {
      updates.status_id = statusRow.id;
      newStatusId = statusRow.id;
    }
  }

  const { data: updatedOrder } = await supabaseAdmin
    .from('orders')
    .update(updates)
    .eq('id', order.id)
    .select()
    .maybeSingle();

  if (updatedOrder && newStatusId) {
    await runForwardRules(updatedOrder, newStatusId);
  }
}

/**
 * Runs every active status-rule whose trigger_status_id matches statusId
 * (covers both "on create as Новый" and "on transition to X" — both are just
 * the order's status_id becoming that value).
 *
 * Цели правила (target_type):
 *  - 'chat'       — пересылка в фиксированный чат (target_chat_id);
 *  - 'order_chat' — пересылка в чат самого заказа (клиенту): вместе с
 *                   "Режимом диалога после пересылки" это позволяет начать
 *                   AI-диалог с клиентом по его же заказу при смене статуса;
 *  - 'none'       — без пересылки, только обработка заказа промптом.
 */
export async function runForwardRules(order: ForwardableOrder, statusId: string): Promise<void> {
  const { data: rules } = await supabaseAdmin
    .from('order_forward_rules')
    .select('*, conditions:order_forward_conditions(*)')
    .eq('is_active', true)
    .eq('trigger_event', 'status')
    .eq('trigger_status_id', statusId);

  await runMatchingRules(rules ?? [], order, statusId);
}

/**
 * Правила на смену отметки оплаты (trigger_event = 'paid' | 'unpaid') —
 * например, "заказ оплачен → переслать поставщику выкуп". Вызывается из
 * серверного роута тумблера оплаты.
 */
export async function runPaymentRules(order: ForwardableOrder, isPaid: boolean): Promise<void> {
  const { data: rules } = await supabaseAdmin
    .from('order_forward_rules')
    .select('*, conditions:order_forward_conditions(*)')
    .eq('is_active', true)
    .eq('trigger_event', isPaid ? 'paid' : 'unpaid');

  await runMatchingRules(rules ?? [], order, order.status_id ?? null);
}

// Общий исполнитель: условия, цель, промпт, лог. Правила независимы — ошибка
// одного не блокирует остальные.
async function runMatchingRules(rules: any[], order: ForwardableOrder, currentStatusId: string | null): Promise<void> {
  if (!rules.length) return;

  for (const rule of rules) {
    const conditions: ForwardCondition[] = rule.conditions ?? [];
    const matched = conditions.every((c) => evaluateCondition(order.data, c));
    if (!matched) continue;

    try {
      if (rule.target_type === 'none') {
        await runProcessingRule(rule, order, currentStatusId);
        await supabaseAdmin.from('order_forward_log').insert([{
          rule_id: rule.id,
          order_id: order.id,
          chat_id: order.chat_id ?? null,
          status: 'ok',
        }]);
        continue;
      }

      const targetChatId = rule.target_type === 'order_chat' ? order.chat_id : rule.target_chat_id;
      if (!targetChatId) throw new Error('Не задан целевой чат');

      const { data: targetChat } = await supabaseAdmin
        .from('chats')
        .select('*')
        .eq('id', targetChatId)
        .maybeSingle();

      if (!targetChat) throw new Error('Целевой чат не найден');

      let content: string;
      let badge: string | null = null;
      let isAiGenerated = false;
      let promptId: string | null = null;

      if (rule.prompt_id) {
        const { data: prompt } = await supabaseAdmin
          .from('bot_commands')
          .select('prompt_template, badge, starts_dialog')
          .eq('id', rule.prompt_id)
          .maybeSingle();

        if (prompt?.prompt_template) {
          const raw = await runPromptOnData(
            prompt.prompt_template,
            { ...omitPrivateFields(order.data), order_number: order.order_number },
            { chatId: targetChat.id, commandId: rule.prompt_id, source: 'forward' }
          );
          // Первое сообщение — всегда одноразовая трансформация текста, теги
          // <RESULT>/<NOTIFY> тут не нужны, но модель может их вставить —
          // NOTIFY отрабатывает пушом, RESULT вырезается, чтобы получателю
          // не улетал сырой JSON в тегах.
          const notifyTags = extractNotifyTags(raw);
          if (notifyTags.notifications.length) {
            pushToOperator(targetChat.customer_name || `Заказ №${order.order_number ?? ''}`.trim(), notifyTags.notifications.join(' · '), targetChat.id);
          }
          const bellTag = extractBellTag(notifyTags.text);
          const botTag = extractBotTag(bellTag.text);
          await applySwitchTags(targetChat.id, bellTag.value, botTag.value);
          content = stripResultTags(botTag.text) || formatOrderData(order.data);
          badge = prompt.badge ?? null;
          isAiGenerated = true;
          // Продолжать диалогом (ждать ответ и завершиться через <RESULT>)
          // нужно, только если это явно включено у команды галочкой "Режим
          // диалога после пересылки" — иначе на этом первом сообщении всё
          // и заканчивается.
          if (prompt.starts_dialog) promptId = rule.prompt_id;
        } else {
          content = formatOrderData(order.data);
        }
      } else {
        content = formatOrderData(order.data);
      }

      const sender = getSenderForChat(targetChat);
      await sender.send(withBadge(content, badge));

      await supabaseAdmin.from('messages').insert([{
        chat_id: targetChat.id,
        content,
        is_from_bot: true,
        is_ai_generated: isAiGenerated,
        badge,
      }]);

      if (promptId) {
        // Переводим чат получателя в режим той же команды — так его
        // следующий ответ пойдёт через обычный диалоговый движок
        // (askDeepSeek + finishCommandTurn в chatAgent.ts) и сможет
        // завершиться тегом <RESULT>, который обновит этот же заказ
        // (см. номер заказа в collected_data — так модель его не забудет).
        await supabaseAdmin.from('chats').update({
          status: 'bot_processing',
          active_command_id: promptId,
          ai_metadata: {
            collected_data: { order_number: order.order_number },
            command_started_at: new Date().toISOString()
          }
        }).eq('id', targetChat.id);
      }

      await supabaseAdmin.from('order_forward_log').insert([{
        rule_id: rule.id,
        order_id: order.id,
        chat_id: targetChat.id,
        status: 'ok',
      }]);
    } catch (err) {
      console.error(`Forward rule "${rule.name}" failed:`, err);
      await supabaseAdmin.from('order_forward_log').insert([{
        rule_id: rule.id,
        order_id: order.id,
        chat_id: rule.target_chat_id,
        status: 'error',
        error_message: err instanceof Error ? err.message : String(err),
      }]);
    }
  }
}
