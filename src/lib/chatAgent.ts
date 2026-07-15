import { supabaseAdmin } from '@/lib/supabase';
import { withBadge, stripBadgePrefix } from '@/lib/badge';

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

// ── <RESULT> — единая точка разбора/вырезания тега ───────────────────────────
// Раньше регекс дублировался здесь и в orderForwarding.ts с разными флагами
// (i против gi) — теперь оба используют эти хелперы.

const RESULT_TAG = /<RESULT>([\s\S]*?)<\/RESULT>/i;

/** Removes every <RESULT>...</RESULT> block from an AI reply. */
export function stripResultTags(text: string): string {
  return text.replace(/<RESULT>[\s\S]*?<\/RESULT>/gi, '').trim();
}

/** Parses the JSON payload of the first <RESULT> tag, or null when the tag is
 * missing/empty/invalid. Used by no-forward trigger rules (orderForwarding). */
export function parseResultJson(text: string): Record<string, any> | null {
  const match = text.match(RESULT_TAG);
  if (!match) return null;
  try {
    const json = JSON.parse(match[1].trim());
    return json && typeof json === 'object' ? json : null;
  } catch {
    return null;
  }
}

/** Renders a chat's orders as text for injection into an AI prompt (used by
 * the command flag "получает заказы чата" and by message templates). */
export function formatOrdersForPrompt(orders: Array<{ order_number: number; data: any; order_statuses?: { name: string } | null }>): string {
  if (!orders.length) return 'Заказов пока нет.';
  return orders
    .map((o) => {
      const fields = Object.entries(o.data ?? {}).map(([k, v]) => `  ${k}: ${v}`).join('\n');
      return `Заказ №${o.order_number} (${o.order_statuses?.name ?? 'без статуса'}):\n${fields}`;
    })
    .join('\n\n');
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
      ai_metadata: { collected_data: {} },
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

// Не-AI сообщение бота (системное уведомление или "надо подумать") — тоже пишем
// в messages, чтобы оператор видел его в CRM, а не только клиент в мессенджере.
// is_from_bot: true + is_ai_generated: false отличает их от настоящих AI-ответов.
async function sendServiceMessage(dbChatId: string, sender: ChatSender, text: string, badge: string | null) {
  await sender.send(withBadge(text, badge));
  await supabaseAdmin.from('messages').insert([{
    chat_id: dbChatId,
    content: text,
    is_from_bot: true,
    is_ai_generated: false,
    badge
  }]);
}

// Бейдж системных сообщений — свой на каждый канал (Настройки → «Бейдж
// системных сообщений»).
async function sendSystemMessage(chatData: { id: string; channel: string }, sender: ChatSender, text: string) {
  const badge = await getSetting(`system_message_badge_${chatData.channel}`);
  await sendServiceMessage(chatData.id, sender, text, badge);
}

// Разбирает ответ AI на предмет тега <RESULT>...</RESULT>, которым завершается команда.
// Поддерживает два варианта:
//  - <RESULT>{ ...json... }</RESULT> — создаёт заказ с этими данными и передаёт чат оператору;
//  - <RESULT></RESULT> (пусто или невалидный JSON) — просто завершает сценарий без заказа.
// Используется и при первом ответе на запуск команды, и при последующих репликах —
// раньше это распознавалось только во втором случае, из-за чего команды, завершающиеся
// сразу первым сообщением (без сбора данных), зависали с "сырыми" тегами в чате.
// `commandId` — команда, от имени которой идёт этот ход (привязывается к
// созданному заказу); передаётся явно, потому что chatData в момент старта
// команды ещё содержит старый active_command_id.
async function finishCommandTurn(chatData: any, sender: ChatSender, aiResponse: string, badge: string | null, commandId: string | null) {
  // Модель могла скопировать бейдж-подпись из старой истории — вырезаем,
  // чтобы `[Бейдж]` не задваивался с тем, что добавит withBadge при отправке.
  aiResponse = stripBadgePrefix(aiResponse, badge);
  const resultMatch = aiResponse.match(RESULT_TAG);

  if (!resultMatch) {
    await sender.send(withBadge(aiResponse, badge));
    await supabaseAdmin.from('messages').insert([{
      chat_id: chatData.id,
      content: aiResponse,
      is_from_bot: true,
      is_ai_generated: true,
      badge
    }]);
    return;
  }

  const jsonString = resultMatch[1].trim();
  const cleanMessage = stripResultTags(aiResponse);
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
      // status — тоже служебный ключ и при создании: если он совпадает
      // (без учёта регистра) с названием существующего статуса, заказ
      // создаётся сразу в нём (и сработают правила пересылки на этот
      // статус), иначе — как обычно, в статусе "Новый".
      let statusId: string | undefined;
      if (finalJson.status) {
        const { data: statusRow } = await supabaseAdmin
          .from('order_statuses')
          .select('id')
          .ilike('name', String(finalJson.status).trim())
          .maybeSingle();
        statusId = statusRow?.id;
      }
      if (!statusId) {
        const { data: statusData } = await supabaseAdmin
          .from('order_statuses')
          .select('id')
          .eq('name', 'Новый')
          .single();
        statusId = statusData?.id;
      }

      const orderData: Record<string, any> = { ...finalJson };
      delete orderData.order_number;
      delete orderData.status;

      const { data: orderRow } = await supabaseAdmin.from('orders').insert([{
        chat_id: chatData.id,
        data: orderData,
        status_id: statusId,
        command_id: commandId
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
    content: bodyText,
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

// ── Контекст промпта ─────────────────────────────────────────────────────────

// Приклеивает к промпту список заказов клиента этого чата, если команда
// включила флаг "Получать заказы клиента в этом чате" (bot_commands.receives_chat_orders).
async function withOrdersContext(promptTemplate: string, chatId: string, receivesChatOrders: boolean): Promise<string> {
  if (!receivesChatOrders) return promptTemplate;
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('order_number, data, order_statuses (name)')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  return `${promptTemplate}\n\nЗАКАЗЫ КЛИЕНТА В ЭТОМ ЧАТЕ:\n${formatOrdersForPrompt((orders ?? []) as any)}`;
}

/**
 * Appends knowledge-base articles to a prompt according to the command's
 * knowledge_mode: 'all' — every active article, 'selected' — only the ones
 * linked via command_knowledge, 'none' — prompt unchanged.
 */
export async function withKnowledgeContext(promptTemplate: string, command: { id: string; knowledge_mode?: string | null }): Promise<string> {
  const mode = command.knowledge_mode ?? 'none';
  if (mode !== 'all' && mode !== 'selected') return promptTemplate;

  let query = supabaseAdmin.from('knowledge_base').select('title, content').eq('is_active', true);
  if (mode === 'selected') {
    const { data: links } = await supabaseAdmin
      .from('command_knowledge')
      .select('knowledge_id')
      .eq('command_id', command.id);
    const ids = (links ?? []).map(l => l.knowledge_id);
    if (!ids.length) return promptTemplate;
    query = query.in('id', ids);
  }

  const { data: knowledge } = await query;
  if (!knowledge?.length) return promptTemplate;

  const articles = knowledge.map(k => `СТАТЬЯ: ${k.title}\n${k.content}`).join('\n\n');
  return `${promptTemplate}\n\nБАЗА ЗНАНИЙ КОМПАНИИ:\n${articles}`;
}

// Собирает полный системный промпт команды: её шаблон + статьи базы знаний
// (по knowledge_mode) + заказы чата (по receives_chat_orders).
async function buildCommandPrompt(command: any, chatId: string): Promise<string> {
  let prompt = command.prompt_template;
  prompt = await withKnowledgeContext(prompt, command);
  prompt = await withOrdersContext(prompt, chatId, !!command.receives_chat_orders);
  return prompt;
}

/**
 * The command marked "по умолчанию" for this channel (channel-specific row
 * wins over the channel-agnostic one). Replaces the old
 * default_assistant_prompt/badge keys in bot_settings.
 */
export async function getDefaultCommand(channel: string): Promise<any | null> {
  const { data } = await supabaseAdmin
    .from('bot_commands')
    .select('*')
    .eq('is_default', true)
    .eq('is_active', true)
    .or(`channel.is.null,channel.eq.${channel}`);
  return data?.find(c => c.channel === channel) ?? data?.find(c => !c.channel) ?? null;
}

// ── Вызовы DeepSeek + журнал ─────────────────────────────────────────────────

export interface AiCallMeta {
  chatId?: string | null;
  commandId?: string | null;
  source: 'command' | 'default' | 'template' | 'forward';
}

// Промпт/ответ в журнале усечены, чтобы таблица не разрасталась от больших
// баз знаний в контексте.
const AI_LOG_TEXT_LIMIT = 4000;

async function logAiCall(meta: AiCallMeta, prompt: string, response: string | null, durationMs: number, error: unknown) {
  try {
    await supabaseAdmin.from('ai_call_log').insert([{
      chat_id: meta.chatId ?? null,
      command_id: meta.commandId ?? null,
      source: meta.source,
      duration_ms: durationMs,
      prompt: prompt.slice(0, AI_LOG_TEXT_LIMIT),
      response: response?.slice(0, AI_LOG_TEXT_LIMIT) ?? null,
      status: error ? 'error' : 'ok',
      error_message: error ? (error instanceof Error ? error.message : String(error)) : null,
    }]);
  } catch (e) {
    console.error('logAiCall failed:', e);
  }
}

async function callDeepSeek(systemPrompt: string, messages: Array<{ role: string; content: string }>, meta: AiCallMeta): Promise<string> {
  const startedAt = Date.now();
  try {
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
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error(`DeepSeek: неожиданный ответ — ${JSON.stringify(data).slice(0, 300)}`);
    }
    await logAiCall(meta, systemPrompt, content, Date.now() - startedAt, null);
    return content;
  } catch (err) {
    await logAiCall(meta, systemPrompt, null, Date.now() - startedAt, err);
    throw err;
  }
}

// Многоходовой вызов: системный промпт + история чата. collectedData
// подставляется блоком ТЕКУЩИЕ ДАННЫЕ только если непуст — единственный
// реальный источник сейчас — пересылка поставщику, которая кладёт туда
// order_number исходного заказа (см. orderForwarding.ts).
async function askDeepSeek(history: any[], systemPromptBase: string, collectedData: Record<string, any>, meta: AiCallMeta) {
  const hasData = collectedData && Object.keys(collectedData).length > 0;
  const systemPrompt = hasData
    ? `${systemPromptBase}\n\nТЕКУЩИЕ ДАННЫЕ: ${JSON.stringify(collectedData)}`
    : systemPromptBase;

  // Старые сообщения хранят бейдж-подпись прямо в content — вырезаем её из
  // истории для модели, иначе она начинает копировать `[Бейдж]` в свои ответы.
  return callDeepSeek(
    systemPrompt,
    history.map(m => ({ role: m.is_from_bot ? 'assistant' : 'user', content: stripBadgePrefix(m.content, m.badge) })),
    meta
  );
}

/**
 * One-shot prompt run over arbitrary data (no multi-turn history) — used by
 * order-forward rules to transform an order's JSON before it's sent to the
 * target chat.
 */
export async function runPromptOnData(promptTemplate: string, data: unknown, meta: AiCallMeta): Promise<string> {
  return callDeepSeek(promptTemplate, [{ role: 'user', content: JSON.stringify(data) }], meta);
}

/**
 * Full turn for one incoming customer message, independent of channel:
 * persists it, applies command-locking / command-matching, runs the AI
 * agent (either the active command's prompt or the default command), and
 * delivers the reply via `sender`.
 */
export async function processIncomingMessage(chatData: any, text: string, sender: ChatSender): Promise<void> {
  // 1. Сохранить входящее сообщение
  await supabaseAdmin.from('messages').insert([{
    chat_id: chatData.id,
    content: text,
    is_from_bot: false
  }]);

  // Web Push оператору, если на чате включён колокольчик. Не блокируем
  // обработку сообщения — уведомление вторично.
  if (chatData.notify_on_message) {
    const { sendPushToAll } = await import('@/lib/webPush');
    sendPushToAll({
      title: chatData.customer_name || 'Клиент',
      body: text.slice(0, 140),
      chatId: chatData.id,
    }).catch((err) => console.error('push notification failed:', err));
  }

  // 2. Если это команда (начинается с /)
  if (text.startsWith('/')) {
    // Блокируем переключение, только если уже идёт другая команда,
    // а не просто потому что бот в режиме агента по умолчанию
    if (chatData.active_command_id) {
      await sendSystemMessage(chatData, sender, "Пожалуйста, сначала завершите текущий опрос.");
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
        // command_started_at — для history_scope='command': история для модели
        // обрезается сообщениями с момента запуска этой команды
        ai_metadata: { collected_data: {}, command_started_at: new Date().toISOString() }
      }).eq('id', chatData.id);

      if (commandData.thinking_message) {
        await sendServiceMessage(chatData.id, sender, commandData.thinking_message, commandData.badge ?? null);
      }

      const startPrompt = await buildCommandPrompt(commandData, chatData.id);
      const aiResponse = await askDeepSeek([], startPrompt, {}, {
        chatId: chatData.id,
        commandId: commandData.id,
        source: 'command',
      });

      await finishCommandTurn(chatData, sender, aiResponse, commandData.badge ?? null, commandData.id);
      return;
    }
  }

  // 3. Если работает бот
  if (chatData.status === 'bot_processing') {
    const metadata = chatData.ai_metadata || {};

    // Если есть активная команда, промпт и бейдж берём из bot_commands напрямую —
    // так изменения в разделе "Команды AI" применяются сразу, а не только к новым
    // опросам. Иначе (режим ожидания или команда была удалена) работает команда,
    // помеченная "по умолчанию".
    let commandForTurn: any = null;
    if (chatData.active_command_id) {
      const { data: activeCommand } = await supabaseAdmin
        .from('bot_commands')
        .select('*')
        .eq('id', chatData.active_command_id)
        .maybeSingle();
      commandForTurn = activeCommand;
    }
    const isDefaultTurn = !commandForTurn;
    if (isDefaultTurn) commandForTurn = await getDefaultCommand(chatData.channel);

    let currentPrompt: string;
    let badge: string | null = null;
    let commandId: string | null = null;

    if (commandForTurn) {
      if (commandForTurn.thinking_message) {
        await sendServiceMessage(chatData.id, sender, commandForTurn.thinking_message, commandForTurn.badge ?? null);
      }
      currentPrompt = await buildCommandPrompt(commandForTurn, chatData.id);
      badge = commandForTurn.badge ?? null;
      commandId = commandForTurn.id;
    } else {
      // Дефолтная команда не настроена (или выключена) — минимальный запасной промпт.
      currentPrompt = 'Ты помощник.';
    }

    // Глубина контекста: history_scope='command' обрезает историю сообщениями
    // с момента запуска текущей команды (по умолчанию — вся переписка чата).
    let historyQuery = supabaseAdmin
      .from('messages')
      .select('*')
      .eq('chat_id', chatData.id)
      .order('created_at', { ascending: true });
    if (commandForTurn?.history_scope === 'command' && metadata.command_started_at) {
      historyQuery = historyQuery.gte('created_at', metadata.command_started_at);
    }
    const { data: history } = await historyQuery;

    const aiResponse = await askDeepSeek(
      history || [],
      currentPrompt,
      metadata.collected_data || {},
      { chatId: chatData.id, commandId, source: isDefaultTurn ? 'default' : 'command' }
    );

    await finishCommandTurn(chatData, sender, aiResponse, badge, commandId);
  }
}

/**
 * Runs a message template's one-shot AI turn (used by the "Шаблоны" panel
 * in the chat's third column) and delivers it exactly like a command turn —
 * reuses `finishCommandTurn`, so `<RESULT>` parsing, order creation/update,
 * forward-rule triggering and dialog continuation (if the reply has no tag
 * and the chat was left with an active command) all behave identically.
 */
export async function runMessageTemplate(chatData: any, systemPrompt: string, sender: ChatSender, badge: string | null, commandId: string | null): Promise<void> {
  const aiResponse = await askDeepSeek([], systemPrompt, {}, {
    chatId: chatData.id,
    commandId,
    source: 'template',
  });
  await finishCommandTurn(chatData, sender, aiResponse, badge, commandId);
}
