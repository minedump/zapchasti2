import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Deletes this account's data in our own database only — never touches the
 * gateway (no delete endpoint there, and the WeChat login session/credentials
 * should survive regardless of whether this app still tracks the account).
 * chats.wechat_bot_name isn't a foreign key (bot_name is just a shared text
 * value), so both rows are deleted explicitly; chats cascades to its own
 * messages/orders/etc. via existing FKs.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ botName: string }> }) {
  const { botName } = await params;

  const { error: chatsError } = await supabaseAdmin.from('chats').delete().eq('wechat_bot_name', botName);
  if (chatsError) {
    return NextResponse.json({ error: chatsError.message }, { status: 500 });
  }

  const { error: labelError } = await supabaseAdmin.from('wechat_account_labels').delete().eq('bot_name', botName);
  if (labelError) {
    return NextResponse.json({ error: labelError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
