import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';

const GATEWAY_URL = process.env.WECHAT_GATEWAY_URL;
const GATEWAY_API_KEY = process.env.WECHAT_GATEWAY_API_KEY;

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${GATEWAY_API_KEY}` };
}

export async function GET() {
  if (!GATEWAY_URL || !GATEWAY_API_KEY) {
    return NextResponse.json({ error: 'Gateway not configured' }, { status: 500 });
  }

  const res = await fetch(`${GATEWAY_URL}/v1/accounts`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const { data: labels } = await supabaseAdmin.from('wechat_account_labels').select('bot_name, label, badge');
  const labelByBotName = new Map((labels ?? []).map((l) => [l.bot_name, l.label]));
  const badgeByBotName = new Map((labels ?? []).map((l) => [l.bot_name, l.badge]));

  // Most recently active chat per account — powers an "open chat" shortcut
  // straight to the conversation once one has actually started.
  const { data: chats } = await supabaseAdmin
    .from('chats')
    .select('id, wechat_bot_name, last_message_at')
    .eq('channel', 'wechat')
    .order('last_message_at', { ascending: false });

  const latestChatByBotName = new Map<string, string>();
  for (const chat of chats ?? []) {
    if (chat.wechat_bot_name && !latestChatByBotName.has(chat.wechat_bot_name)) {
      latestChatByBotName.set(chat.wechat_bot_name, chat.id);
    }
  }

  const accounts = (data.accounts ?? []).map((acc: any) => ({
    ...acc,
    label: labelByBotName.get(acc.bot_name) ?? acc.bot_name,
    badge: badgeByBotName.get(acc.bot_name) ?? null,
    chat_id: latestChatByBotName.get(acc.bot_name) ?? null,
  }));

  return NextResponse.json({ accounts });
}

export async function POST(req: Request) {
  if (!GATEWAY_URL || !GATEWAY_API_KEY) {
    return NextResponse.json({ error: 'Gateway not configured' }, { status: 500 });
  }

  const body = await req.json();

  // Two callers hit this route: creating a brand-new account (only a
  // human-facing `label`, no bot_name yet — we generate the technical
  // routing key and it's never shown in the UI) and retrying an existing
  // one after a failed login (bot_name given directly, label untouched).
  let botName: string = body.bot_name;
  const isNew = !botName;
  if (isNew) {
    botName = `wc-${randomBytes(6).toString('hex')}`;
  }

  const res = await fetch(`${GATEWAY_URL}/v1/accounts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ bot_name: botName }),
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  if (isNew) {
    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : botName;
    const badge = typeof body.badge === 'string' && body.badge.trim() ? body.badge.trim() : null;
    await supabaseAdmin
      .from('wechat_account_labels')
      .upsert({ bot_name: botName, label, badge }, { onConflict: 'bot_name', ignoreDuplicates: true });
  }

  return NextResponse.json(data, { status: res.status });
}
