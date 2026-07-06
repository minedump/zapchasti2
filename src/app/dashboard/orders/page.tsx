'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ShoppingBag, MessageCircle, Calendar, User } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        chats (id, customer_name, telegram_chat_id),
        order_statuses (name, color)
      `)
      .order('created_at', { ascending: false });

    if (data) setOrders(data);
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <ShoppingBag className="text-blue-600" /> Все заказы
          </h1>
          <p className="text-slate-500 mt-1">История всех запросов от клиентов</p>
        </div>
      </div>

      <div className="grid gap-6">
        {loading ? (
          [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
        ) : (
          orders.map((order) => (
            <div key={order.id} className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-bold font-mono">
                      #{order.order_number}
                    </span>
                    <div className="flex items-center gap-2 text-slate-800 font-semibold">
                      <User size={16} className="text-slate-400" />
                      {order.chats?.customer_name || 'Клиент'}
                    </div>
                    {order.order_statuses && (
                      <span 
                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase"
                        style={{ backgroundColor: order.order_statuses.color + '20', color: order.order_statuses.color }}
                      >
                        {order.order_statuses.name}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(order.data || {}).map(([key, value]: [string, any]) => (
                      <div key={key} className="px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                        <span className="text-slate-400 mr-1">{key}:</span>
                        <span className="font-medium text-slate-700">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right hidden md:block">
                    <div className="text-xs text-slate-400 flex items-center justify-end gap-1">
                      <Calendar size={12} />
                      {new Date(order.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-[10px] text-slate-300">{new Date(order.created_at).toLocaleTimeString()}</div>
                  </div>
                  <Button 
                    variant="secondary" 
                    onClick={() => router.push(`/dashboard?chatId=${order.chat_id}`)}
                    className="gap-2"
                  >
                    <MessageCircle size={18} /> В чат
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}

        {orders.length === 0 && !loading && (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border-2 border-dashed">
            Заказов пока нет
          </div>
        )}
      </div>
    </div>
  );
}
