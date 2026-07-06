'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { MessageCircle, Calendar, User, ChevronDown, Plus, X, Tag } from 'lucide-react';
import { Button, Input, Skeleton } from '@/components/ui';
import { toast, Toaster } from 'react-hot-toast';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [showAddTag, setShowAddTag] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchOrders();
    fetchStatuses();
    fetchTags();
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

  const fetchStatuses = async () => {
    const { data } = await supabase.from('order_statuses').select('*').order('created_at');
    if (data) setStatuses(data);
  };

  const fetchTags = async () => {
    const { data } = await supabase.from('tags').select('*').order('created_at');
    if (data) setTags(data);
  };

  const updateStatus = async (orderId: string, statusId: string) => {
    const status = statuses.find(s => s.id === statusId);
    await supabase.from('orders').update({ status_id: statusId }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status_id: statusId, order_statuses: status } : o));
    setOpenStatusId(null);
    toast.success('Статус обновлён');
  };

  const addTag = async () => {
    if (!newTagName.trim()) return;
    const { error } = await supabase.from('tags').insert([{ name: newTagName.trim(), color: newTagColor }]);
    if (error) toast.error('Такая метка уже существует');
    else { toast.success('Метка добавлена'); setNewTagName(''); setNewTagColor('#3b82f6'); setShowAddTag(false); fetchTags(); }
  };

  const deleteTag = async (id: string) => {
    await supabase.from('tags').delete().eq('id', id);
    fetchTags();
    toast.success('Метка удалена');
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = () => { setOpenStatusId(null); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
    <Toaster position="top-right" />
    <div className="p-8 max-w-5xl mx-auto w-full flex-1">

      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Все заказы</h1>
          <p className="text-slate-500 mt-1">История всех запросов от клиентов</p>
        </div>
      </div>

      {/* Tags management */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
            <Tag size={16} className="text-blue-500" /> Метки
          </h2>
          <Button size="sm" variant="secondary" className="gap-1" onClick={() => setShowAddTag(v => !v)}>
            <Plus size={14} /> Добавить
          </Button>
        </div>
        {showAddTag && (
          <div className="flex items-center gap-2 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <input
              type="color"
              value={newTagColor}
              onChange={e => setNewTagColor(e.target.value)}
              className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200 bg-transparent shrink-0"
            />
            <Input
              placeholder="Название метки"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              className="flex-1 bg-white"
              autoFocus
            />
            <Button size="sm" className="gap-1 shrink-0" onClick={addTag}>Добавить</Button>
            <Button size="sm" variant="secondary" className="p-2 shrink-0" onClick={() => { setShowAddTag(false); setNewTagName(''); }}>
              <X size={14} />
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && !showAddTag && (
            <p className="text-sm text-slate-400">Меток пока нет</p>
          )}
          {tags.map(tag => (
            <div
              key={tag.id}
              className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-bold group"
              style={{ backgroundColor: tag.color + '20', color: tag.color }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
              {tag.name}
              <button
                onClick={() => deleteTag(tag.id)}
                className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/10"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Orders list */}
      <div className="grid gap-6">
        {loading ? (
          [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
        ) : (
          orders.map((order) => (
            <div key={order.id} className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-bold font-mono">
                      #{order.order_number}
                    </span>
                    <div className="flex items-center gap-2 text-slate-800 font-semibold">
                      <User size={16} className="text-slate-400" />
                      {order.chats?.customer_name || 'Клиент'}
                    </div>

                    {/* Status dropdown */}
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenStatusId(openStatusId === order.id ? null : order.id); }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase cursor-pointer transition-all hover:opacity-80"
                        style={order.order_statuses
                          ? { backgroundColor: order.order_statuses.color + '20', color: order.order_statuses.color }
                          : { backgroundColor: '#f1f5f9', color: '#94a3b8' }
                        }
                      >
                        {order.order_statuses && (
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: order.order_statuses.color }} />
                        )}
                        {order.order_statuses?.name || 'Статус'}
                        <ChevronDown size={12} />
                      </button>
                      {openStatusId === order.id && (
                        <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                          {statuses.map(s => (
                            <button
                              key={s.id}
                              onClick={(e) => { e.stopPropagation(); updateStatus(order.id, s.id); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors"
                            >
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                              <span style={{ color: s.color }}>{s.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
    <footer className="shrink-0 border-t border-slate-200 bg-white px-8 py-3 text-center text-xs text-slate-400">
      &copy; {new Date().getFullYear()} PromptFlow &mdash; CRM для Telegram
    </footer>
    </div>
  );
}
