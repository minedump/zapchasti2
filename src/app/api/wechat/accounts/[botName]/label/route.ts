import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function PATCH(req: Request, { params }: { params: Promise<{ botName: string }> }) {
  const { botName } = await params;
  const { label, badge } = await req.json();

  if (label !== undefined && (typeof label !== 'string' || !label.trim())) {
    return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 });
  }
  if (label === undefined && badge === undefined) {
    return NextResponse.json({ error: 'label or badge is required' }, { status: 400 });
  }

  const payload: Record<string, string | null> = { bot_name: botName };
  if (label !== undefined) payload.label = label.trim();
  if (badge !== undefined) payload.badge = typeof badge === 'string' && badge.trim() ? badge.trim() : null;

  // The AFTER UPDATE trigger on wechat_account_labels (see migration
  // 20240707000005) propagates a renamed label into chats.customer_name for
  // any chat that hasn't had its name manually changed since — updating
  // unconditionally here is safe because the trigger itself is the
  // conservative part. Only columns present in `payload` are touched — the
  // other field (badge or label) is left as-is when omitted.
  const { error } = await supabaseAdmin
    .from('wechat_account_labels')
    .upsert(payload, { onConflict: 'bot_name' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
