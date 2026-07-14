'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Save, Trash2, Edit3, FileText } from 'lucide-react';
import { Badge, Button, Input, Select, Textarea, Skeleton, Toggle, Checkbox } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { toast, Toaster } from 'react-hot-toast';
import { cn } from '@/lib/utils';

const EMPTY_TEMPLATE = { title: '', context: '', command_id: null, ask_extra: false, extra_question: '', is_active: true };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [commands, setCommands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: templatesData }, { data: commandsData }] = await Promise.all([
      supabase.from('message_templates').select('*, command:bot_commands(id, command, description)').order('created_at', { ascending: false }),
      supabase.from('bot_commands').select('id, command, description').order('created_at', { ascending: false }),
    ]);
    if (templatesData) setTemplates(templatesData);
    if (commandsData) setCommands(commandsData);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAdd = () => {
    const newId = 'new-' + Date.now();
    const newTemplate = { id: newId, ...structuredClone(EMPTY_TEMPLATE), isNew: true };
    setTemplates([newTemplate, ...templates]);
    setEditingId(newId);
    setEditForm(newTemplate);
  };

  const handleEdit = (tpl: any) => {
    setEditingId(tpl.id);
    setEditForm({ ...tpl, command_id: tpl.command_id ?? null, extra_question: tpl.extra_question ?? '' });
  };

  const handleCancel = (tpl: any) => {
    setEditingId(null);
    if (tpl.isNew) fetchAll();
  };

  const handleSave = async () => {
    if (!editForm.title.trim()) return toast.error('Укажите заголовок шаблона');
    if (!editForm.context.trim()) return toast.error('Укажите контекст для AI');
    if (editForm.ask_extra && !editForm.extra_question.trim()) return toast.error('Укажите уточняющий вопрос');

    setSaving(true);
    const { isNew, command, ...payload } = editForm;
    payload.command_id = payload.command_id || null;
    payload.extra_question = payload.ask_extra ? payload.extra_question.trim() : null;

    let result;
    if (isNew) {
      const { id, ...insertData } = payload;
      result = await supabase.from('message_templates').insert([insertData]).select();
    } else {
      result = await supabase.from('message_templates').update(payload).eq('id', editForm.id).select();
    }

    if (!result.error) {
      toast.success('Сохранено');
      setEditingId(null);
      fetchAll();
    } else {
      toast.error('Ошибка сохранения');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (id.startsWith('new-')) {
      setTemplates(templates.filter(t => t.id !== id));
      setEditingId(null);
      return;
    }
    if (!confirm('Удалить этот шаблон?')) return;
    const { error } = await supabase.from('message_templates').delete().eq('id', id);
    if (error) return toast.error('Ошибка удаления');
    toast.success('Удалено');
    fetchAll();
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="p-8 max-w-5xl mx-auto w-full flex-1">
        <Toaster position="top-right" />

        <div className="flex justify-end md:justify-between items-center mb-4 md:mb-8">
          <h1 className="hidden md:block text-3xl font-bold text-slate-900">Шаблоны</h1>
          <Button onClick={handleAdd} className="gap-2">
            <Plus size={18} /> Создать шаблон
          </Button>
        </div>

        <div className="grid gap-6">
          {loading ? (
            [1, 2].map(i => <Skeleton key={i} className="h-40 w-full" />)
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 bg-white rounded-2xl border border-slate-200">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                <FileText size={28} className="text-slate-300" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-400">Шаблонов пока нет</p>
                <p className="text-xs text-slate-300 mt-1">Нажмите «Создать шаблон», чтобы добавить готовый AI-ответ в чаты</p>
              </div>
            </div>
          ) : (
            templates.map((tpl: any) => (
              <div key={tpl.id} className={cn(
                "bg-white rounded-2xl border transition-all",
                editingId === tpl.id ? "border-blue-500 ring-4 ring-blue-50" : "border-slate-200 hover:border-slate-300"
              )}>
                {editingId === tpl.id ? (
                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <Input
                        placeholder="Заголовок шаблона, напр. «Статус заказа»"
                        value={editForm.title}
                        onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                        className="flex-1"
                      />
                      <div className="flex items-center gap-2 text-sm text-slate-600 shrink-0">
                        <Toggle checked={editForm.is_active} onChange={v => setEditForm({ ...editForm, is_active: v })} aria-label="Активен" />
                        активен
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Контекст для AI</label>
                      <Textarea
                        className="min-h-[140px] bg-slate-50 focus-visible:bg-white leading-relaxed"
                        value={editForm.context}
                        onChange={e => setEditForm({ ...editForm, context: e.target.value })}
                        placeholder={`Ответь, какой статус у заказа, и спроси, что ещё подсказать по заказам. Если больше ничего не нужно — передай оператору и выведи пустой тег <RESULT></RESULT>.`}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Прогнать через команду (необязательно)</label>
                      <Select value={editForm.command_id ?? ''} onChange={e => setEditForm({ ...editForm, command_id: e.target.value || null })}>
                        <option value="">Без команды — только контекст</option>
                        {commands.map(c => <option key={c.id} value={c.id}>{c.description || c.command || c.id}</option>)}
                      </Select>
                      <p className="text-xs text-slate-400 ml-1">Если выбрана команда, её промпт подставится перед контекстом шаблона, а созданный/обновлённый заказ привяжется к этой команде.</p>
                    </div>

                    <div className="flex items-start gap-2 text-sm text-slate-700">
                      <Checkbox
                        checked={editForm.ask_extra}
                        onChange={e => setEditForm({ ...editForm, ask_extra: e.target.checked })}
                        aria-label="Запросить уточнение у оператора"
                        className="mt-0.5"
                      />
                      <span>Запросить уточнение у оператора при отправке (например, номер заказа)</span>
                    </div>

                    {editForm.ask_extra && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Вопрос оператору</label>
                        <Input
                          value={editForm.extra_question}
                          onChange={e => setEditForm({ ...editForm, extra_question: e.target.value })}
                          placeholder="Какой номер заказа?"
                        />
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="secondary" onClick={() => handleCancel(tpl)}>Отмена</Button>
                      <Button onClick={handleSave} disabled={saving} className="gap-2">
                        <Save size={18} /> Сохранить
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-800">{tpl.title}</h3>
                        <Badge variant={tpl.is_active ? 'green' : 'neutral'}>
                          {tpl.is_active ? 'активен' : 'выключен'}
                        </Badge>
                        {tpl.command && (
                          <Badge mono>{tpl.command.command || tpl.command.description}</Badge>
                        )}
                        {tpl.ask_extra && (
                          <Badge>с уточнением</Badge>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="secondary" className="gap-2" onClick={() => handleEdit(tpl)}>
                          <Edit3 size={16} /> Редактировать
                        </Button>
                        <Button variant="danger" className="gap-2" onClick={() => handleDelete(tpl.id)}>
                          <Trash2 size={16} /> Удалить
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-100 whitespace-pre-wrap">
                      {tpl.context}
                    </div>
                    {tpl.ask_extra && (
                      <p className="text-xs text-slate-400 mt-2 ml-1">Вопрос оператору: «{tpl.extra_question}»</p>
                    )}
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
