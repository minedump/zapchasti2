'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ShoppingBag, MessageCircle, ExternalLink } from 'lucide-react';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        chats (id, customer_name, telegram_chat_id)
      `)
      .order('created_at', { ascending: false });

    if (data) setOrders(data);
    setLoading(false);
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ShoppingBag className="text-blue-600" /> Все заказы
        </h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-4 text-xs font-semibold text-slate-500 uppercase">№ Заказа</th>
              <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Клиент</th>
              <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Данные</th>
              <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Дата</th>
              <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4">
                  <span className="font-mono font-bold text-blue-600">#{order.order_number}</span>
                </td>
                <td className="p-4">
                  <div className="font-medium text-slate-700">{order.chats?.customer_name || 'Неизвестно'}</div>
                  <div className="text-xs text-slate-400">ID: {order.chats?.telegram_chat_id}</div>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(order.data || {}).map(([key, value]: [string, any]) => (
                      <span key={key} className="px-2 py-1 bg-slate-100 rounded text-[10px] text-slate-600">
                        <span className="font-semibold">{key}:</span> {String(value)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-4 text-sm text-slate-500">
                  {new Date(order.created_at).toLocaleString()}
                </td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => router.push(`/dashboard?chatId=${order.chat_id}`)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                  >
                    <MessageCircle size={16} /> В чат
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {orders.length === 0 && !loading && (
          <div className="p-12 text-center text-slate-400">
            Заказов пока нет
          </div>
        )}
      </div>
    </div>
  );
}
