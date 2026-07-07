import { NextResponse } from 'next/server';
import { findOrCreateChat, processIncomingMessage, type ChatSender } from '@/lib/chatAgent';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

function telegramSender(chatId: number): ChatSender {
  return { send: (text) => sendTelegramMessage(chatId, text) };
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

  const chatData = await findOrCreateChat({
    channel: 'telegram',
    matchColumn: 'telegram_chat_id',
    matchValue: telegramChatId,
    customerName: from?.first_name + (from?.last_name ? ` ${from.last_name}` : ''),
  });

  if (!chatData || !chatData.id) {
    return NextResponse.json({ ok: true });
  }

  await processIncomingMessage(chatData, text, telegramSender(telegramChatId));

  return NextResponse.json({ ok: true });
}
