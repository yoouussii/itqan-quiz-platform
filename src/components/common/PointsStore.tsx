import React, { useCallback, useEffect, useState } from 'react';
import { Store, Coins, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Redemption, STATUS_LABEL, StoreBalance, StoreItem, cancelRedemption, fetchBalance, fetchRedemptions, fetchStoreItems, redeem, storeError } from '../../services/storeService';
import { Chip } from './ui';
import { timeAgo } from './NotificationBell';
import { t } from '../../i18n';

/** طلبات الاستبدال (للطالب، ولولي الأمر بلا أزرار) */
export const RedemptionList: React.FC<{ rows: Redemption[]; onCancel?: (id: string) => void }> = ({ rows, onCancel }) => (
  <ul className="space-y-2">
    {rows.map((r) => (
      <li key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
        <span className="text-2xl shrink-0" aria-hidden="true">{r.item_emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-900 dark:text-white truncate">{r.item_title}</div>
          <div className="text-[11px] text-slate-500">{t('{n} نقطة', { n: r.cost })} · {timeAgo(r.created_at)}{r.note ? ` · ${r.note}` : ''}</div>
        </div>
        <Chip tone={STATUS_LABEL[r.status].tone}>{t(STATUS_LABEL[r.status].label)}</Chip>
        {onCancel && r.status === 'pending' && (
          <button type="button" onClick={() => onCancel(r.id)} aria-label={t('إلغاء الطلب')} title={t('إلغاء الطلب')} className="w-8 h-8 shrink-0 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"><X className="w-4 h-4" /></button>
        )}
      </li>
    ))}
  </ul>
);

/** متجر النقاط داخل صفحة «نقاطي»: الرصيد، المكافآت، وطلباتي */
export const StudentStore: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const [items, setItems] = useState<StoreItem[] | null>(null);
  const [bal, setBal] = useState<StoreBalance | null>(null);
  const [mine, setMine] = useState<Redemption[]>([]);
  const [confirm, setConfirm] = useState<StoreItem | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [i, b, m] = await Promise.all([fetchStoreItems(), fetchBalance(), fetchRedemptions(currentUser?.id)]);
    setItems(i.ok ? i.items.filter((x) => x.active) : null); setBal(b); setMine(m);
  }, [currentUser?.id]);
  useEffect(() => { void load(); }, [load]);
  if (!items || !bal || (!items.length && !mine.length)) return null; // قبل 052 أو بلا مكافآت

  const buy = async () => {
    if (!confirm) return;
    setBusy(true);
    const r = await redeem(confirm.id);
    setBusy(false);
    if (!r.ok) { showToast(t(storeError(r.error)), 'error'); return; }
    showToast(t('أُرسل طلبك، وسيصلك إشعار عند اعتماده'), 'success');
    setConfirm(null); void load();
  };
  const cancel = async (id: string) => {
    if (!window.confirm(t('إلغاء الطلب وإعادة النقاط؟'))) return;
    if (await cancelRedemption(id)) void load(); else showToast(t('تعذر الإلغاء'), 'error');
  };

  return (
    <section className="space-y-3" data-testid="student-store">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><Store className="w-5 h-5 text-violet-500" />{t('متجر النقاط')}</h2>
        <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-violet-50 dark:bg-violet-950/50 text-violet-800 dark:text-violet-200 px-3 h-8 text-sm font-bold">
          <Coins className="w-4 h-4" />{t('رصيدك: {n} نقطة', { n: bal.balance })}
        </span>
      </div>
      {bal.spent > 0 && <p className="text-[11px] text-slate-500">{t('استبدلت {s} نقطة من {e}. مستواك يُحسب من كل ما جمعته، فالاستبدال لا يُنقصه.', { s: bal.spent, e: bal.earned })}</p>}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((it) => {
          const out = it.stock !== null && it.stock <= 0;
          const short = bal.balance < it.cost;
          return (
            <div key={it.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-2">
              <div className="text-4xl" aria-hidden="true">{it.emoji}</div>
              <div className="font-bold text-slate-900 dark:text-white leading-snug">{it.title}</div>
              {it.description && <p className="text-[11px] text-slate-500 leading-relaxed">{it.description}</p>}
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <span className="font-black text-violet-700 dark:text-violet-300 tabular-nums">{t('{n} نقطة', { n: it.cost })}</span>
                {it.stock !== null && <span className="text-[11px] text-slate-500">{out ? t('نفدت') : t('متبقٍ {n}', { n: it.stock })}</span>}
              </div>
              <button type="button" disabled={out || short} onClick={() => setConfirm(it)}
                className="h-9 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800 disabled:cursor-not-allowed">
                {out ? t('نفدت الكمية') : short ? t('ينقصك {n} نقطة', { n: it.cost - bal.balance }) : t('استبدال')}
              </button>
            </div>
          );
        })}
      </div>
      {mine.length > 0 && (<><h3 className="font-bold text-sm text-slate-900 dark:text-white pt-2">{t('طلباتي')}</h3><RedemptionList rows={mine.slice(0, 10)} onCancel={(id) => void cancel(id)} /></>)}

      {confirm && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={t('تأكيد الاستبدال')} onClick={() => setConfirm(null)}>
          <div className="w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 text-center space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl">{confirm.emoji}</div>
            <h2 className="font-bold text-lg text-slate-900 dark:text-white">{confirm.title}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('سيُخصم {c} نقطة ويبقى لك {r}. يصل الطلب للإدارة لاعتماده.', { c: confirm.cost, r: bal.balance - confirm.cost })}</p>
            <div className="flex gap-2 justify-center pt-1">
              <button type="button" disabled={busy} onClick={() => void buy()} className="h-10 px-5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold disabled:opacity-60">{t('تأكيد الاستبدال')}</button>
              <button type="button" onClick={() => setConfirm(null)} className="h-10 px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold">{t('إلغاء')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
