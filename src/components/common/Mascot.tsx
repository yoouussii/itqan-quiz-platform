import React, { useEffect, useState } from 'react';
import { t } from '../../i18n';

/**
 * «إتقان الصغير»: شخصية بكسل بقبعة تخرّج تقفز أثناء التحميل (بلون هوية المدرسة).
 * الرسم شبكة 16×16؛ كل حرف بكسل:
 *  K قبعة · B جسم · H لمعة · S ظل · P خد · E عين · W بريق العين · M فم · F قدم
 */
export const MASCOT_GRID = [
  '.....KKKKKK.....',
  '..KKKKKKKKKKKK..',
  '.....KKKKKK.....',
  '....KKKKKKKK....',
  '...BHBBBBBBBB...',
  '..BHBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '..BBWEBBBBWEBB..',
  '..BBEEBBBBEEBB..',
  '..BPBBBBBBBBPB..',
  '..BBBBBMMBBBBB..',
  '..SBBBBBBBBBBS..',
  '...SSSSSSSSSS...',
  '....FF....FF....',
];

const pixels = (filter: (c: string) => boolean) => {
  const out: { x: number; y: number; c: string }[] = [];
  MASCOT_GRID.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.' && filter(c)) out.push({ x, y, c }); }));
  return out;
};
// الفم يُرسم فوق بكسل جسم (حتى لا تظهر فجوة فوقه)
const BODY = pixels((c) => !'EW'.includes(c)).map((p) => (p.c === 'M' ? { ...p, c: 'B' } : p));
const FACE = pixels((c) => 'EW'.includes(c));
const MOUTH = pixels((c) => c === 'M');

/** أدوات تمسكها الشخصية حسب الصفحة (شبكات صغيرة بجانبها) */
export type MascotProp = 'book' | 'pencil' | 'chart' | 'notebook' | 'calendar' | 'trophy' | 'gear' | 'bell' | 'gift';
const PROPS: Record<MascotProp, string[]> = {
  pencil: ['rr', 'nn', 'nn', 'nn', 'll', '.d'],
  chart: ['....c', '..a.c', 'g.a.c', 'g.a.c', 'ddddd'],
  notebook: ['SSSS', 'Swww', 'Sqqw', 'Swww', 'Sqqw', 'SSSS'],
  book: ['SSSS', 'Swww', 'Swqw', 'Swww', 'SSSS'],
  calendar: ['.r.r.', 'rrrrr', 'wwwww', 'wdwdw', 'wwwww'],
  trophy: ['TTTTT', 'TTTTT', '.TTT.', '..T..', '.TTT.'],
  gear: ['..q..', '.qqq.', 'qq.qq', '.qqq.', '..q..'],
  bell: ['..T..', '.TTT.', '.TTT.', 'TTTTT', '..d..'],
  gift: ['.T.T.', 'rrTrr', 'rrTrr', 'rrTrr', 'rrTrr'],
};

/** الأداة المناسبة لكل صفحة */
export function propFor(view?: string): MascotProp {
  const v = view || '';
  if (['take_quiz', 'create_quiz', 'quizzes', 'question_bank', 'approvals', 'grading', 'quiz_preview', 'quiz_review', 'outcomes'].includes(v)) return 'pencil';
  if (['analytics', 'reports', 'gradebook', 'quiz_results', 'remedial', 'academic_support'].includes(v)) return 'chart';
  if (v === 'homework' || v === 'class_records' || v === 'portfolio') return 'notebook';
  if (v === 'points_store') return 'gift';
  if (['attendance', 'behavior', 'calendar', 'visits', 'surveys'].includes(v)) return 'calendar';
  if (['leaderboard', 'certificates', 'my_points'].includes(v)) return 'trophy';
  if (['settings', 'school_year', 'users', 'users_management', 'subjects_classes', 'banners', 'activity_log'].includes(v)) return 'gear';
  if (v === 'notifications') return 'bell';
  return 'book';
}

export const Mascot: React.FC<{ size?: number; className?: string; prop?: MascotProp }> = ({ size = 64, className = '', prop }) => {
  const grid = prop ? PROPS[prop] : null;
  // الأداة بجانب اليد (يمين الرسم)، ومنتصفها عند صف البطن
  const ox = 14, oy = grid ? 12 - grid.length : 0;
  const w = prop ? 20 : 16;
  return (
    // مساحة 4 وحدات فوق الرأس حتى لا تُقص القبعة أثناء القفز
    <svg viewBox={`${prop ? -1 : 0} -4 ${w} 21`} width={size * w / 16} height={size * 21 / 16} shapeRendering="crispEdges" aria-hidden="true" className={`itq-mascot ${className}`}>
      <ellipse className="itq-shadow" cx="8" cy="15.6" rx="4.5" ry="0.7" />
      <g className="itq-hop">
        {BODY.map((p) => <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width="1.02" height="1.02" className={`itq-px-${p.c}`} />)}
        <g className="itq-blink">{FACE.map((p) => <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width="1.02" height="1.02" className={`itq-px-${p.c}`} />)}</g>
        {MOUTH.map((p) => <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y + 0.4} width="1.02" height="0.6" className="itq-px-E" />)}
        {/* الشرّابة تتأرجح من منتصف القبعة */}
        <g className="itq-tassel">
          <rect x="8" y="1" width="4" height="0.6" className="itq-px-T" />
          <rect x="11.6" y="1" width="0.6" height="3" className="itq-px-T" />
          <rect x="11.2" y="3.6" width="1.4" height="1.4" className="itq-px-T" />
        </g>
        {grid && (
          <g className={`itq-prop itq-prop-${prop}`} data-prop={prop}>
            {grid.flatMap((row, y) => [...row].map((c, x) => (c === '.' ? null : <rect key={`${x}-${y}`} x={ox + x} y={oy + y} width="1.02" height="1.02" className={`itq-px-${c}`} />)))}
          </g>
        )}
      </g>
    </svg>
  );
};

// كلمات تتبدل أثناء الانتظار (مثل «يفكّر…») حسب محتوى الصفحة
const WORDS: Record<MascotProp, () => string[]> = {
  book: () => [t('نجهّز الصفحة…'), t('نفتح الكتاب…'), t('نراجع الإجابات…')],
  pencil: () => [t('نبري الأقلام…'), t('نرتّب الأسئلة…'), t('نجهّز ورقة الاختبار…')],
  chart: () => [t('نحسب الدرجات…'), t('نرسم الرسوم البيانية…'), t('نجمع النتائج…')],
  notebook: () => [t('نفتح الدفاتر…'), t('نرتّب الواجبات…'), t('نجهّز المرفقات…')],
  calendar: () => [t('نراجع الكشوف…'), t('نقلّب التقويم…'), t('نعدّ الحضور…')],
  trophy: () => [t('نلمّع الكؤوس…'), t('نجهّز الشهادات…'), t('نرتّب لوحة الشرف…')],
  gear: () => [t('نضبط الإعدادات…'), t('نشدّ البراغي…'), t('نرتّب الملفات…')],
  bell: () => [t('نجمع الإشعارات…'), t('نرنّ الجرس…'), t('نرتّب الرسائل…')],
  gift: () => [t('نرتّب المكافآت…'), t('نعدّ النقاط…'), t('نغلّف الهدايا…')],
};

/** شاشة تحميل الصفحات: الشخصية وكلمة تتبدل */
export const PageLoader: React.FC<{ full?: boolean; view?: string }> = ({ full, view }) => {
  const prop = propFor(view);
  const [i, setI] = useState(() => Math.floor(Math.random() * 3));
  // لا نُظهر شيئاً في أول ربع ثانية: التحميل السريع لا يحتاج رسماً يومض
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const s = setTimeout(() => setShown(true), 250);
    const id = setInterval(() => setI((x) => x + 1), 1800);
    return () => { clearTimeout(s); clearInterval(id); };
  }, []);
  const words = WORDS[prop]();
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${full ? 'min-h-screen' : 'py-24'}`} role="status" aria-live="polite" aria-label={t('جارٍ التحميل')} data-testid="page-loader">
      {shown && (
        <>
          <Mascot size={64} prop={prop} />
          <span key={i} className="itq-word text-sm font-semibold text-slate-500 dark:text-slate-400">{words[i % words.length]}</span>
        </>
      )}
    </div>
  );
};

/** شريط علوي رفيع عند كل تنقل، و«إتقان الصغير» يجري عليه بأداة الصفحة الجديدة */
export const NavProgress: React.FC<{ navKey: string }> = ({ navKey }) => {
  setMascotView(navKey);
  const [tick, setTick] = useState(0);
  const first = React.useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setTick((x) => x + 1); }, [navKey]);
  if (!tick) return null;
  return (
    <>
      <div key={`b${tick}`} className="itq-navbar" aria-hidden="true" />
      <div key={`m${tick}`} className="itq-rider" aria-hidden="true" data-testid="nav-rider"><Mascot size={26} prop={propFor(navKey)} /></div>
    </>
  );
};

/**
 * حالة «لا يوجد» موحّدة: «إتقان الصغير» ثابت بأداة الصفحة الحالية مع الرسالة.
 * compact للقوائم الصغيرة داخل البطاقات.
 */
export const EmptyMascot: React.FC<{ text: React.ReactNode; prop?: MascotProp; view?: string; compact?: boolean; className?: string; children?: React.ReactNode }> = ({ text, prop, view, compact, className = '', children }) => (
  <div className={`flex flex-col items-center justify-center text-center gap-2 ${compact ? 'py-4' : 'py-10'} ${className}`} data-testid="empty-mascot">
    <Mascot size={compact ? 36 : 56} prop={prop || propFor(view || currentViewHint)} className="itq-idle" />
    <div className={`${compact ? 'text-xs' : 'text-sm'} text-slate-500 dark:text-slate-400 max-w-md`}>{text}</div>
    {children}
  </div>
);

/** الصفحة الحالية لاختيار أداة الشخصية في حالات «لا يوجد» (يضبطها التطبيق عند كل تنقل) */
let currentViewHint = '';
export const setMascotView = (v: string) => { currentViewHint = v; };

/** «إتقان الصغير» ثابتاً بأداة الصفحة الحالية (بدل أيقونة حالات «لا يوجد») */
export const MascotHere: React.FC<{ size?: number; className?: string; prop?: MascotProp }> = ({ size = 56, className = '', prop }) => (
  <Mascot size={size} prop={prop || propFor(currentViewHint)} className={`itq-idle ${className}`} />
);
