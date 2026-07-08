'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Palette, Tag, BookOpen, MessageSquare, Save, X, Check, Tags } from 'lucide-react';
import { Button, Input, Textarea, Skeleton } from '@/components/ui';
import { toast, Toaster } from 'react-hot-toast';

export default function SettingsPage() {
  const [statuses, setStatuses] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [botPrompt, setBotPrompt] = useState('');
  const [defaultAssistantBadge, setDefaultAssistantBadge] = useState('');
  const [systemMessageBadge, setSystemMessageBadge] = useState('');
  const [loading, setLoading] = useState(true);

  // inline-add state
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#94a3b8');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [newArticleTitle, setNewArticleTitle] = useState('');
  const [newArticleContent, setNewArticleContent] = useState('');
  const [showAddStatus, setShowAddStatus] = useState(false);
  const [showAddTag, setShowAddTag] = useState(false);
  const [showAddArticle, setShowAddArticle] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: sData }, { data: tData }, { data: kData }, { data: settingsData }] = await Promise.all([
      supabase.from('order_statuses').select('*').order('created_at'),
      supabase.from('tags').select('*').order('created_at'),
      supabase.from('knowledge_base').select('*').order('created_at', { ascending: false }),
      supabase.from('bot_settings').select('key, value').in('key', ['default_assistant_prompt', 'default_assistant_badge', 'system_message_badge']),
    ]);
    if (sData) setStatuses(sData);
    if (tData) setTags(tData);
    if (kData) setKnowledge(kData);
    if (settingsData) {
      const byKey = new Map(settingsData.map(s => [s.key, s.value]));
      setBotPrompt(byKey.get('default_assistant_prompt') ?? '');
      setDefaultAssistantBadge(byKey.get('default_assistant_badge') ?? '');
      setSystemMessageBadge(byKey.get('system_message_badge') ?? '');
    }
    setLoading(false);
  };

  const savePrompt = async () => {
    await supabase.from('bot_settings').upsert({ key: 'default_assistant_prompt', value: botPrompt });
    toast.success('Промпт сохранен');
  };

  const saveBadges = async () => {
    await Promise.all([
      supabase.from('bot_settings').upsert({ key: 'default_assistant_badge', value: defaultAssistantBadge }),
      supabase.from('bot_settings').upsert({ key: 'system_message_badge', value: systemMessageBadge }),
    ]);
    toast.success('Бейджи сохранены');
  };

  const addStatus = async () => {
    if (!newStatusName.trim()) return;
    const { error } = await supabase.from('order_statuses').insert([{ name: newStatusName.trim(), color: newStatusColor }]);
    if (error) toast.error('Ошибка: статус уже существует');
    else { toast.success('Статус добавлен'); setNewStatusName(''); setNewStatusColor('#94a3b8'); setShowAddStatus(false); fetchData(); }
  };

  const addTag = async () => {
    if (!newTagName.trim()) return;
    const { error } = await supabase.from('tags').insert([{ name: newTagName.trim(), color: newTagColor }]);
    if (error) toast.error('Ошибка: метка уже существует');
    else { toast.success('Метка добавлена'); setNewTagName(''); setNewTagColor('#3b82f6'); setShowAddTag(false); fetchData(); }
  };

  const addArticle = async () => {
    if (!newArticleTitle.trim()) return;
    const { error } = await supabase.from('knowledge_base').insert([{ title: newArticleTitle.trim(), content: newArticleContent }]);
    if (error) toast.error('Ошибка при добавлении');
    else { toast.success('Статья добавлена'); setNewArticleTitle(''); setNewArticleContent(''); setShowAddArticle(false); fetchData(); }
  };

  const updateKnowledge = async (id: string, updates: any) => {
    await supabase.from('knowledge_base').update(updates).eq('id', id);
  };

  const deleteItem = async (table: string, id: string, isSystem: boolean) => {
    if (isSystem) return toast.error('Системный элемент нельзя удалить');
    await supabase.from(table).delete().eq('id', id);
    fetchData();
  };

  const updateColor = async (table: string, id: string, color: string) => {
    await supabase.from(table).update({ color }).eq('id', id);
    fetchData();
  };

  if (loading) return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <Skeleton className="h-8 w-56" />
      </div>
      <Skeleton className="h-4 w-72" />
      {[1,2,3,4].map(i => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
          <Skeleton className="h-px w-full" />
          {[1,2].map(j => (
            <div key={j} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="w-8 h-8 rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
    <div className="p-8 max-w-5xl mx-auto w-full pb-4 flex-1">
      <Toaster />

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            Настройки
          </h1>
          <p className="text-slate-500 mt-1">Промпт бота, база знаний и справочники</p>
        </div>
      </div>

      <div className="space-y-8">

        {/* === Промпт ассистента === */}
        <Section
          icon={<MessageSquare size={18} />}
          title="Промпт ассистента"
          description="Инструкции для бота в режиме ожидания"
          action={<Button onClick={savePrompt} className="gap-2"><Save size={16} /> Сохранить</Button>}
        >
          <Textarea
            className="min-h-[180px] bg-slate-50 focus-visible:bg-white leading-relaxed resize-none"
            value={botPrompt}
            onChange={e => setBotPrompt(e.target.value)}
          />
        </Section>

        {/* === Бейджи по умолчанию === */}
        <Section
          icon={<Tags size={18} />}
          title="Бейджи по умолчанию"
          description="Метки на сообщениях без своей команды/аккаунта"
          action={<Button onClick={saveBadges} className="gap-2"><Save size={16} /> Сохранить</Button>}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Ответы агента по умолчанию</label>
              <Input value={defaultAssistantBadge} onChange={e => setDefaultAssistantBadge(e.target.value)} placeholder="напр. AI" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Системные сообщения</label>
              <Input value={systemMessageBadge} onChange={e => setSystemMessageBadge(e.target.value)} placeholder="напр. Система" />
            </div>
          </div>
        </Section>

        {/* === Статусы заказов === */}
        <Section
          icon={<Palette size={18} />}
          title="Статусы заказов"
          description="Цветовые статусы для управления заказами"
          action={
            <Button variant="secondary" className="gap-2" onClick={() => setShowAddStatus(v => !v)}>
              <Plus size={16} /> Добавить
            </Button>
          }
        >
          {showAddStatus && (
            <AddRow
              colorValue={newStatusColor}
              onColorChange={setNewStatusColor}
              nameValue={newStatusName}
              onNameChange={setNewStatusName}
              placeholder="Название статуса"
              onConfirm={addStatus}
              onCancel={() => { setShowAddStatus(false); setNewStatusName(''); }}
            />
          )}
          <div className="space-y-2">
            {statuses.map(s => (
              <ItemRow
                key={s.id}
                color={s.color}
                name={s.name}
                badge={s.is_system ? 'Системный' : undefined}
                onColorChange={color => updateColor('order_statuses', s.id, color)}
                onDelete={s.is_system ? undefined : () => deleteItem('order_statuses', s.id, false)}
              />
            ))}
          </div>
        </Section>

        {/* === Метки === */}
        <Section
          icon={<Tag size={18} />}
          title="Метки"
          description="Теги для классификации чатов и заказов"
          action={
            <Button variant="secondary" className="gap-2" onClick={() => setShowAddTag(v => !v)}>
              <Plus size={16} /> Добавить
            </Button>
          }
        >
          {showAddTag && (
            <AddRow
              colorValue={newTagColor}
              onColorChange={setNewTagColor}
              nameValue={newTagName}
              onNameChange={setNewTagName}
              placeholder="Название метки"
              onConfirm={addTag}
              onCancel={() => { setShowAddTag(false); setNewTagName(''); }}
            />
          )}
          <div className="space-y-2">
            {tags.map(t => (
              <ItemRow
                key={t.id}
                color={t.color}
                name={t.name}
                onColorChange={color => updateColor('tags', t.id, color)}
                onDelete={() => deleteItem('tags', t.id, false)}
              />
            ))}
            {tags.length === 0 && !showAddTag && (
              <p className="text-sm text-slate-400 py-2">Меток пока нет</p>
            )}
          </div>
        </Section>

        {/* === База знаний === */}
        <Section
          icon={<BookOpen size={18} />}
          title="База знаний"
          description="Статьи, которые бот использует при ответах"
          action={
            <Button variant="secondary" className="gap-2" onClick={() => setShowAddArticle(v => !v)}>
              <Plus size={16} /> Добавить статью
            </Button>
          }
        >
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
                <Button size="sm" variant="secondary" className="gap-1" onClick={() => { setShowAddArticle(false); setNewArticleTitle(''); setNewArticleContent(''); }}>
                  <X size={14} /> Отмена
                </Button>
                <Button size="sm" className="gap-1" onClick={addArticle}>
                  <Check size={14} /> Сохранить
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {knowledge.map(k => (
              <div key={k.id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Input
                    defaultValue={k.title}
                    onBlur={e => updateKnowledge(k.id, { title: e.target.value })}
                    className="font-semibold bg-white"
                  />
                  <Button variant="danger" size="sm" className="shrink-0 p-2" onClick={() => deleteItem('knowledge_base', k.id, false)}>
                    <Trash2 size={16} />
                  </Button>
                </div>
                <Textarea
                  defaultValue={k.content}
                  onBlur={e => updateKnowledge(k.id, { content: e.target.value })}
                  className="min-h-[100px] resize-none"
                />
              </div>
            ))}
            {knowledge.length === 0 && !showAddArticle && (
              <p className="text-sm text-slate-400 py-2">Статей пока нет</p>
            )}
          </div>
        </Section>

      </div>
    </div>
    <footer className="shrink-0 border-t border-slate-200 bg-white px-8 py-3 text-center text-xs text-slate-400">
      &copy; {new Date().getFullYear()} PromptFlow &mdash; CRM для Telegram
    </footer>
    </div>
  );
}

// ── Переиспользуемые компоненты ──────────────────────────────────────────────

function Section({ icon, title, description, action, children }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="text-blue-600">{icon}</span>
          <div>
            <h2 className="font-bold text-slate-800 text-sm">{title}</h2>
            <p className="text-xs text-slate-400">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function AddRow({ colorValue, onColorChange, nameValue, onNameChange, placeholder, onConfirm, onCancel }: {
  colorValue: string;
  onColorChange: (v: string) => void;
  nameValue: string;
  onNameChange: (v: string) => void;
  placeholder: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
      <input
        type="color"
        value={colorValue}
        onChange={e => onColorChange(e.target.value)}
        className="w-9 h-9 rounded-full cursor-pointer border border-slate-200 bg-transparent shrink-0"
      />
      <Input
        placeholder={placeholder}
        value={nameValue}
        onChange={e => onNameChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onConfirm()}
        className="flex-1 bg-white"
        autoFocus
      />
      <Button size="sm" className="gap-1 shrink-0" onClick={onConfirm}>
        <Check size={14} /> Добавить
      </Button>
      <Button size="sm" variant="secondary" className="shrink-0 p-2" onClick={onCancel}>
        <X size={14} />
      </Button>
    </div>
  );
}

function ItemRow({ color, name, badge, onColorChange, onDelete }: {
  color: string;
  name: string;
  badge?: string;
  onColorChange: (v: string) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={color}
          onChange={e => onColorChange(e.target.value)}
          className="w-8 h-8 rounded-full cursor-pointer border border-slate-200 bg-transparent"
        />
        <span className="font-medium text-slate-700 text-sm">{name}</span>
        {badge && (
          <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase">{badge}</span>
        )}
      </div>
      {onDelete && (
        <Button variant="danger" size="sm" className="p-2" onClick={onDelete}>
          <Trash2 size={15} />
        </Button>
      )}
    </div>
  );
}
