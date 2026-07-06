'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { MessageSquare, Settings, LogOut, Bot, ShoppingBag, Palette } from 'lucide-react';
import { Button } from '@/components/ui';

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

  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50">Загрузка...</div>;

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-xl">
        <div className="p-6 text-xl font-bold border-b border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Bot size={20} className="text-white" />
          </div>
          <span className="tracking-widest uppercase text-sm">PromptFlow</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <NavItem href="/dashboard" icon={<MessageSquare size={20} />} label="Чаты" />
          <NavItem href="/dashboard/orders" icon={<ShoppingBag size={20} />} label="Заказы" />
          <NavItem href="/dashboard/commands" icon={<Bot size={20} />} label="Команды AI" />
          <NavItem href="/dashboard/settings" icon={<Palette size={20} />} label="Настройки" />
        </nav>
        <div className="p-4 border-t border-slate-800">
          <Button
            variant="ghost"
            onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
            className="flex items-center gap-3 p-3 w-full rounded-xl hover:bg-red-900/30 text-red-400 hover:text-red-400 justify-start"
          >
            <LogOut size={20} /> Выйти
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden overflow-y-auto">
        <div className="flex-1">{children}</div>
        <footer className="shrink-0 border-t border-slate-200 bg-white px-8 py-3 text-center text-xs text-slate-400">
          &copy; {new Date().getFullYear()} PromptFlow &mdash; CRM для Telegram
        </footer>
      </main>
    </div>
  );
}

function NavItem({ href, icon, label }: { href: string, icon: React.ReactNode, label: string }) {
  return (
    <a 
      href={href} 
      className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-all"
    >
      {icon} {label}
    </a>
  );
}
