import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Search, ImagePlus, Trash2, Check, Ban, Copy, RotateCcw, Palette, ScrollText, Users as UsersIcon, User as UserIcon, PenLine, Save } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button } from '../common/ui';
import { hasPerm } from '../../utils/permissions';
import { resizeLogo, whiteToTransparent } from '../../utils/brand';
import {
  CERT_KINDS, CERT_TEMPLATES, CERT_PALETTES, STAMP_POSITIONS, StampPos, CertKind, CertGender, CertStyle, CertificateInput, CertTemplate,
  buildCertificatesDoc, exportCertificates, normalizeStyle, certBrand, certReasonPrefix, defaultCertTitle,
} from '../../utils/certificate';
import { CertRecord, NewCert, issueCertificates, listCertificates, revokeCertificate, recordToInput } from '../../services/certificateService';
import { uiDir, t, isEn } from '../../i18n';
import type { User } from '../../types';
import { EmptyMascot } from '../common/Mascot';

type Mode = 'student' | 'manual' | 'group';
type Tab = 'issue' | 'log' | 'identity';

const inputCls = 'w-full h-10 px-3 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500';
const labelCls = 'block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1';
const today = () => new Date().toISOString().slice(0, 10);
const genderOf = (u?: User | null): CertGender => (u?.gender === 'female' ? 'f' : 'm');

/** معاينة حية: نفس مستند الطباعة داخل إطار مصغّر */
const CertPreview: React.FC<{ inputs: CertificateInput[]; testId?: string }> = ({ inputs, testId }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [html, setHtml] = useState('');
  const key = JSON.stringify(inputs);
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => { void buildCertificatesDoc(inputs).then((h) => alive && setHtml(h)); }, 250);
    return () => { alive = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1123));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={boxRef} className="relative w-full min-w-0 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 shadow-inner" style={{ height: 794 * scale }} data-testid={testId}>
      <iframe title={t('معاينة الشهادة')} srcDoc={html} scrolling="no"
        style={{ position: 'absolute', top: 0, left: 0, width: 1123, height: 794, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none', background: '#fff' }} />
    </div>
  );
};

/** اختيار القالب والألوان */
const StylePicker: React.FC<{ value: CertStyle; onChange: (s: CertStyle) => void }> = ({ value, onChange }) => {
  const paletteId = CERT_PALETTES.find((p) => p.primary === value.primary && p.accent === value.accent)?.id;
  return (
    <div className="space-y-3">
      <div>
        <span className={labelCls}>{t('القالب')}</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label={t('القالب')}>
          {CERT_TEMPLATES.map((tp) => {
            const on = value.template === tp.id;
            return (
              <button key={tp.id} type="button" role="radio" aria-checked={on} onClick={() => onChange({ ...value, template: tp.id as CertTemplate })}
                className={`text-start p-2.5 rounded-xl border transition ${on ? 'border-indigo-600 ring-2 ring-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
                <span className="flex items-center justify-between text-sm font-bold text-slate-900 dark:text-white">{t(tp.label)}{on && <Check className="w-4 h-4 text-indigo-600" />}</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">{t(tp.hint)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <span className={labelCls}>{t('الألوان')}</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('الألوان')}>
          {CERT_PALETTES.map((p) => {
            const on = paletteId === p.id;
            return (
              <button key={p.id} type="button" role="radio" aria-checked={on} title={t(p.label)} onClick={() => onChange({ ...value, primary: p.primary, accent: p.accent })}
                className={`h-9 ps-1.5 pe-3 rounded-xl border inline-flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100 ${on ? 'border-slate-900 dark:border-white' : 'border-slate-200 dark:border-slate-700'}`}>
                <span className="flex rounded-lg overflow-hidden"><span className="w-4 h-6" style={{ background: p.primary }} /><span className="w-4 h-6" style={{ background: p.accent }} /></span>
                {t(p.label)}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-600 dark:text-slate-300">
          <label className="inline-flex items-center gap-2">{t('اللون الأساسي')}<input type="color" value={value.primary} onChange={(e) => onChange({ ...value, primary: e.target.value })} className="w-9 h-8 rounded border border-slate-300 dark:border-slate-600 bg-transparent" /></label>
          <label className="inline-flex items-center gap-2">{t('اللون الثانوي')}<input type="color" value={value.accent} onChange={(e) => onChange({ ...value, accent: e.target.value })} className="w-9 h-8 rounded border border-slate-300 dark:border-slate-600 bg-transparent" /></label>
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100 cursor-pointer">
        <input type="checkbox" checked={value.qr} onChange={(e) => onChange({ ...value, qr: e.target.checked })} className="accent-indigo-600 w-4 h-4 mt-0.5" />
        <span><b>{t('إظهار رمز QR للتحقق')}</b><span className="block text-[11px] text-slate-500 dark:text-slate-400">{t('عند الإخفاء: لا يظهر الرمز ولا رقم الشهادة عليها، وتبقى مسجّلة في السجل.')}</span></span>
      </label>
    </div>
  );
};

export const CertificatesPage: React.FC = () => {
  const { currentUser, users, classes, settings, updateSettings, showToast } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const canIssue = hasPerm(currentUser, 'can_award_badges');
  const [tab, setTab] = useState<Tab>('issue');

  // ---------------- الإصدار ----------------
  const brand = certBrand();
  const [mode, setMode] = useState<Mode>('student');
  const [q, setQ] = useState('');
  const [studentId, setStudentId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualGender, setManualGender] = useState<CertGender>('m');
  const [manualClass, setManualClass] = useState('');
  const [groupClass, setGroupClass] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<CertKind>('excellence');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [score, setScore] = useState('');
  const [detail, setDetail] = useState('');
  const [date, setDate] = useState(today());
  const [signer, setSigner] = useState(currentUser?.role === 'admin' ? '' : currentUser?.name || '');
  const [signerTitle, setSignerTitle] = useState(currentUser?.role === 'admin' ? '' : currentUser?.gender === 'female' ? 'المعلمة' : 'المعلم');
  const [schoolName, setSchoolName] = useState(brand.schoolName);
  const [style, setStyle] = useState<CertStyle>(() => normalizeStyle());
  const [busy, setBusy] = useState(false);

  // المدير يرى كل الطلاب؛ المعلم والمشرف يرون طلاب الفصول المسندة إليهم فقط
  const myClassIds = useMemo(() => {
    if (!currentUser || currentUser.role === 'admin') return null;
    const ids = [...(currentUser.assigned_class_ids || []), ...(currentUser.class_id ? [currentUser.class_id] : [])];
    return new Set(ids);
  }, [currentUser]);
  const students = useMemo(
    () => (users || []).filter((u) => u.role === 'student' && (!myClassIds || myClassIds.has(u.class_id || ''))).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [users, myClassIds]
  );
  const myClasses = useMemo(() => (myClassIds ? classes.filter((c) => myClassIds.has(c.id)) : classes), [classes, myClassIds]);
  const className = (id?: string | null) => classes.find((c) => c.id === id)?.name || '';
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return students.filter((u) => !s || u.name.toLowerCase().includes(s) || className(u.class_id).toLowerCase().includes(s) || (u.national_id || '').includes(s)).slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, students, classes]);
  const groupStudents = useMemo(() => students.filter((u) => u.class_id === groupClass), [students, groupClass]);
  useEffect(() => { setPicked(new Set(groupStudents.map((u) => u.id))); }, [groupStudents]);

  type Recipient = { id: string | null; name: string; gender: CertGender; className: string };
  const recipients: Recipient[] = useMemo(() => {
    if (mode === 'manual') return manualName.trim() ? [{ id: null, name: manualName.trim(), gender: manualGender, className: manualClass.trim() }] : [];
    if (mode === 'group') return groupStudents.filter((u) => picked.has(u.id)).map((u) => ({ id: u.id, name: u.name, gender: genderOf(u), className: className(u.class_id) }));
    const u = students.find((x) => x.id === studentId);
    return u ? [{ id: u.id, name: u.name, gender: genderOf(u), className: className(u.class_id) }] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, manualName, manualGender, manualClass, groupStudents, picked, studentId, students, classes]);

  const toInput = (r: Recipient, extra: Partial<CertificateInput> = {}): CertificateInput => ({
    kind, student: r.name, gender: r.gender, achievement: reason.trim(), title: title.trim() || undefined,
    score: score.trim() || undefined, detail: detail.trim() || undefined, className: r.className || undefined,
    date, signer: signer.trim() || undefined, signerTitle: signerTitle.trim() || undefined, schoolName: schoolName.trim(), style, ...extra,
  });
  const sample: Recipient = recipients[0] || { id: null, name: isEn() ? 'Student name' : 'اسم الطالب', gender: mode === 'manual' ? manualGender : 'm', className: '' };
  const previewInput = toInput(sample, { serial: 'ITQ-0000-0000', code: 'PREVIEW000' });
  const prefixG = sample.gender;

  const issue = async () => {
    if (!currentUser) return;
    if (!recipients.length) return showToast(t('اختر طالباً أو اكتب الاسم أولاً'), 'error');
    if (kind === 'custom' && !title.trim()) return showToast(t('اكتب عنوان الشهادة'), 'error');
    if (recipients.length > 1 && !window.confirm(t('سيتم إصدار {n} شهادة وتسجيلها. متابعة؟', { n: recipients.length }))) return;
    setBusy(true);
    const rows: NewCert[] = recipients.map((r) => ({
      student_id: r.id, student_name: r.name, class_name: r.className, kind, title: title.trim(), reason: reason.trim(), detail: detail.trim(), score: score.trim(),
      school_name: schoolName.trim(), signer_name: signer.trim(), signer_title: signerTitle.trim(), issued_on: date,
      style: { ...style, gender: r.gender }, created_by: currentUser.id, created_by_name: currentUser.name,
    }));
    const res = await issueCertificates(rows);
    setBusy(false);
    if (!res.ok || !res.data) return showToast(t('تعذر إصدار الشهادة: {error}', { error: res.error || '' }), 'error');
    showToast(res.data.length > 1 ? t('تم إصدار {n} شهادة', { n: res.data.length }) : t('تم إصدار الشهادة {serial}', { serial: res.data[0].serial }), 'success');
    setLog(null);
    await exportCertificates(res.data.map(recordToInput));
  };

  // ---------------- السجل ----------------
  const [log, setLog] = useState<CertRecord[] | null>(null);
  const [logQ, setLogQ] = useState('');
  useEffect(() => {
    if (tab !== 'log' || log) return;
    void listCertificates().then((r) => {
      if (!r.ok) showToast(t('تعذر تحميل السجل: {error}', { error: r.error || '' }), 'error');
      setLog(r.data);
    });
  }, [tab, log, showToast]);
  const shownLog = (log || []).filter((c) => {
    const s = logQ.trim().toLowerCase();
    return !s || c.student_name.toLowerCase().includes(s) || c.serial.toLowerCase().includes(s) || (c.title || '').toLowerCase().includes(s) || c.reason.toLowerCase().includes(s);
  });
  const revoke = async (c: CertRecord) => {
    const why = window.prompt(t('سبب إلغاء الشهادة {serial}؟ (ستظهر «ملغاة» عند التحقق منها)', { serial: c.serial }));
    if (why === null) return;
    const r = await revokeCertificate(c.id, why.trim());
    if (!r.ok) return showToast(t('تعذر الإلغاء: {error}', { error: r.error === 'no-permission' ? t('يلغيها من أصدرها أو مدير النظام') : r.error || '' }), 'error');
    showToast(t('تم إلغاء الشهادة'), 'success');
    setLog(null);
  };
  const copyLink = async (c: CertRecord) => {
    const url = `${window.location.origin}/verify/${c.code}`;
    try { await navigator.clipboard.writeText(url); showToast(t('تم نسخ رابط التحقق'), 'success'); } catch { window.prompt(t('رابط التحقق'), url); }
  };
  const kindLabel = (c: CertRecord) => c.title || defaultCertTitle(c.kind);

  // ---------------- الهوية البصرية ----------------
  const [idName, setIdName] = useState(settings.cert_school_name || settings.school_name || '');
  const [idCompany, setIdCompany] = useState(settings.cert_company_logo || '');
  const [idSchool, setIdSchool] = useState(settings.cert_school_logo || '');
  const [idPrincipal, setIdPrincipal] = useState(settings.cert_principal_name || '');
  const [idPrincipalTitle, setIdPrincipalTitle] = useState(settings.cert_principal_title || '');
  const [idSignature, setIdSignature] = useState(settings.cert_principal_signature || '');
  const [idStamp, setIdStamp] = useState(settings.cert_stamp || '');
  const [cleanBg, setCleanBg] = useState(true);
  const signatureRef = useRef<HTMLInputElement>(null);
  const stampRef = useRef<HTMLInputElement>(null);
  /** توقيع/ختم: تصغير ثم إزالة الخلفية البيضاء (اختياري) */
  const pickMark = async (file: File | undefined, set: (v: string) => void) => {
    if (!file) return;
    try {
      let data = await resizeLogo(file, 700);
      if (cleanBg) data = await whiteToTransparent(data);
      if (data.length > 450_000) return showToast(t('الصورة كبيرة جداً بعد التصغير، جرّب صورة أصغر'), 'error');
      set(data);
    } catch (e: any) { showToast(e?.message || t('تعذرت قراءة الصورة'), 'error'); }
  };
  const [idStyle, setIdStyle] = useState<CertStyle>(() => normalizeStyle());
  const companyRef = useRef<HTMLInputElement>(null);
  const schoolRef = useRef<HTMLInputElement>(null);
  const pickLogo = async (file: File | undefined, set: (v: string) => void) => {
    if (!file) return;
    try {
      const data = await resizeLogo(file, 520);
      if (data.length > 450_000) return showToast(t('الصورة كبيرة جداً بعد التصغير، جرّب شعاراً أبسط أو بصيغة PNG'), 'error');
      set(data);
    } catch (e: any) { showToast(e?.message || t('تعذرت قراءة الصورة'), 'error'); }
  };
  const saveIdentity = async () => {
    setBusy(true);
    await updateSettings({
      cert_school_name: idName.trim(), cert_company_logo: idCompany, cert_school_logo: idSchool,
      cert_principal_name: idPrincipal.trim(), cert_principal_title: idPrincipalTitle.trim(), cert_style: idStyle,
      cert_principal_signature: idSignature, cert_stamp: idStamp,
    });
    setBusy(false);
    setSchoolName(idName.trim());
    setStyle(idStyle);
  };
  const identityPreview: CertificateInput = {
    kind: 'excellence', student: isEn() ? 'Student name' : 'محمد أحمد العتيبي', achievement: isEn() ? 'Mathematics' : 'مادة الرياضيات',
    score: '98%', schoolName: idName, style: idStyle, serial: 'ITQ-0000-0000', code: 'PREVIEW000',
    ...(idStyle.stampPos === 'signer' ? { signer: isEn() ? 'Teacher name' : 'أ. اسم المعلم', signerTitle: isEn() ? 'Teacher' : 'المعلم' } : {}),
  };

  if (!canIssue) return null;

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'issue', label: 'إصدار شهادة', icon: PenLine },
    { id: 'log', label: 'سجل الشهادات', icon: ScrollText },
    ...(isAdmin ? [{ id: 'identity' as Tab, label: 'الهوية البصرية', icon: Palette }] : []),
  ];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={t('الشهادات')} subtitle={t('أصدر شهادات بهوية المدرسة، برقم ورمز QR للتحقق من صحتها.')} />

      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit max-w-full overflow-x-auto" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} type="button" onClick={() => setTab(x.id)}
            className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold ${tab === x.id ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>
            <x.icon className="w-4 h-4" />{t(x.label)}
          </button>
        ))}
      </div>

      {tab === 'issue' && (
        <div className="grid lg:grid-cols-[minmax(0,420px)_1fr] gap-5 items-start">
          <Card className="p-5 space-y-4">
            <div>
              <span className={labelCls}>{t('لمن الشهادة؟')}</span>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800" role="radiogroup" aria-label={t('لمن الشهادة؟')}>
                {([['student', 'طالب', UserIcon], ['group', 'فصل كامل', UsersIcon], ['manual', 'كتابة الاسم', PenLine]] as const).map(([id, label, Icon]) => (
                  <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)}
                    className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold ${mode === id ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>
                    <Icon className="w-3.5 h-3.5" />{t(label)}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'student' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute top-3 start-3 text-slate-400" />
                  <input aria-label={t('بحث عن طالب')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث بالاسم أو الفصل أو الهوية')} className={`${inputCls} ps-9`} />
                </div>
                <select aria-label={t('الطالب')} size={6} value={studentId} onChange={(e) => setStudentId(e.target.value)} className="w-full p-1 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                  {matches.map((u) => <option key={u.id} value={u.id} className="py-1 px-2 rounded">{u.name}{className(u.class_id) ? ` — ${className(u.class_id)}` : ''}</option>)}
                </select>
                {!matches.length && <p className="text-xs text-slate-500">{t('لا يوجد طلاب مطابقون')}</p>}
              </div>
            )}

            {mode === 'group' && (
              <div className="space-y-2">
                <select aria-label={t('الفصل')} value={groupClass} onChange={(e) => setGroupClass(e.target.value)} className={inputCls}>
                  <option value="">{t('اختر الفصل')}</option>
                  {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {groupClass && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    <label className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/60 sticky top-0">
                      <input type="checkbox" className="accent-indigo-600" checked={picked.size === groupStudents.length && groupStudents.length > 0}
                        onChange={(e) => setPicked(e.target.checked ? new Set(groupStudents.map((u) => u.id)) : new Set())} />
                      {t('تحديد الكل ({n})', { n: groupStudents.length })}
                    </label>
                    {groupStudents.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100">
                        <input type="checkbox" className="accent-indigo-600" checked={picked.has(u.id)}
                          onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n; })} />
                        {u.name}
                      </label>
                    ))}
                    {!groupStudents.length && <p className="text-xs text-slate-500 p-3">{t('لا يوجد طلاب في هذا الفصل')}</p>}
                  </div>
                )}
              </div>
            )}

            {mode === 'manual' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className={labelCls} htmlFor="cert-name">{t('الاسم كما يظهر في الشهادة')}</label>
                  <input id="cert-name" value={manualName} onChange={(e) => setManualName(e.target.value)} maxLength={120} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="cert-gender">{t('الصيغة')}</label>
                  <select id="cert-gender" value={manualGender} onChange={(e) => setManualGender(e.target.value as CertGender)} className={inputCls}>
                    <option value="m">{t('الطالب')}</option><option value="f">{t('الطالبة')}</option><option value="n">{t('بدون لقب')}</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="cert-class">{t('الصف (اختياري)')}</label>
                  <input id="cert-class" value={manualClass} onChange={(e) => setManualClass(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls} htmlFor="cert-kind">{t('نوع الشهادة')}</label>
                <select id="cert-kind" value={kind} onChange={(e) => setKind(e.target.value as CertKind)} className={inputCls}>
                  {CERT_KINDS.map((k) => <option key={k.id} value={k.id}>{t(k.label)}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="cert-title">{kind === 'custom' ? t('عنوان الشهادة') : t('عنوان مخصص (اختياري)')}</label>
                <input id="cert-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'custom' ? t('مثال: شهادة الطالب المثالي') : defaultCertTitle(kind)} maxLength={60} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls} htmlFor="cert-reason">{certReasonPrefix(kind, prefixG) ? `${t('سبب المنح')}: «${certReasonPrefix(kind, prefixG)} …»` : t('سبب المنح')}</label>
              <input id="cert-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={160} className={inputCls}
                placeholder={kind === 'thanks' ? t('مثال: الإذاعة المدرسية') : kind === 'pass' ? t('مثال: اختبار الرياضيات للفترة الأولى') : t('مثال: مادة الرياضيات للفصل الدراسي الأول')} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls} htmlFor="cert-score">{t('الدرجة (اختياري)')}</label>
                <input id="cert-score" value={score} onChange={(e) => setScore(e.target.value)} placeholder={t('مثال: 98% أو 49/50')} maxLength={20} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="cert-date">{t('التاريخ')}</label>
                <input id="cert-date" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls} htmlFor="cert-detail">{t('سطر إضافي (اختياري)')}</label>
              <input id="cert-detail" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={120} className={inputCls} />
            </div>

            <div>
              <label className={labelCls} htmlFor="cert-school">{t('اسم المدرسة في الشهادة')}</label>
              <input id="cert-school" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} maxLength={90} className={inputCls} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls} htmlFor="cert-signer">{t('اسم الموقّع (اختياري)')}</label>
                <input id="cert-signer" value={signer} onChange={(e) => setSigner(e.target.value)} maxLength={60} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="cert-signer-title">{t('صفته')}</label>
                <input id="cert-signer-title" value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} placeholder={t('المعلم')} maxLength={40} className={inputCls} />
              </div>
              <p className="col-span-2 text-[11px] text-slate-500 dark:text-slate-400">{t('توقيع مدير المدرسة يظهر دائماً (يُضبط من «الهوية البصرية»).')}</p>
            </div>

            <details className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <summary className="text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer inline-flex items-center gap-1.5"><Palette className="w-4 h-4" />{t('شكل هذه الشهادة')}</summary>
              <div className="mt-3"><StylePicker value={style} onChange={setStyle} /></div>
              <button type="button" onClick={() => setStyle(normalizeStyle())} className="mt-2 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" />{t('الرجوع للهوية الافتراضية')}</button>
            </details>

            <Button icon={Printer} onClick={() => void issue()} disabled={busy || !recipients.length} className="w-full justify-center">
              {recipients.length > 1 ? t('إصدار {n} شهادة وطباعتها', { n: recipients.length }) : t('إصدار الشهادة وطباعتها')}
            </Button>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{t('كل شهادة تُسجَّل برقم ورمز QR. من نافذة الطباعة اختر «حفظ كـ PDF» واجعل الاتجاه أفقياً.')}</p>
          </Card>

          <div className="min-w-0 space-y-2 lg:sticky lg:top-20">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('معاينة')}</h2>
              {recipients.length > 1 && <span className="text-xs text-slate-500">{t('معاينة أول شهادة من {n}', { n: recipients.length })}</span>}
            </div>
            <CertPreview inputs={[previewInput]} testId="cert-preview" />
          </div>
        </div>
      )}

      {tab === 'log' && (
        <Card className="p-5 space-y-3">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute top-3 start-3 text-slate-400" />
            <input aria-label={t('بحث في السجل')} value={logQ} onChange={(e) => setLogQ(e.target.value)} placeholder={t('ابحث بالاسم أو رقم الشهادة')} className={`${inputCls} ps-9`} />
          </div>
          {log === null ? <p className="text-sm text-slate-500 py-6 text-center">{t('جارٍ التحميل')}</p> : !shownLog.length ? (
            <EmptyMascot text={t('لا توجد شهادات بعد.')} compact />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm" data-testid="cert-log">
                <thead><tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2 px-3 text-start">{t('الرقم')}</th><th className="py-2 px-3 text-start">{t('الاسم')}</th><th className="py-2 px-3 text-start">{t('الشهادة')}</th>
                  <th className="py-2 px-3 text-start">{t('التاريخ')}</th><th className="py-2 px-3 text-start">{t('أصدرها')}</th><th className="py-2 px-3 text-start">{t('الحالة')}</th><th className="py-2 px-3" />
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-100">
                  {shownLog.map((c) => (
                    <tr key={c.id} className={c.revoked_at ? 'opacity-60' : ''}>
                      <td className="py-2 px-3 font-mono text-xs whitespace-nowrap" dir="ltr">{c.serial}</td>
                      <td className="py-2 px-3 font-semibold">{c.student_name}{c.class_name && <span className="text-xs font-normal text-slate-500"> • {c.class_name}</span>}</td>
                      <td className="py-2 px-3">{kindLabel(c)}{c.reason && <span className="block text-xs text-slate-500">{c.reason}</span>}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-xs">{c.issued_on}</td>
                      <td className="py-2 px-3 text-xs">{c.created_by_name}</td>
                      <td className="py-2 px-3 text-xs whitespace-nowrap">
                        {c.revoked_at
                          ? <span className="inline-flex items-center gap-1 font-bold text-rose-700 dark:text-rose-400" title={c.revoke_reason}><Ban className="w-3.5 h-3.5" />{t('ملغاة')}</span>
                          : <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400"><Check className="w-3.5 h-3.5" />{t('سارية')}</span>}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1 justify-end">
                          <button type="button" title={t('طباعة')} aria-label={t('طباعة')} onClick={() => void exportCertificates([recordToInput(c)])} className="w-8 h-8 rounded-lg inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"><Printer className="w-4 h-4" /></button>
                          <button type="button" title={t('نسخ رابط التحقق')} aria-label={t('نسخ رابط التحقق')} onClick={() => void copyLink(c)} className="w-8 h-8 rounded-lg inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"><Copy className="w-4 h-4" /></button>
                          {!c.revoked_at && (isAdmin || c.created_by === currentUser?.id) && (
                            <button type="button" title={t('إلغاء الشهادة')} aria-label={t('إلغاء الشهادة')} onClick={() => void revoke(c)} className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"><Ban className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'identity' && isAdmin && (
        <div className="grid lg:grid-cols-[minmax(0,420px)_1fr] gap-5 items-start">
          <Card className="p-5 space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{t('الهوية الثابتة لكل شهادات المنصة: الشعاران واسم المدرسة وتوقيع المدير والشكل الافتراضي. يمكن تغيير الشكل لشهادة معينة وقت إصدارها.')}</p>
            <div>
              <label className={labelCls} htmlFor="id-name">{t('اسم المدرسة في الشهادات')}</label>
              <input id="id-name" value={idName} onChange={(e) => setIdName(e.target.value)} maxLength={90} placeholder={t('مثال: مدارس المستقبل الأهلية')} className={inputCls} />
            </div>
            {([['شعار المدرسة', idSchool, setIdSchool, schoolRef], ['شعار الشركة أو الجهة', idCompany, setIdCompany, companyRef]] as const).map(([label, val, set, ref]) => (
              <div key={label}>
                <span className={labelCls}>{t(label)}</span>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-16 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white flex items-center justify-center overflow-hidden shrink-0">
                    {val ? <img src={val} alt="" className="max-w-full max-h-full object-contain" /> : <ImagePlus className="w-6 h-6 text-slate-400" />}
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => ref.current?.click()}>{val ? t('تغيير') : t('رفع')}</Button>
                  {val && <button type="button" onClick={() => set('')} className="h-9 px-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />{t('إزالة')}</button>}
                  <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" aria-label={t(label)} onChange={(e) => { void pickLogo(e.target.files?.[0], set); e.target.value = ''; }} />
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls} htmlFor="id-principal">{t('اسم مدير المدرسة')}</label>
                <input id="id-principal" value={idPrincipal} onChange={(e) => setIdPrincipal(e.target.value)} maxLength={60} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="id-principal-title">{t('الصفة')}</label>
                <input id="id-principal-title" value={idPrincipalTitle} onChange={(e) => setIdPrincipalTitle(e.target.value)} placeholder={t('مدير المدرسة')} maxLength={40} className={inputCls} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-3" data-testid="cert-marks">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('التوقيع والختم')}</h3>
              {([['توقيع المدير', idSignature, setIdSignature, signatureRef], ['ختم المدرسة', idStamp, setIdStamp, stampRef]] as const).map(([label, val, set, ref]) => (
                <div key={label}>
                  <span className={labelCls}>{t(label)}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-16 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0" style={{ backgroundImage: 'repeating-conic-gradient(#f1f5f9 0 25%, #fff 0 50%)', backgroundSize: '12px 12px' }}>
                      {val ? <img src={val} alt="" className="max-w-full max-h-full object-contain" /> : <ImagePlus className="w-6 h-6 text-slate-400" />}
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => ref.current?.click()}>{val ? t('تغيير') : t('رفع')}</Button>
                    {val && <button type="button" onClick={() => set('')} className="h-9 px-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />{t('إزالة')}</button>}
                    <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={t(label)} onChange={(e) => { void pickMark(e.target.files?.[0], set); e.target.value = ''; }} />
                  </div>
                </div>
              ))}
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" checked={cleanBg} onChange={(e) => setCleanBg(e.target.checked)} className="w-4 h-4 accent-indigo-600" />{t('إزالة الخلفية البيضاء تلقائياً عند الرفع (للصور المصوّرة على ورق)')}</label>
              <div>
                <label className={labelCls} htmlFor="id-stamp-pos">{t('مكان الختم')}</label>
                <select id="id-stamp-pos" value={idStyle.stampPos} onChange={(e) => setIdStyle({ ...idStyle, stampPos: e.target.value as StampPos })} className={inputCls}>
                  {STAMP_POSITIONS.map((x) => <option key={x.id} value={x.id}>{t(x.label)}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={labelCls}>{t('حجم الختم')} <b className="tabular-nums font-normal text-slate-500">{idStyle.stampSize} mm</b></span>
                  <input type="range" min={18} max={55} value={idStyle.stampSize} onChange={(e) => setIdStyle({ ...idStyle, stampSize: +e.target.value })} className="w-full accent-indigo-600" aria-label={t('حجم الختم')} /></label>
                <label className="block"><span className={labelCls}>{t('حجم التوقيع')} <b className="tabular-nums font-normal text-slate-500">{idStyle.sigSize} mm</b></span>
                  <input type="range" min={8} max={26} value={idStyle.sigSize} onChange={(e) => setIdStyle({ ...idStyle, sigSize: +e.target.value })} className="w-full accent-indigo-600" aria-label={t('حجم التوقيع')} /></label>
              </div>
            </div>
            <StylePicker value={idStyle} onChange={setIdStyle} />
            <Button icon={Save} onClick={() => void saveIdentity()} disabled={busy} className="w-full justify-center">{t('حفظ الهوية البصرية')}</Button>
          </Card>
          <div className="min-w-0 space-y-2 lg:sticky lg:top-20">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('معاينة')}</h2>
            <IdentityPreview input={identityPreview} company={idCompany} school={idSchool} principal={idPrincipal} principalTitle={idPrincipalTitle} signature={idSignature} stamp={idStamp} />
          </div>
        </div>
      )}
    </div>
  );
};

/** معاينة الهوية قبل حفظها (الشعارات والتوقيع من الحقول لا من الإعدادات المحفوظة) */
const IdentityPreview: React.FC<{ input: CertificateInput; company: string; school: string; principal: string; principalTitle: string; signature: string; stamp: string }> = ({ input, company, school, principal, principalTitle, signature, stamp }) => (
  <CertPreview inputs={[{ ...input, brand: { companyLogo: company, schoolLogo: school, principalName: principal, principalTitle, principalSignature: signature, stamp } }]} testId="identity-preview" />
);
