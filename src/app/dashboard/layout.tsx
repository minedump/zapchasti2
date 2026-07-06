'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { MessageSquare, Users, Settings, LogOut, Bot, ShoppingBag } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      } else {
        setLoading(false);
      }
    };
    checkUser();
  }, [router]);

  if (loading) return <div className="flex h-screen items-center justify-center">Загрузка...</div>;

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 text-xl font-bold border-b border-slate-800 flex items-center gap-2">
          <Bot className="text-blue-400" /> CRM Запчасти
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <a href="/dashboard" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors">
            <MessageSquare size={20} /> Чаты
          </a>
          <a href="/dashboard/orders" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors">
            <ShoppingBag size={20} /> Заказы
          </a>
          <a href="/dashboard/commands" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors">
            <Settings size={20} /> Команды AI
          </a>
          <a href="/dashboard/settings" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors">
            <Settings size={20} /> Настройки
          </a>
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
            className="flex items-center gap-3 p-3 w-full rounded-lg hover:bg-red-900/30 text-red-400 transition-colors"
          >
            <LogOut size={20} /> Выйти
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
