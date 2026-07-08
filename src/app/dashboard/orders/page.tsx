'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { MessageCircle, Calendar, User, ChevronDown, Plus, X } from 'lucide-react';
import { Badge, Button, Skeleton, Toggle } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { toast, Toaster } from 'react-hot-toast';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);
  const [openTagPickerId, setOpenTagPickerId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchOrders();
    fetchStatuses();
    fetchTags();
  }, []);

  // Close dropdowns on outside click (mousedown fires before click, avoids same-click close)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-dropdown]')) {
        setOpenStatusId(null);
        setOpenTagPickerId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        chats (id, customer_name, telegram_chat_id),
        order_statuses (id, name, color),
        order_tags (tag_id, tags (id, name, color)),
        command:bot_commands (id, command, description)
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
    // Через серверный роут, а не напрямую — там же срабатывают правила
    // пересылки заказов (см. /dashboard/triggers), которым нужны секреты,
    // недоступные в браузере.
    await fetch(`/api/orders/${orderId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusId }),
    });
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status_id: statusId, order_statuses: status } : o));
    setOpenStatusId(null);
    toast.success('Статус обновлён');
  };

  const togglePaid = async (orderId: string, isPaid: boolean) => {
    // Оплата независима от статуса заказа — просто своё поле, без правил пересылки.
    await supabase.from('orders').update({ is_paid: isPaid }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, is_paid: isPaid } : o));
  };

  const toggleTag = async (orderId: string, tagId: string, hasTag: boolean) => {
    if (hasTag) {
      await supabase.from('order_tags').delete().eq('order_id', orderId).eq('tag_id', tagId);
    } else {
      await supabase.from('order_tags').insert([{ order_id: orderId, tag_id: tagId }]);
    }
    fetchOrders();
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
    <Toaster position="top-right" />
    <div className="p-8 max-w-5xl mx-auto w-full flex-1">

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Все заказы</h1>
          <p className="text-slate-500 mt-1">История всех запросов от клиентов</p>
        </div>
      </div>

      {/* Orders list */}
      <div className="grid gap-6">
        {loading ? (
          [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
        ) : (
          orders.map((order) => {
            const orderTagIds = new Set((order.order_tags || []).map((ot: any) => ot.tag_id));
            const activeTagList = (order.order_tags || []).map((ot: any) => ot.tags).filter(Boolean);
            return (
            <div key={order.id} className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-3 flex-1">
                  {/* Row: номер + клиент + статус */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge mono>#{order.order_number}</Badge>
                    <div className="flex items-center gap-2 text-slate-800 font-semibold">
                      <User size={16} className="text-slate-400" />
                      {order.chats?.customer_name || 'Клиент'}
                    </div>

                    {/* Status dropdown */}
                    <div className="relative" data-dropdown>
                      <button
                        onMouseDown={(e) => { e.stopPropagation(); setOpenStatusId(openStatusId === order.id ? null : order.id); }}
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
                              onMouseDown={(e) => { e.stopPropagation(); updateStatus(order.id, s.id); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors"
                            >
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                              <span style={{ color: s.color }}>{s.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Оплата */}
                    <div className="flex items-center gap-2">
                      <Toggle checked={!!order.is_paid} onChange={(v) => togglePaid(order.id, v)} aria-label="Статус оплаты" />
                      <span className={order.is_paid ? 'text-xs font-bold text-emerald-600' : 'text-xs font-bold text-slate-400'}>
                        {order.is_paid ? 'Оплачен' : 'Не оплачен'}
                      </span>
                    </div>

                    {/* Команда-источник */}
                    <span className="text-[10px] font-mono text-slate-400" title={order.command?.description}>
                      {order.command_id ? (order.command?.command || order.command?.description || '…') : 'без команды'}
                    </span>
                  </div>

                  {/* Data fields */}
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(order.data || {}).map(([key, value]: [string, any]) => (
                      <div key={key} className="px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                        <span className="text-slate-400 mr-1">{key}:</span>
                        <span className="font-medium text-slate-700">{String(value)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Active tags with remove */}
                  {activeTagList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {activeTagList.map((tag: any) => (
                        <Badge
                          key={tag.id}
                          color={tag.color}
                          dot
                          uppercase={false}
                          onRemove={() => toggleTag(order.id, tag.id, true)}
                        >
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Date */}
                  <div className="text-right hidden md:block">
                    <div className="text-xs text-slate-400 flex items-center justify-end gap-1">
                      <Calendar size={12} />
                      {new Date(order.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-[10px] text-slate-300">{new Date(order.created_at).toLocaleTimeString()}</div>
                  </div>

                  {/* Tag picker */}
                  {tags.length > 0 && (
                    <div className="relative" data-dropdown>
                      <button
                        onMouseDown={(e) => { e.stopPropagation(); setOpenTagPickerId(openTagPickerId === order.id ? null : order.id); }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                        title="Добавить метку"
                      >
                        <Plus size={15} />
                      </button>
                      {openTagPickerId === order.id && (
                        <div className="absolute top-full right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                          {tags.map(tag => {
                            const active = orderTagIds.has(tag.id);
                            return (
                              <button
                                key={tag.id}
                                onMouseDown={(e) => { e.stopPropagation(); toggleTag(order.id, tag.id, active); setOpenTagPickerId(null); }}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors"
                              >
                                <span className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                                  <span style={{ color: tag.color }}>{tag.name}</span>
                                </span>
                                {active && <X size={12} className="text-slate-400" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

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
            );
          })
        )}

        {orders.length === 0 && !loading && (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border-2 border-dashed">
            Заказов пока нет
          </div>
        )}
      </div>
    </div>
    <Footer />
    </div>
  );
}
