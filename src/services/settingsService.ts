import { supabase, isMissingRpc } from './supabase';
import { safe, readJson, writeJson } from './remote';

export const DEFAULT_PREPARATIONS_URL = 'https://www.tinyurl.com/moznedu1';

export interface AppSettings {
  require_quiz_approval: boolean;
  preparations_url: string;
  /** رابط منصة «التمكن المهاري» (مثل رابط مزن): يظهر في القائمة لمن يملك الصلاحية إن ضُبط */
  skills_url: string;
  /** هوية المدرسة: الاسم والشعار (data:image/png) ولون الواجهة (معرّف من BRAND_PRESETS) */
  school_name: string;
  school_logo: string;
  brand_color: string;
  /** المفتاح العام لإشعارات الجوال (يضبطه سير العمل «Setup push notifications») */
  vapid_public_key: string;
  /** هوية الشهادات (صفحة الشهادات): الشعاران واسم المدرسة والتوقيع والقالب واللونان */
  cert_company_logo: string;
  cert_school_logo: string;
  cert_school_name: string;
  cert_principal_name: string;
  cert_principal_title: string;
  /** توقيع المدير وختم المدرسة (صور بخلفية شفافة) */
  cert_principal_signature: string;
  cert_stamp: string;
  /** آخر نسخة احتياطية تلقائية على Drive (يكتبها سير عمل Daily backup to Drive) */
  auto_backup: { at: string; file: string; size: number; ok: boolean; encrypted?: boolean; keep?: number } | null;
  /** الملخص الصباحي: إشعار يومي ومن يستلمه (050) */
  morning_summary: { enabled?: boolean; roles?: string[]; time?: string } | null;
  /** التقرير الأسبوعي لأولياء الأمور كل خميس (051) */
  weekly_report: { enabled?: boolean; day?: number; time?: string } | null;
  /** التقرير الأسبوعي للإدارة (081) */
  weekly_admin: { enabled?: boolean; day?: number; time?: string; roles?: string[] } | null;
  cert_style: { template?: string; primary?: string; accent?: string; qr?: boolean; stampPos?: string; stampSize?: number; sigSize?: number } | null;
  /** وضع الصيانة (019): لا يدخل إلا المدير */
  maintenance: { on?: boolean; message?: string; until?: string } | null;
  /** تصميم شاشة الدخول وصورتها وعبارتها (019) */
  login_style: string;
  login_image: string;
  login_tagline: string;
  /** اسم وشعاران خاصان بشاشة الدخول وصفحة الصيانة (020)؛ فارغة = هوية المدرسة */
  login_title: string;
  login_logo: string;
  login_logo2: string;
  /** تبديل البانرات: نوع الانتقال والمدة الافتراضية لكل بانر (ثوانٍ) */
  banner_slider: { transition?: string; seconds?: number } | null;
  /** رئيسية الطالب (021): تحدي اليوم والأيام المتتالية وترتيب الفصل (مفعّلة إن لم تُضبط) */
  student_home: { challenge?: boolean; streak?: boolean; leaderboard?: boolean; challenge_count?: number } | null;
  /** الحصص المباشرة (083): عنوان خادم Jitsi */
  live_classes: { domain?: string } | null;
}
// اشتراط اعتماد الاختبارات مفعّل افتراضياً (مثل الخادم في 008)، ويُلغيه المدير من الإعدادات
export const DEFAULT_SETTINGS: AppSettings = {
  require_quiz_approval: true,
  preparations_url: DEFAULT_PREPARATIONS_URL,
  skills_url: '',
  school_name: '',
  school_logo: '',
  brand_color: 'indigo',
  vapid_public_key: '',
  cert_company_logo: '',
  cert_school_logo: '',
  cert_school_name: '',
  cert_principal_name: '',
  cert_principal_title: '',
  cert_principal_signature: '',
  cert_stamp: '',
  auto_backup: null,
  morning_summary: null,
  weekly_report: null,
  weekly_admin: null,
  cert_style: null,
  maintenance: null,
  login_style: 'classic',
  login_image: '',
  login_tagline: '',
  login_title: '',
  login_logo: '',
  login_logo2: '',
  banner_slider: null,
  student_home: null,
  live_classes: null,
};
const BRANDING_KEYS = ['school_name', 'school_logo', 'brand_color', 'maintenance', 'login_style', 'login_image', 'login_tagline', 'login_title', 'login_logo', 'login_logo2', 'cert_school_name', 'cert_company_logo', 'cert_school_logo'] as const;

// v2: النسخة السابقة كانت تحفظ «بلا اعتماد» على الأجهزة حتى لو لم يختره المدير
const KEY = 'itqan_settings_v2';
/** هل وصلت هوية المدرسة لهذا الجهاز من قبل؟ (جهاز جديد = لا، فننتظرها بدل إظهار الشكل الافتراضي) */
export const hasCachedSettings = (): boolean => { try { return localStorage.getItem(KEY) != null; } catch { return false; } };
export const loadSettings = (): AppSettings => ({ ...DEFAULT_SETTINGS, ...readJson<Partial<AppSettings>>(KEY, {}) });

// الصور (الشعارات وصورة الدخول) تصل مع هوية المدرسة فقط، فلا تُعاد مع الإعدادات
const IMAGE_KEYS = ['school_logo', 'login_image', 'login_logo', 'login_logo2', 'cert_company_logo', 'cert_school_logo'];

export async function syncSettings(): Promise<boolean> {
  const res = await safe<Array<{ key: string; value: any }>>(() => supabase.from('app_settings').select('*').not('key', 'in', `(${IMAGE_KEYS.join(',')})`) as any);
  if (!res.ok || !Array.isArray(res.data)) return false;
  const cur = loadSettings();
  const next: any = { ...cur };
  res.data.forEach((r) => {
    if (r.key in DEFAULT_SETTINGS) next[r.key] = r.value;
  });
  const changed = JSON.stringify(next) !== JSON.stringify(cur);
  writeJson(KEY, next);
  return changed;
}

// بصمة كل قيمة من هوية المدرسة كما أرسلها الخادم، وطولها لنتأكد أن القيمة ما زالت محفوظة على الجهاز
const HASH_KEY = 'itqan_branding_hashes_v1';
let brandingV2Missing = false;
const CORE = ['school_name', 'school_logo', 'brand_color'];
const sizeOf = (v: unknown) => JSON.stringify(v ?? null).length;

/** هوية المدرسة بلا إعادة تنزيل الشعار: الخادم يرجع ما تغيّر فقط (068)، وإلا الدالة القديمة */
export async function syncPublicBranding(): Promise<boolean> {
  const cur = loadSettings();
  if (!brandingV2Missing) {
    const known = readJson<Record<string, { h: string; n: number }>>(HASH_KEY, {});
    const have: Record<string, string> = {};
    Object.entries(known).forEach(([k, v]) => { if ((cur as any)[k] != null && sizeOf((cur as any)[k]) === v.n) have[k] = v.h; });
    let missing = false;
    const res = await safe<{ values?: Record<string, any>; hashes?: Record<string, string> }>(async () => {
      const r = await supabase.rpc('itqan_public_branding_v2', { p_have: have });
      missing = isMissingRpc(r.error);
      return r as any;
    });
    if (res.ok && res.data?.hashes) {
      const values = res.data.values || {}, hashes = res.data.hashes;
      const next: any = { ...cur };
      BRANDING_KEYS.forEach((k) => {
        if (k in values) next[k] = values[k] ?? DEFAULT_SETTINGS[k];
        else if (!(k in hashes) && CORE.includes(k)) next[k] = DEFAULT_SETTINGS[k];
      });
      const nextKnown: Record<string, { h: string; n: number }> = {};
      Object.entries(hashes).forEach(([k, h]) => { if (next[k] != null) nextKnown[k] = { h, n: sizeOf(next[k]) }; });
      const changed = JSON.stringify(next) !== JSON.stringify(cur);
      writeJson(KEY, next);
      writeJson(HASH_KEY, nextKnown);
      return changed;
    }
    if (!missing) return false;
    brandingV2Missing = true;
  }
  return syncPublicBrandingV1(cur);
}

/** هوية المدرسة لشاشة الدخول (قبل تسجيل الدخول): دالة عامة لا تكشف باقي الإعدادات (012) */
async function syncPublicBrandingV1(cur: AppSettings): Promise<boolean> {
  const res = await safe<Record<string, any>>(() => supabase.rpc('itqan_public_branding') as any);
  if (!res.ok || !res.data || typeof res.data !== 'object') return false;
  const next: any = { ...cur };
  // الهوية الأساسية تعود للافتراضي إن حُذفت؛ المفاتيح الأحدث (019) تُحدَّث فقط إن أعادها الخادم
  BRANDING_KEYS.forEach((k) => {
    if (k in res.data!) next[k] = res.data![k] ?? DEFAULT_SETTINGS[k];
    else if (CORE.includes(k)) next[k] = DEFAULT_SETTINGS[k];
  });
  const changed = JSON.stringify(next) !== JSON.stringify(cur);
  writeJson(KEY, next);
  return changed;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<{ ok: boolean; error?: string }> {
  writeJson(KEY, { ...loadSettings(), ...patch });
  const rows = Object.entries(patch).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
  const res = await safe(() => supabase.from('app_settings').upsert(rows, { onConflict: 'key' }) as any);
  return { ok: res.ok, error: res.error };
}
