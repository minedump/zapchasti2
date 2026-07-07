import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function PATCH(req: Request, { params }: { params: Promise<{ botName: string }> }) {
  const { botName } = await params;
  const { label } = await req.json();

  if (!label || typeof label !== 'string' || !label.trim()) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }

  // The AFTER UPDATE trigger on this table (see migration 20240707000005)
  // propagates the new label into chats.customer_name for any chat that
  // hasn't had its name manually changed since — updating unconditionally
  // here is safe because the trigger itself is the conservative part.
  const { error } = await supabaseAdmin
    .from('wechat_account_labels')
    .upsert({ bot_name: botName, label: label.trim() }, { onConflict: 'bot_name' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
