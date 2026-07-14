// Service worker для Web Push уведомлений (обязателен для iOS PWA —
// уведомления там работают только через push-события, не через new Notification()).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'PromptFlow', body: event.data.text() };
  }

  event.waitUntil((async () => {
    // Если дашборд открыт и в фокусе — оператор и так видит чат, не дублируем.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const focused = windows.some((w) => w.focused && w.visibilityState === 'visible');
    if (focused) return;

    await self.registration.showNotification(payload.title || 'PromptFlow', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.chatId || 'promptflow', // новое сообщение чата заменяет предыдущее уведомление
      data: { chatId: payload.chatId || null },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const chatId = event.notification.data?.chatId;
  const url = chatId ? `/dashboard?chatId=${chatId}` : '/dashboard';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((w) => w.url.includes('/dashboard'));
    if (existing) {
      await existing.focus();
      await existing.navigate(url);
    } else {
      await self.clients.openWindow(url);
    }
  })());
});
