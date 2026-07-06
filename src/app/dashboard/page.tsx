'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { Search, User, Send, Bot, ShoppingBag } from 'lucide-react';
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

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
        <div className="p-4 border-b bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <Input 
              placeholder="Поиск чатов..." 
              className="pl-10 bg-slate-50 border-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            [1, 2, 3, 4, 5].map(i => (
              <div key={i} className="p-4 border-b space-y-2">
                <div className="flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-10" /></div>
                <Skeleton className="h-3 w-full" />
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
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <User size={20} />
                </div>
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
            <div className="p-4 bg-white border-b flex justify-between items-center shadow-sm">
              <div>
                <h2 className="font-bold text-slate-800">{selectedChat.customer_name || 'Чат с клиентом'}</h2>
                <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Telegram ID: {selectedChat.telegram_chat_id}</p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant={selectedChat.status === 'bot_processing' ? 'primary' : 'secondary'}
                  size="sm"
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
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.is_from_bot || msg.sender_id ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[70%] p-3 rounded-2xl ${
                    msg.is_from_bot 
                      ? 'bg-purple-100 text-purple-900 rounded-tl-none' 
                      : msg.sender_id 
                        ? 'bg-blue-600 text-white rounded-tl-none' 
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tr-none shadow-sm'
                  }`}>
                    <p className="text-sm">{msg.content}</p>
                    <span className="text-[10px] opacity-50 mt-1 block">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {msg.is_ai_generated && ' • AI'}
                    </span>
                  </div>
                </div>
              ))}
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
                <Button type="submit" className="p-2 w-10 h-10">
                  <Send size={20} />
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
          <div className="p-4 border-b bg-white">
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
              <div className="text-center py-20">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ShoppingBag size={20} className="text-slate-300" />
                </div>
                <p className="text-xs text-slate-400 italic">Заказов пока нет</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
