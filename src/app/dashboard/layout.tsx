'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { MessageSquare, Settings, LogOut, Bot, ShoppingBag, Workflow, FileText, BookOpen, ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { WeChatIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Чаты', icon: MessageSquare, isActive: (p: string) => p === '/dashboard' },
  { href: '/dashboard/orders', label: 'Заказы', icon: ShoppingBag, isActive: (p: string) => p.startsWith('/dashboard/orders') },
  { href: '/dashboard/commands', label: 'Команды', icon: Bot, isActive: (p: string) => p.startsWith('/dashboard/commands') },
  { href: '/dashboard/wechat', label: 'WeChat', icon: WeChatIcon, isActive: (p: string) => p.startsWith('/dashboard/wechat') },
  { href: '/dashboard/triggers', label: 'Триггеры', icon: Workflow, isActive: (p: string) => p.startsWith('/dashboard/triggers') },
  { href: '/dashboard/templates', label: 'Шаблоны', icon: FileText, isActive: (p: string) => p.startsWith('/dashboard/templates') },
  { href: '/dashboard/docs', label: 'Документация', icon: BookOpen, isActive: (p: string) => p.startsWith('/dashboard/docs') },
  { href: '/dashboard/settings', label: 'Настройки', icon: Settings, isActive: (p: string) => p.startsWith('/dashboard/settings') },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  useEffect(() => {
    setCollapsed(localStorage.getItem('sidebar-collapsed') === '1');
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(v => {
      localStorage.setItem('sidebar-collapsed', v ? '0' : '1');
      return !v;
    });
  };

  const logout = () => supabase.auth.signOut().then(() => router.push('/login'));

  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50">Загрузка...</div>;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50">
      {/* Mobile header */}
      <header className="md:hidden relative z-40 bg-slate-900 text-white shrink-0">
        <div className="h-14 px-3 flex items-center">
          {(() => {
            const current = NAV_ITEMS.find(item => item.isActive(pathname));
            const CurrentIcon = current?.icon ?? Bot;
            return (
              <button
                onClick={() => setMobileMenuOpen(v => !v)}
                aria-label="Выбрать раздел"
                aria-expanded={mobileMenuOpen}
                className="w-full h-10 px-3.5 flex items-center gap-2.5 rounded-xl bg-slate-800 border border-slate-700/60 text-sm font-semibold transition-colors hover:bg-slate-700/70 focus-visible:outline-none"
              >
                <CurrentIcon size={17} className="text-blue-400 shrink-0" />
                <span className="flex-1 text-left truncate">{current?.label ?? 'PromptFlow'}</span>
                <ChevronDown size={16} className={cn('text-slate-400 transition-transform duration-200', mobileMenuOpen && 'rotate-180')} />
              </button>
            );
          })()}
        </div>

        {/* Backdrop */}
        <div
          onClick={() => setMobileMenuOpen(false)}
          className={cn(
            'fixed inset-0 top-14 bg-slate-950/60 backdrop-blur-[2px] transition-opacity duration-200',
            mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        />

        {/* Dropdown */}
        <div
          className={cn(
            'absolute left-3 right-3 top-full mt-2 rounded-2xl bg-slate-900 border border-slate-700/60 shadow-2xl shadow-slate-950/50 overflow-hidden transition-all duration-200 origin-top',
            mobileMenuOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-[0.98] -translate-y-2 pointer-events-none'
          )}
        >
          <nav className="p-2 space-y-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon, isActive }) => {
              const active = isActive(pathname);
              return (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                    active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  )}
                >
                  <Icon size={19} />
                  {label}
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80" />}
                </a>
              );
            })}
          </nav>
          <div className="p-2 border-t border-slate-800">
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-900/30 transition-colors focus-visible:outline-none"
            >
              <LogOut size={19} /> Выйти
            </button>
          </div>
        </div>
      </header>

      {/* Desktop sidebar */}
      {/* Единая геометрия: контейнеры px-4 (16px), квадрат логотипа и пункты
          начинаются от одной линии, иконки внутри — тоже (px-2 у пункта = p-2
          у логотипа). Свёрнутая ширина 68px = 16 + 36 + 16 — иконки остаются
          на той же оси и не скачут при сворачивании. */}
      {/* Структура пунктов одинакова в обоих состояниях (h-9, px-2, иконка на
          фиксированном месте) — анимируется только ширина aside, поэтому при
          сворачивании/разворачивании ничего не «разрастается»: подписи просто
          подрезаются overflow-hidden. В свёрнутом виде пункт сам собой квадрат:
          внутренняя ширина 68 - 16*2 = 36 = px-2 + иконка 20 + px-2. */}
      <aside className={cn(
        'hidden md:flex bg-slate-900 text-white flex-col shadow-xl transition-[width] duration-200 shrink-0 overflow-hidden',
        collapsed ? 'w-[68px]' : 'w-64'
      )}>
        <div className="h-[65px] border-b border-slate-800 flex items-center px-4">
          <div className="p-2 bg-blue-600 rounded-lg shrink-0">
            <Bot size={20} className="text-white" />
          </div>
          <span className={cn('ml-3 tracking-widest uppercase text-sm font-bold whitespace-nowrap', collapsed && 'hidden')}>PromptFlow</span>
        </div>

        <nav className="flex-1 space-y-1.5 p-4">
          {NAV_ITEMS.map(({ href, label, icon: Icon, isActive }) => {
            const active = isActive(pathname);
            return (
              <a
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={cn(
                  'flex items-center h-9 px-2 rounded-lg text-sm whitespace-nowrap transition-colors',
                  active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <Icon size={20} className="shrink-0" />
                <span className={cn('ml-3', collapsed && 'hidden')}>{label}</span>
              </a>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            className="w-full flex items-center h-9 px-2 rounded-lg text-sm whitespace-nowrap text-slate-400 hover:bg-slate-800 hover:text-white transition-colors focus-visible:outline-none cursor-pointer"
          >
            {collapsed ? <ChevronsRight size={20} className="shrink-0" /> : <ChevronsLeft size={20} className="shrink-0" />}
            <span className={cn('ml-3', collapsed && 'hidden')}>Свернуть</span>
          </button>
        </div>
        <div className="border-t border-slate-800 p-4">
          <button
            onClick={logout}
            title={collapsed ? 'Выйти' : undefined}
            className="w-full flex items-center h-9 px-2 rounded-lg text-sm whitespace-nowrap text-red-400 hover:bg-red-900/30 transition-colors focus-visible:outline-none cursor-pointer"
          >
            <LogOut size={20} className="shrink-0" />
            <span className={cn('ml-3', collapsed && 'hidden')}>Выйти</span>
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
