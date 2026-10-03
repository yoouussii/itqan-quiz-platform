// اختبارات 019: وضع الصيانة — رفض دخول غير المدير، إنهاء الجلسات عند التفعيل، والهوية العامة.
// تُشغَّل على قاعدة بيانات فيها 001–019 والبيانات التجريبية (seed.sql).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const BASE = 'http://localhost:3001';
const ANON = readFileSync(process.argv[2], 'utf8').trim();
const SQL = (q) => execFileSync('psql', ['postgres://postgres:postgres@localhost:54322/postgres', '-tA', '-c', q]).toString().trim();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗ FAIL:', m); };
async function req(method, path, { token, body } = {}) {
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (token) headers['x-itqan-session'] = token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let json; try { json = JSON.parse(t); } catch { json = t; }
  return { status: r.status, json };
}
const rpc = (fn, body, token) => req('POST', `/rpc/${fn}`, { token, body });
const login = (id, pw) => rpc('itqan_login', { p_national_id: id, p_password: pw });

SQL("delete from itqan.login_attempts; delete from app_settings where key = 'maintenance'");
SQL("update users set password='stud12345' where role='student'");
const A = (await login('1010', 'admin123')).json.token;
const T = (await login('2020', 'teach123')).json.token;
ok(!!A && !!T, 'الدخول عادي قبل الصيانة');

console.log('— تفعيل الصيانة');
let r = await req('POST', '/app_settings', { token: T, body: { key: 'maintenance', value: { on: true }, updated_at: new Date().toISOString() } });
ok(r.status >= 400, 'المعلم لا يستطيع تفعيل الصيانة');
r = await req('POST', '/app_settings?on_conflict=key', { token: A, body: { key: 'maintenance', value: { on: true, message: 'تحديث' }, updated_at: new Date().toISOString() } });
ok(r.status < 300, 'المدير يفعّل الصيانة');
r = await req('GET', '/quizzes?select=id', { token: T });
ok(SQL("select count(*) from itqan.sessions s join users u on u.id::text = s.user_id where u.role <> 'admin'") === '0', 'جلسات غير المديرين أُنهيت');
r = await req('GET', '/users?select=id&limit=1', { token: A });
ok(Array.isArray(r.json) && r.json.length === 1, 'جلسة المدير مستمرة');
r = await login('2020', 'teach123');
ok(!r.json?.token && /maintenance/.test(JSON.stringify(r.json)), 'دخول المعلم مرفوض أثناء الصيانة');
r = await login('4040', 'stud12345');
ok(!r.json?.token, 'دخول الطالب مرفوض أثناء الصيانة');
r = await login('1010', 'admin123');
ok(!!r.json?.token, 'المدير يدخل أثناء الصيانة');
r = await rpc('itqan_public_branding', {});
ok(r.json?.maintenance?.on === true && r.json.maintenance.message === 'تحديث', 'الهوية العامة تُظهر وضع الصيانة قبل الدخول');

console.log('— إيقاف الصيانة');
r = await req('PATCH', '/app_settings?key=eq.maintenance', { token: A, body: { value: { on: false }, updated_at: new Date().toISOString() } });
ok(r.status < 300, 'المدير يوقف الصيانة');
r = await login('2020', 'teach123');
ok(!!r.json?.token, 'الدخول يعود بعد إيقاف الصيانة');
r = await rpc('itqan_public_branding', {});
ok(r.json?.maintenance?.on === false, 'الهوية العامة: الصيانة متوقفة');
SQL("delete from app_settings where key = 'maintenance'");

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
