import { supabase } from './supabase';
import { safe, readJson, writeJson } from './remote';

export const DEFAULT_PREPARATIONS_URL = 'https://www.tinyurl.com/moznedu1';

export interface AppSettings {
  require_quiz_approval: boolean;
  preparations_url: string;
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
  cert_style: { template?: string; primary?: string; accent?: string; qr?: boolean } | null;
  /** وضع الصيانة (019): لا يدخل إلا المدير */
  maintenance: { on?: boolean; message?: string; until?: string } | null;
  /** تصميم شاشة الدخول وصورتها وعبارتها (019) */
  login_style: string;
  login_image: string;
  login_tagline: string;
  /** اسم وشعاران خاصان بشاشة الدخول وصفحة الصيانة (020)؛ فارغة = هوية الشهادات أو المدرسة */
  login_title: string;
  login_logo: string;
  login_logo2: string;
  /** تبديل البانرات: نوع الانتقال والمدة الافتراضية لكل بانر (ثوانٍ) */
  banner_slider: { transition?: string; seconds?: number } | null;
}
// اشتراط اعتماد الاختبارات مفعّل افتراضياً (مثل الخادم في 008)، ويُلغيه المدير من الإعدادات
export const DEFAULT_SETTINGS: AppSettings = {
  require_quiz_approval: true,
  preparations_url: DEFAULT_PREPARATIONS_URL,
  school_name: '',
  school_logo: '',
  brand_color: 'indigo',
  vapid_public_key: '',
  cert_company_logo: '',
  cert_school_logo: '',
  cert_school_name: '',
  cert_principal_name: '',
  cert_principal_title: '',
  cert_style: null,
  maintenance: null,
  login_style: 'classic',
  login_image: '',
  login_tagline: '',
  login_title: '',
  login_logo: '',
  login_logo2: '',
  banner_slider: null,
};
const BRANDING_KEYS = ['school_name', 'school_logo', 'brand_color', 'maintenance', 'login_style', 'login_image', 'login_tagline', 'login_title', 'login_logo', 'login_logo2', 'cert_school_name', 'cert_company_logo', 'cert_school_logo'] as const;

// v2: النسخة السابقة كانت تحفظ «بلا اعتماد» على الأجهزة حتى لو لم يختره المدير
const KEY = 'itqan_settings_v2';
export const loadSettings = (): AppSettings => ({ ...DEFAULT_SETTINGS, ...readJson<Partial<AppSettings>>(KEY, {}) });

export async function syncSettings(): Promise<boolean> {
  const res = await safe<Array<{ key: string; value: any }>>(() => supabase.from('app_settings').select('*') as any);
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

/** هوية المدرسة لشاشة الدخول (قبل تسجيل الدخول): دالة عامة لا تكشف باقي الإعدادات (012) */
export async function syncPublicBranding(): Promise<boolean> {
  const res = await safe<Record<string, any>>(() => supabase.rpc('itqan_public_branding') as any);
  if (!res.ok || !res.data || typeof res.data !== 'object') return false;
  const cur = loadSettings();
  const next: any = { ...cur };
  // الهوية الأساسية تعود للافتراضي إن حُذفت؛ المفاتيح الأحدث (019) تُحدَّث فقط إن أعادها الخادم
  const CORE = ['school_name', 'school_logo', 'brand_color'];
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
