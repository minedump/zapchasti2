import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { findOrCreateChat, processIncomingMessage, type ChatSender } from '@/lib/chatAgent';
import { supabaseAdmin } from '@/lib/supabase';

const GATEWAY_URL = process.env.WECHAT_GATEWAY_URL;
const GATEWAY_API_KEY = process.env.WECHAT_GATEWAY_API_KEY;
const WEBHOOK_SECRET = process.env.WECHAT_GATEWAY_WEBHOOK_SECRET;

function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', WEBHOOK_SECRET!).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function wechatSender(botName: string, userId: string): ChatSender {
  return {
    send: async (text: string) => {
      await fetch(`${GATEWAY_URL}/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GATEWAY_API_KEY}` },
        body: JSON.stringify({ bot_name: botName, user_id: userId, content: text }),
      });
    },
  };
}

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET || !GATEWAY_URL || !GATEWAY_API_KEY) {
    console.error('WeChat gateway env vars not configured');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-wechat-gateway-signature');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return NextResponse.json({ ok: true });
  }

  const { bot_name, userId, text } = payload;
  if (!bot_name || !userId || typeof text !== 'string') {
    return NextResponse.json({ ok: true });
  }

  // Только для новых чатов — findOrCreateChat не трогает существующие customer_name,
  // а дальнейшие переименования метки аккаунта распространяются триггером на БД.
  const { data: labelRow } = await supabaseAdmin
    .from('wechat_account_labels')
    .select('label')
    .eq('bot_name', bot_name)
    .maybeSingle();

  const chatData = await findOrCreateChat({
    channel: 'wechat',
    matchColumn: 'wechat_user_id',
    matchValue: userId,
    customerName: labelRow?.label ?? bot_name,
    extraFields: { wechat_bot_name: bot_name },
  });

  if (!chatData || !chatData.id) {
    return NextResponse.json({ ok: true });
  }

  await processIncomingMessage(chatData, text, wechatSender(bot_name, userId));

  return NextResponse.json({ ok: true });
}
