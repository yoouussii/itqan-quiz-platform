import React, { useMemo, useState } from 'react';
import { Trophy, Download, Sparkles, Medal, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  BADGES, LEVELS, bestPerQuiz, computePointEvents, earnedBadges, levelFor, totalPoints,
} from '../../utils/points';
import { exportStudentReport } from '../../utils/studentReport';
import { formatFullArabicDate } from '../../utils/dateUtils';
import { timeAgo } from '../common/NotificationBell';
import { uiDir, t, isEn } from '../../i18n';

/** صفحة "نقاطي" للطالب: النقاط، المستوى، الأوسمة، الجوائز، ولوحة الشرف */
export const MyPoints: React.FC = () => {
  const { currentUser, submissions, quizzes, awards, classes } = useApp();
  const [busy, setBusy] = useState(false);

  const data = useMemo(() => {
    if (!currentUser) return null;
    const mine = (submissions || []).filter((s) => s.student_id === currentUser.id);
    const myAwards = (awards || []).filter((a) => a.student_id === currentUser.id);
    const events = computePointEvents(mine, quizzes || [], myAwards);
    const total = totalPoints(events);
    const valid = bestPerQuiz(mine.filter((s) => (quizzes || []).some((q) => q.id === s.quiz_id)));
    const avg = valid.length ? Math.round(valid.reduce((a, s) => a + (Number(s.percentage) || 0), 0) / valid.length) : 0;
    return { mine, myAwards, events, total, avg, count: valid.length, badges: earnedBadges(mine, quizzes || []) };
  }, [currentUser, submissions, quizzes, awards]);

  if (!currentUser || !data) return null;
  const lvl = levelFor(data.total);
  const className = classes.find((c) => c.id === (currentUser.class_id || currentUser.assigned_class_ids?.[0]))?.name;

  const downloadReport = async () => {
    setBusy(true);
    try {
      await exportStudentReport({
        name: currentUser.name,
        nationalId: currentUser.national_id,
        className,
        results: data.mine.map((s) => ({
          quiz: s.quiz?.title || '—', subject: s.subject?.name || '—',
          score: `${s.score}/${s.total_possible_score}`, pct: Number(s.percentage) || 0, date: formatFullArabicDate(s.completed_at),
        })),
        points: data.total,
        badgeKeys: data.badges,
        awards: data.myAwards,
      });
    } finally {
      setBusy(false);
    }
  };

  const honor = (awards || []).slice(0, 8);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8" dir={uiDir()}>
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 rounded-3xl p-6 sm:p-8 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-4xl">{lvl.level.emoji}</div>
            <div>
              <p className="text-xs font-bold text-white/80">{t('المستوى الحالي')}</p>
              <h1 className="text-2xl sm:text-3xl font-black font-cairo" data-testid="level-name">{t(lvl.level.name)}</h1>
              <p className="text-xs text-white/90 mt-1">
                {lvl.next ? t('تبقّى {n} نقطة للوصول إلى مستوى «{level}»', { n: lvl.toNext, level: t(lvl.next.name) }) : t('وصلت لأعلى مستوى. ما شاء الله!')}
              </p>
            </div>
          </div>
          <div className="text-center sm:text-end">
            <p className="text-xs font-bold text-white/80">{t('مجموع نقاطي')}</p>
            <p className="text-5xl font-black font-cairo" data-testid="total-points">{data.total}</p>
          </div>
        </div>
        <div className="mt-5 h-3 rounded-full bg-white/25 overflow-hidden">
          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${lvl.progress}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('اختبارات مكتملة'), value: data.count },
          { label: t('متوسط أفضل النتائج'), value: `${data.avg}%` },
          { label: t('أوسمة مكتسبة'), value: `${data.badges.length}/${BADGES.length}` },
          { label: t('جوائز'), value: data.myAwards.length },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4">
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{s.label}</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><Medal className="w-5 h-5 text-amber-500" />{' '}{t('أوسمتي')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {BADGES.map((b) => {
            const on = data.badges.includes(b.key);
            return (
              <div key={b.key} data-badge={b.key} data-earned={on}
                className={`rounded-2xl border p-4 flex gap-3 items-start ${on ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-60'}`}>
                <span className="text-3xl">{on ? b.emoji : <Lock className="w-6 h-6 text-slate-400" />}</span>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{t(b.name)}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{t(b.desc)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {data.myAwards.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><Trophy className="w-5 h-5 text-emerald-500" />{' '}{t('جوائزي')}</h2>
          <ul className="space-y-2">
            {data.myAwards.map((a) => (
              <li key={a.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 text-sm">
                <b className="text-slate-900 dark:text-white">🏆 {a.title}</b>
                {a.points > 0 && <span className="text-emerald-600 font-bold"> {t('+{n} نقطة', { n: a.points })}</span>}
                {a.note && <p className="text-xs text-slate-500 mt-1">{a.note}</p>}
                <p className="text-[11px] text-slate-400 mt-1">{a.awarded_by_name ? `${t('من {name}', { name: a.awarded_by_name })} • ` : ''}{timeAgo(a.created_at)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {honor.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-500" />{' '}{t('لوحة الشرف')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {honor.map((a) => (
              <div key={a.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3 text-xs flex items-center justify-between">
                <span><b className="text-slate-900 dark:text-white">{a.student_name || t('طالب')}</b> <span className="text-slate-400">{a.class_name ? `• ${a.class_name}` : ''}</span></span>
                <span className="font-bold text-amber-600">🏆 {a.title}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-bold text-lg text-slate-900 dark:text-white">{t('سجل نقاطي')}</h2>
        {data.events.length === 0 ? (
          <p className="text-xs text-slate-400">{t('أدِّ أول اختبار لتبدأ بجمع النقاط.')}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="w-full text-start text-xs">
              <thead><tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold"><th className="py-2 px-3">{t('البند')}</th><th className="py-2 px-3">{t('التاريخ')}</th><th className="py-2 px-3">{t('النقاط')}</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.events.slice(0, 20).map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 px-3 text-slate-800 dark:text-slate-200">{e.label}</td>
                    <td className="py-2 px-3 text-slate-500">{formatFullArabicDate(e.date)}</td>
                    <td className="py-2 px-3 font-black text-emerald-600">+{e.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-xs text-slate-600 dark:text-slate-300 space-y-2">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t('كيف تُحسب نقاطي؟')}</h3>
        <p>{t('لكل اختبار (من أفضل محاولاتك): 10 نقاط للإكمال + حتى 20 حسب درجتك + 5 للنجاح + 15 للعلامة الكاملة. وتُضاف نقاط الجوائز التي يمنحها لك المعلمون.')}</p>
        <p>{t('المستويات:')}{' '}{LEVELS.map((l) => `${l.emoji} ${t(l.name)} (${l.min}+)`).join(isEn() ? ' → ' : ' ← ')}</p>
      </section>

      <button onClick={downloadReport} disabled={busy}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md disabled:opacity-60">
        <Download className="w-4 h-4" />{' '}{t('تحميل كشف درجاتي (PDF)')}
      </button>
    </div>
  );
};
