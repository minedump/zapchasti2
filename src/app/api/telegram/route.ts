import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function askDeepSeek(prompt: string, history: any[], currentState: any, retryCount: number) {
  const systemPrompt = `
    Ты — AI-агент службы поддержки магазина запчастей.
    Твоя задача: собрать данные { "vin": string, "part_name": string, "budget": number }.
    
    ПРАВИЛА:
    1. Задавай только ОДИН вопрос за раз.
    2. Если ответ непонятен, у тебя есть 3 попытки (сейчас попытка №${retryCount + 1}).
    3. На 3-й неудачной попытке пиши "Пункт пропущен" и переходи к следующему.
    4. Когда ВСЕ данные собраны, обязательно выведи результат в формате: <RESULT>{"vin": "...", "part_name": "...", "budget": 0}</RESULT>.
    
    ТЕКУЩИЕ ДАННЫЕ: ${JSON.stringify(currentState)}
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
  const body = await req.json();
  
  if (!body.message) return NextResponse.json({ ok: true });

  const { chat, text, from } = body.message;
  const telegramChatId = chat.id;

  // 1. Найти или создать чат
  let { data: chatData, error: chatError } = await supabase
    .from('chats')
    .select('*')
    .eq('telegram_chat_id', telegramChatId)
    .single();

  if (!chatData) {
    const { data: newChat, error: createError } = await supabase
      .from('chats')
      .insert([{ 
        telegram_chat_id: telegramChatId, 
        customer_name: from.first_name + (from.last_name ? ` ${from.last_name}` : ''),
        status: 'bot_processing'
      }])
      .select()
      .single();
    chatData = newChat;
  }

  // 2. Сохранить входящее сообщение
  await supabase.from('messages').insert([{
    chat_id: chatData.id,
    content: text,
    is_from_bot: false
  }]);

  // 3. Если работает бот
  if (chatData.status === 'bot_processing') {
    // Получаем историю для контекста AI
    const { data: history } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatData.id)
      .order('created_at', { ascending: true });

    const aiResponse = await askDeepSeek(
      text, 
      history || [], 
      chatData.ai_metadata.collected_data, 
      chatData.ai_metadata.retry_count
    );

    // Проверяем, закончил ли AI сбор данных
    const resultMatch = aiResponse.match(/<RESULT>(.*?)<\/RESULT>/);
    
    if (resultMatch) {
      const finalJson = JSON.parse(resultMatch[1]);
      await supabase.from('chats').update({
        status: 'operator_needed',
        ai_metadata: { ...chatData.ai_metadata, collected_data: finalJson }
      }).eq('id', chatData.id);

      await sendTelegramMessage(telegramChatId, aiResponse.replace(/<RESULT>.*?<\/RESULT>/, "") + "\n\n✅ Данные собраны. Сейчас подключится оператор.");
    } else {
      // Обновляем метаданные (например, инкремент попыток, если нужно - здесь упрощено)
      await sendTelegramMessage(telegramChatId, aiResponse);
    }

    // Сохраняем ответ бота в базу
    await supabase.from('messages').insert([{
      chat_id: chatData.id,
      content: aiResponse.replace(/<RESULT>.*?<\/RESULT>/, ""),
      is_from_bot: true,
      is_ai_generated: true
    }]);
  }

  return NextResponse.json({ ok: true });
}
