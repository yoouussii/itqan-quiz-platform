import { supabase } from './supabase';
import { safe, readJson, writeJson } from './remote';

export const DEFAULT_PREPARATIONS_URL = 'https://www.tinyurl.com/moznedu1';

export interface AppSettings {
  require_quiz_approval: boolean;
  preparations_url: string;
}
// اشتراط اعتماد الاختبارات مفعّل افتراضياً (مثل الخادم في 008)، ويُلغيه المدير من الإعدادات
export const DEFAULT_SETTINGS: AppSettings = { require_quiz_approval: true, preparations_url: DEFAULT_PREPARATIONS_URL };

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

export async function saveSettings(patch: Partial<AppSettings>): Promise<{ ok: boolean; error?: string }> {
  writeJson(KEY, { ...loadSettings(), ...patch });
  const rows = Object.entries(patch).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
  const res = await safe(() => supabase.from('app_settings').upsert(rows, { onConflict: 'key' }) as any);
  return { ok: res.ok, error: res.error };
}
