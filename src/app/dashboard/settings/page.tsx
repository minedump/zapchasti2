'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Settings, Plus, Trash2, Palette, Tag } from 'lucide-react';
import { Button, Input, Skeleton } from '@/components/ui';
import { toast, Toaster } from 'react-hot-toast';

export default function SettingsPage() {
  const [statuses, setStatuses] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: sData } = await supabase.from('order_statuses').select('*').order('created_at');
    const { data: tData } = await supabase.from('tags').select('*').order('created_at');
    if (sData) setStatuses(sData);
    if (tData) setTags(tData);
    setLoading(false);
  };

  const addStatus = async () => {
    const name = prompt('Название статуса:');
    if (!name) return;
    const { error } = await supabase.from('order_statuses').insert([{ name, color: '#cbd5e1' }]);
    if (error) toast.error('Ошибка или такой статус уже есть');
    else fetchData();
  };

  const addTag = async () => {
    const name = prompt('Название метки:');
    if (!name) return;
    const { error } = await supabase.from('tags').insert([{ name, color: '#3b82f6' }]);
    if (error) toast.error('Ошибка или такая метка уже есть');
    else fetchData();
  };

  const deleteItem = async (table: string, id: string, isSystem: boolean) => {
    if (isSystem) return toast.error('Системный элемент нельзя удалить');
    if (confirm('Удалить?')) {
      await supabase.from(table).delete().eq('id', id);
      fetchData();
    }
  };

  const updateColor = async (table: string, id: string, color: string) => {
    await supabase.from(table).update({ color }).eq('id', id);
    fetchData();
  };

  if (loading) return <div className="p-8"><Skeleton className="h-20 w-full mb-4" /><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <Toaster />
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Palette className="text-blue-600" /> Настройки PromptFlow
        </h1>
        <p className="text-slate-500 mt-1">Управление справочниками статусов и меток</p>
      </div>

      <div className="space-y-8">
        {/* Статусы */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">Статусы заказов</h2>
              <p className="text-sm text-slate-400">Определяют этап обработки запроса</p>
            </div>
            <Button onClick={addStatus} className="gap-2"><Plus size={18} /> Добавить</Button>
          </div>
          <div className="grid gap-3">
            {statuses.map(s => (
              <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all">
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <input 
                      type="color" 
                      value={s.color} 
                      onChange={e => updateColor('order_statuses', s.id, e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border-2 border-white shadow-sm"
                    />
                  </div>
                  <span className="font-bold text-slate-700">{s.name}</span>
                  {s.is_system && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase">Системный</span>}
                </div>
                {!s.is_system && (
                  <Button variant="danger" size="sm" onClick={() => deleteItem('order_statuses', s.id, s.is_system)} className="p-2">
                    <Trash2 size={18} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Метки */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">Метки (Теги)</h2>
              <p className="text-sm text-slate-400">Для дополнительной классификации чатов</p>
            </div>
            <Button onClick={addTag} className="gap-2"><Plus size={18} /> Добавить</Button>
          </div>
          <div className="grid gap-3">
            {tags.map(t => (
              <div key={t.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all">
                <div className="flex items-center gap-4">
                  <input 
                    type="color" 
                    value={t.color} 
                    onChange={e => updateColor('tags', t.id, e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border-2 border-white shadow-sm"
                  />
                  <span className="font-bold text-slate-700">{t.name}</span>
                </div>
                <Button variant="danger" size="sm" onClick={() => deleteItem('tags', t.id, false)} className="p-2">
                  <Trash2 size={18} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
