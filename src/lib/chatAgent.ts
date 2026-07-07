import { supabaseAdmin } from '@/lib/supabase';

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
  await sender.send(text);
  await supabaseAdmin.from('messages').insert([{
    chat_id: dbChatId,
    content: text,
    is_from_bot: true,
    is_ai_generated: false
  }]);
}

// Разбирает ответ AI на предмет тега <RESULT>...</RESULT>, которым завершается команда.
// Поддерживает два варианта:
//  - <RESULT>{ ...json... }</RESULT> — создаёт заказ с этими данными и передаёт чат оператору;
//  - <RESULT></RESULT> (пусто или невалидный JSON) — просто завершает сценарий без заказа.
// Используется и при первом ответе на запуск команды, и при последующих репликах —
// раньше это распознавалось только во втором случае, из-за чего команды, завершающиеся
// сразу первым сообщением (без сбора данных), зависали с "сырыми" тегами в чате.
async function finishCommandTurn(chatData: any, sender: ChatSender, aiResponse: string) {
  const resultMatch = aiResponse.match(/<RESULT>([\s\S]*?)<\/RESULT>/i);

  if (!resultMatch) {
    await sender.send(aiResponse);
    await supabaseAdmin.from('messages').insert([{
      chat_id: chatData.id,
      content: aiResponse,
      is_from_bot: true,
      is_ai_generated: true
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

  if (finalJson) {
    const { data: statusData } = await supabaseAdmin
      .from('order_statuses')
      .select('id')
      .eq('name', 'Новый')
      .single();

    await supabaseAdmin.from('orders').insert([{
      chat_id: chatData.id,
      data: finalJson,
      status_id: statusData?.id
    }]);
  }

  await supabaseAdmin.from('chats').update({
    status: 'operator_needed',
    active_command_id: null,
    ai_metadata: { collected_data: finalJson || {} }
  }).eq('id', chatData.id);

  const suffix = finalJson
    ? "\n\n✅ Данные собраны. Сейчас подключится оператор."
    : "\n\n✅ Готово. Сейчас подключится оператор.";
  await sender.send((cleanMessage || "Готово.") + suffix);

  await supabaseAdmin.from('messages').insert([{
    chat_id: chatData.id,
    content: cleanMessage,
    is_from_bot: true,
    is_ai_generated: true
  }]);
}

async function askDeepSeek(text: string, history: any[], currentState: any, retryCount: number, promptTemplate: string) {
  const systemPrompt = `
    ${promptTemplate}

    ТЕКУЩИЕ ДАННЫЕ: ${JSON.stringify(currentState)}
    ПОПЫТКА №${retryCount + 1} ДЛЯ ТЕКУЩЕГО ПУНКТА.
  `;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.map(m => ({ role: m.is_from_bot ? 'assistant' : 'user', content: m.content })),
      ]
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
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

    const { data: commandData } = await supabaseAdmin
      .from('bot_commands')
      .select('*')
      .eq('command', text)
      .eq('is_active', true)
      .maybeSingle();

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

      await finishCommandTurn(chatData, sender, aiResponse);
      return;
    }
  }

  // 3. Если работает бот
  if (chatData.status === 'bot_processing') {
    const metadata = chatData.ai_metadata || {};
    let currentPrompt: string | undefined;

    // Если есть активная команда, промпт берём из bot_commands напрямую —
    // так изменения в разделе "Команды AI" применяются сразу, а не только к новым опросам
    if (chatData.active_command_id) {
      const { data: activeCommand } = await supabaseAdmin
        .from('bot_commands')
        .select('prompt_template')
        .eq('id', chatData.active_command_id)
        .maybeSingle();
      currentPrompt = activeCommand?.prompt_template;
    }

    // Если промпта нет (дефолтный режим или команда была удалена), берем его из настроек и добавляем знания
    if (!currentPrompt) {
      const { data: settings } = await supabaseAdmin
        .from('bot_settings')
        .select('value')
        .eq('key', 'default_assistant_prompt')
        .single();

      const { data: knowledge } = await supabaseAdmin
        .from('knowledge_base')
        .select('title, content')
        .eq('is_active', true);

      const knowledgeContext = knowledge?.map(k => `СТАТЬЯ: ${k.title}\n${k.content}`).join('\n\n') || '';

      currentPrompt = `
        ${settings?.value || "Ты помощник."}

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

    await finishCommandTurn(chatData, sender, aiResponse);
  }
}
