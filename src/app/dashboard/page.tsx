'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { Search, Send, Bot, ShoppingBag, User } from 'lucide-react';

// Telegram plane SVG (lucide doesn't have it)
const TelegramIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);
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
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 30;

  const scrollToBottom = (smooth = false) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    fetchChats();
    fetchStatuses();
    
    const chatChannel = supabase
      .channel('global-chat-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => fetchChats())
      .subscribe();

    return () => { supabase.removeChannel(chatChannel); };
  }, []);

  const fetchStatuses = async () => {
    const { data } = await supabase.from('order_statuses').select('*').order('created_at');
    if (data) setStatuses(data);
  };

  const fetchChats = async () => {
    const { data } = await supabase
      .from('chats')
      .select('*')
      .order('last_message_at', { ascending: false });
    if (data) setChats(data);
    setLoading(false);
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
          setMessages(prev => prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new]);
          setTimeout(() => scrollToBottom(true), 50);
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
      setMessages(data.reverse());
      setHasMore((count ?? 0) > PAGE_SIZE);
      // scroll to bottom without animation after initial load
      setTimeout(() => scrollToBottom(false), 0);
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
      // restore scroll position so user doesn't jump
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - prevScrollHeight;
      });
    } else {
      setHasMore(false);
    }
    setLoadingMore(false);
  }, [selectedChat, loadingMore, hasMore, messages]);

  const fetchOrders = async (chatId: string) => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
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
      // 2. Отправляем в Telegram через наш API
      await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: selectedChat.telegram_chat_id,
          text: newMessage
        })
      });
      
      // 3. Если оператор ответил, переводим чат в статус 'operator_needed' (или оставляем)
      if (selectedChat.status === 'bot_processing') {
        await supabase.from('chats').update({ status: 'operator_needed' }).eq('id', selectedChat.id);
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
                  "w-full p-4 flex items-start gap-3 border-b transition-all",
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
                  <div className="flex items-center gap-2">
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
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-sky-100 text-sky-500">
                      <TelegramIcon size={11} /> TG
                    </span>
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
              <h2 className="font-bold text-slate-800">{selectedChat.customer_name || 'Чат с клиентом'}</h2>
              <Button 
                variant={selectedChat.status === 'bot_processing' ? 'primary' : 'secondary'}
                size="md"
                onClick={async () => {
                  const newStatus = selectedChat.status === 'bot_processing' ? 'operator_needed' : 'bot_processing';
                  await supabase.from('chats').update({ status: newStatus }).eq('id', selectedChat.id);
                  setSelectedChat({...selectedChat, status: newStatus});
                }}
                className="gap-2"
              >
                <Bot size={16} />
                {selectedChat.status === 'bot_processing' ? 'Бот активен' : 'Включить бота'}
              </Button>
            </div>

            <div ref={messagesContainerRef} className="flex-1 p-4 overflow-y-auto space-y-4">
              {hasMore && (
                <div className="flex justify-center pb-2">
                  <button
                    onClick={loadMoreMessages}
                    disabled={loadingMore}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-3 py-1 rounded-full hover:bg-slate-100 disabled:opacity-50"
                  >
                    {loadingMore ? 'Загрузка...' : 'Загрузить ранее'}
                  </button>
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
                        ? 'bg-purple-100 text-purple-900 rounded-br-none' 
                        : msg.sender_id 
                          ? 'bg-blue-600 text-white rounded-br-none' 
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                    }`}>
                      <p className="text-sm">{msg.content}</p>
                      <span className="text-[10px] opacity-50 mt-1 block text-right">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.is_ai_generated && ' • AI'}
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
          <div className="flex-1 flex items-center justify-center text-slate-400">
            Выберите чат для начала общения
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
            {orders.map((order) => (
              <div key={order.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                <div className="flex justify-between items-center mb-3">
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold font-mono">
                    #{order.order_number}
                  </span>
                  <select 
                    value={order.status_id || ''}
                    onChange={async (e) => {
                      await supabase.from('orders').update({ status_id: e.target.value }).eq('id', order.id);
                      fetchOrders(selectedChat.id);
                      toast.success('Статус обновлен');
                    }}
                    className="text-[10px] font-bold uppercase bg-slate-100 border-none rounded-lg px-2 py-1 focus:ring-0 cursor-pointer"
                    style={order.order_statuses ? { color: order.order_statuses.color, backgroundColor: order.order_statuses.color + '15' } : {}}
                  >
                    <option value="">Статус...</option>
                    {statuses.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  {Object.entries(order.data || {}).map(([key, value]: [string, any]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-[9px] text-slate-400 uppercase font-bold">{key}</span>
                      <span className="text-xs font-medium text-slate-700">{String(value)}</span>
                    </div>
                  ))}
                </div>
                
                <div className="mt-3 pt-3 border-t border-slate-50 flex justify-between items-center">
                  <span className="text-[9px] text-slate-300">{new Date(order.created_at).toLocaleDateString()}</span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]">Детали</Button>
                </div>
              </div>
            ))}
            
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
