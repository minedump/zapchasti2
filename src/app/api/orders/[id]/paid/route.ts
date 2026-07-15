import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { runPaymentRules } from '@/lib/orderForwarding';

// Тумблер оплаты — через серверный роут, чтобы срабатывали триггеры на
// события "оплачен"/"оплата снята" (им нужны секреты, недоступные в браузере).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { isPaid } = await req.json();

  if (typeof isPaid !== 'boolean') {
    return NextResponse.json({ error: 'isPaid (boolean) is required' }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .update({ is_paid: isPaid })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: error?.message ?? 'order not found' }, { status: 500 });
  }

  // Ошибки правил не блокируют ответ — они логируются в order_forward_log.
  await runPaymentRules(order, isPaid).catch((err) => {
    console.error('runPaymentRules failed:', err);
  });

  return NextResponse.json({ ok: true, order });
}
