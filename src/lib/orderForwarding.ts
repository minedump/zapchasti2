import { supabaseAdmin } from '@/lib/supabase';
import { runPromptOnData } from '@/lib/chatAgent';
import { getSenderForChat } from '@/lib/channelSenders';
import { withBadge } from '@/lib/badge';

interface ForwardCondition {
  field_path: string;
  operator: 'equals' | 'contains' | 'is_empty' | 'is_not_empty';
  value: string | null;
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

function formatOrderData(data: any): string {
  return Object.entries(data ?? {}).map(([key, value]) => `${key}: ${value}`).join('\n');
}

/**
 * Runs every active order_forward_rule whose trigger_status_id matches
 * statusId (covers both "on create as Новый" and "on transition to X" —
 * both are just the order's status_id becoming that value). Matching rules
 * run independently — one failing doesn't block the others.
 */
export async function runForwardRules(order: { id: string; data: any; order_number?: number }, statusId: string): Promise<void> {
  const { data: rules } = await supabaseAdmin
    .from('order_forward_rules')
    .select('*, conditions:order_forward_conditions(*)')
    .eq('is_active', true)
    .eq('trigger_status_id', statusId);

  if (!rules?.length) return;

  for (const rule of rules) {
    const conditions: ForwardCondition[] = rule.conditions ?? [];
    const matched = conditions.every((c) => evaluateCondition(order.data, c));
    if (!matched) continue;

    try {
      const { data: targetChat } = await supabaseAdmin
        .from('chats')
        .select('*')
        .eq('id', rule.target_chat_id)
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
          const raw = await runPromptOnData(prompt.prompt_template, { ...order.data, order_number: order.order_number });
          // Первое сообщение — всегда одноразовая трансформация текста, тег
          // <RESULT> тут не нужен, но модель иногда всё равно его вставляет
          // (например, если промпт написан в режиме диалога) — вырезаем,
          // чтобы получателю не улетал сырой JSON в тегах.
          content = raw.replace(/<RESULT>[\s\S]*?<\/RESULT>/gi, '').trim() || formatOrderData(order.data);
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

      const finalContent = withBadge(content, badge);
      const sender = getSenderForChat(targetChat);
      await sender.send(finalContent);

      await supabaseAdmin.from('messages').insert([{
        chat_id: targetChat.id,
        content: finalContent,
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
          ai_metadata: { step: 'start', retry_count: 0, collected_data: { order_number: order.order_number } }
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
