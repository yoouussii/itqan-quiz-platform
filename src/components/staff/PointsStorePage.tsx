import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Save, Pencil, Trash2, Check, PackageCheck, XCircle, ImagePlus, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Redemption, RedemptionStatus, STATUS_LABEL, StoreItem, deleteStoreItem, fileToStoreImage, fetchRedemptions, fetchStoreItems, handleRedemption, saveStoreItem, storeError } from '../../services/storeService';
import { PageHeader, Card, Button, Chip } from '../common/ui';
import { timeAgo } from '../common/NotificationBell';
import { ItemVisual } from '../common/PointsStore';
import { Mascot } from '../common/Mascot';
import { User } from '../../types';
import { t, uiDir } from '../../i18n';

const inp = 'h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white';
const EMOJIS = ['🎁', '🖊️', '📚', '🏅', '🎟️', '⭐', '🍫', '🧃', '⚽', '🎨', '👕', '🪑', '🎮', '📜'];
type Draft = { id?: string; title: string; description: string; emoji: string; image: string | null; cost: string; stock: string; active: boolean };
const blank: Draft = { title: '', description: '', emoji: '🎁', image: null, cost: '50', stock: '', active: true };

/** متجر النقاط للطاقم: المكافآت وطلبات الاستبدال (052) */
export const PointsStorePage: React.FC = () => {
  const { currentUser, users, classes, showToast } = useApp();
  const [tab, setTab] = useState<'requests' | 'items'>('requests');
  const [items, setItems] = useState<StoreItem[]>([]);
  const [reqs, setReqs] = useState<Redemption[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<'open' | RedemptionStatus | 'all'>('open');
  const [draft, setDraft] = useState<Draft>(blank);
  const load = useCallback(async () => {
    const [i, r] = await Promise.all([fetchStoreItems(), fetchRedemptions()]);
    setReady(i.ok); setItems(i.items); setReqs(r);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const userMap = useMemo(() => new Map((users as User[]).map((u) => [u.id, u])), [users]);
  const className = (sid: string) => classes.find((c) => c.id === userMap.get(sid)?.class_id)?.name || '';
  const open = reqs.filter((r) => r.status === 'pending' || r.status === 'approved');
  const shown = reqs.filter((r) => (filter === 'all' ? true : filter === 'open' ? r.status === 'pending' || r.status === 'approved' : r.status === filter));

  const act = async (r: Redemption, status: 'approved' | 'delivered' | 'rejected') => {
    let note = '';
    if (status === 'rejected') { const n = window.prompt(t('سبب الرفض (يصل للطالب، اختياري):'), ''); if (n === null) return; note = n; }
    const x = await handleRedemption(r.id, status, note);
    if (!x.ok) return showToast(t(storeError(x.error)), 'error');
    showToast(status === 'rejected' ? t('رُفض الطلب وأُعيدت النقاط') : status === 'approved' ? t('اعتُمد الطلب') : t('سُجّل التسليم'), 'success');
    void load();
  };

  const save = async () => {
    const cost = Math.round(Number(draft.cost));
    if (!draft.title.trim()) return showToast(t('اكتب اسم المكافأة'), 'error');
    if (!(cost >= 1 && cost <= 100000)) return showToast(t('السعر بين 1 و100000 نقطة'), 'error');
    const stock = draft.stock.trim() === '' ? null : Math.max(0, Math.round(Number(draft.stock)));
    const r = await saveStoreItem({ id: draft.id, title: draft.title.trim(), description: draft.description.trim(), emoji: draft.emoji, image: draft.image, cost, stock, active: draft.active, created_by: currentUser!.id });
    if (!r.ok) return showToast(/policy|row-level|permission/i.test(r.error || '') ? t('ليس لديك صلاحية — أو لم يُشغَّل التحديث 052 بعد') : t('تعذر الحفظ'), 'error');
    setDraft(blank); void load();
  };
  const remove = async (it: StoreItem) => {
    if (!window.confirm(t('حذف «{name}»؟ تبقى الطلبات السابقة في السجل.', { name: it.title }))) return;
    if (await deleteStoreItem(it.id)) void load(); else showToast(t('تعذر الحذف'), 'error');
  };

  return (
    <div className="max-w-6xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={t('متجر النقاط')} subtitle={t('يستبدل الطلاب نقاطهم بمكافآت تحددها المدرسة، وتعتمدون الطلبات وتسلّمونها')} />
      {ready === false && <Card className="p-4 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30">{t('شغّل التحديث 052_points_store.sql من Supabase Migrate لتفعيل المتجر.')}</Card>}
      <div role="tablist" className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
        {([['requests', t('الطلبات'), open.length], ['items', t('المكافآت'), items.length]] as const).map(([k, label, n]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`h-9 px-4 rounded-lg text-sm font-bold ${tab === k ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>
            {label} <span className="tabular-nums text-xs text-slate-500">{n}</span>
          </button>
        ))}
      </div>

      {tab === 'requests' && (
        <Card className="p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['open', 'pending', 'approved', 'delivered', 'rejected', 'all'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                className={`h-8 px-3 rounded-full text-xs font-bold border ${filter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                {f === 'open' ? t('المفتوحة') : f === 'all' ? t('الكل') : t(STATUS_LABEL[f].label)}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 flex flex-col items-center gap-2"><Mascot size={48} prop="gift" />{t('لا توجد طلبات')}</div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {shown.map((r) => (
                <li key={r.id} className="py-3 flex flex-wrap items-center gap-3">
                  <ItemVisual image={r.item_image} emoji={r.item_emoji} />
                  <div className="flex-1 min-w-[12rem]">
                    <div className="font-bold text-slate-900 dark:text-white">{userMap.get(r.student_id)?.name || r.student_id} <span className="text-xs font-normal text-slate-500">{className(r.student_id)}</span></div>
                    <div className="text-xs text-slate-500">{r.item_title} · {t('{n} نقطة', { n: r.cost })} · {timeAgo(r.created_at)}{r.handled_by_name ? ` · ${t('بواسطة {n}', { n: r.handled_by_name })}` : ''}{r.note ? ` · ${r.note}` : ''}</div>
                  </div>
                  <Chip tone={STATUS_LABEL[r.status].tone}>{t(STATUS_LABEL[r.status].label)}</Chip>
                  <div className="flex gap-1.5">
                    {r.status === 'pending' && <Button size="sm" icon={Check} onClick={() => void act(r, 'approved')}>{t('اعتماد')}</Button>}
                    {(r.status === 'pending' || r.status === 'approved') && <Button size="sm" variant="secondary" icon={PackageCheck} onClick={() => void act(r, 'delivered')}>{t('تم التسليم')}</Button>}
                    {(r.status === 'pending' || r.status === 'approved') && <Button size="sm" variant="ghost" icon={XCircle} onClick={() => void act(r, 'rejected')}>{t('رفض')}</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'items' && (
        <div className="grid lg:grid-cols-[22rem_1fr] gap-5 items-start">
          <Card className="p-4 space-y-3">
            <h2 className="font-bold text-slate-900 dark:text-white">{draft.id ? t('تعديل مكافأة') : t('مكافأة جديدة')}</h2>
            <div className="flex items-center gap-3">
              <ItemVisual image={draft.image} emoji={draft.emoji} size="lg" />
              <div className="flex flex-col gap-1.5">
                <label className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <ImagePlus className="w-4 h-4" />{t('رفع صورة')}
                  <input type="file" accept="image/*" className="sr-only" aria-label={t('صورة المكافأة')} onChange={async (e) => {
                    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
                    try { setDraft((d) => ({ ...d, image: null })); const url = await fileToStoreImage(f); setDraft((d) => ({ ...d, image: url })); } catch (er: any) { showToast(t(er?.message || 'تعذرت قراءة الصورة'), 'error'); }
                  }} />
                </label>
                {draft.image && <button type="button" onClick={() => setDraft({ ...draft, image: null })} className="h-8 px-2 rounded-lg text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1"><X className="w-3.5 h-3.5" />{t('إزالة الصورة')}</button>}
              </div>
            </div>
            {!draft.image && <p className="text-[11px] text-slate-500">{t('أو اختر رمزاً')}</p>}
            {!draft.image && <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('الرمز')}>
              {EMOJIS.map((e) => (
                <button key={e} type="button" role="radio" aria-checked={draft.emoji === e} onClick={() => setDraft({ ...draft, emoji: e })}
                  className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center ${draft.emoji === e ? 'bg-indigo-100 dark:bg-indigo-900 ring-2 ring-indigo-500' : 'bg-slate-50 dark:bg-slate-800'}`}>{e}</button>
              ))}
            </div>}
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={80} placeholder={t('مثال: يوم بلا زي مدرسي')} aria-label={t('اسم المكافأة')} className={`${inp} w-full`} />
            <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={300} rows={2} placeholder={t('وصف قصير (اختياري)')} aria-label={t('الوصف')} className={`${inp} w-full h-auto py-2`} />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('السعر (نقطة)')}<input type="number" min={1} value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} className={`${inp} min-w-0`} /></label>
              <label className="text-xs text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('الكمية (فارغ = مفتوحة)')}<input type="number" min={0} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} className={`${inp} min-w-0`} /></label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="w-4 h-4 accent-indigo-600" />{t('ظاهرة للطلاب')}</label>
            <div className="flex gap-2">
              <Button size="sm" icon={draft.id ? Save : Plus} onClick={() => void save()}>{draft.id ? t('حفظ') : t('إضافة')}</Button>
              {draft.id && <Button size="sm" variant="ghost" onClick={() => setDraft(blank)}>{t('إلغاء')}</Button>}
            </div>
          </Card>
          {items.length === 0 ? (
            <Card className="p-10 text-center text-sm text-slate-500 flex flex-col items-center gap-2"><Mascot size={56} prop="gift" />{t('أضف أول مكافأة ليظهر المتجر للطلاب في صفحة «نقاطي».')}</Card>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
              {items.map((it) => {
                const sold = reqs.filter((r) => r.item_id === it.id && ['pending', 'approved', 'delivered'].includes(r.status)).length;
                return (
                  <Card key={it.id} className={`p-4 flex gap-3 ${it.active ? '' : 'opacity-60'}`}>
                    <ItemVisual image={it.image} emoji={it.emoji} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">{it.title}</div>
                      <div className="text-sm font-black text-violet-700 dark:text-violet-300 tabular-nums">{t('{n} نقطة', { n: it.cost })}</div>
                      <div className="text-[11px] text-slate-500">{[it.stock === null ? t('كمية مفتوحة') : t('متبقٍ {n}', { n: it.stock }), t('طُلبت {n} مرة', { n: sold }), it.active ? '' : t('مخفية')].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button type="button" aria-label={t('تعديل')} onClick={() => setDraft({ id: it.id, title: it.title, description: it.description, emoji: it.emoji, image: it.image || null, cost: String(it.cost), stock: it.stock === null ? '' : String(it.stock), active: it.active })} className="w-8 h-8 rounded-lg text-slate-400 hover:text-indigo-600 flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
                      <button type="button" aria-label={t('حذف')} onClick={() => void remove(it)} className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
