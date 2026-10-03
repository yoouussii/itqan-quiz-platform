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
}
// اشتراط اعتماد الاختبارات مفعّل افتراضياً (مثل الخادم في 008)، ويُلغيه المدير من الإعدادات
export const DEFAULT_SETTINGS: AppSettings = {
  require_quiz_approval: true,
  preparations_url: DEFAULT_PREPARATIONS_URL,
  school_name: '',
  school_logo: '',
  brand_color: 'indigo',
};
const BRANDING_KEYS = ['school_name', 'school_logo', 'brand_color'] as const;

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
  BRANDING_KEYS.forEach((k) => { next[k] = k in res.data! ? res.data![k] ?? DEFAULT_SETTINGS[k] : DEFAULT_SETTINGS[k]; });
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
