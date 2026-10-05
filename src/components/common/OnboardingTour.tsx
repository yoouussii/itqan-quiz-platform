import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Mascot } from './Mascot';
import { TOUR_EVENT } from './UserMenu';
import { uiDir, t } from '../../i18n';

type Step = { sel?: string; title: string; text: string };

/** أول عنصر ظاهر يطابق أحد المحددات (قد يوجد العنصر نفسه للجوال والكمبيوتر) */
const findVisible = (sel?: string): HTMLElement | null => {
  if (!sel) return null;
  for (const s of sel.split(',')) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(s.trim()))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
    }
  }
  return null;
};

const stepsFor = (role: string): Step[] => {
  const hello = { title: t('أهلاً بك في إتقان!'), text: t('أنا إتقان الصغير. سأريك أهم الأماكن في دقيقة واحدة.') };
  const menu = { sel: '[data-testid="user-menu"]', title: t('قائمتك'), text: t('من صورتك: الملف الشخصي وكلمة المرور، والوضع الليلي، واللغة، وتسجيل الخروج. ومن هنا تعيد هذه الجولة متى شئت.') };
  const bell = { sel: '[data-testid="notif-bell"]', title: t('الإشعارات'), text: t('هنا يصلك كل جديد: اختبار، أو نتيجة، أو إعلان من المدرسة.') };
  if (role === 'student') return [
    hello,
    { sel: '[data-testid="challenge-card"],[data-testid="challenge-done"]', title: t('تحدي اليوم'), text: t('خمسة أسئلة سريعة كل يوم تزيد نقاطك وسلسلة أيامك.') },
    { sel: '[data-testid="goals"]', title: t('أهدافي'), text: t('ضع هدفاً لنفسك، مثل معدل 90% في مادة، وتابع تقدمك نحوه.') },
    { sel: 'nav[aria-label="التنقل"],nav[aria-label="Navigation"],header nav', title: t('التنقل'), text: t('واجباتك ونتائجك وجدول الاختبارات ونقاطك ومتجر المكافآت.') },
    menu,
  ];
  if (role === 'parent') return [
    hello,
    { sel: 'main section, main .grid', title: t('أبناؤك'), text: t('بدّل بين أبنائك، وتابع نتائجهم وحضورهم وسلوكهم وأهدافهم.') },
    bell, menu,
  ];
  const nav = { sel: '[data-testid="staff-bottom-nav"],[data-testid="sidebar-nav"]', title: t('التنقل'), text: role === 'teacher' ? t('اختباراتك والتصحيح والنتائج، وزر + لإنشاء اختبار جديد. «المزيد» يفتح كل الصفحات.') : t('أهم الصفحات في متناولك، و«المزيد» يفتح القائمة كاملة. ثبّت صفحاتك المفضلة بالنجمة ★.') };
  const search = { sel: '[data-testid="global-search"]', title: t('البحث السريع'), text: t('اكتب اسم طالب أو اختبار أو صفحة وانتقل إليه فوراً. على الكمبيوتر: Ctrl+K.') };
  if (role === 'teacher') return [hello, nav, search, bell, menu];
  return [hello, { sel: '[data-testid="morning-summary"]', title: t('مهام اليوم'), text: t('ما يحتاج إجراءً اليوم فقط، ولكل بند زر ينقلك إليه مباشرة.') }, nav, search, menu];
};

/** جولة تعريفية في أول دخول، يقودها إتقان الصغير، ويمكن إعادتها من قائمة المستخدم */
export const OnboardingTour: React.FC = () => {
  const { currentUser, currentView, isPreview } = useApp();
  const key = currentUser ? `itqan_tour_${currentUser.id}` : '';
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const steps = useMemo(() => stepsFor(currentUser?.role || ''), [currentUser?.role]);

  useEffect(() => {
    if (!currentUser || isPreview || currentView !== 'dashboard') return;
    let seen = '1';
    try { seen = localStorage.getItem(key) || ''; } catch { /* ignore */ }
    if (seen) return;
    // ينتظر حتى تُغلق نافذة تغيير كلمة المرور الإلزامية إن ظهرت
    const tm = setInterval(() => { if (!document.querySelector('[data-force-password]')) { clearInterval(tm); setI(0); } }, 1500);
    return () => clearInterval(tm);
  }, [currentUser, currentView, key, isPreview]);
  useEffect(() => {
    const on = () => setI(0);
    window.addEventListener(TOUR_EVENT, on);
    return () => window.removeEventListener(TOUR_EVENT, on);
  }, []);

  const measure = useCallback(() => {
    if (i === null) return;
    const el = findVisible(steps[i]?.sel);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [i, steps]);
  useLayoutEffect(() => {
    if (i === null) return;
    const el = findVisible(steps[i]?.sel);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 90) el.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
    measure();
    const tm = setTimeout(measure, 250);
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    return () => { clearTimeout(tm); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [i, steps, measure]);

  const finish = () => { setI(null); try { localStorage.setItem(key, new Date().toISOString()); } catch { /* ignore */ } };
  useEffect(() => {
    if (i === null) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  if (i === null || !currentUser) return null;
  const step = steps[i];
  const last = i === steps.length - 1;
  const pad = 8;
  const hole = rect ? { top: Math.max(4, rect.top - pad), left: Math.max(4, rect.left - pad), width: Math.min(window.innerWidth - 8, rect.width + pad * 2), height: Math.min(window.innerHeight - 8, rect.height + pad * 2) } : null;
  // الفقاعة تحت العنصر إن وُجد متسع، وإلا فوقه، وإلا في المنتصف
  const below = hole ? window.innerHeight - (hole.top + hole.height) > 230 : false;
  const bubbleStyle: React.CSSProperties = hole
    ? (below ? { top: hole.top + hole.height + 12 } : { bottom: Math.max(12, window.innerHeight - hole.top + 12) })
    : { top: '50%', transform: 'translateY(-50%)' };
  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={t('الجولة التعريفية')} data-testid="tour">
      {hole
        ? <div className="absolute rounded-2xl border-2 border-white transition-all duration-200 pointer-events-none" style={{ ...hole, boxShadow: '0 0 0 9999px rgba(15,14,35,.62)' }} />
        : <div className="absolute inset-0 bg-slate-950/60" />}
      <div className="absolute inset-x-3 sm:inset-x-0 sm:mx-auto sm:w-[26rem] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-4 flex gap-3" style={bubbleStyle} dir={uiDir()}>
        <Mascot size={52} prop={last ? 'trophy' : undefined} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 dark:text-white">{step.title}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{step.text}</p>
          <div className="flex items-center gap-2 mt-3">
            <div className="flex gap-1 flex-1" aria-label={t('الخطوة {a} من {b}', { a: i + 1, b: steps.length })}>
              {steps.map((_, k) => <span key={k} className={`h-1.5 rounded-full ${k === i ? 'w-5 bg-indigo-600' : 'w-2.5 bg-slate-200 dark:bg-slate-700'}`} />)}
            </div>
            {!last && <button type="button" onClick={finish} className="h-9 px-3 rounded-xl text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">{t('تخطٍّ')}</button>}
            {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="h-9 px-3 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">{t('السابق')}</button>}
            <button type="button" onClick={() => (last ? finish() : setI(i + 1))} className="h-9 px-4 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="tour-next">{last ? t('ابدأ') : t('التالي')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
