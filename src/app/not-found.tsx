import Link from 'next/link';
import { Bot, MessageSquareOff, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex items-center justify-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Bot size={20} className="text-white" />
          </div>
          <span className="tracking-widest uppercase text-sm font-bold text-slate-800">PromptFlow</span>
        </div>

        <div className="rounded-2xl bg-white p-10 shadow-lg border border-slate-100">
          <div className="mx-auto mb-6 w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center">
            <MessageSquareOff size={36} className="text-slate-300" />
          </div>

          <p className="text-6xl font-black text-slate-900 tracking-tight">404</p>
          <h1 className="mt-2 text-lg font-bold text-slate-800">Страница не найдена</h1>
          <p className="mt-2 text-sm text-slate-500">
            Такого чата, заказа или раздела не существует — возможно, ссылка устарела или адрес введён с опечаткой.
          </p>

          <Link
            href="/dashboard"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Home size={16} />
            Вернуться в панель
          </Link>
        </div>
      </div>
    </div>
  );
}
