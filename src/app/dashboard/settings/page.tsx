'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Palette, Tag, Save, X, Check, Tags } from 'lucide-react';
import { Badge, Button, Input, Skeleton } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { toast, Toaster } from 'react-hot-toast';

export default function SettingsPage() {
  const [statuses, setStatuses] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [systemMessageBadge, setSystemMessageBadge] = useState('');
  const [loading, setLoading] = useState(true);

  // inline-add state
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#94a3b8');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [showAddStatus, setShowAddStatus] = useState(false);
  const [showAddTag, setShowAddTag] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: sData }, { data: tData }, { data: settingsData }] = await Promise.all([
      supabase.from('order_statuses').select('*').order('created_at'),
      supabase.from('tags').select('*').order('created_at'),
      supabase.from('bot_settings').select('key, value').in('key', ['system_message_badge']),
    ]);
    if (sData) setStatuses(sData);
    if (tData) setTags(tData);
    if (settingsData) {
      const byKey = new Map(settingsData.map(s => [s.key, s.value]));
      setSystemMessageBadge(byKey.get('system_message_badge') ?? '');
    }
    setLoading(false);
  };

  const saveBadges = async () => {
    await supabase.from('bot_settings').upsert({ key: 'system_message_badge', value: systemMessageBadge });
    toast.success('Бейдж сохранен');
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

  const deleteItem = async (table: string, id: string, isSystem: boolean) => {
    if (isSystem) return toast.error('Системный элемент нельзя удалить');
    await supabase.from(table).delete().eq('id', id);
    fetchData();
  };

  const updateColor = async (table: string, id: string, color: string) => {
    await supabase.from(table).update({ color }).eq('id', id);
    fetchData();
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full flex-1">
      <Toaster />

      <h1 className="hidden md:block text-3xl font-bold text-slate-900 mb-8">Настройки</h1>

      {loading ? (
        <div className="space-y-6">
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
      ) : (
      <div className="space-y-8">

        {/* === Бейдж системных сообщений === */}
        <Section
          icon={<Tags size={18} />}
          title="Бейдж системных сообщений"
          description="Метка на служебных уведомлениях бота (промпт и бейдж ассистента настраиваются в разделе «Команды AI»)"
          action={<Button onClick={saveBadges} className="gap-2"><Save size={16} /> Сохранить</Button>}
        >
          <div className="space-y-1.5 max-w-sm">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Системные сообщения</label>
            <Input value={systemMessageBadge} onChange={e => setSystemMessageBadge(e.target.value)} placeholder="напр. Система" />
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

      </div>
      )}
    </div>
    <Footer />
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
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="text-blue-600">{icon}</span>
          <div>
            <h2 className="font-bold text-slate-800 text-sm">{title}</h2>
            <p className="text-xs text-slate-400">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="p-4 md:p-6">{children}</div>
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
    <div className="mb-3 flex flex-wrap items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
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
      <Button className="gap-2 shrink-0" onClick={onConfirm}>
        <Check size={16} /> Добавить
      </Button>
      <Button variant="secondary" className="gap-2 shrink-0" onClick={onCancel}>
        <X size={16} /> Отмена
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
        {badge && <Badge>{badge}</Badge>}
      </div>
      {onDelete && (
        <Button variant="danger" className="p-2.5" onClick={onDelete}>
          <Trash2 size={16} />
        </Button>
      )}
    </div>
  );
}
