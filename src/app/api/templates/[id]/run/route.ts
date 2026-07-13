import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { runMessageTemplate, formatOrdersForPrompt, withKnowledgeContext, getDefaultCommand } from '@/lib/chatAgent';
import { getSenderForChat } from '@/lib/channelSenders';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { chatId, extraAnswer } = await req.json();

  if (!chatId) {
    return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
  }

  const { data: template } = await supabaseAdmin
    .from('message_templates')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (!template) {
    return NextResponse.json({ error: 'Шаблон не найден' }, { status: 404 });
  }

  const { data: chat } = await supabaseAdmin.from('chats').select('*').eq('id', chatId).maybeSingle();
  if (!chat) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 });
  }

  if (chat.active_command_id) {
    return NextResponse.json({ error: 'Чат занят активной командой' }, { status: 409 });
  }

  let command: { id: string; prompt_template: string; badge: string | null; knowledge_mode?: string | null } | null = null;
  if (template.command_id) {
    const { data } = await supabaseAdmin
      .from('bot_commands')
      .select('id, prompt_template, badge, knowledge_mode')
      .eq('id', template.command_id)
      .maybeSingle();
    command = data;
  }

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('order_number, data, order_statuses (name)')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  // Промпт команды идёт с её статьями базы знаний — так же, как при обычном
  // запуске команды через processIncomingMessage.
  const commandPrompt = command ? await withKnowledgeContext(command.prompt_template, command) : null;

  const systemPrompt = [
    commandPrompt,
    `ЗАДАЧА: ${template.context}`,
    extraAnswer ? `УТОЧНЕНИЕ ОПЕРАТОРА (${template.extra_question}): ${extraAnswer}` : null,
    `ЗАКАЗЫ КЛИЕНТА В ЭТОМ ЧАТЕ:\n${formatOrdersForPrompt((orders ?? []) as any)}`,
  ].filter(Boolean).join('\n\n');

  let badge = command?.badge ?? null;
  if (!badge) {
    const defaultCommand = await getDefaultCommand(chat.channel);
    badge = defaultCommand?.badge ?? null;
  }

  let chatForRun = chat;
  if (command) {
    const { data: updatedChat } = await supabaseAdmin
      .from('chats')
      .update({ active_command_id: command.id, status: 'bot_processing' })
      .eq('id', chatId)
      .select()
      .maybeSingle();
    if (updatedChat) chatForRun = updatedChat;
  }

  const sender = getSenderForChat(chatForRun);
  await runMessageTemplate(chatForRun, systemPrompt, sender, badge, command?.id ?? null);

  return NextResponse.json({ ok: true });
}
