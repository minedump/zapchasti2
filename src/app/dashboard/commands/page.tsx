'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Save, Trash2, Edit3, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button, Input, Skeleton } from '@/components/ui';
import { toast, Toaster } from 'react-hot-toast';
import { cn } from '@/lib/utils';

export default function CommandsPage() {
  const [commands, setCommands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);

  useEffect(() => {
    fetchCommands();
  }, []);

  const fetchCommands = async () => {
    setLoading(true);
    const { data } = await supabase.from('bot_commands').select('*').order('created_at', { ascending: false });
    if (data) setCommands(data);
    setLoading(false);
  };

  const handleAdd = () => {
    const newId = 'new-' + Date.now();
    const newCmd = { id: newId, command: '', description: '', prompt_template: '', is_active: true, isNew: true };
    setCommands([newCmd, ...commands]);
    setEditingId(newId);
    setEditForm(newCmd);
  };

  const handleEdit = (cmd: any) => {
    setEditingId(cmd.id);
    setEditForm({ ...cmd });
  };

  const handleSave = async () => {
    if (!editForm.command.startsWith('/')) {
      toast.error('Команда должна начинаться с /');
      return;
    }

    // Валидация на дубликаты
    const isDuplicate = commands.some(c => c.command === editForm.command && c.id !== editForm.id);
    if (isDuplicate) {
      toast.error('Такая команда уже существует');
      return;
    }

    const { isNew, ...payload } = editForm;
    
    let result;
    if (isNew) {
      const { id, ...insertData } = payload;
      result = await supabase.from('bot_commands').insert([insertData]).select();
    } else {
      result = await supabase.from('bot_commands').update(payload).eq('id', editForm.id).select();
    }

    if (!result.error) {
      toast.success('Сохранено');
      setEditingId(null);
      fetchCommands();
    } else {
      toast.error('Ошибка сохранения');
    }
  };

  const handleDelete = async (id: string) => {
    if (id.toString().startsWith('new-')) {
      setCommands(commands.filter(c => c.id !== id));
      setEditingId(null);
      return;
    }

    if (confirm('Удалить эту команду?')) {
      const { error } = await supabase.from('bot_commands').delete().eq('id', id);
      if (!error) {
        toast.success('Удалено');
        fetchCommands();
      }
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Toaster position="top-right" />
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Команды AI</h1>
          <p className="text-slate-500 mt-1">Управление сценариями работы ассистента</p>
        </div>
        <Button onClick={handleAdd} className="gap-2">
          <Plus size={18} /> Создать команду
        </Button>
      </div>

      <div className="grid gap-6">
        {loading ? (
          [1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)
        ) : (
          commands.map((cmd) => (
            <div 
              key={cmd.id} 
              className={cn(
                "group bg-white rounded-2xl border transition-all duration-200",
                editingId === cmd.id ? "border-blue-500 ring-4 ring-blue-50 ring-offset-0" : "border-slate-200 hover:border-slate-300 hover:shadow-md"
              )}
            >
              {editingId === cmd.id ? (
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Команда</label>
                      <Input 
                        value={editForm.command} 
                        onChange={e => setEditForm({...editForm, command: e.target.value})}
                        placeholder="/start"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Описание</label>
                      <Input 
                        value={editForm.description} 
                        onChange={e => setEditForm({...editForm, description: e.target.value})}
                        placeholder="Сбор данных о запчастях"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Промпт (Инструкции для AI)</label>
                    <textarea 
                      className="w-full min-h-[200px] p-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm leading-relaxed transition-all"
                      value={editForm.prompt_template}
                      onChange={e => setEditForm({...editForm, prompt_template: e.target.value})}
                      placeholder="Напишите инструкции..."
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="secondary" onClick={() => { setEditingId(null); if(cmd.isNew) fetchCommands(); }}>Отмена</Button>
                    <Button onClick={handleSave} className="gap-2">
                      <Save size={18} /> Сохранить
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-6 flex items-start justify-between">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-bold font-mono">
                        {cmd.command}
                      </span>
                      <h3 className="font-semibold text-slate-800">{cmd.description}</h3>
                    </div>
                    <div className="text-sm text-slate-500 line-clamp-2 pr-10">
                      {cmd.prompt_template}
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(cmd)} className="p-2">
                      <Edit3 size={18} />
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(cmd.id)} className="p-2">
                      <Trash2 size={18} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

