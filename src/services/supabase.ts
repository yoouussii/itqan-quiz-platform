import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseUrl !== '' &&
    supabaseUrl.startsWith('http') &&
    supabaseAnonKey &&
    supabaseAnonKey !== ''
  );
};

// ---------------------------------------------------------------------
// جلسة الخادم: رمز يصدره itqan_login ويُرسل مع كل طلب في الترويسة
// x-itqan-session، وعليه تعتمد سياسات الحماية (RLS) في قاعدة البيانات.
// ---------------------------------------------------------------------
const SESSION_TOKEN_KEY = 'itqan_session_token_v1';
const SESSION_INFO_KEY = 'itqan_session_info_v1';

export interface ServerSessionInfo {
  expires_at: string;
  /** صاحب الجلسة على الخادم (يختلف عن المستخدم المعروض في «تبديل الحساب» للمعاينة) */
  user_id?: string;
  password_is_default?: boolean;
}

export const getSessionToken = (): string | null => {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
};

export const getSessionInfo = (): ServerSessionInfo | null => {
  try {
    const raw = localStorage.getItem(SESSION_INFO_KEY);
    return raw ? (JSON.parse(raw) as ServerSessionInfo) : null;
  } catch {
    return null;
  }
};

export const setServerSession = (token: string | null, info?: ServerSessionInfo) => {
  try {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
      if (info) localStorage.setItem(SESSION_INFO_KEY, JSON.stringify(info));
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
      localStorage.removeItem(SESSION_INFO_KEY);
    }
  } catch {
    /* ignore */
  }
};

export const updateSessionInfo = (patch: Partial<ServerSessionInfo>) => {
  const cur = getSessionInfo();
  if (!cur) return;
  try {
    localStorage.setItem(SESSION_INFO_KEY, JSON.stringify({ ...cur, ...patch }));
  } catch {
    /* ignore */
  }
};

const fetchWithSession: typeof fetch = (input, init) => {
  const token = getSessionToken();
  if (!token) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set('x-itqan-session', token);
  return fetch(input, { ...init, headers });
};

/** هل الخطأ يعني أن دوال الحماية لم تُنشأ بعد في قاعدة البيانات (لم يُشغَّل ملفات 003_security)؟ */
export const isMissingRpc = (error: { code?: string; message?: string } | null | undefined): boolean =>
  !!error &&
  (error.code === 'PGRST202' ||
    error.code === '42883' ||
    /Could not find the function|function .* does not exist/i.test(error.message || ''));

// Safe client creation: prevents throw on startup if environment variables are not yet populated
export const supabase: SupabaseClient = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchWithSession } })
  : createClient('https://placeholder-project.supabase.co', 'placeholder-anon-key');

// رابط الخادم والمفتاح العام (المفتاح العام يظهر في الموقع أصلاً؛ يُستخدم في كود ربط سجل الغياب)
export { supabaseUrl, supabaseAnonKey };
