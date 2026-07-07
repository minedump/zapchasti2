import { NextResponse } from 'next/server';
import { findOrCreateChat, processIncomingMessage } from '@/lib/chatAgent';
import { telegramSender } from '@/lib/channelSenders';

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
