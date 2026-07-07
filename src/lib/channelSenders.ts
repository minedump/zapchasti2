import type { ChatSender } from '@/lib/chatAgent';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WECHAT_GATEWAY_URL = process.env.WECHAT_GATEWAY_URL;
const WECHAT_GATEWAY_API_KEY = process.env.WECHAT_GATEWAY_API_KEY;

export function telegramSender(chatId: number): ChatSender {
  return {
    send: async (text: string) => {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    },
  };
}

export function wechatSender(botName: string, userId: string): ChatSender {
  return {
    send: async (text: string) => {
      await fetch(`${WECHAT_GATEWAY_URL}/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WECHAT_GATEWAY_API_KEY}` },
        body: JSON.stringify({ bot_name: botName, user_id: userId, content: text }),
      });
    },
  };
}

/** Picks the right sender for an arbitrary chat row based on its channel. */
export function getSenderForChat(chat: any): ChatSender {
  if (chat.channel === 'wechat') return wechatSender(chat.wechat_bot_name, chat.wechat_user_id);
  return telegramSender(chat.telegram_chat_id);
}
