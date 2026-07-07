'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { Search, Send, Bot, ShoppingBag, User, MessageSquare, ChevronDown, Plus, X } from 'lucide-react';
import { TelegramIcon, WeChatIcon } from '@/components/icons';
import { Button, Input, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { toast, Toaster } from 'react-hot-toast';

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const chatIdFromUrl = searchParams.get('chatId');

  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [hasInitialSelected, setHasInitialSelected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(null);
  const [openTagDropdown, setOpenTagDropdown] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 15;
  // 'instant' | 'smooth' | null
  const pendingScrollRef = useRef<'instant' | 'smooth' | null>(null);

  // Scroll after messages state actually renders
  useEffect(() => {
    if (pendingScrollRef.current === 'instant') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      pendingScrollRef.current = null;
    } else if (pendingScrollRef.current === 'smooth') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      pendingScrollRef.current = null;
    }
  }, [messages]);

  useEffect(() => {
    fetchChats();
    fetchStatuses();
    fetchTags();

    const chatChannel = supabase
      .channel('global-chat-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => fetchChats())
      .subscribe();

    return () => { supabase.removeChannel(chatChannel); };
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-dropdown]')) {
        setOpenStatusDropdown(null);
        setOpenTagDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchStatuses = async () => {
    const { data } = await supabase.from('order_statuses').select('*').order('created_at');
    if (data) setStatuses(data);
  };

  const fetchTags = async () => {
    const { data } = await supabase.from('tags').select('*').order('created_at');
    if (data) setTags(data);
  };

  const fetchChats = async () => {
    const { data } = await supabase
      .from('chats')
      .select('*, active_command:bot_commands(command, description)')
      .order('last_message_at', { ascending: false });
    if (data) setChats(data);
    setLoading(false);
  };

  const resetActiveCommand = async () => {
    if (!selectedChat) return;
    await supabase.from('chats').update({ active_command_id: null }).eq('id', selectedChat.id);
    setSelectedChat({ ...selectedChat, active_command_id: null, active_command: null });
    toast.success('Команда сброшена');
  };

  const handleChatSelect = (chat: any) => {
    setSelectedChat(chat);
    const newUrl = `${window.location.pathname}?chatId=${chat.id}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  // Авто-выбор чата из URL (только один раз при загрузке)
  useEffect(() => {
    if (chatIdFromUrl && chats.length > 0 && !hasInitialSelected) {
      const chat = chats.find(c => c.id === chatIdFromUrl);
      if (chat) {
        setSelectedChat(chat);
        setHasInitialSelected(true);
      }
    }
  }, [chatIdFromUrl, chats, hasInitialSelected]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.id);
      fetchOrders(selectedChat.id);
      
      const msgChannel = supabase
        .channel(`chat-messages-${selectedChat.id}`)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'messages', 
          filter: `chat_id=eq.${selectedChat.id}` 
        }, (payload) => {
          setMessages(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev;
            pendingScrollRef.current = 'smooth';
            return [...prev, payload.new];
          });
        })
        .subscribe();

      const orderChannel = supabase
        .channel(`chat-orders-${selectedChat.id}`)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'orders', 
          filter: `chat_id=eq.${selectedChat.id}` 
        }, (payload) => {
          fetchOrders(selectedChat.id);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(msgChannel);
        supabase.removeChannel(orderChannel);
      };
    }
  }, [selectedChat]);

  const fetchMessages = async (chatId: string) => {
    const { data, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (data) {
      pendingScrollRef.current = 'instant';
      setMessages(data.reverse());
      setHasMore((count ?? 0) > PAGE_SIZE);
    }
  };

  const loadMoreMessages = useCallback(async () => {
    if (!selectedChat || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const oldest = messages[0];
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', selectedChat.id)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (data && data.length > 0) {
      const container = messagesContainerRef.current;
      const prevScrollHeight = container?.scrollHeight ?? 0;
      setMessages(prev => [...data.reverse(), ...prev]);
      setHasMore(data.length === PAGE_SIZE);
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - prevScrollHeight;
      });
    } else {
      setHasMore(false);
    }
    setLoadingMore(false);
  }, [selectedChat, loadingMore, hasMore, messages]);

  // Infinite scroll — load more when scrolled to top
  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (container.scrollTop < 60 && hasMore && !loadingMore) {
      loadMoreMessages();
    }
  }, [hasMore, loadingMore, loadMoreMessages]);

  const fetchOrders = async (chatId: string) => {
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        order_statuses (id, name, color),
        order_tags (tag_id, tags (id, name, color))
      `)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
  };

  const updateOrderStatus = async (orderId: string, statusId: string) => {
    const status = statuses.find(s => s.id === statusId);
    await supabase.from('orders').update({ status_id: statusId }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status_id: statusId, order_statuses: status } : o));
    setOpenStatusDropdown(null);
    toast.success('Статус обновлён');
  };

  const toggleOrderTag = async (orderId: string, tagId: string, hasTag: boolean) => {
    if (hasTag) {
      await supabase.from('order_tags').delete().eq('order_id', orderId).eq('tag_id', tagId);
    } else {
      await supabase.from('order_tags').insert([{ order_id: orderId, tag_id: tagId }]);
    }
    fetchOrders(selectedChat.id);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;

    const { data: { user } } = await supabase.auth.getUser();
    
    // 1. Сохраняем в базу
    const { error } = await supabase.from('messages').insert([{
      chat_id: selectedChat.id,
      content: newMessage,
      sender_id: user?.id,
      is_from_bot: false
    }]);

    if (!error) {
      // 2. Отправляем через нужный канал
      if (selectedChat.channel === 'wechat') {
        await fetch('/api/wechat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botName: selectedChat.wechat_bot_name,
            userId: selectedChat.wechat_user_id,
            text: newMessage
          })
        });
      } else {
        await fetch('/api/telegram/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: selectedChat.telegram_chat_id,
            text: newMessage
          })
        });
      }

      // 3. Если оператор ответил, переводим чат в статус 'operator_needed' (или оставляем)
      // и снимаем активную команду — раз оператор вмешался, опрос дальше не ведётся
      if (selectedChat.status === 'bot_processing') {
        await supabase.from('chats').update({ status: 'operator_needed', active_command_id: null }).eq('id', selectedChat.id);
      }

      setNewMessage('');
    }
  };

  return (
    <div className="flex h-full bg-white">
      <Toaster />
      {/* Chat List */}
      <div className="w-80 border-r flex flex-col bg-slate-50/50">
        <div className="h-[65px] px-4 border-b bg-white flex items-center">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <Input 
              placeholder="Поиск чатов..." 
              className="pl-10 bg-slate-50 border-slate-200 w-full"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            [1, 2, 3, 4, 5].map(i => (
              <div key={i} className="p-4 border-b flex items-start gap-3">
                <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
            ))
          ) : (
            chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => handleChatSelect(chat)}
                className={cn(
                  "w-full p-4 flex items-start gap-3 border-b transition-all cursor-pointer",
                  selectedChat?.id === chat.id ? "bg-white shadow-sm z-10" : "hover:bg-white/50"
                )}
              >
                <ChatAvatar name={chat.customer_name} color={chat.avatar_color} />
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-800 truncate">{chat.customer_name || 'Клиент'}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(chat.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                      chat.status === 'bot_processing' ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
                    )}>
                      {chat.status === 'bot_processing' ? (
                        <><Bot size={12} /> AI</>
                      ) : (
                        <><User size={12} /> Оператор</>
                      )}
                    </span>
                    {chat.channel === 'wechat' ? (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-emerald-100 text-emerald-600">
                        <WeChatIcon size={11} /> WeChat
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-sky-100 text-sky-500">
                        <TelegramIcon size={11} /> TG
                      </span>
                    )}
                    {chat.active_command && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-slate-200 text-slate-600 font-mono">
                        {chat.active_command.command}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {selectedChat ? (
          <>
            <div className="h-[65px] px-4 bg-white border-b flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="font-bold text-slate-800 truncate">{selectedChat.customer_name || 'Чат с клиентом'}</h2>
                {selectedChat.active_command && (
                  <span className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-600 font-mono shrink-0">
                    {selectedChat.active_command.command}
                    <button
                      onClick={resetActiveCommand}
                      title="Сбросить команду"
                      className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-black/10"
                    ><X size={9} /></button>
                  </span>
                )}
              </div>
              <Button
                variant={selectedChat.status === 'bot_processing' ? 'primary' : 'secondary'}
                size="md"
                onClick={async () => {
                  const turningOff = selectedChat.status === 'bot_processing';
                  const newStatus = turningOff ? 'operator_needed' : 'bot_processing';
                  const updates: any = { status: newStatus };
                  if (turningOff) updates.active_command_id = null;
                  await supabase.from('chats').update(updates).eq('id', selectedChat.id);
                  setSelectedChat({
                    ...selectedChat,
                    ...updates,
                    ...(turningOff ? { active_command: null } : {})
                  });
                }}
                className="gap-2 shrink-0"
              >
                <Bot size={16} />
                {selectedChat.status === 'bot_processing' ? 'Бот активен' : 'Включить бота'}
              </Button>
            </div>

            <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 p-4 overflow-y-auto space-y-4">
              {loadingMore && (
                <div className="flex justify-center pb-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-1.5 bg-white rounded-full shadow-sm border border-slate-100">
                    <svg className="animate-spin w-3 h-3 text-blue-500" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Загрузка сообщений...
                  </div>
                </div>
              )}
              {messages.map((msg) => {
                // client messages: not from bot AND no sender_id → left
                // bot/operator messages: from bot OR has sender_id → right
                const isOutgoing = msg.is_from_bot || msg.sender_id;
                return (
                  <div key={msg.id} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] p-3 rounded-2xl ${
                      msg.is_from_bot
                        ? (msg.is_ai_generated
                            ? 'bg-purple-100 text-purple-900 rounded-br-none'
                            : 'bg-amber-100 text-amber-800 rounded-br-none')
                        : msg.sender_id
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                    }`}>
                      <p className="text-sm">{msg.content}</p>
                      <span className="text-[10px] opacity-50 mt-1 block text-right">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.is_from_bot && (msg.is_ai_generated ? ' • AI' : ' • Система')}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t shadow-[0_-1px_2px_rgba(0,0,0,0.05)]">
              <form 
                onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                className="flex gap-2"
              >
                <Input 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Введите сообщение..."
                  className="flex-1"
                />
                <Button type="submit" className="w-10 h-10 flex items-center justify-center p-0 shrink-0">
                  <Send size={16} />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400 select-none">
            <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center">
              <MessageSquare size={36} className="text-slate-300" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-500">Выберите чат</p>
              <p className="text-sm text-slate-400 mt-1">Нажмите на диалог слева, чтобы начать общение</p>
            </div>
          </div>
        )}
      </div>

      {/* Right Info Panel */}
      {selectedChat && (
        <div className="w-80 border-l bg-slate-50/30 flex flex-col">
          <div className="h-[65px] px-4 border-b bg-white flex items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <ShoppingBag size={18} className="text-blue-600" /> Заказы клиента
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {orders.map((order) => {
              const orderTagIds = new Set((order.order_tags || []).map((ot: any) => ot.tag_id));
              return (
              <div key={order.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                {/* Header: номер + статус */}
                <div className="flex justify-between items-center mb-3">
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold font-mono">
                    #{order.order_number}
                  </span>
                  {/* Status dropdown */}
                  <div className="relative" data-dropdown>
                    <button
                      onMouseDown={(e) => { e.stopPropagation(); setOpenStatusDropdown(openStatusDropdown === order.id ? null : order.id); }}
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
                      <ChevronDown size={11} />
                    </button>
                    {openStatusDropdown === order.id && (
                      <div className="absolute top-full right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[150px]">
                        {statuses.map(s => (
                          <button
                            key={s.id}
                            onMouseDown={(e) => { e.stopPropagation(); updateOrderStatus(order.id, s.id); }}
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

                {/* Data fields */}
                <div className="space-y-2 mb-3">
                  {Object.entries(order.data || {}).map(([key, value]: [string, any]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-[9px] text-slate-400 uppercase font-bold">{key}</span>
                      <span className="text-xs font-medium text-slate-700">{String(value)}</span>
                    </div>
                  ))}
                </div>

                {/* Active tags + add button */}
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {(order.order_tags || []).map((ot: any) => ot.tags).filter(Boolean).map((tag: any) => (
                      <span
                        key={tag.id}
                        className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ backgroundColor: tag.color + '25', color: tag.color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                        {tag.name}
                        <button
                          onMouseDown={(e) => { e.stopPropagation(); toggleOrderTag(order.id, tag.id, true); }}
                          className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-black/10"
                        ><X size={8} /></button>
                      </span>
                    ))}
                    {(order.order_tags || []).length === 0 && (
                      <span className="text-[9px] text-slate-300">нет меток</span>
                    )}
                  </div>
                  {tags.length > 0 && (
                    <div className="relative shrink-0" data-dropdown>
                      <button
                        onMouseDown={(e) => { e.stopPropagation(); setOpenTagDropdown(openTagDropdown === order.id ? null : order.id); }}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                        title="Добавить метку"
                      ><Plus size={13} /></button>
                      {openTagDropdown === order.id && (
                        <div className="absolute bottom-full right-0 mb-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[150px]">
                          {tags.filter(tag => !orderTagIds.has(tag.id)).map(tag => (
                            <button
                              key={tag.id}
                              onMouseDown={(e) => { e.stopPropagation(); toggleOrderTag(order.id, tag.id, false); setOpenTagDropdown(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors"
                            >
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                              <span style={{ color: tag.color }}>{tag.name}</span>
                            </button>
                          ))}
                          {tags.filter(tag => !orderTagIds.has(tag.id)).length === 0 && (
                            <p className="px-3 py-2 text-xs text-slate-400">Все метки добавлены</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              );
            })}
            
            {orders.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-16 gap-4">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <ShoppingBag size={28} className="text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-400">Заказов пока нет</p>
                  <p className="text-xs text-slate-300 mt-1">Они появятся после опроса</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const AVATAR_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  rose:    { bg: 'bg-rose-100',    text: 'text-rose-600' },
  pink:    { bg: 'bg-pink-100',    text: 'text-pink-600' },
  fuchsia: { bg: 'bg-fuchsia-100', text: 'text-fuchsia-600' },
  violet:  { bg: 'bg-violet-100',  text: 'text-violet-600' },
  indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-600' },
  sky:     { bg: 'bg-sky-100',     text: 'text-sky-600' },
  teal:    { bg: 'bg-teal-100',    text: 'text-teal-600' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  amber:   { bg: 'bg-amber-100',   text: 'text-amber-600' },
  orange:  { bg: 'bg-orange-100',  text: 'text-orange-600' },
  slate:   { bg: 'bg-slate-100',   text: 'text-slate-600' },
};

function ChatAvatar({ name, color }: { name?: string; color?: string }) {
  const letter = name ? name.trim()[0].toUpperCase() : '?';
  const scheme = AVATAR_COLOR_MAP[color || 'slate'] ?? AVATAR_COLOR_MAP.slate;
  return (
    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0', scheme.bg, scheme.text)}>
      {letter}
    </div>
  );
}
