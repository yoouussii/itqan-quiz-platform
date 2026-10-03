// روابط الصفحات: الموقع صفحة واحدة (SPA)، والرابط يعكس الشاشة الحالية
// حتى يعمل زر الرجوع والروابط المباشرة وفتح الصفحة في تبويب جديد.
import { t } from '../i18n';
import { formatQuizDateTime } from './quizWindow';

export interface RouteState {
  view: string;
  quizId?: string | null;
  submissionId?: string | null;
  editingQuizId?: string | null;
}

const SIMPLE: Record<string, string> = {
  dashboard: '/',
  quizzes: '/quizzes',
  analytics: '/results',
  reports: '/reports',
  notifications: '/notifications',
  my_points: '/points',
  users: '/users',
  users_management: '/users',
  students_management: '/users',
  subjects_classes: '/subjects',
  leaderboard: '/leaderboard',
  approvals: '/approvals',
  activity_log: '/activity',
  settings: '/settings',
  banners: '/banners',
  question_bank: '/bank',
  outcomes: '/outcomes',
  certificates: '/certificates',
  grading: '/grading',
  privacy: '/privacy',
  terms: '/terms',
};

const enc = encodeURIComponent;

/** رابط الشاشة الحالية */
export function pathFor(s: RouteState): string {
  switch (s.view) {
    case 'take_quiz':
      return s.quizId ? `/quiz/${enc(s.quizId)}` : '/';
    case 'quiz_preview':
      return s.quizId ? `/quiz/${enc(s.quizId)}/preview` : '/';
    case 'quiz_results':
      return s.quizId ? `/quiz/${enc(s.quizId)}/results` : '/';
    case 'quiz_review':
      return s.submissionId ? `/review/${enc(s.submissionId)}` : '/';
    case 'create_quiz':
      return s.editingQuizId ? `/editor/${enc(s.editingQuizId)}` : '/editor';
    default:
      return SIMPLE[s.view] || '/';
  }
}

/** صفحات متاحة قبل تسجيل الدخول أيضاً */
export const PUBLIC_PATHS: Record<string, 'privacy' | 'terms'> = { '/privacy': 'privacy', '/terms': 'terms' };

/** تنقّل داخل الموقع من رابط عادي (يعمل قبل الدخول وبعده) */
export function navigateTo(path: string) {
  if (path !== window.location.pathname) window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** رابط الاختبار الكامل الذي يرسله المعلم للطلاب */
export const quizShareUrl = (quizId: string) => `${window.location.origin}/quiz/${enc(quizId)}`;

/** قراءة الرابط إلى شاشة (بدون التحقق من الصلاحية) */
export function parsePath(path: string): RouteState | null {
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
  if (parts.length === 0) return { view: 'dashboard' };
  const [a, b, c] = parts;
  if (a === 'quiz' && b) {
    if (!c) return { view: 'take_quiz', quizId: b };
    if (c === 'preview') return { view: 'quiz_preview', quizId: b };
    if (c === 'results') return { view: 'quiz_results', quizId: b };
    return null;
  }
  if (a === 'review' && b && !c) return { view: 'quiz_review', submissionId: b };
  if (a === 'editor' && !c) return { view: 'create_quiz', editingQuizId: b || null };
  if (parts.length !== 1) return null;
  const view = Object.keys(SIMPLE).find((k) => SIMPLE[k] === `/${a}`);
  return view ? { view } : null;
}

// التحويل التلقائي (صفحة غير مسموحة أو غير موجودة) يستبدل الرابط بدل أن يضيف خطوة للسجل،
// حتى لا يعلق زر الرجوع على صفحة تُحوِّل من جديد.
let replaceNext = false;
export const replaceNextNavigation = () => { replaceNext = true; };
export const takeReplaceFlag = () => { const r = replaceNext; replaceNext = false; return r; };

/** نسخ رابط الاختبار للحافظة (لإرساله للطلاب في واتساب مثلاً) */
export async function copyQuizLink(quizId: string): Promise<boolean> {
  const url = quizShareUrl(quizId);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // متصفحات قديمة أو بدون إذن الحافظة: نعرض الرابط لنسخه يدوياً
    window.prompt('انسخ رابط الاختبار:', url);
    return false;
  }
}

/**
 * مشاركة الاختبار على واتساب (مجاناً): يفتح واتساب برسالة جاهزة فيها العنوان والموعد والرابط،
 * والمعلم يختار جروب أولياء الأمور أو الطلاب ويرسلها.
 */
export function shareQuizOnWhatsApp(quiz: { id: string; title: string; end_date?: string | null; subject?: { name?: string } | null }) {
  const lines = [
    `📝 ${t('اختبار جديد: {title}', { title: quiz.title })}`,
    quiz.subject?.name ? t('المادة: {name}', { name: quiz.subject.name }) : '',
    quiz.end_date ? t('متاح حتى: {date}', { date: formatQuizDateTime(quiz.end_date, 'end') }) : '',
    t('رابط الاختبار: {url}', { url: quizShareUrl(quiz.id) }),
  ].filter(Boolean);
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
}
