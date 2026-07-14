'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Save, Trash2, Edit3, X, HelpCircle, BookOpen, Check, ScrollText } from 'lucide-react';
import { Badge, Button, Input, Select, Textarea, Skeleton, Toggle, Checkbox } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { toast, Toaster } from 'react-hot-toast';
import { cn } from '@/lib/utils';

const DEFAULT_THINKING_MESSAGE = 'Минутку, уточняю информацию — скоро вернусь с ответом 🙌';

const SOURCE_LABELS: Record<string, string> = {
  command: 'команда',
  default: 'ассистент',
  template: 'шаблон',
  forward: 'пересылка',
};

export default function CommandsPage() {
  const [commands, setCommands] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [log, setLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);

  // inline-add статьи базы знаний
  const [showAddArticle, setShowAddArticle] = useState(false);
  const [newArticleTitle, setNewArticleTitle] = useState('');
  const [newArticleContent, setNewArticleContent] = useState('');

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: cmdData }, { data: kbData }, { data: logData }] = await Promise.all([
      supabase.from('bot_commands').select('*, command_knowledge(knowledge_id)').order('created_at', { ascending: false }),
      supabase.from('knowledge_base').select('*').order('created_at', { ascending: false }),
      supabase.from('ai_call_log')
        .select('*, command:bot_commands(command, description), chat:chats(customer_name)')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (cmdData) setCommands(cmdData);
    if (kbData) setKnowledge(kbData);
    if (logData) setLog(logData);
    setLoading(false);
  };

  const handleAdd = () => {
    const newId = 'new-' + Date.now();
    const newCmd = {
      id: newId,
      command: '',
      description: '',
      prompt_template: '',
      channel: null,
      badge: '',
      is_active: true,
      starts_dialog: false,
      receives_chat_orders: false,
      is_default: false,
      thinking_message: DEFAULT_THINKING_MESSAGE,
      knowledge_mode: 'none',
      knowledge_ids: [] as string[],
      isNew: true,
    };
    setCommands([newCmd, ...commands]);
    setEditingId(newId);
    setEditForm(newCmd);
  };

  const handleEdit = (cmd: any) => {
    setEditingId(cmd.id);
    setEditForm({
      ...cmd,
      command: cmd.command ?? '',
      channel: cmd.channel ?? '',
      badge: cmd.badge ?? '',
      starts_dialog: cmd.starts_dialog ?? false,
      receives_chat_orders: cmd.receives_chat_orders ?? false,
      is_default: cmd.is_default ?? false,
      thinking_message: cmd.thinking_message ?? '',
      knowledge_mode: cmd.knowledge_mode ?? 'none',
      knowledge_ids: (cmd.command_knowledge ?? []).map((l: any) => l.knowledge_id),
    });
  };

  const toggleKnowledgeId = (id: string) => {
    const ids: string[] = editForm.knowledge_ids ?? [];
    setEditForm({
      ...editForm,
      knowledge_ids: ids.includes(id) ? ids.filter(k => k !== id) : [...ids, id],
    });
  };

  const handleSave = async () => {
    const command = editForm.command.trim();
    if (command && !command.startsWith('/')) {
      toast.error('Команда должна начинаться с /');
      return;
    }
    if (editForm.starts_dialog && !command) {
      toast.error('В режиме диалога у команды должен быть /триггер');
      return;
    }
    if (editForm.knowledge_mode === 'selected' && !(editForm.knowledge_ids ?? []).length) {
      toast.error('Выберите хотя бы одну статью базы знаний');
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

    const { isNew, command_knowledge, knowledge_ids, ...payload } = editForm;
    payload.command = command || null;
    payload.channel = editForm.channel || null;
    payload.badge = editForm.badge?.trim() || null;
    payload.thinking_message = editForm.thinking_message?.trim() || null;

    // Дефолтная команда одна: перед сохранением снимаем флаг с остальных,
    // иначе упрёмся в уникальный индекс.
    if (payload.is_default) {
      let query = supabase.from('bot_commands').update({ is_default: false }).eq('is_default', true);
      if (!isNew) query = query.neq('id', editForm.id);
      await query;
    }

    let result;
    if (isNew) {
      const { id, ...insertData } = payload;
      result = await supabase.from('bot_commands').insert([insertData]).select();
    } else {
      result = await supabase.from('bot_commands').update(payload).eq('id', editForm.id).select();
    }

    if (result.error || !result.data?.length) {
      toast.error('Ошибка сохранения');
      return;
    }

    const savedId = result.data[0].id;
    await supabase.from('command_knowledge').delete().eq('command_id', savedId);
    if (payload.knowledge_mode === 'selected' && knowledge_ids.length) {
      const { error } = await supabase.from('command_knowledge').insert(
        knowledge_ids.map((kid: string) => ({ command_id: savedId, knowledge_id: kid }))
      );
      if (error) toast.error('Статьи привязались не полностью');
    }

    toast.success('Сохранено');
    setEditingId(null);
    fetchAll();
  };

  const handleDelete = async (cmd: any) => {
    if (cmd.id.toString().startsWith('new-')) {
      setCommands(commands.filter(c => c.id !== cmd.id));
      setEditingId(null);
      return;
    }
    if (cmd.is_default) {
      toast.error('Команду по умолчанию нельзя удалить — сначала назначьте другую');
      return;
    }

    if (confirm('Удалить эту команду?')) {
      const { error } = await supabase.from('bot_commands').delete().eq('id', cmd.id);
      if (!error) {
        toast.success('Удалено');
        fetchAll();
      }
    }
  };

  // ── База знаний ────────────────────────────────────────────────────────────

  const addArticle = async () => {
    if (!newArticleTitle.trim()) return;
    const { error } = await supabase.from('knowledge_base').insert([{ title: newArticleTitle.trim(), content: newArticleContent }]);
    if (error) toast.error('Ошибка при добавлении');
    else {
      toast.success('Статья добавлена');
      setNewArticleTitle('');
      setNewArticleContent('');
      setShowAddArticle(false);
      fetchAll();
    }
  };

  const updateArticle = async (id: string, updates: any) => {
    await supabase.from('knowledge_base').update(updates).eq('id', id);
  };

  const toggleArticleActive = async (id: string, isActive: boolean) => {
    await supabase.from('knowledge_base').update({ is_active: isActive }).eq('id', id);
    setKnowledge(prev => prev.map(k => k.id === id ? { ...k, is_active: isActive } : k));
  };

  const deleteArticle = async (id: string) => {
    if (!confirm('Удалить эту статью?')) return;
    await supabase.from('knowledge_base').delete().eq('id', id);
    fetchAll();
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
    <div className="p-8 max-w-5xl mx-auto w-full flex-1">
      <Toaster position="top-right" />

      <div className="flex justify-end md:justify-between items-center mb-4 md:mb-8">
        <h1 className="hidden md:block text-3xl font-bold text-slate-900">Команды</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { window.location.href = '/dashboard/docs'; }} className="gap-2">
            <HelpCircle size={18} /> Документация
          </Button>
          <Button onClick={handleAdd} className="gap-2">
            <Plus size={18} /> Создать команду
          </Button>
        </div>
      </div>

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
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Сообщение «надо подумать» (необязательно)</label>
                    <Input
                      value={editForm.thinking_message ?? ''}
                      onChange={e => setEditForm({ ...editForm, thinking_message: e.target.value })}
                      placeholder={DEFAULT_THINKING_MESSAGE}
                    />
                    <p className="text-xs text-slate-400 ml-1">Отправляется клиенту сразу, до обращения к AI. Оставьте пустым, чтобы не отправлять.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">База знаний</label>
                    <Select value={editForm.knowledge_mode} onChange={e => setEditForm({ ...editForm, knowledge_mode: e.target.value })}>
                      <option value="none">Не использовать</option>
                      <option value="all">Все активные статьи</option>
                      <option value="selected">Выбранные статьи</option>
                    </Select>
                    {editForm.knowledge_mode === 'selected' && (
                      <div className="mt-2 space-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto">
                        {knowledge.map(k => (
                          <label key={k.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <Checkbox
                              checked={(editForm.knowledge_ids ?? []).includes(k.id)}
                              onChange={() => toggleKnowledgeId(k.id)}
                            />
                            <span className={cn(!k.is_active && 'text-slate-400 line-through')}>{k.title}</span>
                          </label>
                        ))}
                        {knowledge.length === 0 && (
                          <p className="text-xs text-slate-400">Статей пока нет — добавьте их в разделе «База знаний» ниже</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-2 text-sm text-slate-700">
                      <Toggle
                        checked={!!editForm.is_active}
                        onChange={v => setEditForm({ ...editForm, is_active: v })}
                        aria-label="Команда активна"
                        className="mt-0.5"
                      />
                      <span>Активна — выключенная команда не запускается и не отвечает.</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-slate-700">
                      <Toggle
                        checked={!!editForm.is_default}
                        onChange={v => setEditForm({ ...editForm, is_default: v })}
                        aria-label="Ассистент по умолчанию"
                        className="mt-0.5"
                      />
                      <span>Ассистент по умолчанию — отвечает, когда бот включён, но активной команды нет. Может быть только один.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-sm text-slate-700">
                    <Toggle
                      checked={!!editForm.starts_dialog}
                      onChange={v => setEditForm({ ...editForm, starts_dialog: v })}
                      aria-label="Режим диалога после пересылки"
                      className="mt-0.5"
                    />
                    <span>
                      Режим диалога после пересылки — после первого сообщения чат перейдёт в эту команду и будет ждать ответ получателя, пока тот не завершит её тегом{' '}
                      <code className="bg-slate-100 border border-slate-200 rounded px-1 py-0.5 font-mono text-xs">{`<RESULT>`}</code>. Требует /триггер.
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-slate-700">
                    <Toggle
                      checked={!!editForm.receives_chat_orders}
                      onChange={v => setEditForm({ ...editForm, receives_chat_orders: v })}
                      aria-label="Получать заказы клиента в этом чате"
                      className="mt-0.5"
                    />
                    <span>
                      Получать заказы клиента в этом чате — в промпт перед вызовом AI автоматически добавится блок со всеми заказами текущего чата (номер, статус, данные).
                    </span>
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
                    <Button variant="secondary" onClick={() => { setEditingId(null); if(cmd.isNew) fetchAll(); }}>Отмена</Button>
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
                      ) : cmd.is_default ? null : (
                        <Badge>только для пересылки</Badge>
                      )}
                      {cmd.is_default && (
                        <Badge variant="green">по умолчанию</Badge>
                      )}
                      {!cmd.is_active && (
                        <Badge variant="red">выключена</Badge>
                      )}
                      {cmd.channel && (
                        <Badge>{cmd.channel}</Badge>
                      )}
                      {cmd.badge && (
                        <Badge>{cmd.badge}</Badge>
                      )}
                      {cmd.starts_dialog && (
                        <Badge variant="green">диалог</Badge>
                      )}
                      {cmd.receives_chat_orders && (
                        <Badge color="#2563eb">видит заказы</Badge>
                      )}
                      {cmd.knowledge_mode && cmd.knowledge_mode !== 'none' && (
                        <Badge color="#7c3aed">
                          {cmd.knowledge_mode === 'all' ? 'вся база знаний' : `статьи: ${(cmd.command_knowledge ?? []).length}`}
                        </Badge>
                      )}
                      <h3 className="font-semibold text-slate-800">{cmd.description || 'Без описания'}</h3>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="secondary" className="gap-2" onClick={() => handleEdit(cmd)}>
                        <Edit3 size={16} /> Редактировать
                      </Button>
                      {!cmd.is_default && (
                        <Button variant="danger" className="gap-2" onClick={() => handleDelete(cmd)}>
                          <Trash2 size={16} /> Удалить
                        </Button>
                      )}
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

      {/* === База знаний === */}
      <div className="mt-12">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <BookOpen size={20} className="text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900">База знаний</h2>
          </div>
          <Button variant="secondary" className="gap-2" onClick={() => setShowAddArticle(v => !v)}>
            <Plus size={16} /> Добавить статью
          </Button>
        </div>

        {showAddArticle && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
            <Input
              placeholder="Заголовок статьи"
              value={newArticleTitle}
              onChange={e => setNewArticleTitle(e.target.value)}
            />
            <Textarea
              placeholder="Содержание статьи..."
              value={newArticleContent}
              onChange={e => setNewArticleContent(e.target.value)}
              className="min-h-[100px] resize-none"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" className="gap-2" onClick={() => { setShowAddArticle(false); setNewArticleTitle(''); setNewArticleContent(''); }}>
                <X size={16} /> Отмена
              </Button>
              <Button className="gap-2" onClick={addArticle}>
                <Check size={16} /> Добавить
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {knowledge.map(k => (
            <div key={k.id} className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Input
                  defaultValue={k.title}
                  onBlur={e => updateArticle(k.id, { title: e.target.value })}
                  className="font-semibold"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <Toggle
                    checked={!!k.is_active}
                    onChange={v => toggleArticleActive(k.id, v)}
                    aria-label="Статья активна"
                  />
                  <span className="text-xs text-slate-500 w-16">{k.is_active ? 'активна' : 'выключена'}</span>
                  <Button variant="danger" size="sm" className="shrink-0 p-2" onClick={() => deleteArticle(k.id)}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
              <Textarea
                defaultValue={k.content}
                onBlur={e => updateArticle(k.id, { content: e.target.value })}
                className="min-h-[100px] resize-none"
              />
            </div>
          ))}
          {knowledge.length === 0 && !showAddArticle && !loading && (
            <p className="text-sm text-slate-400 py-2">Статей пока нет</p>
          )}
        </div>
      </div>

      {/* === Журнал AI-вызовов === */}
      <div className="mt-12">
        <div className="flex items-center gap-2 mb-4">
          <ScrollText size={20} className="text-blue-600" />
          <h2 className="text-xl font-bold text-slate-900">Журнал AI</h2>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {log.length === 0 ? (
            <p className="text-sm text-slate-400 p-6 text-center">Обращений к AI пока не было</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase">
                  <th className="p-3 font-bold">Время</th>
                  <th className="p-3 font-bold">Источник</th>
                  <th className="p-3 font-bold">Команда</th>
                  <th className="p-3 font-bold">Чат</th>
                  <th className="p-3 font-bold">Длит.</th>
                  <th className="p-3 font-bold">Статус</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry: any) => (
                  <tr key={entry.id} className="border-b border-slate-50 last:border-0">
                    <td className="p-3 text-slate-500">{new Date(entry.created_at).toLocaleString()}</td>
                    <td className="p-3 text-slate-700">{SOURCE_LABELS[entry.source] ?? entry.source}</td>
                    <td className="p-3 text-slate-700">{entry.command ? (entry.command.command || entry.command.description || '—') : '—'}</td>
                    <td className="p-3 text-slate-700">{entry.chat?.customer_name ?? '—'}</td>
                    <td className="p-3 text-slate-500">{entry.duration_ms != null ? `${(entry.duration_ms / 1000).toFixed(1)}с` : '—'}</td>
                    <td className="p-3">
                      <Badge variant={entry.status === 'ok' ? 'green' : 'red'} title={entry.error_message ?? undefined}>
                        {entry.status === 'ok' ? 'ок' : 'ошибка'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
    <Footer />
    </div>
  );
}
