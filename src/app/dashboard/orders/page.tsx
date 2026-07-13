'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { MessageCircle, Calendar, ChevronDown, Plus, Search, X } from 'lucide-react';
import { Badge, Button, Input, Skeleton, Toggle } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { cn } from '@/lib/utils';
import { toast, Toaster } from 'react-hot-toast';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);
  const [openTagPickerId, setOpenTagPickerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paidFilter, setPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
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

  // Все три фильтра независимы и совмещаются друг с другом (AND)
  const filteredOrders = orders
    .filter((o) => statusFilter === 'all' || o.status_id === statusFilter)
    .filter((o) => paidFilter === 'all' || (paidFilter === 'paid' ? !!o.is_paid : !o.is_paid))
    .filter((o) => (o.chats?.customer_name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()));

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

      {/* Filters */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input
            placeholder="Поиск по имени клиента..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              title="Очистить"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus-visible:outline-none"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-colors',
              statusFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            )}
          >
            Все статусы
          </button>
          {statuses.map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(statusFilter === s.id ? 'all' : s.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-colors"
              style={statusFilter === s.id
                ? { backgroundColor: s.color, color: '#fff' }
                : { backgroundColor: '#f1f5f9', color: '#94a3b8' }
              }
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusFilter === s.id ? '#fff' : s.color }} />
              {s.name}
            </button>
          ))}

          <span className="w-px h-5 bg-slate-200 mx-1" />

          <button
            onClick={() => setPaidFilter('all')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-colors',
              paidFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            )}
          >
            Все
          </button>
          <button
            onClick={() => setPaidFilter(paidFilter === 'paid' ? 'all' : 'paid')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-colors',
              paidFilter === 'paid' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            )}
          >
            Оплачен
          </button>
          <button
            onClick={() => setPaidFilter(paidFilter === 'unpaid' ? 'all' : 'unpaid')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-colors',
              paidFilter === 'unpaid' ? 'bg-slate-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            )}
          >
            Не оплачен
          </button>
        </div>
      </div>

      {/* Orders list */}
      <div className="grid gap-6">
        {loading ? (
          [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
        ) : (
          filteredOrders.map((order) => {
            const orderTagIds = new Set((order.order_tags || []).map((ot: any) => ot.tag_id));
            const activeTagList = (order.order_tags || []).map((ot: any) => ot.tags).filter(Boolean);
            return (
            <div key={order.id} className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-slate-300 transition-all">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  {/* Row 1: Заказ №4 + статус + оплата */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-lg font-bold text-slate-900">Заказ №{order.order_number}</span>

                    {/* Status dropdown */}
                    <div className="relative" data-dropdown>
                      <button
                        onMouseDown={(e) => { e.stopPropagation(); setOpenStatusId(openStatusId === order.id ? null : order.id); }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase cursor-pointer transition-all hover:opacity-80 focus-visible:outline-none"
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
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors focus-visible:outline-none"
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
                      <Toggle checked={!!order.is_paid} onChange={(v) => togglePaid(order.id, v)} color="green" aria-label="Статус оплаты" />
                      <span className={order.is_paid ? 'text-xs font-bold text-emerald-600' : 'text-xs font-bold text-slate-400'}>
                        {order.is_paid ? 'Оплачен' : 'Не оплачен'}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: клиент + дата + команда + метки */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-slate-500">
                      {order.chats?.customer_name || 'Клиент'}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(order.created_at).toLocaleDateString()} {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <Badge mono={!!order.command_id} title={order.command?.description}>
                      {order.command_id ? (order.command?.command || order.command?.description || '…') : 'без команды'}
                    </Badge>
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
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Tag picker */}
                  {tags.length > 0 && (
                    <div className="relative" data-dropdown>
                      <Button
                        variant="secondary"
                        className="gap-2 focus-visible:outline-none"
                        onMouseDown={(e) => { e.stopPropagation(); setOpenTagPickerId(openTagPickerId === order.id ? null : order.id); }}
                      >
                        <Plus size={16} /> Добавить метку
                      </Button>
                      {openTagPickerId === order.id && (
                        <div className="absolute top-full right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                          {tags.map(tag => {
                            const active = orderTagIds.has(tag.id);
                            return (
                              <button
                                key={tag.id}
                                onMouseDown={(e) => { e.stopPropagation(); toggleTag(order.id, tag.id, active); setOpenTagPickerId(null); }}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors focus-visible:outline-none"
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
                    <MessageCircle size={16} /> Открыть чат
                  </Button>
                </div>
              </div>

              {/* Row 3: Данные заказа — на всю ширину */}
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Данные заказа</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(order.data || {}).map(([key, value]: [string, any]) => (
                    <div key={key} className="px-3 py-1.5 bg-white rounded-lg border border-slate-200 text-xs">
                      <span className="text-slate-400 mr-1">{key}:</span>
                      <span className="font-medium text-slate-700">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            );
          })
        )}

        {filteredOrders.length === 0 && !loading && (
          <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border-2 border-dashed">
            {orders.length === 0 ? 'Заказов пока нет' : 'Ничего не найдено по заданным фильтрам'}
          </div>
        )}
      </div>
    </div>
    <Footer />
    </div>
  );
}
