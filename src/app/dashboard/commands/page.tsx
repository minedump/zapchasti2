'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Save, Trash2, Edit3, X, AlertCircle, CheckCircle2, HelpCircle, ChevronDown } from 'lucide-react';
import { Badge, Button, Input, Select, Textarea, Skeleton } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { toast, Toaster } from 'react-hot-toast';
import { cn } from '@/lib/utils';

export default function CommandsPage() {
  const [commands, setCommands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [showGuide, setShowGuide] = useState(false);

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
    const newCmd = { id: newId, command: '', description: '', prompt_template: '', channel: null, badge: '', is_active: true, isNew: true };
    setCommands([newCmd, ...commands]);
    setEditingId(newId);
    setEditForm(newCmd);
  };

  const handleEdit = (cmd: any) => {
    setEditingId(cmd.id);
    setEditForm({ ...cmd, channel: cmd.channel ?? '', badge: cmd.badge ?? '' });
  };

  const handleSave = async () => {
    const command = editForm.command.trim();
    if (command && !command.startsWith('/')) {
      toast.error('Команда должна начинаться с /');
      return;
    }

    // Валидация на дубликаты — в рамках одного канала (или "любой")
    const isDuplicate = command && commands.some(c =>
      c.command === command && c.id !== editForm.id && (c.channel ?? '') === (editForm.channel ?? '')
    );
    if (isDuplicate) {
      toast.error('Такая команда для этого канала уже существует');
      return;
    }

    const { isNew, ...payload } = editForm;
    payload.command = command || null;
    payload.channel = editForm.channel || null;
    payload.badge = editForm.badge?.trim() || null;

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
    <div className="flex-1 overflow-y-auto flex flex-col">
    <div className="p-8 max-w-5xl mx-auto w-full flex-1">
      <Toaster position="top-right" />

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">AI команды</h1>
          <p className="text-slate-500 mt-1">Управление сценариями работы ассистента</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowGuide(v => !v)} className="gap-2">
            <HelpCircle size={18} /> Как писать промпты
            <ChevronDown size={14} className={showGuide ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </Button>
          <Button onClick={handleAdd} className="gap-2">
            <Plus size={18} /> Создать команду
          </Button>
        </div>
      </div>

      {showGuide && (
        <div className="mb-8 bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5 text-sm text-slate-700 leading-relaxed">
          <div>
            <h3 className="font-bold text-slate-900 mb-1">1. Что AI видит, кроме вашего текста</h3>
            <p>
              К промпту команды перед отправкой в модель автоматически добавляется блок:
            </p>
            <pre className="mt-2 bg-white border border-slate-200 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap">{`ТЕКУЩИЕ ДАННЫЕ: {"vin": "...", "part_name": "..."}\nПОПЫТКА №1 ДЛЯ ТЕКУЩЕГО ПУНКТА.`}</pre>
            <p className="mt-2 text-slate-500">
              Это уже собранные на данный момент данные и номер попытки уточнения текущего вопроса. Дублировать это в тексте инструкции не нужно.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-1">2. Как завершить сценарий и создать заказ</h3>
            <p>Выведите валидный JSON внутри тега:</p>
            <pre className="mt-2 bg-white border border-slate-200 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap">{`<RESULT>{ "vin": "Z8T...", "part_name": "колодки", "budget": 2000 }</RESULT>`}</pre>
            <p className="mt-2 text-slate-500">
              Всё внутри тега должно быть валидным JSON — это станет телом заказа. Каждая пара ключ/значение отобразится отдельной строкой в карточке заказа в панели «Заказы клиента» — используйте понятные ключи (snake_case), они же подписи полей.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-1">3. Как завершить сценарий без заказа</h3>
            <p>
              Выведите пустой тег <code className="bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono text-xs">{`<RESULT></RESULT>`}</code> — заказ не создаётся, но команда всё равно считается завершённой, и чат передаётся оператору. Подходит для утилитарных команд без сбора данных (комплимент, шутка и т.п.), где не нужна карточка заказа.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-1">4. Что реально видит клиент</h3>
            <p>
              Клиенту в Telegram уходит весь текст ответа, кроме содержимого самого тега <code className="bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono text-xs">{`<RESULT>...</RESULT>`}</code>. Чтобы команда отвечала и сразу завершалась одним сообщением (без диалога), пишите видимый текст перед тегом в этом же ответе:
            </p>
            <pre className="mt-2 bg-white border border-slate-200 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap">{`Вот твой комплимент: ты сегодня прекрасно выглядишь!\n<RESULT></RESULT>`}</pre>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-1">5. Одна активная команда на чат</h3>
            <p>
              Пока в чате не завершена текущая команда (бейдж рядом с именем клиента в шапке чата), вторая команда не запустится — клиент получит сообщение «Пожалуйста, сначала завершите текущий опрос» (оно же видно оператору в чате с пометкой «Система»). Сбросить команду вручную можно крестиком на бейдже — чат вернётся в режим агента по умолчанию, не переключаясь на оператора.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-1">6. Режим по умолчанию (без активной команды)</h3>
            <p>
              Когда активной команды нет, бот отвечает по промпту из раздела «Настройки» → «Промпт ассистента», дополняя его всеми активными статьями из «Базы знаний».
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6">
        {loading ? (
          [1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)
        ) : (
          commands.map((cmd) => (
            <div 
              key={cmd.id} 
              className={cn(
                "w-full bg-white rounded-2xl border transition-all duration-200",
                editingId === cmd.id ? "border-blue-500 ring-4 ring-blue-50 ring-offset-0" : "border-slate-200 hover:border-slate-300"
              )}
            >
              {editingId === cmd.id ? (
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Команда (необязательно)</label>
                      <Input
                        value={editForm.command}
                        onChange={e => setEditForm({...editForm, command: e.target.value})}
                        placeholder="/start — оставьте пустым для промпта только для пересылки"
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Канал</label>
                      <Select value={editForm.channel ?? ''} onChange={e => setEditForm({ ...editForm, channel: e.target.value || null })}>
                        <option value="">Любой</option>
                        <option value="telegram">Telegram</option>
                        <option value="wechat">WeChat</option>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Бейдж на сообщениях</label>
                      <Input
                        value={editForm.badge ?? ''}
                        onChange={e => setEditForm({ ...editForm, badge: e.target.value })}
                        placeholder="напр. Продажи"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Промпт (Инструкции для AI)</label>
                    <Textarea
                      className="min-h-[200px] bg-slate-50 focus-visible:bg-white leading-relaxed"
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
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-2 flex-wrap">
                      {cmd.command ? (
                        <Badge mono>{cmd.command}</Badge>
                      ) : (
                        <Badge>только для пересылки</Badge>
                      )}
                      {cmd.channel && (
                        <Badge>{cmd.channel}</Badge>
                      )}
                      {cmd.badge && (
                        <Badge>{cmd.badge}</Badge>
                      )}
                      <h3 className="font-semibold text-slate-800">{cmd.description || 'Без описания'}</h3>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="secondary" className="gap-2" onClick={() => handleEdit(cmd)}>
                        <Edit3 size={16} /> Редактировать
                      </Button>
                      <Button variant="danger" className="gap-2" onClick={() => handleDelete(cmd.id)}>
                        <Trash2 size={16} /> Удалить
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-100 whitespace-pre-wrap">
                    {cmd.prompt_template || 'Инструкции не заданы'}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
    <Footer />
    </div>
  );
}

