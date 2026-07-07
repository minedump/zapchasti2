import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { runForwardRules } from '@/lib/orderForwarding';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { statusId } = await req.json();

  if (!statusId) {
    return NextResponse.json({ error: 'statusId is required' }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .update({ status_id: statusId })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: error?.message ?? 'order not found' }, { status: 500 });
  }

  // Не блокируем ответ оператору сбоем пересылки — правила логируют свои
  // ошибки в order_forward_log самостоятельно.
  await runForwardRules(order, statusId).catch((err) => {
    console.error('runForwardRules failed:', err);
  });

  return NextResponse.json({ ok: true, order });
}
