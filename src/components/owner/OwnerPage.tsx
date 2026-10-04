import React, { useCallback, useEffect, useState } from 'react';
import { Building2, KeyRound, RefreshCw, Plus, Pencil, Trash2, X, Save, ShieldAlert, LogOut } from 'lucide-react';
import {
  License, OwnerSchool, SchoolStats, THIS_SCHOOL, deleteOwnerSchool, fetchOwnerSchools, fetchSchoolStats, licenseState, saveOwnerSchool, setSchoolLicense,
} from '../../services/ownerService';
import { uiDir, t, dateLocale } from '../../i18n';

const KEY = 'itqan_owner_key_v1';
const readKey = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
const LIMIT = 500 * 1024 * 1024;
const PLANS = ['مجانية', 'أساسية', 'متقدمة', 'مؤسسية'];
const fmtDate = (d?: string | null) => (d ? new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const daysLeft = (exp?: string) => (exp ? Math.round((new Date(`${exp}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null);

interface Row { school: OwnerSchool; stats?: SchoolStats; error?: string; loading: boolean }

/** لوحة صاحب المنصة: كل المدارس المشتركة، إحصاءاتها واشتراكاتها، من مكان واحد (صفحة مستقلة /owner) */
export const OwnerPage: React.FC = () => {
  const [key, setKey] = useState(readKey);
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [authError, setAuthError] = useState('');
  const [editing, setEditing] = useState<OwnerSchool | 'new' | null>(null);
  const [licFor, setLicFor] = useState<Row | null>(null);

  const load = useCallback(async (k: string) => {
    const reg = await fetchOwnerSchools(k);
    if (!reg.ok) {
      setAuthError(/forbidden/.test(reg.error || '') ? t('المفتاح غير صحيح') : t('تعذر الاتصال، أو لم يُشغَّل تحديث قاعدة البيانات 038'));
      setKey(''); try { sessionStorage.removeItem(KEY); } catch { /* */ }
      return;
    }
    setAuthError('');
    const schools = [THIS_SCHOOL, ...reg.rows];
    setRows(schools.map((school) => ({ school, loading: true })));
    await Promise.all(schools.map(async (school, i) => {
      const r = await fetchSchoolStats(school, k);
      setRows((prev) => prev.map((x, j) => (j === i ? { school, loading: false, stats: r.data, error: r.ok ? undefined : r.error === 'forbidden' ? t('المفتاح غير مضبوط لهذه المدرسة') : t('تعذر الاتصال') } : x)));
    }));
  }, []);
  useEffect(() => { if (key) void load(key); }, [key, load]);

  const login = (e: React.FormEvent) => {
    e.preventDefault();
    const k = input.trim(); if (!k) return;
    try { sessionStorage.setItem(KEY, k); } catch { /* */ }
    setKey(k); setInput('');
  };
  const logout = () => { try { sessionStorage.removeItem(KEY); } catch { /* */ } setKey(''); setRows([]); };

  if (!key) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-[#0b0f19]" dir={uiDir()}>
        <form onSubmit={login} className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2"><Building2 className="w-7 h-7 text-indigo-600" /><h1 className="text-xl font-extrabold text-slate-900 dark:text-white">{t('لوحة صاحب المنصة')}</h1></div>
          <p className="text-sm text-slate-500">{t('أدخل مفتاح صاحب المنصة (السر OWNER_KEY) لعرض المدارس واشتراكاتها.')}</p>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">{t('المفتاح')}
            <input type="password" autoComplete="off" value={input} onChange={(e) => setInput(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800" dir="ltr" />
          </label>
          {authError && <p role="alert" className="text-sm font-semibold text-rose-600">{authError}</p>}
          <button type="submit" className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold inline-flex items-center justify-center gap-2"><KeyRound className="w-4 h-4" />{t('دخول')}</button>
        </form>
      </div>
    );
  }

  const ok = rows.filter((r) => r.stats);
  const students = ok.reduce((a, r) => a + (r.stats!.users.student || 0), 0);
  const soon = ok.filter((r) => { const d = daysLeft(r.stats!.license?.expires_at); return d != null && d >= 0 && d <= 14; }).length;
  const expired = ok.filter((r) => { const d = daysLeft(r.stats!.license?.expires_at); return d != null && d < 0; }).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-white" dir={uiDir()}>
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Building2 className="w-8 h-8 text-indigo-600" />
          <div className="me-auto"><h1 className="text-2xl font-extrabold">{t('لوحة صاحب المنصة')}</h1><p className="text-sm text-slate-500">{t('المدارس المشتركة وإحصاءاتها واشتراكاتها')}</p></div>
          <button type="button" onClick={() => void load(key)} className="h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" />{t('تحديث')}</button>
          <button type="button" onClick={() => setEditing('new')} className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold inline-flex items-center gap-2"><Plus className="w-4 h-4" />{t('إضافة مدرسة')}</button>
          <button type="button" onClick={logout} aria-label={t('خروج')} className="w-10 h-10 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"><LogOut className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([['المدارس', rows.length], ['إجمالي الطلاب', students], ['تنتهي خلال 14 يوماً', soon], ['اشتراكات منتهية', expired]] as const).map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4"><div className="text-xs font-semibold text-slate-500">{t(l)}</div><div className="text-3xl font-extrabold tabular-nums">{v}</div></div>
          ))}
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto" data-testid="owner-schools">
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
              {['المدرسة', 'الاشتراك', 'الطلاب / المعلمون / أولياء الأمور', 'مشاركات 30 يوماً', 'نشطون 7 أيام', 'آخر نشاط', 'المساحة'].map((h) => <th key={h} className="text-start px-4 py-3 font-semibold whitespace-nowrap">{h && t(h)}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const s = r.stats; const lic: License = s?.license || {};
                const d = daysLeft(lic.expires_at);
                const pct = s ? Math.min(100, (s.db_bytes / LIMIT) * 100) : 0;
                const over = lic.max_students && s ? (s.users.student || 0) > lic.max_students : false;
                return (
                  <tr key={r.school.id} className="border-b border-slate-50 dark:border-slate-800/60 align-top">
                    <td className="px-4 py-3">
                      <div className="font-bold">{s?.school_name || r.school.name || t('هذه المدرسة')}{r.school.id === '__this__' && <span className="ms-2 text-[11px] font-semibold text-indigo-600">{t('(هذه النسخة)')}</span>}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[260px]" dir="ltr">{r.school.url.replace(/^https?:\/\//, '')}</div>
                      {r.school.notes && <div className="text-xs text-slate-500">{r.school.notes}</div>}
                      <div className="flex gap-1 mt-2">
                        {s && <button type="button" onClick={() => setLicFor(r)} className="h-8 px-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold">{t('الاشتراك')}</button>}
                        {r.school.id !== '__this__' && <>
                          <button type="button" aria-label={t('تعديل')} onClick={() => setEditing(r.school)} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"><Pencil className="w-4 h-4" /></button>
                          <button type="button" aria-label={t('حذف')} onClick={async () => { if (window.confirm(t('إزالة «{n}» من القائمة؟ (لا يحذف بيانات المدرسة)', { n: r.school.name }))) { await deleteOwnerSchool(key, r.school.id); void load(key); } }} className="w-8 h-8 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                        </>}
                      </div>
                    </td>
                    {r.loading ? <td colSpan={6} className="px-4 py-3 text-slate-400">{t('جارٍ التحميل…')}</td> : r.error ? (
                      <td colSpan={6} className="px-4 py-3"><span className="inline-flex items-center gap-1 text-rose-600 font-semibold"><ShieldAlert className="w-4 h-4" />{r.error}</span></td>
                    ) : (<>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold">{lic.plan || t('بلا اشتراك محدد')}</div>
                        {d != null && <span className={`text-xs font-bold ${d < 0 ? 'text-rose-600' : d <= 14 ? 'text-amber-600' : 'text-emerald-600'}`}>{d < 0 ? t('منتهٍ منذ {n} يوم', { n: -d }) : t('ينتهي {d} (بعد {n} يوم)', { d: fmtDate(lic.expires_at), n: d })}</span>}
                        {lic.block_on_expiry && <div className="text-[11px] text-slate-500">{t('يُوقف عند الانتهاء')}</div>}
                      </td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap"><span dir="ltr"><span className={over ? 'text-rose-600 font-bold' : ''}>{s!.users.student || 0}{lic.max_students ? ` / ${lic.max_students}` : ''}</span> · {s!.users.teacher || 0} · {s!.users.parent || 0}</span></td>
                      <td className="px-4 py-3 tabular-nums">{s!.submissions_30d}</td>
                      <td className="px-4 py-3 tabular-nums">{s!.active_users_7d}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmtDate(s!.last_activity)}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className={`tabular-nums font-semibold ${pct >= 85 ? 'text-rose-600' : pct >= 65 ? 'text-amber-600' : ''}`}>{pct.toFixed(1)}%</span></td>
                    </>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">{t('لإضافة مدرسة: شغّل تحديثات قاعدة البيانات عليها حتى 038، ثم workflow «Set owner key» بسر قاعدة بياناتها، ثم أضفها هنا برابط Supabase والمفتاح العام (anon). المفتاح نفسه لكل المدارس.')}</p>
      </div>
      {editing && <SchoolForm ownerKey={key} school={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(key); }} />}
      {licFor && licFor.stats && <LicenseForm row={licFor} ownerKey={key} onClose={() => setLicFor(null)} onSaved={() => { setLicFor(null); void load(key); }} />}
    </div>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 space-y-4" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
      <div className="flex items-center"><h2 className="font-bold text-lg flex-1 text-slate-900 dark:text-white">{title}</h2><button type="button" aria-label={t('إغلاق')} onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-4 h-4" /></button></div>
      {children}
    </div>
  </div>
);
const inp = 'mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';

const SchoolForm: React.FC<{ ownerKey: string; school: OwnerSchool | null; onClose: () => void; onSaved: () => void }> = ({ ownerKey, school, onClose, onSaved }) => {
  const [f, setF] = useState({ name: school?.name || '', url: school?.url || 'https://', anon_key: school?.anon_key || '', notes: school?.notes || '' });
  const [err, setErr] = useState('');
  const save = async () => {
    if (!f.name.trim() || !/^https:\/\/.+/.test(f.url.trim()) || !f.anon_key.trim()) return setErr(t('أكمل الاسم والرابط (https) والمفتاح العام'));
    const r = await saveOwnerSchool(ownerKey, { ...(school ? { id: school.id } : {}), name: f.name.trim(), url: f.url.trim(), anon_key: f.anon_key.trim(), notes: f.notes.trim() });
    if (!r) return setErr(t('تعذر الحفظ'));
    onSaved();
  };
  return (
    <Modal title={school ? t('تعديل مدرسة') : t('إضافة مدرسة')} onClose={onClose}>
      <label className="block text-sm font-semibold">{t('اسم المدرسة')}<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} /></label>
      <label className="block text-sm font-semibold">{t('رابط Supabase')}<input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} className={inp} dir="ltr" placeholder="https://xxxx.supabase.co" /></label>
      <label className="block text-sm font-semibold">{t('المفتاح العام (anon)')}<input value={f.anon_key} onChange={(e) => setF({ ...f, anon_key: e.target.value })} className={inp} dir="ltr" /></label>
      <label className="block text-sm font-semibold">{t('ملاحظات')}<input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={inp} /></label>
      {err && <p className="text-sm text-rose-600 font-semibold">{err}</p>}
      <button type="button" onClick={() => void save()} className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold inline-flex items-center justify-center gap-2"><Save className="w-4 h-4" />{t('حفظ')}</button>
    </Modal>
  );
};

const LicenseForm: React.FC<{ row: Row; ownerKey: string; onClose: () => void; onSaved: () => void }> = ({ row, ownerKey, onClose, onSaved }) => {
  const l = row.stats!.license || {};
  const [f, setF] = useState({ plan: l.plan || '', expires_at: l.expires_at || '', max_students: l.max_students ? String(l.max_students) : '', block_on_expiry: !!l.block_on_expiry, note: l.note || '' });
  const [err, setErr] = useState('');
  const save = async (clear = false) => {
    const r = await setSchoolLicense(row.school, ownerKey, clear ? {} : { ...f, max_students: f.max_students ? Number(f.max_students) : undefined } as License);
    if (!r.ok) return setErr(t('تعذر الحفظ'));
    onSaved();
  };
  const st = licenseState({ days_left: daysLeft(f.expires_at) });
  return (
    <Modal title={t('اشتراك: {n}', { n: row.stats!.school_name || row.school.name || t('هذه المدرسة') })} onClose={onClose}>
      <label className="block text-sm font-semibold">{t('الخطة')}
        <input list="owner-plans" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} className={inp} />
        <datalist id="owner-plans">{PLANS.map((p) => <option key={p} value={p} />)}</datalist>
      </label>
      <label className="block text-sm font-semibold">{t('تاريخ الانتهاء')}<input type="date" value={f.expires_at} onChange={(e) => setF({ ...f, expires_at: e.target.value })} className={inp} /></label>
      {st !== 'none' && <p className={`text-xs font-semibold ${st === 'expired' ? 'text-rose-600' : st === 'soon' ? 'text-amber-600' : 'text-emerald-600'}`}>{st === 'expired' ? t('هذا التاريخ منتهٍ') : t('متبقٍ {n} يوم', { n: daysLeft(f.expires_at) ?? 0 })}</p>}
      <label className="block text-sm font-semibold">{t('حد الطلاب (اختياري)')}<input inputMode="numeric" value={f.max_students} onChange={(e) => setF({ ...f, max_students: e.target.value.replace(/\D/g, '') })} className={inp} /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.block_on_expiry} onChange={(e) => setF({ ...f, block_on_expiry: e.target.checked })} /><span>{t('إيقاف المنصة للمستخدمين عند انتهاء الاشتراك (يبقى مدير النظام قادراً على الدخول)')}<span className="block text-xs text-slate-500">{t('قفل حقيقي من قاعدة البيانات: لا دخول ولا قراءة بيانات لغير المدير حتى التجديد.')}</span></span></label>
      <label className="block text-sm font-semibold">{t('ملاحظة (لك فقط)')}<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={inp} /></label>
      {err && <p className="text-sm text-rose-600 font-semibold">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => void save()} className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold inline-flex items-center justify-center gap-2"><Save className="w-4 h-4" />{t('حفظ الاشتراك')}</button>
        <button type="button" onClick={() => { if (window.confirm(t('إلغاء الاشتراك المحدد (المدرسة بلا قيود)؟'))) void save(true); }} className="h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold">{t('بلا قيود')}</button>
      </div>
    </Modal>
  );
};
