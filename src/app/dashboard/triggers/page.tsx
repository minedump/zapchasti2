'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Save, Trash2, Edit3, X, Workflow } from 'lucide-react';
import { Button, Input, Select, Skeleton, Toggle } from '@/components/ui';
import { toast, Toaster } from 'react-hot-toast';
import { cn } from '@/lib/utils';

const OPERATOR_LABELS: Record<string, string> = {
  equals: 'равно',
  contains: 'содержит',
  is_empty: 'пусто',
  is_not_empty: 'не пусто',
};

interface Condition {
  id?: string;
  field_path: string;
  operator: string;
  value: string;
}

interface Rule {
  id: string;
  name: string;
  is_active: boolean;
  trigger_status_id: string;
  target_chat_id: string;
  prompt_id: string | null;
  conditions: Condition[];
}

const EMPTY_CONDITION: Condition = { field_path: '', operator: 'contains', value: '' };
const EMPTY_RULE = { name: '', is_active: true, trigger_status_id: '', target_chat_id: '', prompt_id: null, conditions: [{ ...EMPTY_CONDITION }] };

export default function TriggersPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [log, setLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: rulesData }, { data: statusesData }, { data: chatsData }, { data: promptsData }, { data: logData }] = await Promise.all([
      supabase.from('order_forward_rules').select('*, conditions:order_forward_conditions(*)').order('created_at', { ascending: false }),
      supabase.from('order_statuses').select('*').order('created_at'),
      supabase.from('chats').select('id, customer_name, channel').order('last_message_at', { ascending: false }),
      supabase.from('bot_commands').select('id, command, description, badge').order('created_at', { ascending: false }),
      supabase.from('order_forward_log')
        .select('*, rule:order_forward_rules(name), order:orders(order_number), chat:chats(customer_name)')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (rulesData) setRules(rulesData);
    if (statusesData) setStatuses(statusesData);
    if (chatsData) setChats(chatsData);
    if (promptsData) setPrompts(promptsData);
    if (logData) setLog(logData);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAdd = () => {
    const newId = 'new-' + Date.now();
    const newRule = { id: newId, ...structuredClone(EMPTY_RULE), isNew: true };
    setRules([newRule, ...rules]);
    setEditingId(newId);
    setEditForm(newRule);
  };

  const handleEdit = (rule: Rule) => {
    setEditingId(rule.id);
    setEditForm({ ...rule, conditions: rule.conditions.length ? [...rule.conditions] : [{ ...EMPTY_CONDITION }] });
  };

  const handleCancel = (rule: any) => {
    setEditingId(null);
    if (rule.isNew) fetchAll();
  };

  const addCondition = () => {
    setEditForm({ ...editForm, conditions: [...editForm.conditions, { ...EMPTY_CONDITION }] });
  };

  const removeCondition = (index: number) => {
    setEditForm({ ...editForm, conditions: editForm.conditions.filter((_: any, i: number) => i !== index) });
  };

  const updateCondition = (index: number, field: keyof Condition, value: string) => {
    const conditions = [...editForm.conditions];
    conditions[index] = { ...conditions[index], [field]: value };
    setEditForm({ ...editForm, conditions });
  };

  const handleSave = async () => {
    if (!editForm.name.trim()) return toast.error('Укажите название правила');
    if (!editForm.trigger_status_id) return toast.error('Выберите статус-триггер');
    if (!editForm.target_chat_id) return toast.error('Выберите чат для пересылки');

    setSaving(true);
    const { isNew, conditions, ...payload } = editForm;
    payload.prompt_id = payload.prompt_id || null;

    let ruleId = editForm.id;
    if (isNew) {
      const { id, ...insertData } = payload;
      const { data, error } = await supabase.from('order_forward_rules').insert([insertData]).select().maybeSingle();
      if (error || !data) { toast.error('Ошибка сохранения'); setSaving(false); return; }
      ruleId = data.id;
    } else {
      const { error } = await supabase.from('order_forward_rules').update(payload).eq('id', ruleId);
      if (error) { toast.error('Ошибка сохранения'); setSaving(false); return; }
      await supabase.from('order_forward_conditions').delete().eq('rule_id', ruleId);
    }

    const validConditions = conditions
      .filter((c: Condition) => c.field_path.trim())
      .map((c: Condition) => ({
        rule_id: ruleId,
        field_path: c.field_path.trim(),
        operator: c.operator,
        value: c.operator === 'is_empty' || c.operator === 'is_not_empty' ? null : c.value,
      }));

    if (validConditions.length) {
      const { error } = await supabase.from('order_forward_conditions').insert(validConditions);
      if (error) toast.error('Условия сохранились не полностью');
    }

    toast.success('Правило сохранено');
    setEditingId(null);
    setSaving(false);
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (id.startsWith('new-')) {
      setRules(rules.filter(r => r.id !== id));
      setEditingId(null);
      return;
    }
    if (!confirm('Удалить это правило?')) return;
    const { error } = await supabase.from('order_forward_rules').delete().eq('id', id);
    if (error) return toast.error('Ошибка удаления');
    toast.success('Удалено');
    fetchAll();
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="p-8 max-w-5xl mx-auto w-full flex-1">
        <Toaster position="top-right" />

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <Workflow className="text-blue-600" size={28} />
              Триггеры
            </h1>
            <p className="text-slate-500 mt-1">Автоматическая пересылка заказов по правилам</p>
          </div>
          <Button onClick={handleAdd} className="gap-2">
            <Plus size={18} /> Создать правило
          </Button>
        </div>

        <div className="grid gap-6 mb-12">
          {loading ? (
            [1, 2].map(i => <Skeleton key={i} className="h-40 w-full" />)
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 bg-white rounded-2xl border border-slate-200">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                <Workflow size={28} className="text-slate-300" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-400">Правил пока нет</p>
                <p className="text-xs text-slate-300 mt-1">Нажмите «Создать правило», чтобы настроить пересылку заказов</p>
              </div>
            </div>
          ) : (
            rules.map((rule: any) => (
              <div key={rule.id} className={cn(
                "bg-white rounded-2xl border transition-all",
                editingId === rule.id ? "border-blue-500 ring-4 ring-blue-50" : "border-slate-200 hover:border-slate-300"
              )}>
                {editingId === rule.id ? (
                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <Input
                        placeholder="Название правила"
                        value={editForm.name}
                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        className="flex-1"
                      />
                      <label className="flex items-center gap-2 text-sm text-slate-600 shrink-0">
                        <Toggle checked={editForm.is_active} onChange={v => setEditForm({ ...editForm, is_active: v })} aria-label="Активно" />
                        активно
                      </label>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1 mb-1.5 block">Когда заказ переходит в статус</label>
                      <Select value={editForm.trigger_status_id} onChange={e => setEditForm({ ...editForm, trigger_status_id: e.target.value })}>
                        <option value="">Выберите статус…</option>
                        {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1 mb-1.5 block">Условия (все должны совпасть)</label>
                      <div className="space-y-2">
                        {editForm.conditions.map((c: Condition, i: number) => (
                          <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2">
                            <Input
                              placeholder="поле, напр. model"
                              value={c.field_path}
                              onChange={e => updateCondition(i, 'field_path', e.target.value)}
                              className="w-40 h-9"
                            />
                            <Select value={c.operator} onChange={e => updateCondition(i, 'operator', e.target.value)} className="h-9 w-36">
                              {Object.entries(OPERATOR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </Select>
                            {c.operator !== 'is_empty' && c.operator !== 'is_not_empty' && (
                              <Input
                                placeholder="значение"
                                value={c.value}
                                onChange={e => updateCondition(i, 'value', e.target.value)}
                                className="flex-1 h-9"
                              />
                            )}
                            <Button variant="ghost" size="sm" className="p-1.5 shrink-0" onClick={() => removeCondition(i)}>
                              <X size={14} />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button variant="ghost" size="sm" className="gap-2 mt-2 text-blue-600" onClick={addCondition}>
                        <Plus size={14} /> Добавить условие
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1 mb-1.5 block">Переслать в чат</label>
                        <Select value={editForm.target_chat_id} onChange={e => setEditForm({ ...editForm, target_chat_id: e.target.value })}>
                          <option value="">Выберите чат…</option>
                          {chats.map(c => <option key={c.id} value={c.id}>{c.customer_name || 'Без имени'} ({c.channel})</option>)}
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1 mb-1.5 block">Обработать промптом (необязательно)</label>
                        <Select value={editForm.prompt_id ?? ''} onChange={e => setEditForm({ ...editForm, prompt_id: e.target.value || null })}>
                          <option value="">Без обработки — переслать как есть</option>
                          {prompts.map(p => <option key={p.id} value={p.id}>{p.description || p.command || p.id}</option>)}
                        </Select>
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="secondary" onClick={() => handleCancel(rule)}>Отмена</Button>
                      <Button onClick={handleSave} disabled={saving} className="gap-2">
                        <Save size={18} /> Сохранить
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-slate-800">{rule.name}</h3>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                          rule.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                        )}>
                          {rule.is_active ? 'активно' : 'выключено'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(rule)} className="p-2">
                          <Edit3 size={18} />
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(rule.id)} className="p-2">
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      Статус: <b className="text-slate-700">{statuses.find(s => s.id === rule.trigger_status_id)?.name ?? '—'}</b>
                      {' · '}
                      Условия: {rule.conditions.length ? rule.conditions.map((c: Condition) => `${c.field_path} ${OPERATOR_LABELS[c.operator]}${c.value ? ` "${c.value}"` : ''}`).join(', ') : 'нет'}
                      {' → '}
                      {chats.find(c => c.id === rule.target_chat_id)?.customer_name ?? '—'}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-4">Журнал</h2>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {log.length === 0 ? (
            <p className="text-sm text-slate-400 p-6 text-center">Пока ничего не пересылалось</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase">
                  <th className="p-3 font-bold">Время</th>
                  <th className="p-3 font-bold">Правило</th>
                  <th className="p-3 font-bold">Заказ</th>
                  <th className="p-3 font-bold">Куда</th>
                  <th className="p-3 font-bold">Статус</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry: any) => (
                  <tr key={entry.id} className="border-b border-slate-50 last:border-0">
                    <td className="p-3 text-slate-500">{new Date(entry.created_at).toLocaleString()}</td>
                    <td className="p-3 text-slate-700">{entry.rule?.name ?? '—'}</td>
                    <td className="p-3 text-slate-700">{entry.order?.order_number ? `#${entry.order.order_number}` : '—'}</td>
                    <td className="p-3 text-slate-700">{entry.chat?.customer_name ?? '—'}</td>
                    <td className="p-3">
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                        entry.status === 'ok' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                      )} title={entry.error_message ?? undefined}>
                        {entry.status === 'ok' ? 'ок' : 'ошибка'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white px-8 py-3 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} PromptFlow &mdash; CRM для Telegram и WeChat
      </footer>
    </div>
  );
}
