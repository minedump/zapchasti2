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
    <div className="p-8 max-w-4xl mx-auto">
      <Toaster />
      <h1 className="text-3xl font-bold text-slate-900 mb-8 flex items-center gap-3">
        <Settings className="text-slate-400" /> Настройки CRM
      </h1>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Статусы */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><Palette size={18} /> Статусы заказов</h2>
            <Button size="sm" onClick={addStatus}><Plus size={16} /></Button>
          </div>
          <div className="space-y-3">
            {statuses.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={s.color} 
                    onChange={e => updateColor('order_statuses', s.id, e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                  />
                  <span className="font-medium text-slate-700">{s.name}</span>
                  {s.is_system && <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded uppercase">Системный</span>}
                </div>
                {!s.is_system && (
                  <Button variant="ghost" size="sm" onClick={() => deleteItem('order_statuses', s.id, s.is_system)}>
                    <Trash2 size={16} className="text-red-400" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Метки */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><Tag size={18} /> Метки (Теги)</h2>
            <Button size="sm" onClick={addTag}><Plus size={16} /></Button>
          </div>
          <div className="space-y-3">
            {tags.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={t.color} 
                    onChange={e => updateColor('tags', t.id, e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                  />
                  <span className="font-medium text-slate-700">{t.name}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteItem('tags', t.id, false)}>
                  <Trash2 size={16} className="text-red-400" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
