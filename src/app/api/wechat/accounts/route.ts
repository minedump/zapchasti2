import { NextResponse } from 'next/server';
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

  const { data: labels } = await supabaseAdmin.from('wechat_account_labels').select('bot_name, label');
  const labelByBotName = new Map((labels ?? []).map((l) => [l.bot_name, l.label]));

  const accounts = (data.accounts ?? []).map((acc: any) => ({
    ...acc,
    label: labelByBotName.get(acc.bot_name) ?? acc.bot_name,
  }));

  return NextResponse.json({ accounts });
}

export async function POST(req: Request) {
  if (!GATEWAY_URL || !GATEWAY_API_KEY) {
    return NextResponse.json({ error: 'Gateway not configured' }, { status: 500 });
  }

  const body = await req.json();
  const res = await fetch(`${GATEWAY_URL}/v1/accounts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  // Initial label defaults to whatever name was used to connect the account —
  // editable later without touching the gateway's own bot_name (immutable
  // session key). Only set on first registration, never overwritten here.
  if (body.bot_name) {
    await supabaseAdmin
      .from('wechat_account_labels')
      .upsert({ bot_name: body.bot_name, label: body.bot_name }, { onConflict: 'bot_name', ignoreDuplicates: true });
  }

  return NextResponse.json(data, { status: res.status });
}
