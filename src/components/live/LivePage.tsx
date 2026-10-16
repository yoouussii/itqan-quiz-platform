import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Video, Plus, ChevronRight, ChevronLeft, Pencil, Trash2, Users, X, Save, Ban, RotateCcw, Settings2, Copy, Download, KeyRound, Radio, Clock, Link2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card, Button, Chip, Tone, ListSkeleton } from '../common/ui';
import { DateTimeField } from '../common/DateTimeField';
import {
  LiveAttendee, LiveDraft, LiveJoin, LivePeriod, LiveSession, deleteLive, periodEnd, isSoon, joinLive, listLive, liveAttendance, liveConfigStatus, liveEnd,
  randomSecret, saveLive, setLive, setLiveConfig, takePendingJoin, copyLiveLink, openExternal, externalKind,
  zoomKeysStatus, setZoomKeys, parseZoomMeeting,
} from '../../services/liveService';
import { saveSettings } from '../../services/settingsService';
import { LiveRoom } from './LiveRoom';
const ZoomRoom = React.lazy(() => import('./ZoomRoom'));
import { t, uiDir, dateLocale } from '../../i18n';
import type { User } from '../../types';

const inp = 'h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';
const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const weekStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; };
const fmtTime = (iso: string | Date) => new Date(iso).toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' });
const fmtDay = (d: Date) => d.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
const WEEKDAYS = () => [t('الأحد'), t('الاثنين'), t('الثلاثاء'), t('الأربعاء'), t('الخميس'), t('الجمعة'), t('السبت')];

const STATUS: Record<string, { label: () => string; tone: Tone }> = {
  scheduled: { label: () => t('مجدولة'), tone: 'muted' },
  soon: { label: () => t('تبدأ قريباً'), tone: 'info' },
  live: { label: () => t('مباشرة الآن'), tone: 'bad' },
  ended: { label: () => t('انتهت'), tone: 'ok' },
  missed: { label: () => t('لم تُعقد'), tone: 'warn' },
  cancelled: { label: () => t('ملغاة'), tone: 'muted' },
};
const statusOf = (s: LiveSession) => (isSoon(s) ? 'soon' : s.status);

const JOIN_ERR: Record<string, () => string> = {
  not_started: () => t('لم يحن موعد الحصة بعد. تفتح تلقائياً في وقتها.'),
  ended: () => t('انتهت هذه الحصة.'),
  cancelled: () => t('أُلغيت هذه الحصة.'),
  not_configured: () => t('لم يُضبط خادم الحصص بعد. تواصل مع إدارة المدرسة.'),
  forbidden: () => t('لا تملك صلاحية دخول هذه الحصة.'),
  not_found: () => t('الحصة غير موجودة.'),
};

/** الحصص المباشرة: جدول الأسبوع، والدخول، والحضور (للطاقم والطلاب) */
export const LivePage: React.FC = () => {
  const { currentUser, users, classes, subjects, settings, showToast, updateSettings } = useApp() as any;
  const me = currentUser as User;
  const isStaff = me.role === 'admin' || me.role === 'teacher' || me.role === 'supervisor';
  const isTeacher = me.role === 'teacher';
  const fresh = useMemo(() => (users as User[]).find((u) => u.id === me.id) || me, [users, me]);
  const myClasses = useMemo(() => {
    const ids = new Set([...(fresh.assigned_class_ids || []), ...(fresh.class_id ? [fresh.class_id] : [])]);
    return [...(isTeacher ? classes.filter((c: any) => ids.has(c.id)) : classes)].sort((a: any, b: any) => a.name.localeCompare(b.name, 'ar'));
  }, [isTeacher, fresh, classes]);
  const className = useCallback((id: string) => classes.find((c: any) => c.id === id)?.name || id, [classes]);
  const subjectName = useCallback((id: string | null) => (id ? subjects.find((s: any) => s.id === id)?.name || '' : ''), [subjects]);
  const domain: string = settings.live_classes?.domain || '';
  const periods: LivePeriod[] = settings.live_classes?.periods || [];

  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [rows, setRows] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [classFilter, setClassFilter] = useState('');
  const [mineOnly, setMineOnly] = useState(isTeacher);
  const [editing, setEditing] = useState<LiveSession | 'new' | null>(null);
  const [att, setAtt] = useState<LiveSession | null>(null);
  const [del, setDel] = useState<LiveSession | null>(null);
  const [room, setRoom] = useState<LiveJoin | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [showCfg, setShowCfg] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const [zoomJoin, setZoomJoin] = useState<LiveJoin | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const from = new Date(Math.min(week.getTime(), weekStart(new Date()).getTime()));
    const to = new Date(week); to.setDate(to.getDate() + 7);
    const r = await listLive(from, to);
    setRows(r.rows);
    setLoading(false);
  }, [week]);
  useEffect(() => { void load(); }, [load]);
  // دخول مباشر من بطاقة الرئيسية
  // أو من رابط الحصة المنسوخ (/live?s=…)
  const [pending] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('s');
    if (fromUrl) { try { window.history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ } }
    return takePendingJoin() || fromUrl;
  });
  useEffect(() => {
    if (!pending || loading) return;
    const s = rows.find((x) => x.id === pending);
    if (s) void enter(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, loading]);
  // تحديث دوري: كل 20 ثانية إن كانت هناك حصة مباشرة (حتى تختفي عند إنهائها)، وإلا كل دقيقة
  // لا تحديث أثناء وجود المستخدم داخل الحصة (يخفّف الحمل مع مئات الطلاب في وقت واحد)
  const anyLive = rows.some((s) => s.status === 'live');
  const inRoom = !!room || !!zoomJoin;
  useEffect(() => {
    if (inRoom) return undefined;
    const iv = window.setInterval(() => { setNow(Date.now()); void load(true); }, anyLive ? 20000 : 60000);
    return () => window.clearInterval(iv);
  }, [load, anyLive, inRoom]);

  const visible = rows.filter((s) => (!classFilter || s.class_ids.includes(classFilter)) && (!mineOnly || s.teacher_id === me.id));
  const happening = visible.filter((s) => s.status === 'live' || isSoon(s, now));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(week); d.setDate(d.getDate() + i); return d; }), [week]);
  const byDay = useMemo(() => {
    const m: Record<string, LiveSession[]> = {};
    visible.forEach((s) => { const k = dayKey(new Date(s.starts_at)); (m[k] ||= []).push(s); });
    return m;
  }, [visible]);
  // أيام العمل (الأحد-الخميس) دائماً، والجمعة والسبت إن كان فيهما حصص
  const shownDays = days.filter((d) => d.getDay() <= 4 || byDay[dayKey(d)]?.length);
  const thisWeek = weekStart(new Date()).getTime() === week.getTime();

  const enter = async (s: LiveSession) => {
    setJoining(s.id);
    const r = await joinLive(s.id);
    setJoining(null);
    if (!r.ok) { showToast((JOIN_ERR[r.error || ''] || (() => t('تعذر دخول الحصة')))(), 'error'); void load(true); return; }
    if (r.zoom) { setZoomJoin(r); return; }
    if (r.external_url) { openExternal(r.external_url); void load(true); return; }
    setRoom(r);
  };
  const setStatus = async (s: LiveSession, status: 'cancelled' | 'scheduled' | 'ended') => {
    if (status === 'cancelled' && !window.confirm(t('إلغاء هذه الحصة؟ سيظهر للطلاب أنها ملغاة.'))) return;
    if (status === 'ended' && !window.confirm(t('إنهاء الحصة الآن؟ لن يتمكن الطلاب من دخولها بعد ذلك.'))) return;
    const r = await setLive(s.id, { status });
    if (r.ok) { showToast(t('تم الحفظ')); void load(true); } else showToast(t('تعذر الحفظ'), 'error');
  };

  if (room) return <LiveRoom join={room} onClose={() => { setRoom(null); void load(true); }} />;
  if (zoomJoin) return <React.Suspense fallback={null}><ZoomRoom join={zoomJoin} onClose={() => { setZoomJoin(null); void load(true); }} /></React.Suspense>;

  const canCreate = isStaff && (!isTeacher || myClasses.length > 0);
  return (
    <div className="max-w-6xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5" dir={uiDir()}>
      <PageHeader
        title={isStaff ? t('الحصص المباشرة') : t('حصصي المباشرة')}
        subtitle={isStaff ? t('جدول الحصص عن بُعد: جدولة، وتذكير تلقائي للطلاب، ودخول بضغطة، وحضور يُسجَّل وحده') : t('ادخل حصتك من هنا عندما يبدأها المعلم')}
        actions={<>
          {canCreate && <Button icon={Plus} onClick={() => setEditing('new')} data-testid="live-new">{t('حصة جديدة')}</Button>}
          {isStaff && <Button variant="secondary" icon={Video} onClick={() => setShowZoom((v) => !v)} data-testid="zoom-keys-btn">{t('حسابي في Zoom')}</Button>}
          {me.role === 'admin' && <Button variant="secondary" icon={Settings2} onClick={() => setShowCfg((v) => !v)}>{t('إعدادات الخادم')}</Button>}
        </>}
      />

      {!domain && (
        <Card className="p-4 text-sm bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200">
          {me.role === 'admin' ? t('اضبط عنوان خادم الحصص من «إعدادات الخادم»، أو أضف رابط Zoom/Teams لكل حصة.') : isStaff ? t('خادم الحصص غير مضبوط: أضف رابط اجتماع Zoom أو Teams للحصة.') : t('لم تُفعَّل الحصص المباشرة بعد. تواصل مع إدارة المدرسة.')}
        </Card>
      )}
      {me.role === 'admin' && (showCfg || !domain) && (
        <ServerSettings domain={domain} onSaveDomain={async (d) => {
          const v = { ...(settings.live_classes || {}), domain: d };
          if (updateSettings) await updateSettings({ live_classes: v }); else await saveSettings({ live_classes: v } as any);
          showToast(t('تم الحفظ'));
        }} periods={periods} onSavePeriods={async (ps) => {
          const v = { ...(settings.live_classes || {}), periods: ps };
          if (updateSettings) await updateSettings({ live_classes: v }); else await saveSettings({ live_classes: v } as any);
          showToast(t('تم الحفظ'));
        }} />
      )}

      {isStaff && showZoom && <ZoomKeysCard />}

      {happening.length > 0 && (
        <div className="space-y-3">
          {happening.map((s) => (
            <Card key={s.id} className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${s.status === 'live' ? 'border-rose-300 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/30' : 'border-indigo-200 dark:border-indigo-900'}`} data-testid="live-now">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${s.status === 'live' ? 'bg-rose-600 text-white' : 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'}`}>
                {s.status === 'live' ? <Radio className="w-6 h-6 animate-pulse" /> : <Clock className="w-6 h-6" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-lg text-slate-900 dark:text-white truncate">{s.title}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {s.status === 'live' ? t('بدأت الحصة الآن') : t('تبدأ {time}', { time: fmtTime(s.starts_at) })} · {s.teacher_name} · {s.class_ids.map(className).join('، ')}
                </p>
              </div>
              {s.can_manage && s.status === 'live' && (
                <Button variant="secondary" onClick={() => void setStatus(s, 'ended')} data-testid="live-end-card">{t('إنهاء الحصة')}</Button>
              )}
              {(s.can_manage || s.status === 'live') ? (
                <Button icon={Video} onClick={() => void enter(s)} disabled={joining === s.id} className={s.status === 'live' ? '!bg-rose-600 hover:!bg-rose-700' : ''} data-testid="live-join">
                  {s.can_manage ? (s.status === 'live' ? t('العودة للحصة') : t('ابدأ الحصة')) : t('ادخل الحصة')}
                </Button>
              ) : <Chip tone="info">{t('تفتح {time}', { time: fmtTime(s.starts_at) })}</Chip>}
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setWeek((w) => { const x = new Date(w); x.setDate(x.getDate() - 7); return x; })} className="w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center justify-center" aria-label={t('الأسبوع السابق')}>
            <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
          </button>
          <span className="px-2 font-bold text-slate-800 dark:text-slate-100 text-sm min-w-[9rem] text-center">
            {thisWeek ? t('هذا الأسبوع') : `${days[0].toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}`}
          </span>
          <button type="button" onClick={() => setWeek((w) => { const x = new Date(w); x.setDate(x.getDate() + 7); return x; })} className="w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center justify-center" aria-label={t('الأسبوع التالي')}>
            <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
          </button>
          {!thisWeek && <Button size="sm" variant="ghost" onClick={() => setWeek(weekStart(new Date()))}>{t('اليوم')}</Button>}
        </div>
        {isStaff && myClasses.length > 1 && (
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={inp} aria-label={t('الفصل')}>
            <option value="">{t('كل الفصول')}</option>
            {myClasses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {isStaff && me.role !== 'student' && (
          <label className="text-sm text-slate-600 dark:text-slate-300 inline-flex items-center gap-2">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="w-4 h-4" />{t('حصصي فقط')}
          </label>
        )}
      </div>

      {loading ? <ListSkeleton rows={4} /> : (
        <div className="space-y-4">
          {shownDays.map((d) => {
            const list = (byDay[dayKey(d)] || []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            const today = dayKey(d) === dayKey(new Date());
            return (
              <section key={dayKey(d)} aria-label={fmtDay(d)}>
                <h2 className={`text-sm font-black mb-2 ${today ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`}>
                  {fmtDay(d)}{today && ` · ${t('اليوم')}`}
                </h2>
                {list.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 px-1">{t('لا حصص')}</p>
                ) : (
                  <div className="space-y-2">
                    {list.map((s) => (
                      <SessionRow key={s.id} s={s} className={className} subjectName={subjectName} isStaff={isStaff} joining={joining === s.id}
                        onCopy={() => void copyLiveLink(s.id).then((ok) => ok && showToast(t('نُسخ رابط الحصة')))}
                        onJoin={() => void enter(s)} onEdit={() => setEditing(s)} onDelete={() => setDel(s)} onAtt={() => setAtt(s)}
                        onCancel={() => void setStatus(s, 'cancelled')} onRestore={() => void setStatus(s, 'scheduled')} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {editing && (
        <LiveEditor session={editing === 'new' ? null : editing} classes={myClasses} subjects={subjects} periods={periods} needExternal={!domain}
          teachers={me.role === 'teacher' ? [] : (users as User[]).filter((u) => u.role === 'teacher').sort((a, b) => a.name.localeCompare(b.name, 'ar'))}
          me={me} onClose={() => setEditing(null)} onSaved={(n) => { setEditing(null); showToast(n > 1 ? t('تمت جدولة {n} حصة', { n }) : t('تم الحفظ')); void load(true); }} />
      )}
      {att && <AttendanceModal s={att} className={className} onClose={() => setAtt(null)} />}
      {del && <DeleteModal s={del} onClose={() => setDel(null)} onDone={(n) => { setDel(null); showToast(t('تم حذف {n} حصة', { n })); void load(true); }} />}
    </div>
  );
};

const SessionRow: React.FC<{
  s: LiveSession; className: (id: string) => string; subjectName: (id: string | null) => string; isStaff: boolean; joining: boolean;
  onJoin: () => void; onEdit: () => void; onDelete: () => void; onAtt: () => void; onCancel: () => void; onRestore: () => void; onCopy: () => void;
}> = ({ s, className, subjectName, isStaff, joining, onJoin, onEdit, onDelete, onAtt, onCancel, onRestore, onCopy }) => {
  const st = statusOf(s);
  const meta = STATUS[st] || STATUS.scheduled;
  const subj = subjectName(s.subject_id);
  const canEnter = s.status === 'live' || (s.can_manage && (st === 'scheduled' || st === 'soon'));
  const ib = 'w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800';
  return (
    <Card className={`p-3 sm:p-4 flex flex-wrap items-center gap-3 ${s.status === 'cancelled' ? 'opacity-60' : ''}`} data-testid="live-row">
      <div className="w-16 shrink-0 text-center">
        <p className="font-black text-slate-900 dark:text-white tabular-nums">{fmtTime(s.starts_at)}</p>
        <p className="text-xs text-slate-500">{s.period ? t('الحصة {n}', { n: s.period }) : t('{n} د', { n: s.duration_min })}</p>
      </div>
      <div className="flex-1 min-w-[12rem]">
        <p className={`font-bold text-slate-900 dark:text-white ${s.status === 'cancelled' ? 'line-through' : ''}`}>{s.title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {[subj, s.class_ids.map(className).join('، '), s.teacher_name].filter(Boolean).join(' · ')}
        </p>
      </div>
      {s.external && <Chip tone="info">{externalKind(s.external_url) || t('رابط خارجي')}</Chip>}
      <Chip tone={meta.tone}>{meta.label()}</Chip>
      {!isStaff && s.attended && <Chip tone="ok">{t('حضرت ✓')}</Chip>}
      <div className="flex items-center gap-1">
        {canEnter && (
          <Button size="sm" icon={Video} onClick={onJoin} disabled={joining}>{s.can_manage ? (s.status === 'live' ? t('العودة') : t('ابدأ')) : t('ادخل')}</Button>
        )}
        {isStaff && s.status !== 'ended' && s.status !== 'cancelled' && s.status !== 'missed' && (
          <button type="button" onClick={onCopy} className={ib} title={t('نسخ رابط الحصة')} aria-label={t('نسخ رابط الحصة')}><Link2 className="w-4 h-4" /></button>
        )}
        {isStaff && <button type="button" onClick={onAtt} className={ib} title={t('الحضور')} aria-label={t('الحضور')}><Users className="w-4 h-4" /></button>}
        {s.can_manage && s.status !== 'live' && (
          <>
            <button type="button" onClick={onEdit} className={ib} title={t('تعديل')} aria-label={t('تعديل')}><Pencil className="w-4 h-4" /></button>
            {s.status === 'cancelled'
              ? <button type="button" onClick={onRestore} className={ib} title={t('إعادة الحصة')} aria-label={t('إعادة الحصة')}><RotateCcw className="w-4 h-4" /></button>
              : (st === 'scheduled' || st === 'soon') && <button type="button" onClick={onCancel} className={ib} title={t('إلغاء الحصة')} aria-label={t('إلغاء الحصة')}><Ban className="w-4 h-4" /></button>}
            <button type="button" onClick={onDelete} className={`${ib} hover:text-rose-600`} title={t('حذف')} aria-label={t('حذف')}><Trash2 className="w-4 h-4" /></button>
          </>
        )}
      </div>
    </Card>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-[70] bg-slate-950/50 flex items-end sm:items-center justify-center p-0 sm:p-4" dir={uiDir()} role="dialog" aria-modal="true" aria-label={title}
    onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 space-y-4`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-slate-900 dark:text-white">{title}</h2>
        <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center" aria-label={t('إغلاق')}><X className="w-5 h-5" /></button>
      </div>
      {children}
    </div>
  </div>
);

const LiveEditor: React.FC<{
  session: LiveSession | null; classes: any[]; subjects: any[]; periods: LivePeriod[]; needExternal: boolean; teachers: User[]; me: User; onClose: () => void; onSaved: (n: number) => void;
}> = ({ session, classes, subjects, periods, needExternal, teachers, me, onClose, onSaved }) => {
  const next = () => { const d = new Date(); d.setMinutes(Math.ceil((d.getMinutes() + 5) / 5) * 5, 0, 0); return toLocalInput(d); };
  const [title, setTitle] = useState(session?.title || '');
  const [notes, setNotes] = useState(session?.notes || '');
  const [classIds, setClassIds] = useState<string[]>(session?.class_ids || (classes.length === 1 ? [classes[0].id] : []));
  const [subjectId, setSubjectId] = useState(session?.subject_id || '');
  const [start, setStart] = useState(session ? toLocalInput(new Date(session.starts_at)) : next());
  const [dur, setDur] = useState(session?.duration_min || 35);
  // الحصص الثابتة: أقرب حصة قادمة اليوم، وإلا الأولى غداً
  const nowHm = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  const nextIdx = periods.findIndex((p) => periodEnd(p) > nowHm);
  const [period, setPeriod] = useState<number>(session ? session.period || 0 : periods.length ? (nextIdx >= 0 ? nextIdx + 1 : 1) : 0);
  const [date, setDate] = useState(() => {
    if (session) return dayKey(new Date(session.starts_at));
    const d = new Date(); if (periods.length && nextIdx < 0) d.setDate(d.getDate() + 1); return dayKey(d);
  });
  const per = period > 0 ? periods[period - 1] : null;
  const effStart = per ? `${date}T${per.start}` : start;
  const effDur = per ? Number(per.minutes) || 35 : dur;
  const [teacherId, setTeacherId] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [until, setUntil] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return dayKey(d); });
  const [ext, setExt] = useState(session?.external_url || '');
  type Prov = 'jitsi' | 'zoom' | 'external';
  const [prov, setProv] = useState<Prov>((session?.provider as Prov) || (needExternal ? 'zoom' : 'jitsi'));
  const [zm, setZm] = useState(session?.zoom_meeting || '');
  const [zp, setZp] = useState(session?.zoom_passcode || '');
  const [zoomOk, setZoomOk] = useState<boolean | null>(null);
  useEffect(() => { if (prov === 'zoom' && zoomOk === null) void zoomKeysStatus().then((s) => setZoomOk(s.configured)); }, [prov, zoomOk]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const startDow = effStart ? new Date(effStart).getDay() : -1;
  const toggleClass = (id: string) => setClassIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!title.trim()) return setErr(t('اكتب عنوان الحصة'));
    if (!classIds.length) return setErr(t('اختر فصلاً واحداً على الأقل'));
    if (!effStart || (per && !date)) return setErr(t('حدد موعد الحصة'));
    const extUrl = prov === 'external' ? ext.trim() : '';
    if (prov === 'external' && !/^https:\/\/\S+$/i.test(extUrl)) return setErr(t('الرابط يجب أن يبدأ بـ https://'));
    const zMeeting = prov === 'zoom' ? parseZoomMeeting(zm) : '';
    if (prov === 'zoom' && !zMeeting) return setErr(t('اكتب رقم اجتماع Zoom (9 إلى 12 رقماً) أو الصق رابط الدعوة'));
    setBusy(true);
    const d: LiveDraft = { id: session?.id, title: title.trim(), notes, class_ids: classIds, subject_id: subjectId || null, starts_at: new Date(effStart).toISOString(), duration_min: effDur, period: per ? period : null, teacher_id: teacherId || undefined, external_url: extUrl || null,
      zoom_meeting: zMeeting || null, zoom_passcode: prov === 'zoom' ? zp.trim() || null : null };
    const r = await saveLive(d, !session && repeat ? until : null, !session && repeat ? weekdays.filter((w) => w !== startDow) : undefined);
    setBusy(false);
    if (!r.ok) {
      const m = r.error || '';
      if (m.includes('bad_url')) return setErr(t('الرابط يجب أن يبدأ بـ https://'));
      if (m.includes('zoom_keys_missing')) return setErr(t('اربط حسابك في Zoom أولاً من زر «حسابي في Zoom» أعلى الصفحة.'));
      if (m.includes('bad_zoom')) return setErr(t('رقم الاجتماع أو رمز المرور غير صحيح'));
      return setErr(m.includes('class_forbidden') ? t('أحد الفصول ليس ضمن إسنادك') : m.includes('repeat_too_long') ? t('مدة التكرار طويلة جداً (الحد ستة أشهر)') : t('تعذر الحفظ'));
    }
    onSaved(session ? 1 : Number(r.data?.created) || 1);
  };

  return (
    <Modal title={session ? t('تعديل الحصة') : t('حصة مباشرة جديدة')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('عنوان الحصة')}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={`${inp} w-full`} placeholder={t('مثال: رياضيات — الكسور')} data-testid="live-title" />
        </label>
        <div className="space-y-1">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('الفصول')}</span>
          <div className="flex flex-wrap gap-1.5">
            {classes.map((c) => (
              <button key={c.id} type="button" onClick={() => toggleClass(c.id)} aria-pressed={classIds.includes(c.id)}
                className={`h-9 px-3 rounded-xl text-sm font-semibold border ${classIds.includes(c.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('المادة (اختياري)')}</span>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={`${inp} w-full`}>
            <option value="">—</option>
            {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {periods.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('الحصة')}</span>
              <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} className={`${inp} w-full`} data-testid="live-period">
                {periods.map((p, i) => <option key={i} value={i + 1}>{t('الحصة {n}', { n: i + 1 })} · {`\u2066${p.start}–${periodEnd(p)}\u2069`}</option>)}
                <option value={0}>{t('وقت آخر')}</option>
              </select>
            </label>
            {per && (
              <label className="block space-y-1">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('اليوم')}</span>
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`${inp} w-full`} />
              </label>
            )}
          </div>
        )}
        {per ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('تفتح الحصة تلقائياً من {a} وتُغلق للجميع عند {b}.', { a: per.start, b: periodEnd(per) })}</p>
        ) : (
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('الموعد')}</span>
              <DateTimeField value={start} onChange={setStart} required label={t('الموعد')} />
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('المدة')}</span>
              <select value={dur} onChange={(e) => setDur(Number(e.target.value))} className={`${inp} w-full`}>
                {[30, 35, 40, 45, 60, 90].map((m) => <option key={m} value={m}>{t('{n} دقيقة', { n: m })}</option>)}
              </select>
            </label>
          </div>
        )}
        {teachers.length > 0 && !session && (
          <label className="block space-y-1">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('المعلم')}</span>
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={`${inp} w-full`}>
              <option value="">{me.name} ({t('أنا')})</option>
              {teachers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        )}
        {!session && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="w-4 h-4" data-testid="live-repeat" />
              {t('تتكرر أسبوعياً')}
            </label>
            {repeat && (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('أيام التكرار')}>
                  {WEEKDAYS().map((w, i) => {
                    const on = i === startDow || weekdays.includes(i);
                    return (
                      <button key={i} type="button" disabled={i === startDow} onClick={() => setWeekdays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}
                        aria-pressed={on} className={`h-9 px-3 rounded-xl text-sm font-semibold border ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}>
                        {w}
                      </button>
                    );
                  })}
                </div>
                <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  {t('حتى تاريخ')}
                  <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={inp} />
                </label>
              </>
            )}
          </div>
        )}
        <div className="space-y-2">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('أين تُعقد الحصة؟')}</span>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
            {([['jitsi', t('خادم المدرسة')], ['zoom', t('Zoom داخل المنصة')], ['external', t('رابط خارجي')]] as Array<[Prov, string]>)
              .filter(([k]) => k !== 'jitsi' || !needExternal)
              .map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={prov === k} onClick={() => setProv(k)} data-testid={`live-prov-${k}`}
                  className={`h-10 px-2 rounded-xl text-sm font-semibold border ${prov === k ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}>
                  {label}
                </button>
              ))}
          </div>
          {prov === 'zoom' && (
            <div className="space-y-2 rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
              {zoomOk === false && (
                <p className="text-xs font-bold text-amber-700 dark:text-amber-300">{t('لم تربط حسابك في Zoom بعد: احفظ الحصة بعد ربطه من زر «حسابي في Zoom».')}</p>
              )}
              <div className="grid sm:grid-cols-2 gap-2">
                <input value={zm} onChange={(e) => setZm(e.target.value)} dir="ltr" placeholder={t('رقم الاجتماع أو رابط الدعوة')} className={`${inp} w-full`} data-testid="live-zoom-meeting" />
                <input value={zp} onChange={(e) => setZp(e.target.value)} dir="ltr" placeholder={t('رمز المرور (Passcode)')} className={`${inp} w-full`} data-testid="live-zoom-pass" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('أنشئ اجتماعاً متكرراً في Zoom (نفس الرقم لكل الحصص) وابدأه من تطبيق Zoom في موعده، والطلاب يرونه داخل المنصة. لا يظهر الرقم ولا الرمز للطلاب.')}</p>
            </div>
          )}
          {prov === 'external' && (
            <div className="space-y-1">
              <input value={ext} onChange={(e) => setExt(e.target.value)} dir="ltr" inputMode="url" placeholder="https://teams.microsoft.com/…" className={`${inp} w-full`} data-testid="live-ext" />
              <span className="block text-xs text-slate-500 dark:text-slate-400">{t('Teams أو Google Meet أو غيرها: يدخل الطالب من المنصة فيُسجَّل حضوره ثم يُفتح الاجتماع في تطبيقه.')}</span>
            </div>
          )}
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('ملاحظات للطلاب (اختياري)')}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={2} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
        </label>
        {err && <p className="text-sm font-bold text-rose-600" role="alert">{err}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>{t('إلغاء')}</Button>
          <Button type="submit" icon={Save} disabled={busy} data-testid="live-save">{t('حفظ')}</Button>
        </div>
      </form>
    </Modal>
  );
};

const AttendanceModal: React.FC<{ s: LiveSession; className: (id: string) => string; onClose: () => void }> = ({ s, className, onClose }) => {
  const [rows, setRows] = useState<LiveAttendee[] | null>(null);
  useEffect(() => { void liveAttendance(s.id).then((r) => setRows(r || [])); }, [s.id]);
  const present = (rows || []).filter((r) => r.joins > 0);
  const mins = (sec: number) => Math.round(sec / 60);
  const exportCsv = () => {
    const lines = [[t('الطالب'), t('الفصل'), t('الحالة'), t('أول دخول'), t('الدقائق')].join(',')];
    (rows || []).forEach((r) => lines.push([r.name, className(r.class_id), r.joins ? t('حاضر') : t('غائب'), r.first_join ? fmtTime(r.first_join) : '', mins(r.seconds)].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `${s.title}-${dayKey(new Date(s.starts_at))}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Modal title={t('حضور: {title}', { title: s.title })} onClose={onClose} wide>
      <p className="text-sm text-slate-500">{fmtDay(new Date(s.starts_at))} · {fmtTime(s.starts_at)} – {fmtTime(liveEnd(s))}</p>
      {!rows ? <ListSkeleton rows={4} /> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="ok">{t('حضر {n}', { n: present.length })}</Chip>
            <Chip tone="bad">{t('غاب {n}', { n: rows.length - present.length })}</Chip>
            <span className="flex-1" />
            <Button size="sm" variant="secondary" icon={Download} onClick={exportCsv} disabled={!rows.length}>{t('تصدير Excel')}</Button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="live-att-list">
            {rows.map((r) => (
              <div key={r.user_id} className="py-2 flex items-center gap-3 text-sm">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${r.joins ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                <span className="flex-1 font-semibold text-slate-800 dark:text-slate-100 truncate">{r.name}</span>
                <span className="text-xs text-slate-500 hidden sm:inline">{className(r.class_id)}</span>
                <span className="text-xs text-slate-500 w-28 text-end tabular-nums">
                  {r.joins ? `${r.first_join ? fmtTime(r.first_join) : ''} · ${t('{n} د', { n: mins(r.seconds) })}` : t('غائب')}
                </span>
              </div>
            ))}
            {!rows.length && <p className="py-4 text-sm text-slate-500">{t('لا يوجد طلاب في فصول هذه الحصة')}</p>}
          </div>
        </>
      )}
    </Modal>
  );
};

const DeleteModal: React.FC<{ s: LiveSession; onClose: () => void; onDone: (n: number) => void }> = ({ s, onClose, onDone }) => {
  const [busy, setBusy] = useState(false);
  const go = async (series: boolean) => {
    setBusy(true);
    const r = await deleteLive([s.id], series);
    setBusy(false);
    if (r.ok) onDone(Number(r.data) || 0);
  };
  return (
    <Modal title={t('حذف الحصة')} onClose={onClose}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('سيُحذف سجل الحضور معها. لا يمكن التراجع.')}</p>
      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="secondary" onClick={onClose}>{t('إلغاء')}</Button>
        {s.series_id && <Button variant="danger" onClick={() => void go(true)} disabled={busy}>{t('هذه وكل ما بعدها')}</Button>}
        <Button variant="danger" icon={Trash2} onClick={() => void go(false)} disabled={busy}>{t('هذه الحصة فقط')}</Button>
      </div>
    </Modal>
  );
};

/** إعدادات خادم الحصص (للمدير): العنوان، وسرّ رموز الدخول */
const ServerSettings: React.FC<{ domain: string; onSaveDomain: (d: string) => Promise<void>; periods: LivePeriod[]; onSavePeriods: (p: LivePeriod[]) => Promise<void> }> = ({ domain, onSaveDomain, periods, onSavePeriods }) => {
  const { showToast } = useApp();
  const [ps, setPs] = useState<LivePeriod[]>(periods);
  const addPeriod = () => setPs((x) => [...x, { start: x.length ? periodEnd(x[x.length - 1]) : '07:00', minutes: x.length ? x[x.length - 1].minutes : 35 }]);
  const setP = (i: number, patch: Partial<LivePeriod>) => setPs((x) => x.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const psValid = ps.every((p) => /^\d{2}:\d{2}$/.test(p.start) && p.minutes >= 5);
  const [d, setD] = useState(domain);
  const [cfg, setCfg] = useState<{ configured: boolean; app_id?: string } | null>(null);
  const [secret, setSecret] = useState('');
  useEffect(() => { void liveConfigStatus().then(setCfg); }, []);
  const clean = d.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const gen = async () => {
    if (cfg?.configured && !window.confirm(t('توليد سرّ جديد يوقف الدخول حتى تضعه على خادم Jitsi. متابعة؟'))) return;
    const s = randomSecret();
    const r = await setLiveConfig(cfg?.app_id || 'itqan', s);
    if (r.ok) { setSecret(s); setCfg(r.data); } else showToast(t('تعذر الحفظ'), 'error');
  };
  const cmd = secret ? `sudo bash itqan-jwt.sh ${clean || 'DOMAIN'} ${cfg?.app_id || 'itqan'} ${secret}` : '';
  return (
    <Card className="p-4 sm:p-5 space-y-4" data-testid="live-server">
      <div className="space-y-1">
        <p className="font-black text-slate-900 dark:text-white">{t('عنوان خادم الحصص (Jitsi)')}</p>
        <div className="flex flex-wrap gap-2">
          <input value={d} onChange={(e) => setD(e.target.value)} dir="ltr" placeholder="meet.school.sa" className={`${inp} flex-1 min-w-[14rem]`} data-testid="live-domain" />
          <Button icon={Save} onClick={() => void onSaveDomain(clean)} disabled={!clean || clean === domain}>{t('حفظ')}</Button>
        </div>
      </div>
      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4" data-testid="live-periods">
        <p className="font-black text-slate-900 dark:text-white">{t('مواعيد الحصص الثابتة')}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('يختار المعلم رقم الحصة فقط، فتفتح الحصة تلقائياً في موعدها وتُغلق للجميع عند نهايته.')}</p>
        <div className="space-y-2">
          {ps.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-20 font-bold text-slate-700 dark:text-slate-200">{t('الحصة {n}', { n: i + 1 })}</span>
              <input type="time" value={p.start} onChange={(e) => setP(i, { start: e.target.value })} className={inp} aria-label={t('بداية الحصة {n}', { n: i + 1 })} />
              <select value={p.minutes} onChange={(e) => setP(i, { minutes: Number(e.target.value) })} className={inp} aria-label={t('المدة')}>
                {[30, 35, 40, 45, 50, 60].map((m) => <option key={m} value={m}>{t('{n} دقيقة', { n: m })}</option>)}
              </select>
              <span className="text-slate-500 tabular-nums">← {periodEnd(p)}</span>
              <button type="button" onClick={() => setPs((x) => x.filter((_, j) => j !== i))} className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600" aria-label={t('حذف')}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {ps.length < 12 && <Button size="sm" variant="secondary" icon={Plus} onClick={addPeriod}>{t('إضافة حصة')}</Button>}
          <Button size="sm" icon={Save} onClick={() => void onSavePeriods(ps)} disabled={!psValid || JSON.stringify(ps) === JSON.stringify(periods)}>{t('حفظ المواعيد')}</Button>
        </div>
      </div>
      <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
        <p className="font-black text-slate-900 dark:text-white flex items-center gap-2"><KeyRound className="w-4 h-4" />{t('الدخول الآمن (المعلم مشرف تلقائياً)')}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {cfg?.configured ? t('مفعّل: لا يدخل الحصة إلا من يفتحها من المنصة، والمعلم هو المتحكّم.') : t('غير مفعّل بعد: أي شخص لديه الرابط يمكنه الدخول. ولّد سرّاً وضعه على الخادم.')}
        </p>
        <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => void gen()}>{cfg?.configured ? t('توليد سرّ جديد') : t('توليد السرّ')}</Button>
        {secret && (
          <div className="rounded-xl bg-slate-900 text-slate-100 p-3 space-y-2">
            <p className="text-xs text-amber-300">{t('انسخ هذا الأمر الآن ونفّذه على الخادم؛ لن يظهر السرّ مرة أخرى.')}</p>
            <code dir="ltr" className="block text-xs break-all">{cmd}</code>
            <Button size="sm" variant="secondary" icon={Copy} onClick={() => { void navigator.clipboard?.writeText(cmd); showToast(t('تم النسخ')); }}>{t('نسخ')}</Button>
          </div>
        )}
      </div>
    </Card>
  );
};

/** ربط حساب المعلم في Zoom: مفاتيح تطبيق Meeting SDK من حسابه (السرّ يُحفظ على الخادم ولا يُعرض) */
const ZoomKeysCard: React.FC = () => {
  const { showToast } = useApp();
  const [st, setSt] = useState<{ configured: boolean; client_id?: string | null } | null>(null);
  const [cid, setCid] = useState('');
  const [sec, setSec] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void zoomKeysStatus().then((s) => { setSt(s); setCid(s.client_id || ''); }); }, []);
  const save = async (remove = false) => {
    setBusy(true);
    const r = await setZoomKeys(remove ? '' : cid.trim(), remove ? '' : sec.trim() || null);
    setBusy(false);
    if (!r.ok) { showToast(t('تعذر الحفظ'), 'error'); return; }
    setSt(r.data); setSec(''); if (remove) setCid('');
    showToast(remove ? t('أُلغي ربط Zoom') : t('تم ربط حسابك في Zoom'));
  };
  const steps = [
    t('ادخل marketplace.zoom.us بحسابك في Zoom ← Develop ← Build App.'),
    t('اختر General App، ثم من Features فعّل Embed ← Meeting SDK.'),
    t('من App Credentials انسخ Client ID و Client Secret والصقهما هنا.'),
    t('أنشئ في Zoom اجتماعاً متكرراً لكل فصل، وضع رقمه في الحصة.'),
  ];
  return (
    <Card className="p-4 sm:p-5 space-y-3" data-testid="zoom-keys">
      <div className="flex items-center justify-between gap-2">
        <p className="font-black text-slate-900 dark:text-white">{t('ربط حسابي في Zoom (مرة واحدة)')}</p>
        {st?.configured && <Chip tone="ok">{t('مربوط ✓')}</Chip>}
      </div>
      <ol className="list-decimal ps-5 text-sm text-slate-600 dark:text-slate-300 space-y-1">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      <div className="grid sm:grid-cols-2 gap-2">
        <input value={cid} onChange={(e) => setCid(e.target.value)} dir="ltr" placeholder="Client ID" className={`${inp} w-full`} data-testid="zoom-client-id" />
        <input value={sec} onChange={(e) => setSec(e.target.value)} dir="ltr" type="password" autoComplete="off"
          placeholder={st?.configured ? t('Client Secret (اتركه فارغاً للإبقاء على الحالي)') : 'Client Secret'} className={`${inp} w-full`} data-testid="zoom-secret" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={Save} onClick={() => void save()} disabled={busy || !cid.trim() || (!st?.configured && !sec.trim())} data-testid="zoom-save">{t('حفظ')}</Button>
        {st?.configured && <Button size="sm" variant="secondary" icon={Trash2} onClick={() => void save(true)} disabled={busy}>{t('إلغاء الربط')}</Button>}
      </div>
    </Card>
  );
};
