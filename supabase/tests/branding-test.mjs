// اختبارات هوية المدرسة (012) على نسخة محلية من قاعدة البيانات.
// التشغيل: نفس إعداد security-test.mjs، ثم 004 ← 012، ثم:
//   node supabase/tests/branding-test.mjs <ملف-مفتاح-anon>
import { readFileSync } from 'node:fs';
const BASE = 'http://localhost:3001';
const ANON = readFileSync(process.argv[2], 'utf8').trim();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } };
async function req(method, path, { token, body, prefer } = {}) {
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };
  if (token) headers['x-itqan-session'] = token;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
const rpc = (fn, body, token) => req('POST', `/rpc/${fn}`, { token, body });
const login = async (id, pw) => (await rpc('itqan_login', { p_national_id: id, p_password: pw })).json?.token;

const admin = await login('1010', 'admin123');
const teacher = await login('2020', 'teach123');
ok(admin && teacher, 'دخول المدير والمعلم');

let r = await req('POST', '/app_settings', { token: admin, prefer: 'resolution=merge-duplicates', body: [
  { key: 'school_name', value: 'مدارس التجربة' }, { key: 'brand_color', value: 'green' },
  { key: 'school_logo', value: 'data:image/png;base64,AAAA' }, { key: 'require_quiz_approval', value: false }] });
ok(r.status < 300, 'المدير يحفظ اسم المدرسة وشعارها ولونها');

r = await rpc('itqan_public_branding', {});
ok(r.status === 200 && r.json?.school_name === 'مدارس التجربة' && r.json?.brand_color === 'green' && r.json?.school_logo?.startsWith('data:'), 'شاشة الدخول (بدون جلسة) تقرأ الهوية');
ok(r.json && !('require_quiz_approval' in r.json), 'ولا تكشف باقي الإعدادات');

r = await req('GET', '/app_settings?select=key');
ok(Array.isArray(r.json) && r.json.length === 0, 'جدول الإعدادات نفسه لا يُقرأ بدون جلسة');

r = await req('POST', '/app_settings', { token: teacher, prefer: 'resolution=merge-duplicates', body: [{ key: 'school_name', value: 'اختراق' }] });
const after = (await rpc('itqan_public_branding', {})).json;
ok(r.status >= 400 && after?.school_name === 'مدارس التجربة', 'المعلم لا يغيّر هوية المدرسة');
r = await req('POST', '/app_settings', { body: [{ key: 'school_name', value: 'اختراق' }] });
ok(r.status >= 400, 'ولا يغيّرها أحد بدون تسجيل دخول');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
