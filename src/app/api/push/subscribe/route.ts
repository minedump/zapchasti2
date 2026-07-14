import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Сохраняет Web Push подписку устройства (браузер/PWA). Идемпотентно:
// endpoint уникален, повторная подписка того же устройства обновляет ключи.
export async function POST(req: Request) {
  const { subscription, userAgent } = await req.json();

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('push_subscriptions').upsert(
    {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent ?? null,
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
