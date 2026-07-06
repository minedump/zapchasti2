'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Settings, Plus, Trash2, Palette, Tag, BookOpen, MessageSquare, Save } from 'lucide-react';
import { Button, Input, Skeleton } from '@/components/ui';
import { toast, Toaster } from 'react-hot-toast';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'knowledge' | 'dictionary'>('general');
  const [statuses, setStatuses] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [botPrompt, setBotPrompt] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: sData } = await supabase.from('order_statuses').select('*').order('created_at');
    const { data: tData } = await supabase.from('tags').select('*').order('created_at');
    const { data: kData } = await supabase.from('knowledge_base').select('*').order('created_at', { ascending: false });
    const { data: pData } = await supabase.from('bot_settings').select('value').eq('key', 'default_assistant_prompt').single();

    if (sData) setStatuses(sData);
    if (tData) setTags(tData);
    if (kData) setKnowledge(kData);
    if (pData) setBotPrompt(pData.value);
    setLoading(false);
  };

  const savePrompt = async () => {
    await supabase.from('bot_settings').upsert({ key: 'default_assistant_prompt', value: botPrompt });
    toast.success('Промпт сохранен');
  };

  const addKnowledge = async () => {
    const title = prompt('Заголовок статьи:');
    if (!title) return;
    await supabase.from('knowledge_base').insert([{ title, content: 'Текст статьи...' }]);
    fetchData();
  };

  const updateKnowledge = async (id: string, updates: any) => {
    await supabase.from('knowledge_base').update(updates).eq('id', id);
    toast.success('Обновлено');
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

      <div className="flex gap-4 mb-8 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('general')} 
          className={cn("pb-4 px-2 font-bold text-sm transition-all", activeTab === 'general' ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400")}
        >
          Общие
        </button>
        <button 
          onClick={() => setActiveTab('knowledge')} 
          className={cn("pb-4 px-2 font-bold text-sm transition-all", activeTab === 'knowledge' ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400")}
        >
          База знаний
        </button>
        <button 
          onClick={() => setActiveTab('dictionary')} 
          className={cn("pb-4 px-2 font-bold text-sm transition-all", activeTab === 'dictionary' ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400")}
        >
          Справочники
        </button>
      </div>

      <div className="space-y-8">
        {activeTab === 'general' && (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><MessageSquare size={18} /> Промпт ассистента</h2>
                <p className="text-sm text-slate-400">Инструкции для бота в режиме ожидания</p>
              </div>
              <Button onClick={savePrompt} className="gap-2"><Save size={18} /> Сохранить</Button>
            </div>
            <textarea 
              className="w-full min-h-[200px] p-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm leading-relaxed transition-all"
              value={botPrompt}
              onChange={e => setBotPrompt(e.target.value)}
            />
          </div>
        )}

        {activeTab === 'knowledge' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><BookOpen size={18} /> Статьи базы знаний</h2>
              <Button onClick={addKnowledge} className="gap-2"><Plus size={18} /> Добавить статью</Button>
            </div>
            {knowledge.map(k => (
              <div key={k.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex justify-between gap-4">
                  <Input 
                    value={k.title} 
                    onChange={e => updateKnowledge(k.id, { title: e.target.value })}
                    className="font-bold text-lg"
                  />
                  <Button variant="danger" size="sm" onClick={() => deleteItem('knowledge_base', k.id, false)}><Trash2 size={18} /></Button>
                </div>
                <textarea 
                  className="w-full min-h-[150px] p-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none text-sm"
                  value={k.content}
                  onChange={e => updateKnowledge(k.id, { content: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'dictionary' && (
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
                      {s.is_system && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase">Системный</span>}
                    </div>
                    {!s.is_system && (
                      <Button variant="danger" size="sm" onClick={() => deleteItem('order_statuses', s.id, s.is_system)} className="p-2">
                        <Trash2 size={16} />
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
                    <Button variant="danger" size="sm" onClick={() => deleteItem('tags', t.id, false)} className="p-2">
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
