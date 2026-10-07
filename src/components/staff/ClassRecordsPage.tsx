import { HBarRank } from '../common/HBarRank';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderSync, ClipboardList, TrendingUp, Upload, Copy, KeyRound, X, FileDown, Trash2, Search, RefreshCw, Users, CheckCircle2, AlertTriangle, LayoutDashboard, History } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button, Chip, timeAgo } from '../common/ui';
import { RecordChange, RecordKind, RecordSheet, RecordsConfig, deleteRecordFile, fetchRecordChanges, setRecordTools, fetchRecordSheets, fetchRecordsConfig, folderIdFrom, importRecordFile, requestRecordsSync, setLevelsCfg, setRecordsInterval, setupRecords } from '../../services/classRecordsService';
import { FollowSheet, LevelSheet, LevelsCfg, ToolMode, autoRounds, classLabel, lastOf, meanOf, parseFollowup, parseLevels, prepLevels, recordMeta, recordsAppsScript, trimGrid } from '../../utils/classRecords';
import { ChangesTimeline, Freshness, RecItem, RecordsDashboard, VBarChart, buildItems, dayKey, fmtDay, fmtFull, sheetShort } from './ClassRecordsDashboard';
import { supabaseUrl, supabaseAnonKey } from '../../services/supabase';
import { hasPerm } from '../../utils/permissions';
import { exportElementToPdf } from '../../utils/exportPdf';
import { uiDir, t, dateLocale } from '../../i18n';
import { MascotHere } from '../common/Mascot';

type Tab = 'dash' | 'followup' | 'levels' | 'sync';
const inp = 'h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const escH = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SUB = (i: number) => `var(--sub-${(i % 6) + 1})`;
const fmtAt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

/** سجلات المتابعة الصفية وتتبع مستويات الطلاب — من مجلدات Drive أو رفع Excel */
export const ClassRecordsPage: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const canManage = hasPerm(currentUser, 'can_manage_class_records');
  const [tab, setTab] = useState<Tab>('dash');
  const [rows, setRows] = useState<RecordSheet[] | null>(null);
  const [changes, setChanges] = useState<RecordChange[]>([]);
  const [cfg, setCfg] = useState<RecordsConfig | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  // لا نُفرغ البيانات عند التحديث كي لا يُعاد تركيب التبويب (ويضيع كود الربط الظاهر)
  const load = () => { void fetchRecordSheets().then((r) => setRows(r.rows)); void fetchRecordChanges().then(setChanges); void fetchRecordsConfig().then(setCfg); };
  useEffect(load, []);
  // كود Drive يعمل كل دقيقة؟ (064: آخر اتصال منه خلال 3 دقائق)
  const live = !!cfg?.last_poll && Date.now() - new Date(cfg.last_poll).getTime() < 3 * 60 * 1000;
  const driveLinked = !!cfg?.has_token && (cfg?.folders?.length || 0) > 0;
  // أثناء فتح الصفحة: نتحقق كل دقيقة، ونعيد التحميل إن وصلت مزامنة جديدة
  const lastSyncRef = useRef<string | null>(null);
  useEffect(() => { lastSyncRef.current = cfg?.last_sync || null; }, [cfg?.last_sync]);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void fetchRecordsConfig().then((c) => {
        if (!c) return;
        if (c.last_sync && c.last_sync !== lastSyncRef.current) load(); else setCfg(c);
      });
    }, 60 * 1000);
    return () => window.clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // «تحديث الآن»: يطلب من كود Drive فحص المجلدات فوراً، وننتظر انتهاء الفحص ثم نعيد التحميل
  const [syncing, setSyncing] = useState(false);
  const refresh = async () => {
    load();
    if (!driveLinked || syncing) return;
    const r = await requestRecordsSync();
    if (!r.ok || !r.at) return;
    setSyncing(true);
    const asked = new Date(r.at).getTime();
    for (let i = 0; i < 36; i++) {
      await new Promise((res) => setTimeout(res, 5000));
      const c = await fetchRecordsConfig();
      if (c?.last_scan && new Date(c.last_scan).getTime() >= asked - 1000) {
        setSyncing(false); load(); showToast(t('تمت المزامنة مع Drive'), 'success'); return;
      }
    }
    setSyncing(false); load();
    showToast(t('لم يكتمل فحص Drive بعد. إن تكرر ذلك أنشئ كود ربط جديداً من «الربط والاستيراد» وشغّل setup.'), 'info');
  };
  const { items, tools } = useMemo(() => buildItems(rows || [], (cfg?.tools || {}) as Record<string, ToolMode>), [rows, cfg?.tools]);
  const setTool = async (key: string, mode: 'auto' | ToolMode) => {
    const next = { ...(cfg?.tools || {}) } as Record<string, ToolMode>;
    if (mode === 'auto') delete next[key]; else next[key] = mode;
    const r = await setRecordTools(next);
    if (r.ok && cfg) setCfg({ ...cfg, tools: r.tools }); else showToast(t('تعذر الحفظ — تأكد من تشغيل التحديث 046'), 'error');
  };
  const levels = useMemo(() => (rows || []).filter((r) => r.kind === 'levels'), [rows]);
  const toSync = () => canManage && setTab('sync');
  const TABS: Array<[Tab, string, React.ElementType]> = [['dash', t('لوحة المتابعة'), LayoutDashboard], ['followup', t('سجلات المتابعة الصفية'), ClipboardList], ['levels', t('تتبع مستويات الطلاب'), TrendingUp], ...(canManage ? [['sync', t('الربط والاستيراد'), FolderSync] as [Tab, string, React.ElementType]] : [])];
  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader title={t('سجلات المتابعة')} subtitle={t('سجلات المعلمين ومستويات الطلاب من Google Drive، مع آخر تعديل لكل ملف')}
        actions={<div className="flex items-center gap-3">
          {cfg?.last_sync && <span className="text-xs text-slate-500 inline-flex items-center gap-1.5" title={driveLinked ? (live ? t('كود Drive يعمل ويتحقق كل دقيقة') : t('كود Drive لا يتصل كل دقيقة: أنشئ كوداً جديداً من «الربط والاستيراد»')) : undefined}>
            <span className={`w-2 h-2 rounded-full ${!driveLinked || live ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />{t('آخر مزامنة: {d}', { d: timeAgo(cfg.last_sync) })}</span>}
          <Button size="sm" variant="secondary" icon={RefreshCw} disabled={syncing} onClick={() => void refresh()} data-testid="records-refresh" className={syncing ? '[&>svg]:animate-spin' : ''}>
            {syncing ? t('جارٍ المزامنة من Drive…') : driveLinked ? t('تحديث الآن') : t('تحديث')}
          </Button>
        </div>} />
      <div className="flex flex-wrap gap-2">
        {TABS.map(([k, l, Icon]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center gap-2 ${tab === k ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}><Icon className="w-4 h-4" />{l}</button>
        ))}
      </div>
      {rows === null ? null : tab === 'dash' ? (items.length ? <RecordsDashboard items={items} tools={tools} changes={changes} canManage={canManage} onSetTool={(k, m) => void setTool(k, m)} onOpenTeacher={(k) => { setTab('followup'); setOpenFile(k); }} /> : <EmptyFollow onEmpty={toSync} />)
        : tab === 'followup' ? <FollowupTab items={items} changes={changes} openFile={openFile} setOpenFile={setOpenFile} onEmpty={toSync} />
        : tab === 'levels' ? <LevelsTab rows={levels} cfg={cfg?.levels_cfg || {}} canManage={canManage}
            onCfg={async (c) => { if (await setLevelsCfg(c)) { if (cfg) setCfg({ ...cfg, levels_cfg: c }); } else showToast(t('تعذر الحفظ — تأكد من تشغيل التحديث 064'), 'error'); }} />
        : <SyncTab cfg={cfg} rows={rows} live={live} onChanged={load} onCfg={setCfg} />}
    </div>
  );
};

// ---------------------------------------------------------------------
// سجلات المتابعة: لوحة المعلمين (اكتمال الرصد وآخر تعديل) ← سجلات كل معلم ← عرض السجل
// ---------------------------------------------------------------------
const EmptyFollow: React.FC<{ onEmpty: () => void }> = ({ onEmpty }) => (
  <Card className="p-10 text-center text-slate-500 space-y-3"><MascotHere className="mx-auto mb-1" /><p>{t('لم تصل سجلات المتابعة بعد. اربط مجلد Drive أو ارفع ملفات Excel من «الربط والاستيراد».')}</p><Button size="sm" variant="secondary" onClick={onEmpty}>{t('الربط والاستيراد')}</Button></Card>
);

const FollowupTab: React.FC<{ items: RecItem[]; changes: RecordChange[]; openFile: string | null; setOpenFile: (k: string | null) => void; onEmpty: () => void }> = ({ items: parsed, changes, openFile, setOpenFile, onEmpty }) => {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'name' | 'stale' | 'low'>('stale');
  const [drawerTab, setDrawerTab] = useState<'sheets' | 'history'>('sheets');
  const [view, setView] = useState<{ row: RecordSheet; p: FollowSheet } | null>(null);
  useEffect(() => setDrawerTab('sheets'), [openFile]);
  const files = useMemo(() => {
    const m = new Map<string, { key: string; name: string; path: string; sheets: typeof parsed; at: string | null; by: string }>();
    parsed.forEach((x) => {
      const f = m.get(x.r.file_key) || { key: x.r.file_key, name: x.r.file_name, path: x.r.folder_path, sheets: [], at: x.r.last_edit_at, by: x.r.last_edit_by };
      f.sheets.push(x);
      if (x.r.last_edit_at && (!f.at || x.r.last_edit_at > f.at)) { f.at = x.r.last_edit_at; f.by = x.r.last_edit_by; }
      m.set(x.r.file_key, f);
    });
    return [...m.values()].map((f) => {
      const filled = f.sheets.reduce((a, s) => a + s.p.filled, 0), cells = f.sheets.reduce((a, s) => a + s.p.cells, 0);
      return { ...f, students: f.sheets.reduce((a, s) => a + s.p.students.length, 0), done: pct(filled, cells) };
    });
  }, [parsed]);
  const shown = files.filter((f) => !q.trim() || f.name.includes(q.trim()))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ar') : sort === 'low' ? a.done - b.done : (a.at || '').localeCompare(b.at || ''));
  if (!files.length) return <EmptyFollow onEmpty={onEmpty} />;
  const stale = files.filter((f) => !f.at || Date.now() - new Date(f.at).getTime() > 7 * 864e5).length;
  const avgDone = Math.round(files.reduce((a, f) => a + f.done, 0) / files.length);
  const file = files.find((f) => f.key === openFile);
  const fileChanges = changes.filter((c) => c.kind === 'followup' && c.file_key === openFile);
  const metaByKey = new Map((file?.sheets || []).map((x) => [x.r.sheet_name, x.meta]));
  const teacherDaily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (29 - i));
    const k = dayKey(d.toISOString()), list = fileChanges.filter((c) => dayKey(c.edited_at) === k);
    return { key: k, short: `${d.getDate()}/${d.getMonth() + 1}`, title: fmtDay(d), value: list.length, sub: list.length ? t('{n} خلية', { n: list.reduce((a, c) => a + c.cells_changed + c.cells_filled + c.cells_cleared, 0) }) : undefined };
  });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="cr-kpis">
        {[[Users, t('المعلمون'), String(files.length)], [ClipboardList, t('السجلات'), String(parsed.length)], [CheckCircle2, t('متوسط اكتمال الرصد'), `${avgDone}%`], [AlertTriangle, t('لم تُعدَّل منذ أسبوع'), String(stale)]].map(([Icon, l, v], i) => (
          <Card key={i} className="p-4"><div className="text-xs text-slate-500 flex items-center gap-1.5">{React.createElement(Icon as React.ElementType, { className: 'w-3.5 h-3.5' })}{l as string}</div><div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-1">{v as string}</div></Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-slate-900 dark:text-white me-auto">{t('متابعة المعلمين')}</h2>
          <label className="relative"><Search className="w-4 h-4 absolute top-3 start-3 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('بحث باسم المعلم')} className={`${inp} ps-9 w-44`} /></label>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className={inp} aria-label={t('الترتيب')}>
            <option value="stale">{t('الأقدم تعديلاً أولاً')}</option><option value="low">{t('الأقل اكتمالاً أولاً')}</option><option value="name">{t('بالاسم')}</option>
          </select>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {shown.map((f) => (
            <li key={f.key}>
              <button type="button" onClick={() => setOpenFile(f.key)} className="w-full text-start px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1.6fr] gap-2 items-center" data-testid="cr-teacher">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">{f.name}</div>
                  <div className="text-xs text-slate-500">{t('{n} سجل · {s} طالب', { n: f.sheets.length, s: f.students })}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.max(2, f.done)}%` }} /></div>
                  <span className="text-sm font-bold tabular-nums w-12 text-end">{f.done}%</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300 md:justify-end">
                  <span className="text-end">{t('آخر تعديل:')} <b>{f.by || '—'}</b><span className="block text-[11px] text-slate-500">{fmtFull(f.at)}</span></span><Freshness at={f.at} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {file && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex justify-end" onClick={() => setOpenFile(null)} role="dialog" aria-modal="true" aria-label={file.name}>
          <div className="w-full max-w-2xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()}>
            <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{file.name}</h2>
                <p className="text-sm text-slate-500">{t('آخر تعديل: {by} — {at}', { by: file.by || '—', at: fmtFull(file.at) })}</p>
                <div className="flex gap-1.5 mt-3" role="tablist">
                  {([['sheets', t('السجلات ({n})', { n: file.sheets.length }), ClipboardList], ['history', t('سجل التعديلات ({n})', { n: fileChanges.length }), History]] as const).map(([k, l, Icon]) => (
                    <button key={k} type="button" role="tab" aria-selected={drawerTab === k} onClick={() => setDrawerTab(k)} className={`h-9 px-3 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 border ${drawerTab === k ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}><Icon className="w-4 h-4" />{l}</button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setOpenFile(null)} aria-label={t('إغلاق')} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
            </div>
            {drawerTab === 'history' ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <Card className="p-4 space-y-1" data-testid="cr-teacher-activity">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t('نشاط المعلم: التعديلات في آخر 30 يوماً')}</h3>
                  <VBarChart data={teacherDaily} label={t('نشاط المعلم: التعديلات في آخر 30 يوماً')} height={150} />
                </Card>
                <ChangesTimeline changes={fileChanges} metaOf={(c) => metaByKey.get(c.sheet_name) || recordMeta(c.sheet_name)} showFile={false} />
              </div>
            ) : (
            <div className="flex-1 overflow-y-auto p-5 grid sm:grid-cols-2 gap-3 content-start">
              <Card className="p-4 space-y-1 sm:col-span-2" data-testid="cr-teacher-chart">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t('اكتمال الرصد في كل سجل')}</h3>
                <HBarRank items={file.sheets.map((x) => ({ key: String(x.r.id), label: sheetShort(x.r.sheet_name, x.meta), sub: `${x.meta.subject}${x.meta.classLabel ? ` · ${x.meta.classLabel}` : ''}`, value: x.done }))}
                  label={t('اكتمال الرصد في كل سجل')} avg={file.done} onSelect={(k) => { const x = file.sheets.find((y) => String(y.r.id) === k); if (x) setView({ row: x.r, p: x.p }); }} />
              </Card>
              {file.sheets.map(({ r, p }) => {
                const done = pct(p.filled, p.cells);
                const max = p.columns.find((c) => c.total)?.max || p.columns.filter((c) => !c.total).reduce((a, c) => a + (c.max || 0), 0);
                const avg = meanOf(p.students.map((s) => s.total));
                return (
                  <button key={r.id} type="button" onClick={() => setView({ row: r, p })} className="text-start rounded-2xl border border-slate-200 dark:border-slate-700 p-4 hover:border-indigo-300 space-y-2" data-testid="cr-sheet">
                    <div className="font-bold text-slate-900 dark:text-white">{r.sheet_name}</div>
                    <div className="text-xs text-slate-500 truncate">{p.title}</div>
                    <div className="flex items-center gap-2"><div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.max(2, done)}%` }} /></div><span className="text-xs font-bold tabular-nums">{done}%</span></div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">{t('{n} طالب', { n: p.students.length })}{avg !== null && max ? ` · ${t('متوسط المجموع {a} من {m}', { a: Math.round(avg * 10) / 10, m: max })}` : ''}</div>
                  </button>
                );
              })}
            </div>)}
          </div>
        </div>
      )}
      {view && <SheetViewer row={view.row} p={view.p} onClose={() => setView(null)} />}
    </div>
  );
};

/** عرض سجل متابعة: الطلاب × أدوات التقويم، مع الدرجة العظمى ومتوسط كل عمود، وتصدير PDF */
const SheetViewer: React.FC<{ row: RecordSheet; p: FollowSheet; onClose: () => void }> = ({ row, p, onClose }) => {
  const { showToast } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const gradeCols = p.columns.filter((c) => !c.total);
  const totalCol = p.columns.find((c) => c.total);
  const colAvg = gradeCols.map((_, i) => meanOf(p.students.map((s) => s.values[i])));
  const exportPdf = async () => {
    const head = `<tr><th>#</th><th>${escH(t('الطالب'))}</th>${gradeCols.map((c) => `<th>${escH(c.label)}<br/><small>${c.max ?? ''}</small></th>`).join('')}<th>${escH(t('المجموع'))}${totalCol?.max ? `<br/><small>${totalCol.max}</small>` : ''}</th></tr>`;
    const body = p.students.map((s, i) => `<tr><td>${i + 1}</td><td>${escH(s.name)}</td>${s.values.map((v) => `<td>${v ?? ''}</td>`).join('')}<td><b>${s.total ?? ''}</b></td></tr>`).join('');
    try { await exportElementToPdf({ bodyHtml: `<table class="pdf-table"><thead>${head}</thead><tbody>${body}</tbody></table>`, orientation: 'landscape', title: `${row.file_name} — ${row.sheet_name}`, subtitle: `${p.title} · ${t('آخر تعديل: {by} — {at}', { by: row.last_edit_by || '—', at: fmtFull(row.last_edit_at) })}` }); }
    catch (e: any) { showToast(e?.message || t('تعذر تصدير PDF'), 'error'); }
  };
  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/50 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={row.sheet_name}>
      <div className="w-full max-w-6xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} dir={uiDir()} data-testid="cr-viewer">
        <div className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1 min-w-0">
            <h2 className="font-extrabold text-lg text-slate-900 dark:text-white">{row.file_name} — {row.sheet_name}</h2>
            <p className="text-sm text-slate-500">{p.title} · {t('اكتمال الرصد {n}%', { n: pct(p.filled, p.cells) })} · {t('آخر تعديل: {by} — {at}', { by: row.last_edit_by || '—', at: fmtFull(row.last_edit_at) })}</p>
          </div>
          <Button size="sm" variant="secondary" icon={FileDown} onClick={() => void exportPdf()}>{t('تقرير PDF')}</Button>
          <button type="button" onClick={onClose} aria-label={t('إغلاق')} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div ref={ref} className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-600 dark:text-slate-300 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-start">{t('الطالب')}</th>
                {gradeCols.map((c) => <th key={c.col} className={`px-2 py-2 text-center font-semibold min-w-[5.5rem] ${c.due === false ? 'text-slate-400 dark:text-slate-500' : ''}`}>{c.label}<div className="text-[10px] font-normal text-slate-400">{c.max ?? ''}</div>{c.due === false && <div className="text-[10px] font-normal text-slate-400">{t('لم يحن وقتها')}</div>}</th>)}
                <th className="px-3 py-2 text-center">{t('المجموع')}<div className="text-[10px] font-normal text-slate-400">{totalCol?.max ?? ''}</div></th>
              </tr>
            </thead>
            <tbody>
              {p.students.map((s, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white whitespace-nowrap">{s.name}</td>
                  {s.values.map((v, j) => <td key={j} className={`px-2 py-2 text-center tabular-nums ${v === null ? 'text-slate-300 dark:text-slate-600' : ''}`}>{v ?? '—'}</td>)}
                  <td className="px-3 py-2 text-center font-bold tabular-nums">{s.total ?? '—'}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs">
                <td className="px-3 py-2 font-bold">{t('المتوسط')}</td>
                {colAvg.map((a, j) => <td key={j} className="px-2 py-2 text-center tabular-nums">{a === null ? '—' : Math.round(a * 10) / 10}</td>)}
                <td className="px-3 py-2 text-center font-bold tabular-nums">{(() => { const a = meanOf(p.students.map((s) => s.total)); return a === null ? '—' : Math.round(a * 10) / 10; })()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// تتبع المستويات: اختيار المرحلة والفصل ← متوسط الفصل لكل مادة عبر القياسات + جدول الطلاب
// ---------------------------------------------------------------------
const LevelsTab: React.FC<{ rows: RecordSheet[]; cfg: LevelsCfg; canManage: boolean; onCfg: (c: LevelsCfg) => void }> = ({ rows, cfg, canManage, onCfg }) => {
  const raw = useMemo(() => rows.map((r) => ({ r, p: parseLevels(r.grid) })).filter((x): x is { r: RecordSheet; p: LevelSheet } => !!x.p && x.p.students.length > 0), [rows]);
  // القياسات المحسوبة (ما حان وقته) والمواد التي لا تُدرس في المرحلة لا تدخل في المتوسطات والنسب
  const auto = useMemo(() => autoRounds(raw.map((x) => x.p)), [raw]);
  const maxRounds = useMemo(() => Math.max(1, ...raw.flatMap((x) => x.p.subjects.map((s) => s.cols.length))), [raw]);
  const rounds = Math.min(cfg.rounds || auto, maxRounds);
  const parsed = useMemo(() => raw.map((x) => ({ r: x.r, p: prepLevels(x.p, rounds, cfg.off?.[x.r.file_key] || []) })), [raw, rounds, cfg.off]);
  const files = useMemo(() => [...new Map(parsed.map((x) => [x.r.file_key, x.r.file_name])).entries()], [parsed]);
  const [file, setFile] = useState('');
  const [sheetId, setSheetId] = useState<number | null>(null);
  useEffect(() => { if (!files.some(([k]) => k === file)) setFile(files[0]?.[0] || ''); }, [files, file]);
  const sheets = parsed.filter((x) => x.r.file_key === file);
  useEffect(() => { if (!sheets.some((x) => x.r.id === sheetId)) setSheetId(sheets[0]?.r.id ?? null); }, [sheets, sheetId]);
  const cur = sheets.find((x) => x.r.id === sheetId);
  if (!parsed.length) return <Card className="p-10 text-center text-slate-500"><MascotHere className="mx-auto mb-1" />{t('لم تصل ملفات تتبع المستويات بعد.')}</Card>;
  const fileRow = sheets[0]?.r;
  // كل مواد المرحلة المختارة، وما لا يُحسب منها (يدوياً أو لأنه بلا درجات)
  const stageSubjects = [...new Set(raw.filter((x) => x.r.file_key === file).flatMap((x) => x.p.subjects.map((s) => s.name)))];
  const offList = cfg.off?.[file] || [];
  const autoHidden = stageSubjects.filter((n) => !offList.includes(n) && sheets.every((x) => x.p.hidden.includes(n)));
  const toggleOff = (name: string) => {
    const next = offList.includes(name) ? offList.filter((x) => x !== name) : [...offList, name];
    onCfg({ ...cfg, off: { ...(cfg.off || {}), [file]: next } });
  };
  return (
    <div className="space-y-5">
      <Card className="p-4 space-y-3" data-testid="levels-cfg">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-bold text-slate-900 dark:text-white text-sm me-auto">{t('ما يُحسب في المتوسطات والنسب')}</h2>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">{t('القياسات المحسوبة')}
            <select value={cfg.rounds || 0} disabled={!canManage} aria-label={t('القياسات المحسوبة')} onChange={(e) => onCfg({ ...cfg, rounds: Number(e.target.value) || null })}
              className="h-9 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm disabled:opacity-70">
              <option value={0}>{t('تلقائي (حتى القياس {n})', { n: auto })}</option>
              {Array.from({ length: maxRounds }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? t('القياس الأول فقط') : t('حتى القياس {n}', { n })}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-slate-500">{t('القياسات التي لم يحن موعدها لا تُحسب. تلقائياً: حتى آخر قياس فيه درجات.')}</p>
        {stageSubjects.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('مواد {s}: اضغط على المادة التي لا تُدرس في هذه المرحلة لاستبعادها من النسب', { s: files.find(([k]) => k === file)?.[1] || '' })}</div>
            <div className="flex flex-wrap gap-1.5">
              {stageSubjects.map((n) => {
                const off = offList.includes(n), autoOff = autoHidden.includes(n);
                return (
                  <button key={n} type="button" disabled={!canManage} aria-pressed={!off} onClick={() => toggleOff(n)} title={autoOff ? t('لا توجد درجات لهذه المادة في القياسات المحسوبة، فلا تُحسب') : undefined}
                    className={`h-8 px-3 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 disabled:cursor-default ${off ? 'border-slate-200 dark:border-slate-700 text-slate-400 line-through' : autoOff ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300' : 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'}`}>
                    {off ? <X className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}{n}{autoOff && !off ? ` · ${t('بلا درجات')}` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>
      <LevelsAll parsed={parsed} />
      <div className="flex flex-wrap items-center gap-2">
        <select value={file} onChange={(e) => setFile(e.target.value)} className={inp} aria-label={t('المرحلة')}>{files.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('الفصل')}>
          {sheets.map((x) => <button key={x.r.id} type="button" role="tab" aria-selected={x.r.id === sheetId} onClick={() => setSheetId(x.r.id)} className={`h-9 px-3 rounded-xl text-sm font-semibold border ${x.r.id === sheetId ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>{classLabel(x.r.sheet_name)}</button>)}
        </div>
        {fileRow && <span className="ms-auto text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">{t('آخر تعديل:')} <b>{fileRow.last_edit_by || '—'}</b><Freshness at={fileRow.last_edit_at} /></span>}
      </div>
      {cur && <LevelsClass p={cur.p} title={`${cur.r.file_name} — ${classLabel(cur.r.sheet_name)}`} />}
      {cur && cur.p.hidden.length > 0 && <p className="text-xs text-slate-500 -mt-3">{t('لا تُحسب في هذا الفصل: {s}', { s: cur.p.hidden.join('، ') })}</p>}
      <LevelsOverview sheets={sheets} />
    </div>
  );
};

/** رسم متوسط الفصل لكل مادة عبر القياسات (خط لكل مادة، أسماء مباشرة) + جدول الطلاب */
const LevelsClass: React.FC<{ p: LevelSheet; title: string }> = ({ p, title }) => {
  const [hi, setHi] = useState<number | null>(null);
  const rounds = Math.max(...p.subjects.map((s) => s.cols.length));
  const series = p.subjects.map((s, si) => ({ name: s.name, color: SUB(si), avgs: Array.from({ length: rounds }, (_, k) => meanOf(p.students.map((st) => st.scores[si][k] ?? null))) }));
  // يُرسم بعرض البطاقة الفعلي كي يبقى حجم النص ثابتاً (لا يتمدد مع viewBox)
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(320, Math.round(el.clientWidth))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const H = 240, L = 36, R = 150, T = 14, B = 30;
  const x = (k: number) => L + (rounds > 1 ? (k / (rounds - 1)) * (W - L - R) : 0);
  const y = (v: number) => T + (1 - v / p.max) * (H - T - B);
  // أسماء مباشرة عند آخر نقطة، مع إزاحة رأسية تمنع تداخلها
  const labels = series.map((s, i) => { const k = [...s.avgs.keys()].reverse().find((j) => s.avgs[j] !== null); return k === undefined ? null : { i, k, y: y(s.avgs[k]!) + 4 }; })
    .filter((l): l is { i: number; k: number; y: number } => !!l).sort((a, b) => a.y - b.y);
  labels.forEach((l, j) => { if (j && l.y - labels[j - 1].y < 14) l.y = labels[j - 1].y + 14; });
  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-bold text-slate-900 dark:text-white me-auto">{t('متوسط الفصل في كل قياس')} <span className="text-sm font-normal text-slate-500">({title} · {t('من {n}', { n: p.max })})</span></h2>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">{series.map((s) => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: s.color, height: 3 }} />{s.name}</span>)}</div>
      </div>
      <div className="relative" dir="ltr" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={t('متوسط الفصل في كل قياس')} onMouseLeave={() => setHi(null)}
          onMouseMove={(e) => { const b = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - b.left) / b.width) * W; let k = 0; for (let i = 0; i < rounds; i++) if (Math.abs(x(i) - px) < Math.abs(x(k) - px)) k = i; setHi(k); }}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(p.max * f)} y2={y(p.max * f)} className="stroke-slate-100 dark:stroke-slate-800" /><text x={L - 6} y={y(p.max * f) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{Math.round(p.max * f)}</text></g>)}
          {Array.from({ length: rounds }, (_, k) => <text key={k} x={x(k)} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">{t('القياس {n}', { n: k + 1 })}</text>)}
          {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={T} y2={H - B} className="stroke-slate-400" strokeDasharray="2 3" />}
          {series.map((s) => {
            const pts = s.avgs.map((v, k) => (v === null ? null : [x(k), y(v)] as [number, number])).filter(Boolean) as Array<[number, number]>;
            return (
              <g key={s.name}>
                {pts.length > 1 && <polyline points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />}
                {pts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={4} fill={s.color} className="stroke-white dark:stroke-slate-900" strokeWidth={2} />)}

              </g>
            );
          })}
          {labels.map((l) => <text key={l.i} x={x(l.k) + 10} y={l.y} className="fill-slate-600 dark:fill-slate-300 text-[11px]">{series[l.i].name} {Math.round(series[l.i].avgs[l.k]! * 10) / 10}</text>)}
        </svg>
        {hi !== null && (
          <div className="absolute top-1 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs shadow-lg pointer-events-none" style={{ left: `${Math.min(62, (x(hi) / W) * 100)}%` }} dir="rtl">
            <div className="font-bold mb-1">{t('القياس {n}', { n: hi + 1 })}</div>
            {series.map((s) => <div key={s.name} className="flex justify-between gap-4"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.name}</span><b className="tabular-nums">{s.avgs[hi] === null ? '—' : Math.round(s.avgs[hi]! * 10) / 10}</b></div>)}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60">
            <tr><th className="px-3 py-2 text-start" rowSpan={2}>{t('الطالب')}</th>{p.subjects.map((s, si) => <th key={si} className="px-2 py-1.5 text-center border-s border-slate-200 dark:border-slate-700" colSpan={s.cols.length + 1}><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: SUB(si) }} />{s.name}</span></th>)}</tr>
            <tr>{p.subjects.map((s, si) => <React.Fragment key={si}>{s.cols.map((_, k) => <th key={k} className={`px-1.5 py-1 text-center font-normal ${k === 0 ? 'border-s border-slate-200 dark:border-slate-700' : ''}`}>{k + 1}</th>)}<th className="px-1.5 py-1 text-center">{t('التغير')}</th></React.Fragment>)}</tr>
          </thead>
          <tbody>
            {p.students.map((st, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white whitespace-nowrap">{st.name}</td>
                {st.scores.map((sc, si) => {
                  const first = sc.find((v) => v !== null) ?? null, last = lastOf(sc);
                  const d = first !== null && last !== null && sc.filter((v) => v !== null).length > 1 ? last - first : null;
                  return <React.Fragment key={si}>{sc.map((v, k) => <td key={k} className={`px-1.5 py-2 text-center tabular-nums ${k === 0 ? 'border-s border-slate-100 dark:border-slate-800' : ''} ${v !== null && v / p.max < 0.5 ? 'text-rose-700 dark:text-rose-400 font-bold' : ''}`}>{v ?? <span className="text-slate-300 dark:text-slate-600">—</span>}</td>)}<td className={`px-1.5 py-2 text-center text-xs font-bold tabular-nums ${d === null ? 'text-slate-300' : d > 0 ? 'text-emerald-700 dark:text-emerald-400' : d < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-500'}`} dir="ltr">{d === null ? '—' : d > 0 ? `↑ +${d}` : d < 0 ? `↓ ${d}` : '='}</td></React.Fragment>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-500 mt-2">{t('الأحمر: أقل من نصف الدرجة. «التغير» = آخر قياس − أول قياس.')}</p>
      </div>
    </Card>
  );
};

/** نظرة على كل فصول المرحلة: متوسط آخر قياس لكل مادة */
/** ملخص كل المراحل: متوسط آخر قياس لكل مادة، وعدد الطلاب دون نصف الدرجة */
const LevelsAll: React.FC<{ parsed: Array<{ r: RecordSheet; p: LevelSheet }> }> = ({ parsed }) => {
  const stages = [...new Map(parsed.map((x) => [x.r.file_key, x.r.file_name])).entries()];
  const subjects = [...new Set(parsed.flatMap((x) => x.p.subjects.map((s) => s.name)))];
  if (stages.length < 2) return null;
  const rowsOf = (fk: string) => {
    const sh = parsed.filter((x) => x.r.file_key === fk);
    const students = sh.reduce((a, x) => a + x.p.students.length, 0);
    let below = 0, scored = 0;
    const per = subjects.map((name) => {
      const vals: number[] = [];
      sh.forEach(({ p }) => { const si = p.subjects.findIndex((s) => s.name === name); if (si < 0) return; p.students.forEach((st) => { const v = lastOf(st.scores[si]); if (v !== null) { vals.push(v / p.max); scored++; if (v < p.max / 2) below++; } }); });
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
    return { classes: sh.length, students, per, below, scored };
  };
  return (
    <Card className="p-5 overflow-x-auto" data-testid="cr-levels-all">
      <h2 className="font-bold text-slate-900 dark:text-white mb-1">{t('ملخص كل المراحل')}</h2>
      <p className="text-xs text-slate-500 mb-3">{t('متوسط آخر قياس لكل مادة كنسبة من الدرجة، وعدد الدرجات دون النصف.')}</p>
      <table className="w-full text-sm min-w-[620px]">
        <thead className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60"><tr><th className="px-3 py-2 text-start">{t('المرحلة')}</th><th className="px-3 py-2 text-center">{t('الفصول')}</th><th className="px-3 py-2 text-center">{t('الطلاب')}</th>{subjects.map((s, i) => <th key={s} className="px-3 py-2 text-center"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: SUB(i) }} />{s}</span></th>)}<th className="px-3 py-2 text-center">{t('دون النصف')}</th></tr></thead>
        <tbody>
          {stages.map(([fk, name]) => {
            const r = rowsOf(fk);
            return (
              <tr key={fk} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-semibold">{name}</td>
                <td className="px-3 py-2 text-center tabular-nums">{r.classes}</td>
                <td className="px-3 py-2 text-center tabular-nums">{r.students}</td>
                {r.per.map((v, i) => <td key={i} className="px-3 py-2 text-center tabular-nums"><span className={v === null ? 'text-slate-300' : v >= 0.8 ? 'text-emerald-700 dark:text-emerald-400 font-bold' : v < 0.5 ? 'text-rose-700 dark:text-rose-400 font-bold' : ''}>{v === null ? '—' : `${Math.round(v * 100)}%`}</span></td>)}
                <td className="px-3 py-2 text-center tabular-nums">{r.below} <span className="text-xs text-slate-500">({r.scored ? Math.round((r.below / r.scored) * 100) : 0}%)</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
};

const LevelsOverview: React.FC<{ sheets: Array<{ r: RecordSheet; p: LevelSheet }> }> = ({ sheets }) => {
  const subjects = [...new Set(sheets.flatMap((x) => x.p.subjects.map((s) => s.name)))];
  if (sheets.length < 2) return null;
  return (
    <Card className="p-5 overflow-x-auto">
      <h2 className="font-bold text-slate-900 dark:text-white mb-3">{t('مقارنة الفصول: متوسط آخر قياس')}</h2>
      <table className="w-full text-sm min-w-[520px]">
        <thead className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60"><tr><th className="px-3 py-2 text-start">{t('الفصل')}</th><th className="px-3 py-2 text-center">{t('الطلاب')}</th>{subjects.map((s, i) => <th key={s} className="px-3 py-2 text-center"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: SUB(i) }} />{s}</span></th>)}</tr></thead>
        <tbody>
          {sheets.map(({ r, p }) => (
            <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-2 font-semibold">{classLabel(r.sheet_name)}</td>
              <td className="px-3 py-2 text-center tabular-nums">{p.students.length}</td>
              {subjects.map((name) => {
                const si = p.subjects.findIndex((s) => s.name === name);
                const v = si < 0 ? null : meanOf(p.students.map((st) => lastOf(st.scores[si])));
                const ratio = v === null ? null : v / p.max;
                return <td key={name} className="px-3 py-2 text-center tabular-nums"><span className={ratio === null ? 'text-slate-300' : ratio >= 0.8 ? 'text-emerald-700 dark:text-emerald-400 font-bold' : ratio < 0.5 ? 'text-rose-700 dark:text-rose-400 font-bold' : ''}>{v === null ? '—' : Math.round(v * 10) / 10}</span></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};

// ---------------------------------------------------------------------
// الربط: مجلدات Drive + كود Apps Script المركزي، ورفع Excel يدوياً، وسجل المزامنة
// ---------------------------------------------------------------------
const SyncTab: React.FC<{ cfg: RecordsConfig | null; rows: RecordSheet[]; live: boolean; onChanged: () => void; onCfg: (c: RecordsConfig) => void }> = ({ cfg, rows, live, onChanged, onCfg }) => {
  const { showToast } = useApp();
  const [fu, setFu] = useState(cfg?.folders.find((f) => f.kind === 'followup')?.url || '');
  const [lv, setLv] = useState(cfg?.folders.find((f) => f.kind === 'levels')?.url || '');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<RecordKind>('followup');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const makeCode = async () => {
    const folders: RecordsConfig['folders'] = [];
    for (const [url, k] of [[fu, 'followup'], [lv, 'levels']] as const) {
      if (!url.trim()) continue;
      const id = folderIdFrom(url);
      if (!id) return showToast(t('رابط المجلد غير صحيح'), 'error');
      folders.push({ id, kind: k, url: url.trim() });
    }
    if (!folders.length) return showToast(t('أضف رابط مجلد واحد على الأقل'), 'error');
    const r = await setupRecords(folders, true);
    if (!r.ok || !r.token) return showToast(t('تعذر الحفظ'), 'error');
    setCode(recordsAppsScript(supabaseUrl, supabaseAnonKey, r.token, folders.map(({ id, kind: k }) => ({ id, kind: k }))));
    showToast(t('أُنشئ رمز ربط جديد؛ الكود القديم توقف'), 'success');
    onChanged();
  };
  const upload = async (files: File[]) => {
    setBusy(true);
    const XLSX = await import('xlsx');
    let n = 0;
    for (const f of files) {
      try {
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        // آخر من عدّل الملف ووقته من خصائص Excel إن وُجدت، وإلا الرافع ووقت الملف
        const props = (wb.Props || {}) as { LastAuthor?: string; ModifiedDate?: Date | string };
        const modified = props.ModifiedDate ? new Date(props.ModifiedDate) : null;
        const sheets = wb.SheetNames.map((sn) => ({ sheet: sn.trim(), grid: trimGrid(XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], { header: 1, raw: true, defval: null }) as any) })).filter((s) => s.grid.length >= 2);
        const r = await importRecordFile({ kind, file_name: f.name.replace(/\.xlsx?$/i, ''), last_edit_by: props.LastAuthor?.trim() || undefined, last_edit_at: (modified && !isNaN(+modified) ? modified : new Date(f.lastModified)).toISOString(), sheets });
        if (r.ok) n++; else showToast(t('تعذر رفع «{name}»', { name: f.name }), 'error');
      } catch { showToast(t('تعذر قراءة «{name}»', { name: f.name }), 'error'); }
    }
    setBusy(false);
    if (n) { showToast(t('رُفع {n} ملف', { n }), 'success'); onChanged(); }
  };
  const files = [...new Map(rows.map((r) => [`${r.kind}|${r.file_key}`, r])).values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.file_name.localeCompare(b.file_name, 'ar'));
  // أوراق لم تُقرأ (لم يُعثر فيها على عمود «اسم الطالب» / Student Name وصف الدرجات العظمى)
  const unread = useMemo(() => {
    const m = new Map<string, string[]>();
    rows.forEach((r) => {
      const ok = r.kind === 'followup' ? !!parseFollowup(r.grid)?.students.length : !!parseLevels(r.grid)?.students.length;
      if (!ok) { const k = `${r.kind}|${r.file_key}`; m.set(k, [...(m.get(k) || []), r.sheet_name]); }
    });
    return m;
  }, [rows]);
  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-3">
        <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><FolderSync className="w-5 h-5 text-indigo-600" />{t('الربط مع مجلدات Google Drive')}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('كود واحد يتصل بالمنصة كل دقيقة: يقرأ ملفات المجلدين (وما بداخلهما) عند الضغط على «تحديث الآن» أو حين يحين موعد الفحص، ويرسل الملفات التي تغيّرت فقط مع اسم آخر من عدّلها ووقته. لا يحتاج كل معلم لأي إعداد.')}</p>
        {cfg?.has_token && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-sm">
            <span className={`inline-flex items-center gap-1.5 font-semibold ${live ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
              <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
              {live ? t('الكود يعمل · آخر اتصال {d}', { d: timeAgo(cfg.last_poll || undefined) }) : t('الكود لا يتصل كل دقيقة: أنشئ كوداً جديداً بالأسفل والصقه وشغّل setup')}
            </span>
            {cfg.last_scan && <span className="text-slate-500">{t('آخر فحص للمجلدات: {d}', { d: timeAgo(cfg.last_scan) })}</span>}
            <label className="ms-auto inline-flex items-center gap-2 text-slate-700 dark:text-slate-200">{t('فحص Drive تلقائياً كل')}
              <select value={cfg.sync_interval || 10} aria-label={t('فحص Drive تلقائياً كل')} className="h-9 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                onChange={(e) => { const m = Number(e.target.value); void setRecordsInterval(m).then((ok) => { if (ok) { onCfg({ ...cfg, sync_interval: m }); showToast(t('تم الحفظ'), 'success'); } else showToast(t('تعذر الحفظ — تأكد من تشغيل التحديث 064'), 'error'); }); }}>
                {[1, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m === 1 ? t('دقيقة') : t('{n} دقائق', { n: m })}</option>)}
              </select>
            </label>
            {(cfg.sync_interval || 10) === 1 && <p className="w-full text-xs text-amber-700 dark:text-amber-400">{t('الفحص كل دقيقة يستهلك حصة Google اليومية لتشغيل الأكواد إن كانت الملفات كثيرة. «تحديث الآن» يكفي غالباً مع فحص كل 10 دقائق.')}</p>}
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('مجلد سجلات المتابعة الصفية')}<input value={fu} onChange={(e) => setFu(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" dir="ltr" className={inp} /></label>
          <label className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-1">{t('مجلد تتبع مستويات الطلاب')}<input value={lv} onChange={(e) => setLv(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" dir="ltr" className={inp} /></label>
        </div>
        <Button size="sm" icon={KeyRound} onClick={() => void makeCode()}>{cfg?.has_token ? t('إنشاء كود جديد') : t('إنشاء كود الربط')}</Button>
        {code && (
          <div className="space-y-2">
            <ol className="text-sm text-slate-700 dark:text-slate-200 list-decimal ps-5 space-y-1">
              <li>{t('افتح script.google.com بحساب المدرسة ← «مشروع جديد».')}</li>
              <li>{t('احذف أي كود والصق الكود أدناه، ثم احفظ.')}</li>
              <li>{t('اختر الدالة setup من الأعلى واضغط «تشغيل»، ووافق على الأذونات.')}</li>
            </ol>
            <div className="relative">
              <pre className="max-h-64 overflow-auto rounded-xl bg-slate-900 text-slate-100 text-xs p-3" dir="ltr">{code}</pre>
              <Button size="sm" variant="secondary" icon={Copy} className="absolute top-2 end-2" onClick={() => void navigator.clipboard.writeText(code).then(() => showToast(t('نُسخ الكود'), 'success'))}>{t('نسخ')}</Button>
            </div>
          </div>
        )}
      </Card>
      <Card className="p-5 space-y-3">
        <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Upload className="w-5 h-5 text-indigo-600" />{t('رفع ملفات Excel يدوياً')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as RecordKind)} className={inp} aria-label={t('النوع')}><option value="followup">{t('سجلات المتابعة الصفية')}</option><option value="levels">{t('تتبع مستويات الطلاب')}</option></select>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={(e) => { const list = Array.from(e.target.files || []); e.target.value = ''; if (list.length) void upload(list); }} />
          <Button size="sm" variant="secondary" icon={Upload} disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? t('جارٍ الرفع…') : t('اختيار الملفات')}</Button>
          <span className="text-xs text-slate-500">{t('سجلات المتابعة: ملف لكل معلم (اسم الملف = اسم المعلم). يمكن اختيار عدة ملفات معاً.')}</span>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <h2 className="font-bold text-slate-900 dark:text-white p-4 border-b border-slate-100 dark:border-slate-800">{t('الملفات ({n})', { n: files.length })}</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
          {files.map((r) => (
            <li key={`${r.kind}|${r.file_key}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
              <Chip tone={r.kind === 'followup' ? 'info' : 'ok'}>{r.kind === 'followup' ? t('متابعة') : t('مستويات')}</Chip>
              <b className="text-slate-900 dark:text-white">{r.file_name}</b>
              <span className="text-xs text-slate-500">{r.source === 'drive' ? 'Drive' : t('رفع يدوي')} · {r.last_edit_by || '—'} · {fmtAt(r.last_edit_at)}</span>
              {unread.has(`${r.kind}|${r.file_key}`) && <span title={unread.get(`${r.kind}|${r.file_key}`)!.join('، ')}><Chip tone="warn"><AlertTriangle className="w-3 h-3" />{t('أوراق لم تُقرأ: {s}', { s: unread.get(`${r.kind}|${r.file_key}`)!.slice(0, 3).join('، ') })}</Chip></span>}
              <button type="button" aria-label={t('حذف')} onClick={() => { if (window.confirm(t('حذف «{name}» من المنصة؟', { name: r.file_name }))) void deleteRecordFile(r.kind, r.file_key).then(onChanged); }} className="ms-auto w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      </Card>
      {!!cfg?.log?.length && (
        <Card className="p-4">
          <h2 className="font-bold text-slate-900 dark:text-white mb-2 text-sm">{t('سجل المزامنة')}</h2>
          <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 max-h-48 overflow-y-auto">
            {cfg.log.slice(0, 20).map((l, i) => <li key={i}>{fmtAt(l.at)} · {l.source === 'drive' ? 'Drive' : t('رفع يدوي')} · {l.file} · {t('{n} شيت', { n: l.sheets })}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
};
