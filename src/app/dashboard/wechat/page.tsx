'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { Plus, RefreshCw, Copy, Check, AlertCircle, MessageCircle, Edit3, Save, Trash2 } from 'lucide-react';
import { WeChatIcon } from '@/components/icons';
import { Badge, Button, Input, Skeleton } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import { Footer } from '@/components/Footer';
import { cn } from '@/lib/utils';
import { toast, Toaster } from 'react-hot-toast';

type AccountStatus = 'pending_qr' | 'scanned' | 'logged_in' | 'expired' | 'error' | 'not_started';

interface Account {
  bot_name: string;
  label: string;
  badge?: string | null;
  status: AccountStatus;
  qr_url?: string;
  error?: string;
  error_at?: string;
  fatal_error?: string;
  fatal_error_at?: string;
  last_message_at?: string;
  chat_id?: string | null;
}

// Транзиентные ошибки поллинга (acc.error/error_at) — фоновый шум, не показываем
// оператору вовсе. Фатальные (acc.fatal_error) — только они реально требуют
// действия ("Повторить"), но техническую строку переводим в понятную причину.
function describeFatalError(err: string): string {
  if (/timeout|aborted due to timeout/i.test(err)) {
    return 'Код для входа просрочился';
  }
  if (/expired/i.test(err)) {
    return 'Код для входа истёк';
  }
  return err;
}

const STATUS_LABELS: Record<AccountStatus, { label: string; variant: BadgeVariant }> = {
  not_started: { label: 'Не запущен', variant: 'neutral' },
  pending_qr: { label: 'Ждём сканирования', variant: 'neutral' },
  scanned: { label: 'Отсканирован', variant: 'neutral' },
  logged_in: { label: 'Подключён', variant: 'green' },
  expired: { label: 'QR истёк', variant: 'neutral' },
  error: { label: 'Ошибка', variant: 'red' },
};

export default function WeChatPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [newBadge, setNewBadge] = useState('');
  const [creating, setCreating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const qrCanvasCache = useRef<Record<string, string>>({});
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [badgeDraft, setBadgeDraft] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/wechat/accounts');
      const data = await res.json();
      if (res.ok) setAccounts(data.accounts || []);
    } catch {
      // network hiccup — keep showing the last known state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    const interval = setInterval(fetchAccounts, 4000);
    return () => clearInterval(interval);
  }, [fetchAccounts]);

  // Render QR images for any account currently showing a scannable code
  useEffect(() => {
    accounts.forEach((acc) => {
      if (acc.qr_url && (acc.status === 'pending_qr' || acc.status === 'scanned') && qrCanvasCache.current[acc.qr_url] === undefined) {
        qrCanvasCache.current[acc.qr_url] = 'pending';
        QRCode.toDataURL(acc.qr_url, { width: 220, margin: 1 })
          .then((dataUrl) => {
            qrCanvasCache.current[acc.qr_url!] = dataUrl;
            setQrImages((prev) => ({ ...prev, [acc.qr_url!]: dataUrl }));
          })
          .catch(() => {});
      }
    });
  }, [accounts]);

  const createAccount = async () => {
    const label = newLabel.trim();
    if (!label) return;
    if (accounts.some((a) => a.label === label)) {
      toast.error('Аккаунт с таким именем уже есть');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/wechat/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, badge: newBadge.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Ошибка создания');
        return;
      }
      toast.success('Аккаунт создан, ждём QR-код');
      setNewLabel('');
      setNewBadge('');
      setShowAdd(false);
      await fetchAccounts();
    } catch {
      toast.error('Не удалось связаться со шлюзом');
    } finally {
      setCreating(false);
    }
  };

  const retryAccount = async (botName: string) => {
    try {
      const res = await fetch('/api/wechat/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_name: botName }),
      });
      if (res.ok) {
        toast.success('Повторная попытка запущена');
        await fetchAccounts();
      }
    } catch {
      toast.error('Не удалось связаться со шлюзом');
    }
  };

  const startEditLabel = (acc: Account) => {
    setEditingLabel(acc.bot_name);
    setLabelDraft(acc.label);
    setBadgeDraft(acc.badge ?? '');
  };

  const saveLabel = async (botName: string) => {
    const label = labelDraft.trim();
    if (!label) return;

    setSavingLabel(true);
    try {
      const res = await fetch(`/api/wechat/accounts/${encodeURIComponent(botName)}/label`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, badge: badgeDraft.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Не удалось сохранить имя');
        return;
      }
      toast.success('Имя обновлено');
      setEditingLabel(null);
      await fetchAccounts();
    } catch {
      toast.error('Не удалось сохранить имя');
    } finally {
      setSavingLabel(false);
    }
  };

  const deleteAccount = async (botName: string, label: string) => {
    if (!confirm(`Удалить аккаунт «${label}»? Все связанные чаты, сообщения и заказы будут удалены безвозвратно. Сама сессия WeChat на шлюзе не тронется.`)) return;

    try {
      const res = await fetch(`/api/wechat/accounts/${encodeURIComponent(botName)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Не удалось удалить');
        return;
      }
      toast.success('Аккаунт удалён');
      await fetchAccounts();
    } catch {
      toast.error('Не удалось связаться с сервером');
    }
  };

  const copyLink = async (url: string, botName: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedFor(botName);
    setTimeout(() => setCopiedFor(null), 1500);
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="p-8 max-w-5xl mx-auto w-full flex-1">
        <Toaster position="top-right" />

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">WeChat</h1>
            <p className="text-slate-500 mt-1">Аккаунты для приёма и отправки сообщений в WeChat</p>
          </div>
          <Button onClick={() => setShowAdd((v) => !v)} className="gap-2">
            <Plus size={18} /> Подключить аккаунт
          </Button>
        </div>

        {showAdd && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
            <Input
              placeholder="Имя аккаунта, например Продажи-1"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAccount()}
              className="flex-1 bg-white"
              autoFocus
            />
            <Input
              placeholder="Бейдж на сообщениях (необязательно)"
              value={newBadge}
              onChange={(e) => setNewBadge(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAccount()}
              className="flex-1 bg-white"
            />
            <Button onClick={createAccount} disabled={creating} className="gap-2 shrink-0">
              {creating ? 'Создаём…' : 'Создать'}
            </Button>
          </div>
        )}

        <div className="grid gap-6">
          {loading ? (
            [1, 2].map((i) => <Skeleton key={i} className="h-48 w-full" />)
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 bg-white rounded-2xl border border-slate-200">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                <WeChatIcon size={28} className="text-slate-300" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-400">Аккаунтов пока нет</p>
                <p className="text-xs text-slate-300 mt-1">Нажмите «Подключить аккаунт», чтобы получить QR для входа</p>
              </div>
            </div>
          ) : (
            accounts.map((acc) => {
              const statusInfo = STATUS_LABELS[acc.status] ?? STATUS_LABELS.not_started;
              const showQr = acc.qr_url && (acc.status === 'pending_qr' || acc.status === 'scanned');
              const isEditing = editingLabel === acc.bot_name;
              return (
                <div key={acc.bot_name} className={cn(
                  "bg-white rounded-2xl border transition-all",
                  isEditing ? "border-blue-500 ring-4 ring-blue-50" : "border-slate-200 hover:border-slate-300"
                )}>
                  {isEditing ? (
                    <div className="p-6 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase ml-1 mb-1.5 block">Имя аккаунта</label>
                          <Input
                            value={labelDraft}
                            onChange={(e) => setLabelDraft(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveLabel(acc.bot_name)}
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase ml-1 mb-1.5 block">Бейдж на сообщениях</label>
                          <Input
                            placeholder="напр. Продажи"
                            value={badgeDraft}
                            onChange={(e) => setBadgeDraft(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveLabel(acc.bot_name)}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <Button variant="secondary" onClick={() => setEditingLabel(null)}>Отмена</Button>
                        <Button onClick={() => saveLabel(acc.bot_name)} disabled={savingLabel} className="gap-2">
                          <Save size={18} /> Сохранить
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{acc.label}</span>
                            {acc.badge && <Badge>{acc.badge}</Badge>}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {acc.chat_id && (
                            <Button variant="secondary" className="gap-2" onClick={() => router.push(`/dashboard?chatId=${acc.chat_id}`)}>
                              <MessageCircle size={16} /> Открыть чат
                            </Button>
                          )}
                          {(acc.status === 'error' || acc.status === 'expired' || acc.status === 'not_started') && (
                            <Button variant="secondary" className="gap-2" onClick={() => retryAccount(acc.bot_name)}>
                              <RefreshCw size={16} /> Повторить
                            </Button>
                          )}
                          <Button variant="secondary" className="gap-2" onClick={() => startEditLabel(acc)}>
                            <Edit3 size={16} /> Редактировать
                          </Button>
                          <Button variant="danger" className="gap-2" onClick={() => deleteAccount(acc.bot_name, acc.label)}>
                            <Trash2 size={16} /> Удалить
                          </Button>
                        </div>
                      </div>

                      {showQr && (
                        <div className="flex items-start gap-4 mb-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                          {qrImages[acc.qr_url!] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={qrImages[acc.qr_url!]} alt="QR для входа" className="rounded-lg border border-slate-200" width={160} height={160} />
                          ) : (
                            <Skeleton className="w-40 h-40 rounded-lg" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-600 mb-2">
                              Отсканируйте этим QR-кодом в WeChat тем аккаунтом, который должен отвечать клиентам.
                            </p>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 truncate">
                                {acc.qr_url}
                              </code>
                              <Button variant="secondary" size="sm" className="p-2 shrink-0" onClick={() => copyLink(acc.qr_url!, acc.bot_name)}>
                                {copiedFor === acc.bot_name ? <Check size={14} /> : <Copy size={14} />}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {acc.fatal_error && (
                        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                          <AlertCircle size={14} className="shrink-0 mt-0.5 text-slate-400" />
                          <span className="break-all">{describeFatalError(acc.fatal_error)}</span>
                        </div>
                      )}

                      {acc.last_message_at && (
                        <p className="text-xs text-slate-400 mt-2">
                          Последнее сообщение: {new Date(acc.last_message_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
