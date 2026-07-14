import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase';

// Web Push на все подписанные устройства оператора (десктоп-браузеры и
// iOS PWA). Вызывается из processIncomingMessage при входящем сообщении
// в чат с включённым колокольчиком (chats.notify_on_message).

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

export async function sendPushToAll(payload: { title: string; body: string; chatId?: string }): Promise<void> {
  if (!ensureConfigured()) {
    console.error('sendPushToAll: VAPID-ключи не заданы (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)');
    return;
  }

  const { data: subscriptions } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');

  if (!subscriptions?.length) return;

  const json = JSON.stringify(payload);

  await Promise.all(subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        json
      );
    } catch (err: any) {
      // 404/410 — подписка протухла (пользователь снёс PWA, отозвал
      // разрешение и т.п.) — вычищаем, чтобы не долбиться в неё вечно.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.error('sendPushToAll failed for', sub.endpoint.slice(0, 60), err?.statusCode ?? err);
      }
    }
  }));
}
