'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { Search, User, Send, Bot } from 'lucide-react';

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const chatIdFromUrl = searchParams.get('chatId');

  const [chats, setChats] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    fetchChats();
    
    const chatChannel = supabase
      .channel('public-chats')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'chats' 
      }, () => {
        fetchChats();
      })
      .subscribe();

    return () => { supabase.removeChannel(chatChannel); };
  }, []);

  // Авто-выбор чата из URL
  useEffect(() => {
    if (chatIdFromUrl && chats.length > 0) {
      const chat = chats.find(c => c.id === chatIdFromUrl);
      if (chat) setSelectedChat(chat);
    }
  }, [chatIdFromUrl, chats]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.id);
      fetchOrders(selectedChat.id);
      
      // Подписка на сообщения
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

      // Подписка на новые заказы
      const orderChannel = supabase
        .channel(`chat-orders-${selectedChat.id}`)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'orders', 
          filter: `chat_id=eq.${selectedChat.id}` 
        }, (payload) => {
          setOrders(prev => [payload.new, ...prev]);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(msgChannel);
        supabase.removeChannel(orderChannel);
      };
    }
  }, [selectedChat]);

  useEffect(scrollToBottom, [messages]);

  const fetchChats = async () => {
    const { data } = await supabase
      .from('chats')
      .select('*')
      .order('last_message_at', { ascending: false });
    if (data) setChats(data);
  };

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
    <div className="flex h-full">
      {/* Chat List */}
      <div className="w-80 border-r bg-white flex flex-col">
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Поиск чатов..." 
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setSelectedChat(chat)}
              className={`w-full p-4 flex items-start gap-3 border-b hover:bg-slate-50 transition-colors ${
                selectedChat?.id === chat.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                <User size={20} />
              </div>
              <div className="flex-1 text-left">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-800">{chat.customer_name || 'Клиент'}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(chat.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    chat.status === 'bot_processing' ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'
                  }`}>
                    {chat.status === 'bot_processing' ? '🤖 AI' : '👤 Оператор'}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Window */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {selectedChat ? (
          <>
            <div className="p-4 bg-white border-b flex justify-between items-center">
              <div>
                <h2 className="font-bold text-slate-800">{selectedChat.customer_name || 'Чат с клиентом'}</h2>
                <p className="text-xs text-slate-400">ID: {selectedChat.telegram_chat_id}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={async () => {
                    const newStatus = selectedChat.status === 'bot_processing' ? 'operator_needed' : 'bot_processing';
                    await supabase.from('chats').update({ status: newStatus }).eq('id', selectedChat.id);
                    setSelectedChat({...selectedChat, status: newStatus});
                  }}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    selectedChat.status === 'bot_processing' 
                      ? 'bg-purple-50 border-purple-200 text-purple-600' 
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  {selectedChat.status === 'bot_processing' ? '🤖 Бот активен' : '🤖 Включить бота'}
                </button>
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

            <div className="p-4 bg-white border-t">
              <form 
                onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                className="flex gap-2"
              >
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Введите сообщение..."
                  className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button 
                  type="submit"
                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Send size={20} />
                </button>
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
        <div className="w-80 border-l bg-white flex flex-col">
          <div className="p-4 border-b">
            <h3 className="font-bold text-slate-800">Заказы клиента</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-blue-600 uppercase">Заказ #{order.order_number}</span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(order.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="space-y-1">
                  {Object.entries(order.data || {}).map(([key, value]: [string, any]) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-slate-400">{key}:</span>
                      <span className="font-medium text-slate-700">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {orders.length === 0 && (
              <div className="text-center py-10 text-slate-400 text-sm italic">
                Заказов пока нет
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
