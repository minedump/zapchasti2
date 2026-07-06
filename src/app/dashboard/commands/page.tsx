'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Save, Trash2 } from 'lucide-react';

export default function CommandsPage() {
  const [commands, setCommands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCommands();
  }, []);

  const fetchCommands = async () => {
    try {
      const { data, error } = await supabase.from('bot_commands').select('*');
      if (error) throw error;
      if (data) setCommands(data);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching commands:', err);
    } finally {
      setLoading(false);
    }
  };

  const addCommand = async () => {
    const newCommand = {
      command: '/new_command',
      prompt_template: 'Введите инструкции для AI здесь...',
      description: 'Описание команды'
    };
    const { data, error } = await supabase.from('bot_commands').insert([newCommand]).select();
    if (data) setCommands([...commands, data[0]]);
  };

  const updateCommand = async (id: string, updates: any) => {
    setCommands(commands.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const saveCommand = async (cmd: any) => {
    const { error } = await supabase.from('bot_commands').update({
      command: cmd.command,
      description: cmd.description,
      prompt_template: cmd.prompt_template
    }).eq('id', cmd.id);
    
    if (!error) {
      alert('Команда сохранена!');
      fetchCommands();
    }
  };

  const deleteCommand = async (id: string) => {
    await supabase.from('bot_commands').delete().eq('id', id);
    setCommands(commands.filter(c => c.id !== id));
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Конструктор команд AI</h1>
        <button 
          onClick={addCommand}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} /> Добавить команду
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          Ошибка загрузки: {error}
        </div>
      )}

      <div className="space-y-6">
        {commands.map((cmd) => (
          <div key={cmd.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Команда</label>
                <input 
                  type="text" 
                  value={cmd.command}
                  onChange={(e) => updateCommand(cmd.id, { command: e.target.value })}
                  className="w-full p-2 border rounded-lg font-mono text-blue-600"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Описание</label>
                <input 
                  type="text" 
                  value={cmd.description}
                  onChange={(e) => updateCommand(cmd.id, { description: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
              <button 
                onClick={() => saveCommand(cmd)}
                className="self-end p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Сохранить изменения"
              >
                <Save size={20} />
              </button>
              <button 
                onClick={() => deleteCommand(cmd.id)}
                className="self-end p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={20} />
              </button>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Промпт для AI</label>
              <textarea 
                rows={4}
                value={cmd.prompt_template}
                onChange={(e) => updateCommand(cmd.id, { prompt_template: e.target.value })}
                className="w-full p-3 border rounded-lg text-sm bg-slate-50 focus:bg-white transition-colors"
              />
            </div>
          </div>
        ))}

        {commands.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400 border-2 border-dashed rounded-xl">
            Команды еще не созданы. Нажмите «Добавить команду», чтобы начать.
          </div>
        )}
      </div>
    </div>
  );
}
