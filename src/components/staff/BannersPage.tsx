import React, { useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Images, Plus, Pencil, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, Upload, X, Pin, Sparkles, Play } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Banner, BANNER_THEMES, BANNER_EFFECTS, BannerAudience, BannerEffect, fileToBannerDataUrl, newBanner } from '../../services/bannerService';
import { BannerEffects } from '../common/BannerEffects';
import { fileToAvatarDataUrl } from '../../services/avatarService';
import { toInputValue, inputToIso } from '../../utils/quizWindow';
import { BannerCard, EDIT_BANNER_KEY } from '../common/BannerStrip';
import { uiDir, t } from '../../i18n';

const inputCls = 'w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white';
const labelCls = 'block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5';
const AUDIENCE: Record<BannerAudience, string> = { all: 'الجميع', students: 'الطلاب فقط', staff: 'المعلمون والمشرفون فقط' };
const MAX_GALLERY = 10;

const statusOf = (b: Banner) => {
  const now = Date.now();
  if (!b.is_active) return { label: t('مخفي'), cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' };
  if (b.starts_at && new Date(b.starts_at).getTime() > now) return { label: t('مجدول'), cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' };
  if (b.ends_at && new Date(b.ends_at).getTime() < now) return { label: t('انتهى'), cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' };
  return { label: t('ظاهر الآن'), cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' };
};

const Editor: React.FC<{ initial: Banner; onDone: () => void }> = ({ initial, onDone }) => {
  const { saveBanner, showToast } = useApp();
  const [b, setB] = useState<Banner>(initial);
  const [busy, setBusy] = useState(false);
  const [fxPlay, setFxPlay] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Banner>) => setB((prev) => ({ ...prev, ...patch }));
  const sizeKb = Math.round(JSON.stringify(b.images).length / 1024);

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      if (b.kind === 'wide') {
        set({ images: [{ src: await fileToBannerDataUrl(files[0]) }] });
      } else {
        const room = MAX_GALLERY - b.images.length;
        if (files.length > room) showToast(t('الحد الأقصى {n} صور في المعرض', { n: MAX_GALLERY }), 'info');
        const added = await Promise.all(files.slice(0, room).map(async (f) => ({ src: await fileToAvatarDataUrl(f, 320, 0.82), caption: '' })));
        set({ images: [...b.images, ...added] });
      }
    } catch (err: any) {
      showToast(err?.message || t('تعذر استخدام الصورة'), 'error');
    }
    setBusy(false);
  };

  const save = async () => {
    if (!b.title.trim() && !b.body.trim() && !b.images.length) return showToast(t('أضف صورة أو نصاً للبانر'), 'error');
    if (b.kind === 'gallery' && !b.images.length) return showToast(t('أضف صورة واحدة على الأقل للمعرض'), 'error');
    if (b.starts_at && b.ends_at && new Date(b.ends_at) <= new Date(b.starts_at)) return showToast(t('تاريخ الإخفاء يجب أن يكون بعد تاريخ الظهور'), 'error');
    if (sizeKb > 2500) return showToast(t('الصور كبيرة جداً، احذف بعضها'), 'error');
    setBusy(true);
    const ok = await saveBanner({ ...b, title: b.title.trim(), body: b.body.trim() });
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5">
        <div>
          <span className={labelCls}>{t('نوع البانر')}</span>
          <div className="grid grid-cols-2 gap-2">
            {([['wide', t('صورة عريضة'), ImageIcon], ['gallery', t('معرض صور طلاب'), Images]] as const).map(([k, label, Icon]) => (
              <button key={k} type="button" onClick={() => set({ kind: k, images: [] })}
                className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 ${b.kind === k ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>{t('العنوان')}</label>
          <input aria-label={t('عنوان البانر')} value={b.title} onChange={(e) => set({ title: e.target.value })} placeholder={t('مثال: نبارك لأبطالنا الفائزين 🏆')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('النص')}</label>
          <textarea aria-label={t('نص البانر')} rows={3} value={b.body} onChange={(e) => set({ body: e.target.value })}
            placeholder={t('مثال: تهانينا لطلابنا على تحقيق المراكز الأولى في مسابقة الرياضيات على مستوى المنطقة')} className={inputCls} />
        </div>

        <div>
          <span className={labelCls}>
            {b.kind === 'wide' ? t('الصورة (تُعرض بعرض الصفحة)') : t('صور الطلاب (حتى {n}) مع الاسم تحت كل صورة', { n: MAX_GALLERY })}
          </span>
          {b.kind === 'gallery' && b.images.length > 0 && (
            <div className="space-y-2 mb-2">
              {b.images.map((img, i) => (
                <div key={i} className="flex items-center gap-2">
                  <img src={img.src} alt="" className="w-12 h-12 rounded-xl object-cover" />
                  <input aria-label={t('اسم صاحب الصورة {n}', { n: i + 1 })} value={img.caption || ''} placeholder={t('اسم الطالب')}
                    onChange={(e) => set({ images: b.images.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)) })}
                    className={inputCls} />
                  <button type="button" aria-label={t('حذف الصورة')} onClick={() => set({ images: b.images.filter((_, j) => j !== i) })}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
          {b.kind === 'wide' && b.images[0] && (
            <div className="flex items-center gap-2 mb-2">
              <img src={b.images[0].src} alt="" className="h-14 rounded-xl object-cover" />
              <button type="button" onClick={() => set({ images: [] })} className="text-xs font-bold text-rose-600">{t('إزالة الصورة')}</button>
            </div>
          )}
          {(b.kind === 'wide' ? !b.images.length : b.images.length < MAX_GALLERY) && (
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60">
              <Upload className="w-4 h-4" /> {b.kind === 'wide' ? t('رفع صورة') : t('إضافة صور')}
            </button>
          )}
          <input ref={fileRef} data-testid="banner-file" type="file" accept="image/*" multiple={b.kind === 'gallery'} className="hidden" onChange={onFiles} />
          <p className="text-[11px] text-slate-400 mt-1">
            {b.kind === 'wide'
              ? t('المقاس المثالي: 1200 × 250 بكسل (أو أي صورة بنفس النسبة العريضة). تظهر الصورة كاملة دون قص. ')
              : t('تُقصّ كل صورة مربعة من منتصفها. ')}
            {t('الحجم الحالي:')}{' '}{sizeKb}{' '}{t('ك.ب')}
          </p>
        </div>

        {b.kind === 'wide' && b.images.length > 0 && (
          <div>
            <span className={labelCls}>{t('مكان النص')}</span>
            <select aria-label={t('مكان النص')} value={b.text_position} onChange={(e) => set({ text_position: e.target.value as Banner['text_position'] })} className={inputCls}>
              <option value="overlay">{t('فوق الصورة (أسفلها بخلفية داكنة)')}</option>
              <option value="below">{t('تحت الصورة')}</option>
            </select>
          </div>
        )}

        <div>
          <span className={labelCls}>{t('لون الخلفية')}</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(BANNER_THEMES).map(([k, th]) => (
              <button key={k} type="button" title={t(th.label)} aria-label={t('لون {name}', { name: t(th.label) })} onClick={() => set({ theme: k })}
                style={{ background: `linear-gradient(135deg, ${th.from}, ${th.to})` }}
                className={`w-9 h-9 rounded-xl ${b.theme === k ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-slate-900' : ''}`} />
            ))}
          </div>
        </div>

        <div>
          <span className={labelCls}>{t('تأثير احتفالي عند ظهور البانر')}</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('تأثير البانر')}>
            {(Object.keys(BANNER_EFFECTS) as BannerEffect[]).map((k) => {
              const on = (b.effect || 'none') === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on}
                  onClick={() => { set({ effect: k }); setFxPlay((n) => n + 1); }}
                  className={`h-10 px-3 rounded-xl border text-xs font-bold ${on ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}>
                  {t(BANNER_EFFECTS[k])}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{t('يخرج التأثير من البانر كلما ظهر في الصفحة الرئيسية. لا يظهر لمن فعّل «تقليل الحركة» في جهازه.')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t('يظهر لـ')}</label>
            <select aria-label={t('يظهر لـ')} value={b.audience} onChange={(e) => set({ audience: e.target.value as BannerAudience })} className={inputCls}>
              {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 sm:pt-6">
            <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={b.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
            {t('ظاهر (يمكن إخفاؤه مؤقتاً دون حذفه)')}
          </label>
          <label className="sm:col-span-2 flex items-start gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
            <input type="checkbox" className="accent-indigo-600 w-4 h-4 mt-0.5" checked={!!b.pinned} onChange={(e) => set({ pinned: e.target.checked })} />
            <span>
              <Pin className="inline w-3.5 h-3.5 me-1" />{t('دائم: بدون زر إخفاء (×)')}
              <span className="block font-normal text-slate-500 dark:text-slate-400 mt-0.5">{t('يبقى ظاهراً للجميع ولا يستطيع أحد إخفاءه، مناسب للإعلانات المهمة.')}</span>
            </span>
          </label>
          <div>
            <label className={labelCls}>{t('يبدأ الظهور (اختياري)')}</label>
            <input type="datetime-local" aria-label={t('يبدأ الظهور')} value={toInputValue(b.starts_at, 'start')} onChange={(e) => set({ starts_at: inputToIso(e.target.value) || null })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('يختفي تلقائياً (اختياري)')}</label>
            <input type="datetime-local" aria-label={t('يختفي تلقائياً')} value={toInputValue(b.ends_at, 'end')} onChange={(e) => set({ ends_at: inputToIso(e.target.value) || null })} className={inputCls} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onClick={onDone} className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">{t('إلغاء')}</button>
          <button type="button" disabled={busy} onClick={save} className="px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md disabled:opacity-60">
            {busy ? t('جارٍ الحفظ...') : t('حفظ ونشر البانر')}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{t('معاينة كما سيظهر في الصفحة الرئيسية:')}</p>
          {(b.effect || 'none') !== 'none' && (
            <button type="button" onClick={() => setFxPlay((n) => n + 1)} className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-400 hover:underline">
              <Play className="w-3.5 h-3.5" />{t('تشغيل التأثير')}
            </button>
          )}
        </div>
        <div className="relative pt-2">
          <BannerCard banner={b} />
          <BannerEffects effect={b.effect} playKey={fxPlay} />
        </div>
      </div>
    </div>
  );
};

/** إدارة بانرات الصفحة الرئيسية (مدير النظام) */
export const BannersPage: React.FC = () => {
  const { banners, saveBanner, deleteBanner, currentUser } = useApp();
  // فتح بانر محدد للتعديل (من زر «تعديل» على البانر في الصفحة الرئيسية)
  const [editing, setEditing] = useState<Banner | null>(() => {
    try {
      const id = sessionStorage.getItem(EDIT_BANNER_KEY);
      sessionStorage.removeItem(EDIT_BANNER_KEY);
      return id ? banners.find((b) => b.id === id) || null : null;
    } catch {
      return null;
    }
  });
  const sorted = useMemo(() => [...banners].sort((a, b) => a.sort - b.sort || b.created_at.localeCompare(a.created_at)), [banners]);

  const move = async (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= sorted.length) return;
    const list = sorted.map((b, k) => ({ ...b, sort: k }));
    [list[i].sort, list[j].sort] = [list[j].sort, list[i].sort];
    await saveBanner(list[i]);
    await saveBanner(list[j]);
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-6" dir={uiDir()}>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2"><Images className="w-6 h-6 text-indigo-600" />{' '}{t('بانرات الصفحة الرئيسية')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('صور وتهاني تظهر أعلى الصفحة الرئيسية. عند وجود أكثر من بانر تتبدّل تلقائياً.')}</p>
        </div>
        {!editing && (
          <button onClick={() => setEditing({ ...newBanner(currentUser?.id), sort: sorted.length })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
            <Plus className="w-4 h-4" />{' '}{t('بانر جديد')}
          </button>
        )}
      </div>

      {editing ? (
        <Editor initial={editing} onDone={() => setEditing(null)} />
      ) : sorted.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-16">{t('لا توجد بانرات بعد. اضغط «بانر جديد» لإضافة صورة أو تهنئة.')}</p>
      ) : (
        <ul className="space-y-4">
          {sorted.map((b, i) => {
            const st = statusOf(b);
            return (
              <li key={b.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                    <span className="text-[11px] text-slate-500">{t(AUDIENCE[b.audience])} • {b.kind === 'wide' ? t('صورة عريضة') : t('معرض ({n} صور)', { n: b.images.length })}</span>
                    {b.pinned && <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"><Pin className="w-3 h-3" />{t('دائم')}</span>}
                    {(b.effect || 'none') !== 'none' && <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300"><Sparkles className="w-3 h-3" />{t(BANNER_EFFECTS[b.effect!]).replace(/^\S+\s/, '')}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button aria-label={t('تحريك لأعلى')} disabled={i === 0} onClick={() => void move(i, -1)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button aria-label={t('تحريك لأسفل')} disabled={i === sorted.length - 1} onClick={() => void move(i, 1)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                    <button aria-label={b.is_active ? t('إخفاء') : t('إظهار')} title={b.is_active ? t('إخفاء') : t('إظهار')} onClick={() => void saveBanner({ ...b, is_active: !b.is_active })}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">{b.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                    <button aria-label={t('تعديل')} onClick={() => setEditing(b)} className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"><Pencil className="w-4 h-4" /></button>
                    <button aria-label={t('حذف البانر')} onClick={() => window.confirm(t('حذف هذا البانر نهائياً؟')) && void deleteBanner(b.id)}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className={b.is_active ? '' : 'opacity-60'}><BannerCard banner={b} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
