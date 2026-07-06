import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const AVATAR_COLORS = ['rose', 'pink', 'fuchsia', 'violet', 'indigo', 'sky', 'teal', 'emerald', 'amber', 'orange'];
function pickAvatarColor(telegramChatId: number): string {
  return AVATAR_COLORS[Math.abs(telegramChatId) % AVATAR_COLORS.length];
}

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
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

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ ok: true });
  }
  
  if (!body || !body.message || !body.message.chat || !body.message.chat.id || !body.message.text) {
    return NextResponse.json({ ok: true });
  }

  const { chat, text, from } = body.message;
  const telegramChatId = chat.id;

  // 1. Найти или создать чат через Admin Client
  let { data: chatData, error: chatError } = await supabaseAdmin
    .from('chats')
    .select('*')
    .eq('telegram_chat_id', telegramChatId)
    .maybeSingle();

  if (!chatData) {
    const { data: newChat, error: createError } = await supabaseAdmin
      .from('chats')
      .insert([{ 
        telegram_chat_id: telegramChatId, 
        customer_name: from?.first_name + (from?.last_name ? ` ${from.last_name}` : ''),
        status: 'bot_processing',
        avatar_color: pickAvatarColor(telegramChatId),
        ai_metadata: { step: 'start', retry_count: 0, collected_data: {} }
      }])
      .select()
      .maybeSingle();
    
    if (createError || !newChat) {
      console.error('Error creating chat:', createError);
      return NextResponse.json({ ok: true });
    }
    chatData = newChat;
  }

  if (!chatData || !chatData.id) {
    return NextResponse.json({ ok: true });
  }

  // 2. Сохранить входящее сообщение
  await supabaseAdmin.from('messages').insert([{
    chat_id: chatData.id,
    content: text,
    is_from_bot: false
  }]);

  // 3. Если это команда (начинается с /)
  if (text.startsWith('/')) {
    // Если бот уже в процессе, не даем переключить команду
    if (chatData.status === 'bot_processing') {
      await sendTelegramMessage(telegramChatId, "Пожалуйста, сначала завершите текущий опрос.");
      return NextResponse.json({ ok: true });
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
        ai_metadata: {
          step: 'start',
          retry_count: 0,
          collected_data: {},
          current_prompt: commandData.prompt_template
        }
      }).eq('id', chatData.id);

      const aiResponse = await askDeepSeek(
        "Начни опрос", 
        [], 
        {},
        0,
        commandData.prompt_template
      );

      await sendTelegramMessage(telegramChatId, aiResponse);
      
      await supabaseAdmin.from('messages').insert([{
        chat_id: chatData.id,
        content: aiResponse,
        is_from_bot: true,
        is_ai_generated: true
      }]);
      
      return NextResponse.json({ ok: true });
    }
  }

  // 4. Если работает бот
  if (chatData.status === 'bot_processing') {
    const metadata = chatData.ai_metadata || {};
    let currentPrompt = metadata.current_prompt;
    
    // Если промпта нет (дефолтный режим), берем его из настроек и добавляем знания
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

    // Логика парсинга результата
    const resultMatch = aiResponse.match(/<RESULT>([\s\S]*?)<\/RESULT>/i);
    
    if (resultMatch) {
      try {
        const jsonString = resultMatch[1].trim();
        const finalJson = JSON.parse(jsonString);
        
        // Получаем ID статуса 'Новый'
        const { data: statusData } = await supabaseAdmin
          .from('order_statuses')
          .select('id')
          .eq('name', 'Новый')
          .single();

        // Создаем новый заказ
        await supabaseAdmin.from('orders').insert([{
          chat_id: chatData.id,
          data: finalJson,
          status_id: statusData?.id
        }]);

        await supabaseAdmin.from('chats').update({
          status: 'operator_needed',
          ai_metadata: { ...metadata, collected_data: finalJson }
        }).eq('id', chatData.id);

        const cleanMessage = aiResponse.replace(/<RESULT>[\s\S]*?<\/RESULT>/i, "").trim();
        await sendTelegramMessage(telegramChatId, cleanMessage + "\n\n✅ Данные собраны. Сейчас подключится оператор.");
      } catch (e) {
        console.error('JSON Parse Error:', e);
        await sendTelegramMessage(telegramChatId, aiResponse);
      }
    } else {
      await sendTelegramMessage(telegramChatId, aiResponse);
    }

    await supabaseAdmin.from('messages').insert([{
      chat_id: chatData.id,
      content: aiResponse.replace(/<RESULT>[\s\S]*?<\/RESULT>/i, "").trim(),
      is_from_bot: true,
      is_ai_generated: true
    }]);
  }

  return NextResponse.json({ ok: true });
}