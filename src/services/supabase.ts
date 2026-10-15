// نستخدم جزء قاعدة البيانات فقط من Supabase (الجداول والدوال). الدخول عندنا بجلسة خاصة (x-itqan-session)،
// فلا حاجة لمكتبة supabase-js الكاملة (الدخول/الملفات/البث المباشر) التي كانت تضاعف حجم الموقع.
import { PostgrestClient } from '@supabase/postgrest-js';

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

// عدّاد حجم التنزيل (080): يُبلَّغ عنه مستمع واحد (usageService) دون إبطاء الطلب
type UsageListener = (bytes: number) => void;
let usageListener: UsageListener | null = null;
export const setUsageListener = (fn: UsageListener | null) => { usageListener = fn; };
const measure = (res: Response) => {
  if (!usageListener) return;
  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len) && len > 0) return usageListener(len);
  // بدون content-length (ضغط متدفق): نقيس نسخة من الاستجابة في الخلفية
  void res.clone().blob().then((b) => usageListener?.(b.size)).catch(() => undefined);
};

const fetchWithSession: typeof fetch = (input, init) => {
  const token = getSessionToken();
  let req: Promise<Response>;
  if (!token) req = fetch(input, init);
  else {
    const headers = new Headers(init?.headers);
    headers.set('x-itqan-session', token);
    req = fetch(input, { ...init, headers });
  }
  return req.then((res) => {
    try { measure(res); } catch { /* ignore */ }
    return res;
  });
};

/** هل الخطأ يعني أن دوال الحماية لم تُنشأ بعد في قاعدة البيانات (لم يُشغَّل ملفات 003_security)؟ */
export const isMissingRpc = (error: { code?: string; message?: string } | null | undefined): boolean =>
  !!error &&
  (error.code === 'PGRST202' ||
    error.code === '42883' ||
    /Could not find the function|function .* does not exist/i.test(error.message || ''));

function makeClient(url: string, key: string) {
  const rest = new PostgrestClient(`${url.replace(/\/+$/, '')}/rest/v1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    fetch: fetchWithSession,
  });
  return {
    from: rest.from.bind(rest),
    rpc: rest.rpc.bind(rest),
    schema: rest.schema.bind(rest),
    /** للتوافق مع الكود القديم: لا توجد جلسة Supabase Auth أصلاً */
    auth: { signOut: async () => ({ error: null }) },
  };
}

// Safe client creation: prevents throw on startup if environment variables are not yet populated
export const supabase = isSupabaseConfigured()
  ? makeClient(supabaseUrl, supabaseAnonKey)
  : makeClient('https://placeholder-project.supabase.co', 'placeholder-anon-key');

// رابط الخادم والمفتاح العام (المفتاح العام يظهر في الموقع أصلاً؛ يُستخدم في كود ربط سجل الغياب)
export { supabaseUrl, supabaseAnonKey };
