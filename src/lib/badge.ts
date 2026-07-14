/**
 * Formats a badge as a `[Badge]` signature line before the message text —
 * this is what actually goes over the channel (Telegram/WeChat), so the
 * customer sees the signed text. In `messages.content` we store the CLEAN
 * text (badge lives in the `badge` column): baking the prefix into stored
 * content fed the `[Алиса]` line back into the model's history, and it
 * started echoing/stacking it on every turn.
 */
export function withBadge(text: string, badge?: string | null): string {
  return badge ? `[${badge}]\n${text}` : text;
}

/**
 * Strips leading `[Badge]` signature lines from message content — used when
 * rendering or feeding history to the model, to clean up rows stored before
 * the badge stopped being baked into content (and any model echoes of it).
 */
export function stripBadgePrefix(text: string, badge?: string | null): string {
  if (!badge) return text;
  const prefix = `[${badge}]`;
  let result = text;
  while (result.startsWith(prefix)) {
    result = result.slice(prefix.length).replace(/^\r?\n/, '');
  }
  return result;
}
