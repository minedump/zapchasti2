'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { Search, Send, Bot, ShoppingBag, User, MessageSquare, ChevronDown, Plus, Edit3, Check, X, Calendar, FileText, Bell, BellOff, ArrowLeft, MoreVertical, Lock } from 'lucide-react';
import { TelegramIcon, WeChatIcon } from '@/components/icons';
import { Badge, Button, Input, Skeleton, Toggle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { withBadge, stripBadgePrefix } from '@/lib/badge';
import { toast, Toaster } from 'react-hot-toast';

// base64url → ArrayBuffer для pushManager.subscribe: Chrome принимает ключ и
// строкой, но Safari/WebKit (iPhone) — только BufferSource.
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return buffer;
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const chatIdFromUrl = searchParams.get('chatId');

  const [chats, setChats] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'telegram' | 'wechat'>('all');
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [hasInitialSelected, setHasInitialSelected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [ordersPanelOpen, setOrdersPanelOpen] = useState(true);
  const [templatesPanelOpen, setTemplatesPanelOpen] = useState(true);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [extraAnswerDraft, setExtraAnswerDraft] = useState('');
  const [sendingTemplateId, setSendingTemplateId] = useState<string | null>(null);
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(null);
  const [openTagDropdown, setOpenTagDropdown] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [editingChatName, setEditingChatName] = useState(false);
  const [chatNameDraft, setChatNameDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 15;
  // 'instant' | 'smooth' | null
  const pendingScrollRef = useRef<'instant' | 'smooth' | null>(null);
  // Счётчик непрочитанных в заголовке вкладки
  useEffect(() => {
    const total = chats.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    document.title = total > 0 ? `(${total}) PromptFlow` : 'PromptFlow';
  }, [chats]);

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
    fetchTemplates();

    const chatChannel = supabase
      .channel('global-chat-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => fetchChats())
      .subscribe();

    // Service worker для Web Push (уведомления приходят с сервера через
    // webhook — работают и при закрытой вкладке, и на iOS в PWA).
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('service worker registration failed:', err);
      });
    }

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

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from('message_templates')
      .select('*')
      .eq('is_active', true)
      .order('created_at');
    if (data) setTemplates(data);
  };

  const runTemplate = async (template: any, extraAnswer?: string) => {
    if (!selectedChat) return;
    setSendingTemplateId(template.id);
    try {
      const res = await fetch(`/api/templates/${template.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: selectedChat.id, extraAnswer }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || 'Не удалось отправить шаблон');
        return;
      }
      toast.success('Шаблон отправлен');
      setPendingTemplateId(null);
      setExtraAnswerDraft('');
    } finally {
      setSendingTemplateId(null);
    }
  };

  const handleTemplateClick = (template: any) => {
    if (template.ask_extra) {
      setPendingTemplateId(template.id);
      setExtraAnswerDraft('');
      return;
    }
    runTemplate(template);
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

  const markChatRead = async (chatId: string) => {
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, unread_count: 0 } : c));
    await supabase.from('chats').update({ unread_count: 0 }).eq('id', chatId);
  };

  // Подписывает это устройство на Web Push (идемпотентно) — вызывается при
  // каждом включении колокольчика, чтобы новое устройство (например, PWA на
  // iPhone) тоже попало в рассылку.
  const subscribeDeviceToPush = async (): Promise<boolean> => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      toast.error('VAPID-ключ не настроен в окружении сервера (NEXT_PUBLIC_VAPID_PUBLIC_KEY)');
      return false;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // На iOS пуши доступны только в приложении, установленном на экран «Домой»
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      if (isIos && !isStandalone) {
        toast.error('На iPhone: добавьте сайт на экран «Домой» через Safari и включите уведомления уже из установленного приложения');
      } else {
        toast.error('Этот браузер не поддерживает push-уведомления');
      }
      return false;
    }
    if (Notification.permission === 'denied') {
      toast.error('Уведомления заблокированы в настройках браузера');
      return false;
    }
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Браузер не дал разрешение на уведомления');
        return false;
      }
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      // Safari/WebKit не принимает VAPID-ключ строкой — только Uint8Array
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, userAgent: navigator.userAgent }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `subscribe API: ${res.status}`);
      }
      return true;
    } catch (err) {
      console.error('push subscribe failed:', err);
      const detail = err instanceof Error ? err.message : String(err);
      toast.error(`Не удалось подписаться на уведомления: ${detail}`);
      return false;
    }
  };

  const toggleChatNotifications = async () => {
    if (!selectedChat) return;
    const turningOn = !selectedChat.notify_on_message;

    if (turningOn) {
      const subscribed = await subscribeDeviceToPush();
      if (!subscribed) return;
    }

    const { error } = await supabase.from('chats').update({ notify_on_message: turningOn }).eq('id', selectedChat.id);
    if (error) {
      toast.error('Не удалось сохранить настройку');
      return;
    }
    setSelectedChat({ ...selectedChat, notify_on_message: turningOn });
    setChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, notify_on_message: turningOn } : c));
    toast.success(turningOn ? 'Уведомления по чату включены' : 'Уведомления по чату выключены');
  };

  const startEditChatName = () => {
    setChatNameDraft(selectedChat.customer_name || '');
    setEditingChatName(true);
  };

  const saveChatName = async () => {
    const name = chatNameDraft.trim();
    if (!name || !selectedChat) return;
    const { error } = await supabase.from('chats').update({ customer_name: name }).eq('id', selectedChat.id);
    if (error) {
      toast.error('Не удалось сохранить имя');
      return;
    }
    setSelectedChat((prev: any) => ({ ...prev, customer_name: name }));
    setChats((prev) => prev.map((c) => c.id === selectedChat.id ? { ...c, customer_name: name } : c));
    setEditingChatName(false);
    toast.success('Имя обновлено');
  };

  const handleChatSelect = (chat: any) => {
    setSelectedChat(chat);
    setEditingChatName(false);
    setMobileInfoOpen(false);
    if (chat.unread_count > 0) markChatRead(chat.id);
    const newUrl = `${window.location.pathname}?chatId=${chat.id}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  // Возврат к списку чатов (мобильный режим: список ↔ чат, как в Telegram)
  const closeChat = () => {
    setSelectedChat(null);
    setMobileInfoOpen(false);
    window.history.pushState({}, '', window.location.pathname);
  };

  // Свайпы на мобильном: в чате вправо — назад к списку, влево — открыть
  // заказы/шаблоны; на панели заказов/шаблонов влево — назад к чату.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const readSwipe = (e: React.TouchEvent): { dx: number; dy: number } | null => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || window.innerWidth >= 768) return null;
    return {
      dx: e.changedTouches[0].clientX - start.x,
      dy: e.changedTouches[0].clientY - start.y,
    };
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleChatTouchEnd = (e: React.TouchEvent) => {
    const swipe = readSwipe(e);
    if (!swipe || !selectedChat || Math.abs(swipe.dy) >= 60) return;
    if (swipe.dx > 80) closeChat();
    else if (swipe.dx < -80) setMobileInfoOpen(true);
  };
  const handlePanelTouchEnd = (e: React.TouchEvent) => {
    const swipe = readSwipe(e);
    if (!swipe || Math.abs(swipe.dy) >= 60) return;
    if (Math.abs(swipe.dx) > 80) setMobileInfoOpen(false);
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
          // Входящее в открытый чат при видимой вкладке — сразу прочитано
          const msg: any = payload.new;
          if (!msg.is_from_bot && !msg.sender_id && document.visibilityState === 'visible') {
            markChatRead(selectedChat.id);
          }
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
        order_tags (tag_id, tags (id, name, color)),
        command:bot_commands (id, command, description)
      `)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
  };

  const updateOrderStatus = async (orderId: string, statusId: string) => {
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
    setOpenStatusDropdown(null);
    toast.success('Статус обновлён');
  };

  const togglePaid = async (orderId: string, isPaid: boolean) => {
    // Через серверный роут — на смену отметки оплаты срабатывают триггеры
    // (события "оплачен"/"оплата снята" в разделе Триггеры).
    await fetch(`/api/orders/${orderId}/paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPaid }),
    });
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, is_paid: isPaid } : o));
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

    // Сообщения оператора через WeChat помечаются бейджем того аккаунта,
    // через который отвечаем — задаётся в разделе WeChat при подключении.
    let badge: string | null = null;
    if (selectedChat.channel === 'wechat' && selectedChat.wechat_bot_name) {
      const { data: labelRow } = await supabase
        .from('wechat_account_labels')
        .select('badge')
        .eq('bot_name', selectedChat.wechat_bot_name)
        .maybeSingle();
      badge = labelRow?.badge ?? null;
    }

    // В мессенджер уходит текст с бейджем-подписью, в базе храним чистый
    // (бейдж — отдельной колонкой, UI рендерит его сам).
    const finalText = withBadge(newMessage, badge);

    // 1. Сохраняем в базу
    const { error } = await supabase.from('messages').insert([{
      chat_id: selectedChat.id,
      content: newMessage,
      sender_id: user?.id,
      is_from_bot: false,
      badge
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
            text: finalText
          })
        });
      } else {
        await fetch('/api/telegram/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: selectedChat.telegram_chat_id,
            text: finalText
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
      <div className={cn(
        "w-full md:w-80 border-r border-slate-200 flex-col bg-slate-50/50",
        selectedChat ? "hidden md:flex" : "flex"
      )}>
        <div className="h-[65px] px-4 border-b border-slate-200 bg-white flex items-center">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <Input
              placeholder="Поиск чатов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-9 bg-slate-50 border-slate-200 w-full"
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
        </div>
        <div className="flex items-stretch border-b border-slate-200 bg-white">
          {([
            { id: 'all' as const, label: 'Все', icon: null },
            { id: 'telegram' as const, label: 'TG', icon: <TelegramIcon size={13} /> },
            { id: 'wechat' as const, label: 'WeChat', icon: <WeChatIcon size={13} /> },
          ]).map((tab, i) => (
            <div key={tab.id} className="flex-1 flex items-stretch min-w-0">
              {i > 0 && <span className="w-px bg-slate-200 shrink-0" />}
              <button
                onClick={() => setChannelFilter(tab.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase border-b-2 -mb-px transition-colors cursor-pointer focus-visible:outline-none',
                  channelFilter === tab.id
                    ? 'text-blue-600 border-blue-600'
                    : 'text-slate-400 border-transparent hover:text-slate-600'
                )}
              >
                {tab.icon} {tab.label}
              </button>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            [1, 2, 3, 4, 5].map(i => (
              <div key={i} className="p-4 border-b border-slate-100 flex items-start gap-3">
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
            chats
              .filter((chat) => (chat.customer_name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
              .filter((chat) => channelFilter === 'all' || chat.channel === channelFilter)
              .map((chat) => (
              <button
                key={chat.id}
                onClick={() => handleChatSelect(chat)}
                className={cn(
                  "w-full p-4 flex items-start gap-3 border-b border-slate-100 transition-all cursor-pointer",
                  selectedChat?.id === chat.id ? "bg-blue-50" : "hover:bg-white/50"
                )}
              >
                <ChatAvatar name={chat.customer_name} color={chat.avatar_color} />
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className={cn("font-bold truncate", chat.unread_count > 0 ? "text-slate-900" : "text-slate-800")}>
                      {chat.customer_name || 'Клиент'}
                    </span>
                    <span className={cn(
                      "text-[10px] shrink-0",
                      chat.unread_count > 0 ? "text-blue-600 font-bold" : "text-slate-400"
                    )}>
                      {new Date(chat.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {(chat.last_message_preview || chat.unread_count > 0) && (
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className={cn(
                        "text-xs truncate",
                        chat.unread_count > 0 ? "text-slate-800 font-medium" : "text-slate-400"
                      )}>
                        {chat.last_message_preview}
                      </span>
                      {chat.unread_count > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                          {chat.unread_count > 99 ? '99+' : chat.unread_count}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      className="p-1.5"
                      title={chat.status === 'bot_processing' ? 'AI' : 'Оператор'}
                      icon={chat.status === 'bot_processing' ? <Bot size={12} /> : <User size={12} />}
                    >
                      {null}
                    </Badge>
                    {chat.channel === 'wechat' ? (
                      <Badge variant="wechat" className="p-1.5" title="WeChat" icon={<WeChatIcon size={12} />}>{null}</Badge>
                    ) : (
                      <Badge variant="telegram" className="p-1.5" title="Telegram" icon={<TelegramIcon size={12} />}>{null}</Badge>
                    )}
                    {chat.active_command && (
                      <Badge mono>{chat.active_command.command}</Badge>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div
        className={cn("flex-1 flex-col bg-slate-50", selectedChat ? "flex" : "hidden md:flex")}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleChatTouchEnd}
      >
        {selectedChat ? (
          <>
            <div className="h-[65px] px-4 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Button
                  variant="secondary"
                  onClick={closeChat}
                  title="К списку чатов"
                  className="md:hidden shrink-0 w-10 h-10 p-0"
                >
                  <ArrowLeft size={18} />
                </Button>
                {editingChatName ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={chatNameDraft}
                      onChange={(e) => setChatNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveChatName();
                        if (e.key === 'Escape') setEditingChatName(false);
                      }}
                      className="h-8 py-1 text-sm w-48"
                      autoFocus
                    />
                    <Button size="sm" className="p-1.5" onClick={saveChatName}>
                      <Check size={14} />
                    </Button>
                    <Button variant="secondary" size="sm" className="p-1.5" onClick={() => setEditingChatName(false)}>
                      <X size={14} />
                    </Button>
                  </div>
                ) : (
                  <>
                    <h2 className="font-bold text-slate-800 truncate">{selectedChat.customer_name || 'Чат с клиентом'}</h2>
                    <button
                      onClick={startEditChatName}
                      title="Переименовать чат"
                      className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors focus-visible:outline-none"
                    >
                      <Edit3 size={14} />
                    </button>
                  </>
                )}
                {selectedChat.active_command && (
                  <Badge mono onRemove={resetActiveCommand} removeTitle="Сбросить команду" className="shrink-0">
                    {selectedChat.active_command.command}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant={selectedChat.notify_on_message ? 'primary' : 'secondary'}
                  size="md"
                  onClick={toggleChatNotifications}
                  title={selectedChat.notify_on_message
                    ? 'Уведомления по этому чату включены — выключить'
                    : 'Уведомлять о новых сообщениях в этом чате'}
                  className="w-10 h-10 p-0"
                >
                  {selectedChat.notify_on_message ? <Bell size={16} /> : <BellOff size={16} />}
                </Button>
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
                  className="w-10 h-10 p-0 sm:w-auto sm:h-auto sm:px-4 sm:py-2 sm:gap-2"
                >
                  <Bot size={16} />
                  <span className="hidden sm:inline">
                    {selectedChat.status === 'bot_processing' ? 'Бот активен' : 'Включить бота'}
                  </span>
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setMobileInfoOpen(true)}
                  title="Заказы и шаблоны"
                  className="md:hidden w-10 h-10 p-0"
                >
                  <MoreVertical size={18} />
                </Button>
              </div>
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
                            ? 'bg-purple-100 border border-purple-300 text-purple-900 rounded-br-none'
                            : 'bg-amber-100 border border-amber-300 text-amber-800 rounded-br-none')
                        : msg.sender_id
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                    }`}>
                      {/* Показываем ровно то, что видит получатель: [Бейдж] первой
                          строкой текста (strip убирает вшитые подписи старых
                          сообщений, withBadge добавляет ровно одну) */}
                      <p className="text-sm whitespace-pre-wrap">{withBadge(stripBadgePrefix(msg.content, msg.badge), msg.badge)}</p>
                      <span className="text-[10px] opacity-50 mt-1 block text-right">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-1px_2px_rgba(0,0,0,0.05)]">
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

      {/* Right Info Panel: на десктопе — третья колонка, на мобиле — полноэкранная
          панель, открывается кнопкой с точками в шапке чата */}
      {selectedChat && (
        <div
          className={cn(
            "flex-col bg-slate-50/30 overflow-y-auto",
            mobileInfoOpen
              // top-14 — не перекрываем мобильную шапку с выпадающим меню разделов
              ? "flex fixed inset-x-0 top-14 bottom-0 z-30 bg-slate-50 md:static md:z-auto md:w-80 md:bg-slate-50/30 md:border-l md:border-slate-200"
              : "hidden md:flex md:w-80 md:border-l md:border-slate-200"
          )}
          onTouchStart={handleTouchStart}
          onTouchEnd={handlePanelTouchEnd}
        >
          <div className="md:hidden h-[65px] px-4 border-b border-slate-200 bg-white flex items-center gap-2 shrink-0">
            <Button variant="secondary" className="w-10 h-10 p-0" onClick={() => setMobileInfoOpen(false)} title="Назад к чату">
              <ArrowLeft size={18} />
            </Button>
            <h3 className="font-bold text-slate-800">Заказы и шаблоны</h3>
          </div>
          <CollapsibleSection
            title="Заказы"
            icon={<ShoppingBag size={18} className="text-blue-600" />}
            open={ordersPanelOpen}
            onToggle={() => setOrdersPanelOpen(v => !v)}
          >
          <div className="p-4 space-y-4">
            {orders.map((order) => {
              const orderTagIds = new Set((order.order_tags || []).map((ot: any) => ot.tag_id));
              return (
              <div key={order.id} className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-slate-300 transition-all">
                {/* Row 1: Заказ №N + статус + оплата */}
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-lg font-bold text-slate-900">Заказ №{order.order_number}</span>

                  {/* Status dropdown */}
                  <div className="relative" data-dropdown>
                    <button
                      onMouseDown={(e) => { e.stopPropagation(); setOpenStatusDropdown(openStatusDropdown === order.id ? null : order.id); }}
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
                      <ChevronDown size={11} />
                    </button>
                    {openStatusDropdown === order.id && (
                      <div className="absolute top-full right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[150px]">
                        {statuses.map(s => (
                          <button
                            key={s.id}
                            onMouseDown={(e) => { e.stopPropagation(); updateOrderStatus(order.id, s.id); }}
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

                {/* Row 2: дата + команда + метки */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(order.created_at).toLocaleDateString()} {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <Badge mono={!!order.command_id} title={order.command?.description}>
                    {order.command_id ? (order.command?.command || order.command?.description || '…') : 'без команды'}
                  </Badge>
                  {(order.order_tags || []).map((ot: any) => ot.tags).filter(Boolean).map((tag: any) => (
                    <Badge
                      key={tag.id}
                      color={tag.color}
                      dot
                      uppercase={false}
                      onRemove={() => toggleOrderTag(order.id, tag.id, true)}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                  {tags.length > 0 && (
                    <div className="relative shrink-0" data-dropdown>
                      <button
                        onMouseDown={(e) => { e.stopPropagation(); setOpenTagDropdown(openTagDropdown === order.id ? null : order.id); }}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors focus-visible:outline-none"
                        title="Добавить метку"
                      ><Plus size={13} /></button>
                      {openTagDropdown === order.id && (
                        <div className="absolute top-full right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[150px]">
                          {tags.filter(tag => !orderTagIds.has(tag.id)).map(tag => (
                            <button
                              key={tag.id}
                              onMouseDown={(e) => { e.stopPropagation(); toggleOrderTag(order.id, tag.id, false); setOpenTagDropdown(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors focus-visible:outline-none"
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

                {/* Данные заказа */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Данные заказа</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(order.data || {}).map(([key, value]: [string, any]) => {
                      const isPrivate = key.startsWith('_');
                      return (
                        <div
                          key={key}
                          title={isPrivate ? 'Скрытое поле — AI его не видит' : undefined}
                          className={cn(
                            "px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1",
                            isPrivate ? "bg-slate-100 border-slate-200" : "bg-white border-slate-200"
                          )}
                        >
                          {isPrivate && <Lock size={10} className="text-slate-400 shrink-0" />}
                          <span className="text-slate-400 mr-1">{isPrivate ? key.slice(1) : key}:</span>
                          <span className="font-medium text-slate-700">{String(value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              );
            })}
            
            {orders.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-16 gap-4">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <ShoppingBag size={28} className="text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-400">Заказов пока нет</p>
              </div>
            )}
          </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Шаблоны"
            icon={<FileText size={18} className="text-blue-600" />}
            open={templatesPanelOpen}
            onToggle={() => setTemplatesPanelOpen(v => !v)}
          >
          <div className="p-4 space-y-2">
            {templates.map((tpl) => (
              <div key={tpl.id}>
                <button
                  onClick={() => handleTemplateClick(tpl)}
                  disabled={sendingTemplateId === tpl.id}
                  className="w-full text-left px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none"
                >
                  {tpl.title}
                </button>
                {pendingTemplateId === tpl.id && (
                  <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-slate-600">{tpl.extra_question}</p>
                    <Input
                      value={extraAnswerDraft}
                      onChange={(e) => setExtraAnswerDraft(e.target.value)}
                      placeholder="Ответ оператора..."
                      className="h-9"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter' && extraAnswerDraft.trim()) runTemplate(tpl, extraAnswerDraft); }}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setPendingTemplateId(null); setExtraAnswerDraft(''); }}>Отмена</Button>
                      <Button
                        size="sm"
                        onClick={() => runTemplate(tpl, extraAnswerDraft)}
                        disabled={!extraAnswerDraft.trim() || sendingTemplateId === tpl.id}
                      >
                        Отправить
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {templates.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <FileText size={28} className="text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-400">Шаблонов пока нет</p>
              </div>
            )}
          </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({ title, icon, open, onToggle, children }: { title: string; icon: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-200 shrink-0">
      <button
        onClick={onToggle}
        className="w-full h-[52px] px-4 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors focus-visible:outline-none"
      >
        <h3 className="font-bold text-slate-800 flex items-center gap-2">{icon} {title}</h3>
        <ChevronDown size={16} className={cn('text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && children}
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
