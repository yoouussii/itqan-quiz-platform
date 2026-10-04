// دالة Supabase: مرفقات الواجبات على Google Drive (041).
//   POST (multipart: target=homework|submission، target_id، file) ← رفع ملف
//   GET  ?id=<رقم الملف>                                          ← فتح ملف
// الصلاحيات: صف الملف يُنشأ ويُقرأ بجلسة المستخدم نفسه (x-itqan-session) فتطبّق قاعدة البيانات
// سياسات الحماية (RLS) كما هي؛ والدالة لا تكتب بمفتاح الخادم إلا رقم الملف في Drive.
// الأسرار (يضبطها سير العمل «Setup Drive storage»):
//   GOOGLE_CLIENT_ID، GOOGLE_CLIENT_SECRET، GOOGLE_REFRESH_TOKEN، DRIVE_FOLDER_ID
// متوفرة تلقائياً في Supabase: SUPABASE_URL، SUPABASE_ANON_KEY، SUPABASE_SERVICE_ROLE_KEY

const env = (k: string) => Deno.env.get(k) || '';
const TOKEN_URL = env('GOOGLE_TOKEN_URL') || 'https://oauth2.googleapis.com/token';
const DRIVE_URL = env('GOOGLE_DRIVE_URL') || 'https://www.googleapis.com/drive/v3';
const UPLOAD_URL = env('GOOGLE_UPLOAD_URL') || 'https://www.googleapis.com/upload/drive/v3';
const MAX_BYTES = 20 * 1024 * 1024;
const FILE_COLS = 'id,homework_id,submission_id,name,mime,size,uploaded_by,created_at,storage';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-itqan-session, x-client-info',
  'Access-Control-Expose-Headers': 'content-disposition',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------
let cached: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: env('GOOGLE_REFRESH_TOKEN'), grant_type: 'refresh_token',
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`google_token: ${j.error || r.status}`);
  cached = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3000) * 1000 };
  return cached.token;
}

async function driveUpload(name: string, mime: string, bytes: Uint8Array): Promise<string> {
  const boundary = `itqan${crypto.randomUUID().replace(/-/g, '')}`;
  const meta = JSON.stringify({ name, mimeType: mime, ...(env('DRIVE_FOLDER_ID') ? { parents: [env('DRIVE_FOLDER_ID')] } : {}) });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, bytes, `\r\n--${boundary}--`,
  ]);
  const r = await fetch(`${UPLOAD_URL}/files?uploadType=multipart&fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(`drive_upload: ${r.status}`);
  return j.id;
}

async function driveDelete(id: string) {
  const r = await fetch(`${DRIVE_URL}/files/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${await accessToken()}` } });
  return r.ok || r.status === 404;
}

// ---------------------------------------------------------------------
// قاعدة البيانات
// ---------------------------------------------------------------------
const rest = (path: string, init: RequestInit & { session?: string; service?: boolean } = {}) => {
  const key = init.service ? env('SUPABASE_SERVICE_ROLE_KEY') : env('SUPABASE_ANON_KEY');
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);
  if (init.session) headers.set('x-itqan-session', init.session);
  return fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, { ...init, headers });
};

/** تسجيل حالة Drive في القاعدة (تنبيه للمدير عند انتهاء الإذن مثلاً) */
let lastReported: string | null | undefined;
async function report(error: string | null) {
  if (lastReported === error) return;
  lastReported = error;
  await rest('rpc/itqan_storage_report', { method: 'POST', service: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_error: error }) }).catch(() => undefined);
}

/** حذف ملفات Drive المنتظرة (بعد حذف ملف أو واجب) — دفعة صغيرة في كل طلب */
async function emptyTrash() {
  try {
    const r = await rest('rpc/itqan_drive_trash_take', { method: 'POST', service: true, headers: { 'Content-Type': 'application/json' }, body: '{"p_limit":20}' });
    const ids: string[] = r.ok ? await r.json() : [];
    for (const id of ids) {
      const ok = await driveDelete(id).catch(() => false);
      if (!ok) await rest('rpc/itqan_drive_trash_put', { method: 'POST', service: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: id }) });
    }
  } catch { /* المحاولة القادمة */ }
}
const later = (p: Promise<unknown>) => {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p); else p.catch(() => undefined);
};

async function sessionUser(session: string): Promise<{ id: string; role: string } | null> {
  const r = await rest('rpc/itqan_session_user', { method: 'POST', session, headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && u.id ? u : null;
}

// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const session = req.headers.get('x-itqan-session') || '';
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!env('GOOGLE_REFRESH_TOKEN')) return json({ error: 'not_configured' }, 501);

  // ---------- فتح ملف ----------
  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('id') || '';
    if (!/^hwf-[0-9a-f]+$/.test(id)) return json({ error: 'bad_id' }, 400);
    const r = await rest(`homework_files?id=eq.${id}&select=name,mime,drive_id`, { session });
    const row = r.ok ? (await r.json())[0] : null;
    if (!row?.drive_id) return json({ error: 'not_found' }, 404);
    const d = await fetch(`${DRIVE_URL}/files/${encodeURIComponent(row.drive_id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
    if (!d.ok) return json({ error: 'drive_error' }, 502);
    return new Response(d.body, { headers: { ...CORS, 'Content-Type': row.mime || 'application/octet-stream', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`, 'Cache-Control': 'private, max-age=300' } });
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ---------- رفع ملف ----------
  const user = await sessionUser(session);
  if (!user) return json({ error: 'unauthorized' }, 401);
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: 'bad_form' }, 400); }
  const file = form.get('file');
  const target = String(form.get('target') || '');
  const targetId = String(form.get('target_id') || '');
  if (!(file instanceof File) || !['homework', 'submission'].includes(target) || !targetId) return json({ error: 'bad_form' }, 400);
  if (file.size > MAX_BYTES) return json({ error: 'too_big' }, 413);
  const name = (file.name || 'file').slice(0, 200);
  const mime = file.type || 'application/octet-stream';

  // 1) صف الملف بجلسة المستخدم: قاعدة البيانات تتحقق من الصلاحية والعدد
  const ins = await rest(`homework_files?select=${FILE_COLS}`, {
    method: 'POST', session,
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ [target === 'homework' ? 'homework_id' : 'submission_id']: targetId, name, mime, size: file.size, data: '', storage: 'drive', uploaded_by: user.id }),
  });
  if (!ins.ok) {
    const t = await ins.text();
    return json({ error: /too_many_files/.test(t) ? 'too_many' : 'forbidden' }, ins.status === 400 && /too_many_files/.test(t) ? 409 : 403);
  }
  const row = (await ins.json())[0];

  // 2) الرفع إلى Drive، ثم تسجيل رقمه (بمفتاح الخادم)؛ وعند الفشل نحذف الصف
  try {
    const driveId = await driveUpload(`${row.id}-${name}`, mime, new Uint8Array(await file.arrayBuffer()));
    const up = await rest(`homework_files?id=eq.${row.id}`, { method: 'PATCH', service: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drive_id: driveId }) });
    if (!up.ok) { await driveDelete(driveId).catch(() => undefined); throw new Error(`db_update: ${up.status}`); }
  } catch (e) {
    await rest(`homework_files?id=eq.${row.id}`, { method: 'DELETE', service: true });
    console.error(String(e));
    later(report(String(e)));
    return json({ error: 'drive_error' }, 502);
  }
  later(report(null));
  later(emptyTrash());
  return json(row);
});
