'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { MessageSquare, Settings, LogOut, Bot, ShoppingBag, Workflow, FileText } from 'lucide-react';
import { WeChatIcon } from '@/components/icons';
import { Button } from '@/components/ui';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
        <div className="h-[65px] px-6 text-xl font-bold border-b border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Bot size={20} className="text-white" />
          </div>
          <span className="tracking-widest uppercase text-sm">PromptFlow</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <NavItem href="/dashboard" icon={<MessageSquare size={20} />} label="Чаты" active={pathname === '/dashboard'} />
          <NavItem href="/dashboard/orders" icon={<ShoppingBag size={20} />} label="Заказы" active={pathname.startsWith('/dashboard/orders')} />
          <NavItem href="/dashboard/commands" icon={<Bot size={20} />} label="Команды AI" active={pathname.startsWith('/dashboard/commands')} />
          <NavItem href="/dashboard/wechat" icon={<WeChatIcon size={20} />} label="WeChat" active={pathname.startsWith('/dashboard/wechat')} />
          <NavItem href="/dashboard/triggers" icon={<Workflow size={20} />} label="Триггеры" active={pathname.startsWith('/dashboard/triggers')} />
          <NavItem href="/dashboard/templates" icon={<FileText size={20} />} label="Шаблоны" active={pathname.startsWith('/dashboard/templates')} />
          <NavItem href="/dashboard/settings" icon={<Settings size={20} />} label="Настройки" active={pathname.startsWith('/dashboard/settings')} />
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
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}

function NavItem({ href, icon, label, active }: { href: string, icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
        active
          ? 'bg-blue-600 text-white'
          : 'hover:bg-slate-800 text-slate-300 hover:text-white'
      }`}
    >
      {icon} {label}
    </a>
  );
}
