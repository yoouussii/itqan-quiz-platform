import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, X, Check, Copy, ChevronLeft } from 'lucide-react';
import { Button } from './ui';
import { useApp } from '../../context/AppContext';
import { fillTemplate, waLink } from '../../utils/whatsapp';
import { uiDir, t } from '../../i18n';

export interface WaRecipient {
  id: string;
  /** اسم الطالب (يظهر في القائمة ويُستبدل في {الطالب}) */
  name: string;
  /** رقم ولي الأمر بالصيغة الدولية، أو فارغ إن لم يُسجل */
  phone: string;
  /** متغيرات خاصة بكل مستلم (مثل الدرجة) */
  vars?: Record<string, string>;
  note?: string;
}

/**
 * إرسال رسالة واتساب جاهزة لكل ولي أمر، واحداً تلو الآخر
 * (المتصفح لا يسمح بفتح عدة محادثات دفعة واحدة).
 */
export const WhatsAppSender: React.FC<{
  title: string;
  subtitle?: string;
  recipients: WaRecipient[];
  template: string;
  /** المتغيرات المتاحة في القالب لعرضها للمستخدم */
  placeholders: string[];
  vars?: Record<string, string>;
  /** عناصر تحكم إضافية أعلى الرسالة (مثل اختيار اليوم) */
  extra?: React.ReactNode;
  onClose: () => void;
}> = ({ title, subtitle, recipients, template, placeholders, vars = {}, extra, onClose }) => {
  const { showToast } = useApp();
  const [tpl, setTpl] = useState(template);
  useEffect(() => { setTpl(template); }, [template]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const withPhone = recipients.filter((r) => r.phone);
  const missing = recipients.filter((r) => !r.phone);
  const msg = (r: WaRecipient) => fillTemplate(tpl, { ...vars, ...(r.vars || {}), 'الطالب': r.name });
  const next = useMemo(() => withPhone.find((r) => !sent.has(r.id)), [withPhone, sent]);
  const send = (r: WaRecipient) => {
    window.open(waLink(r.phone, msg(r)), '_blank', 'noopener');
    setSent((s) => new Set(s).add(r.id));
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full sm:max-w-2xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <span className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0"><MessageCircle className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{title}</h2>
            <p className="text-sm text-slate-500">{subtitle || t('{n} ولي أمر لهم أرقام · أُرسل {m}', { n: withPhone.length, m: sent.size })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-2 border-b border-slate-100 dark:border-slate-800">
          {extra}
          <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">{t('نص الرسالة')}</label>
          <textarea value={tpl} onChange={(e) => setTpl(e.target.value)} rows={4} className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm leading-relaxed" />
          <p className="text-xs text-slate-500">{t('يُستبدل تلقائياً لكل ولي أمر:')} {placeholders.map((p) => <code key={p} className="mx-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">{`{${p}}`}</code>)}</p>
          {next ? (
            <Button icon={ChevronLeft} onClick={() => send(next)} className="w-full !bg-emerald-600 hover:!bg-emerald-700">{t('إرسال التالي: {name}', { name: next.name })}</Button>
          ) : withPhone.length > 0 ? (
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5"><Check className="w-4 h-4" />{t('تم فتح كل المحادثات')}</p>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto">
          {recipients.length === 0 && <p className="p-8 text-center text-sm text-slate-500">{t('لا يوجد طلاب في هذه القائمة')}</p>}
          {withPhone.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] truncate text-slate-900 dark:text-white">{r.name}</div>
                <div className="text-xs text-slate-500 truncate" dir="ltr" style={{ textAlign: 'end' }}>+{r.phone}{r.note ? ` · ${r.note}` : ''}</div>
              </div>
              {sent.has(r.id) && <span className="text-xs font-bold text-emerald-600 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" />{t('أُرسل')}</span>}
              <Button size="sm" variant="secondary" icon={MessageCircle} onClick={() => send(r)}>{sent.has(r.id) ? t('إعادة') : t('إرسال')}</Button>
            </div>
          ))}
          {missing.length > 0 && (
            <div className="px-5 py-3">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">{t('بدون رقم جوال ({n}) — أضف «جوال ولي الأمر» من صفحة المستخدمين', { n: missing.length })}</p>
              {missing.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-sm py-1">
                  <span className="text-slate-700 dark:text-slate-200 truncate">{r.name}</span>
                  <button type="button" className="text-xs font-bold text-indigo-600 inline-flex items-center gap-1" onClick={() => { void navigator.clipboard.writeText(msg(r)); showToast(t('نُسخت الرسالة'), 'success'); }}><Copy className="w-3.5 h-3.5" />{t('نسخ الرسالة')}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
