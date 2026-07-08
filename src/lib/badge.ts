/**
 * Formats a badge as a `[Badge]` signature line before the message text —
 * this becomes the actual message content sent over the channel (Telegram/
 * WeChat) and stored in `messages.content`, so the customer and the operator
 * see the exact same signed text instead of separate UI chrome.
 */
export function withBadge(text: string, badge?: string | null): string {
  return badge ? `[${badge}]\n${text}` : text;
}
