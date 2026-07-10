import { supabaseAdmin } from '@/lib/supabase';
import { withBadge } from '@/lib/badge';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

/** Channel-agnostic way to deliver a message to the customer (Telegram, WeChat, ...). */
export interface ChatSender {
  send(text: string): Promise<void>;
}

const AVATAR_COLORS = ['rose', 'pink', 'fuchsia', 'violet', 'indigo', 'sky', 'teal', 'emerald', 'amber', 'orange'];

/** Deterministic avatar color from any channel's external chat id (number or string). */
export function pickAvatarColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

async function getSetting(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('bot_settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

/**
 * Finds the chat row for this channel + external id, creating it if this is
 * the first message ever seen from it. `matchColumn` is the channel-specific
 * external id column (telegram_chat_id is bigint, wechat_user_id is text —
 * different types, so callers pass the already-typed matchValue).
 */
export async function findOrCreateChat(opts: {
  channel: 'telegram' | 'wechat';
  matchColumn: 'telegram_chat_id' | 'wechat_user_id';
  matchValue: string | number;
  customerName?: string;
  /** Channel-specific extra columns (e.g. wechat_bot_name) merged into the insert. */
  extraFields?: Record<string, any>;
}): Promise<any> {
  const { channel, matchColumn, matchValue, customerName, extraFields } = opts;

  const { data: existing } = await supabaseAdmin
    .from('chats')
    .select('*')
    .eq(matchColumn, matchValue)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabaseAdmin
    .from('chats')
    .insert([{
      [matchColumn]: matchValue,
      channel,
      customer_name: customerName,
      // Новый чат не активирует AI сам по себе — только явная команда
      // (см. processIncomingMessage) переводит его в bot_processing.
      status: 'operator_needed',
      avatar_color: pickAvatarColor(String(matchValue)),
      ai_metadata: { step: 'start', retry_count: 0, collected_data: {} },
      ...extraFields,
    }])
    .select()
    .maybeSingle();

  if (error || !created) {
    console.error('Error creating chat:', error);
    return null;
  }
  return created;
}

// Системные уведомления (например, блокировка повторной команды) — тоже пишем в messages,
// чтобы оператор видел их в CRM, а не только клиент в мессенджере.
// is_from_bot: true + is_ai_generated: false отличает их от настоящих AI-ответов.
async function sendSystemMessage(dbChatId: string, sender: ChatSender, text: string) {
  const badge = await getSetting('system_message_badge');
  const finalText = withBadge(text, badge);
  await sender.send(finalText);
  await supabaseAdmin.from('messages').insert([{
    chat_id: dbChatId,
    content: finalText,
    is_from_bot: true,
    is_ai_generated: false,
    badge
  }]);
}

// Разбирает ответ AI на предмет тега <RESULT>...</RESULT>, которым завершается команда.
// Поддерживает два варианта:
//  - <RESULT>{ ...json... }</RESULT> — создаёт заказ с этими данными и передаёт чат оператору;
//  - <RESULT></RESULT> (пусто или невалидный JSON) — просто завершает сценарий без заказа.
// Используется и при первом ответе на запуск команды, и при последующих репликах —
// раньше это распознавалось только во втором случае, из-за чего команды, завершающиеся
// сразу первым сообщением (без сбора данных), зависали с "сырыми" тегами в чате.
async function finishCommandTurn(chatData: any, sender: ChatSender, aiResponse: string, badge: string | null) {
  const resultMatch = aiResponse.match(/<RESULT>([\s\S]*?)<\/RESULT>/i);

  if (!resultMatch) {
    const finalText = withBadge(aiResponse, badge);
    await sender.send(finalText);
    await supabaseAdmin.from('messages').insert([{
      chat_id: chatData.id,
      content: finalText,
      is_from_bot: true,
      is_ai_generated: true,
      badge
    }]);
    return;
  }

  const jsonString = resultMatch[1].trim();
  const cleanMessage = aiResponse.replace(/<RESULT>[\s\S]*?<\/RESULT>/i, "").trim();
  let finalJson: any = null;

  if (jsonString) {
    try {
      finalJson = JSON.parse(jsonString);
    } catch (e) {
      console.error('JSON Parse Error:', e);
    }
  }

  let createdOrder: any = null;
  let updatedOrder: any = null;
  let updatedOrderNewStatusId: string | null = null;

  if (finalJson && typeof finalJson === 'object') {
    const orderNumber = finalJson.order_number;

    if (orderNumber !== undefined && orderNumber !== null) {
      // order_number — служебный ключ: команда не создаёт новый заказ, а
      // дополняет уже существующий (например, ответ поставщика на пересылку).
      // См. "Как писать промпты" на странице Команд AI.
      const { data: existingOrder } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('order_number', orderNumber)
        .maybeSingle();

      if (existingOrder) {
        const extraData: Record<string, any> = { ...finalJson };
        delete extraData.order_number;
        delete extraData.status;

        const updates: Record<string, any> = {
          data: { ...existingOrder.data, ...extraData },
        };

        // status — тоже служебный ключ, меняет статус заказа только если
        // совпадает (без учёта регистра) с названием существующего статуса —
        // это же условие срабатывания правил пересылки ниже.
        if (finalJson.status) {
          const { data: statusRow } = await supabaseAdmin
            .from('order_statuses')
            .select('id')
            .ilike('name', String(finalJson.status).trim())
            .maybeSingle();
          if (statusRow) {
            updates.status_id = statusRow.id;
            updatedOrderNewStatusId = statusRow.id;
          }
        }

        const { data: orderRow } = await supabaseAdmin
          .from('orders')
          .update(updates)
          .eq('id', existingOrder.id)
          .select()
          .maybeSingle();
        updatedOrder = orderRow;
      } else {
        console.error(`finishCommandTurn: заказ №${orderNumber} не найден для обновления`);
      }
    } else {
      const { data: statusData } = await supabaseAdmin
        .from('order_statuses')
        .select('id')
        .eq('name', 'Новый')
        .single();

      const { data: orderRow } = await supabaseAdmin.from('orders').insert([{
        chat_id: chatData.id,
        data: finalJson,
        status_id: statusData?.id,
        command_id: chatData.active_command_id ?? null
      }]).select().maybeSingle();
      createdOrder = orderRow;
    }
  }

  await supabaseAdmin.from('chats').update({
    status: 'operator_needed',
    active_command_id: null,
    ai_metadata: { collected_data: finalJson || {} }
  }).eq('id', chatData.id);

  const suffix = updatedOrder
    ? `\n\n✅ Заказ №${updatedOrder.order_number} обновлён.`
    : createdOrder
      ? "\n\n✅ Данные собраны. Сейчас подключится оператор."
      : "\n\n✅ Готово. Сейчас подключится оператор.";
  const bodyText = cleanMessage || "Готово.";
  await sender.send(withBadge(bodyText + suffix, badge));

  await supabaseAdmin.from('messages').insert([{
    chat_id: chatData.id,
    content: withBadge(bodyText, badge),
    is_from_bot: true,
    is_ai_generated: true,
    badge
  }]);

  if (createdOrder) {
    const { runForwardRules } = await import('@/lib/orderForwarding');
    await runForwardRules(createdOrder, createdOrder.status_id);
  } else if (updatedOrder && updatedOrderNewStatusId) {
    const { runForwardRules } = await import('@/lib/orderForwarding');
    await runForwardRules(updatedOrder, updatedOrderNewStatusId);
  }
}

async function callDeepSeek(systemPrompt: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: systemPrompt }, ...messages]
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

async function askDeepSeek(text: string, history: any[], currentState: any, retryCount: number, promptTemplate: string) {
  const systemPrompt = `
    ${promptTemplate}

    ТЕКУЩИЕ ДАННЫЕ: ${JSON.stringify(currentState)}
    ПОПЫТКА №${retryCount + 1} ДЛЯ ТЕКУЩЕГО ПУНКТА.
  `;

  return callDeepSeek(systemPrompt, history.map(m => ({ role: m.is_from_bot ? 'assistant' : 'user', content: m.content })));
}

/**
 * One-shot prompt run over arbitrary data (no multi-turn history/retry
 * scaffolding) — used by order-forward rules to transform an order's JSON
 * before it's sent to the target chat.
 */
export async function runPromptOnData(promptTemplate: string, data: unknown): Promise<string> {
  return callDeepSeek(promptTemplate, [{ role: 'user', content: JSON.stringify(data) }]);
}

/**
 * Full turn for one incoming customer message, independent of channel:
 * persists it, applies command-locking / command-matching, runs the AI
 * agent (either the active command's prompt or the default assistant +
 * knowledge base), and delivers the reply via `sender`.
 */
export async function processIncomingMessage(chatData: any, text: string, sender: ChatSender): Promise<void> {
  // 1. Сохранить входящее сообщение
  await supabaseAdmin.from('messages').insert([{
    chat_id: chatData.id,
    content: text,
    is_from_bot: false
  }]);

  // 2. Если это команда (начинается с /)
  if (text.startsWith('/')) {
    // Блокируем переключение, только если уже идёт другая команда,
    // а не просто потому что бот в режиме агента по умолчанию
    if (chatData.active_command_id) {
      await sendSystemMessage(chatData.id, sender, "Пожалуйста, сначала завершите текущий опрос.");
      return;
    }

    // Команда ищется среди совпадающих по каналу конкретно + канало-независимых
    // (channel = null) — если есть обе, канало-специфичная побеждает.
    const { data: candidates } = await supabaseAdmin
      .from('bot_commands')
      .select('*')
      .eq('command', text)
      .eq('is_active', true)
      .or(`channel.is.null,channel.eq.${chatData.channel}`);

    const commandData = candidates?.find(c => c.channel === chatData.channel) ?? candidates?.find(c => !c.channel);

    if (commandData) {
      await supabaseAdmin.from('chats').update({
        status: 'bot_processing',
        active_command_id: commandData.id,
        ai_metadata: {
          step: 'start',
          retry_count: 0,
          collected_data: {}
        }
      }).eq('id', chatData.id);

      const aiResponse = await askDeepSeek(
        "Начни опрос",
        [],
        {},
        0,
        commandData.prompt_template
      );

      await finishCommandTurn(chatData, sender, aiResponse, commandData.badge ?? null);
      return;
    }
  }

  // 3. Если работает бот
  if (chatData.status === 'bot_processing') {
    const metadata = chatData.ai_metadata || {};
    let currentPrompt: string | undefined;
    let badge: string | null = null;

    // Если есть активная команда, промпт и бейдж берём из bot_commands напрямую —
    // так изменения в разделе "Команды AI" применяются сразу, а не только к новым опросам
    if (chatData.active_command_id) {
      const { data: activeCommand } = await supabaseAdmin
        .from('bot_commands')
        .select('prompt_template, badge')
        .eq('id', chatData.active_command_id)
        .maybeSingle();
      currentPrompt = activeCommand?.prompt_template;
      badge = activeCommand?.badge ?? null;
    }

    // Если промпта нет (дефолтный режим или команда была удалена), берем его из настроек и добавляем знания
    if (!currentPrompt) {
      const { data: settings } = await supabaseAdmin
        .from('bot_settings')
        .select('key, value')
        .in('key', ['default_assistant_prompt', 'default_assistant_badge']);

      const settingsByKey = new Map((settings ?? []).map(s => [s.key, s.value]));
      badge = settingsByKey.get('default_assistant_badge') ?? null;

      const { data: knowledge } = await supabaseAdmin
        .from('knowledge_base')
        .select('title, content')
        .eq('is_active', true);

      const knowledgeContext = knowledge?.map(k => `СТАТЬЯ: ${k.title}\n${k.content}`).join('\n\n') || '';

      currentPrompt = `
        ${settingsByKey.get('default_assistant_prompt') || "Ты помощник."}

        БАЗА ЗНАНИЙ КОМПАНИИ:
        ${knowledgeContext}
      `;
    }

    const { data: history } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('chat_id', chatData.id)
      .order('created_at', { ascending: true });

    const aiResponse = await askDeepSeek(
      text,
      history || [],
      metadata.collected_data || {},
      metadata.retry_count || 0,
      currentPrompt
    );

    await finishCommandTurn(chatData, sender, aiResponse, badge);
  }
}
