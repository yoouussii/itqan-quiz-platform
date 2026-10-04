// اختبارات 037: الخطط العلاجية — الصلاحيات، الإشعار، المتابعة والإنهاء.
// تُشغَّل على قاعدة بيانات فيها 001–037 والبيانات التجريبية (seed.sql).
//   node supabase/tests/remedial-test.mjs <ملف-مفتاح-anon>
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
const rpc = (fn, body, token) => req('POST', `/rpc/${fn}`, { token, body: body || {} });
const login = async (id, pw) => (await rpc('itqan_login', { p_national_id: id, p_password: pw })).json.token;
const rows = (r) => (Array.isArray(r.json) ? r.json : []);

SQL('delete from itqan.login_attempts');
SQL(`insert into users (id,name,role,national_id,password) values ('rt-2','معلم آخر','teacher','9902','teach1234'),('rsup','مشرف','supervisor','9903','sup12345') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,class_id) values ('rst','طالب العلاج','student','9904','stud1234','c1'),('rst2','طالب آخر','student','9907','stud1234','c1') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,child_ids) values ('rpar','ولي أمر العلاج','parent','9905','par1234','["rst"]') on conflict do nothing`);

const A = await login('1010', 'admin123');
const T = await login('2020', 'teach123');
const T2 = await login('9902', 'teach1234');
const SU = await login('9903', 'sup12345');
const S = await login('9904', 'stud1234');
const S2 = await login('9907', 'stud1234');
const P = await login('9905', 'par1234');
ok(A && T && T2 && SU && S && S2 && P, 'تسجيل الدخول');

const plan = (o) => ({ student_id: 'rst', subject_id: 's1', outcome: 'جمع الكسور', teacher_id: 'u-teach', teacher_name: 'معلم', start_pct: 35, target_pct: 80, actions: '• تدريبات فردية', due_date: '2026-11-01', ...o });
console.log('— الإنشاء');
let r = await req('POST', '/remedial_plans', { token: S, body: plan({ teacher_id: 'rst' }) });
ok(r.status >= 400, 'الطالب لا ينشئ خطة');
r = await req('POST', '/remedial_plans', { token: SU, body: plan({ teacher_id: 'rsup' }) });
ok(r.status >= 400, 'المشرف لا ينشئ خطة (متابعة فقط)');
r = await req('POST', '/remedial_plans', { token: T, body: plan({ teacher_id: 'rt-2' }) });
ok(r.status >= 400, 'لا ينشئ باسم غيره');
r = await req('POST', '/remedial_plans', { token: T, body: plan({ target_pct: 0 }) });
ok(r.status >= 400, 'الهدف بين 1 و100');
const nb = Number(SQL(`select count(*) from notifications where ref_type='remedial'`));
r = await req('POST', '/remedial_plans', { token: T, body: plan() });
ok(r.status < 300 && rows(r)[0]?.id?.startsWith('rp-'), 'المعلم يفتح خطة');
const pid = rows(r)[0]?.id;
const aud = JSON.parse(SQL(`select audience from notifications where ref_type='remedial' order by created_at desc limit 1`) || '{}');
ok(Number(SQL(`select count(*) from notifications where ref_type='remedial'`)) === nb + 1 && aud.student_ids?.includes('rst') && aud.user_ids?.includes('rpar'), 'إشعار للطالب وولي أمره');

console.log('— العرض');
r = await req('GET', `/remedial_plans?id=eq.${pid}`, { token: S });
ok(rows(r).length === 1, 'الطالب يرى خطته');
r = await req('GET', `/remedial_plans?id=eq.${pid}`, { token: S2 });
ok(rows(r).length === 0, 'طالب آخر لا يراها');
r = await req('GET', `/remedial_plans?id=eq.${pid}`, { token: P });
ok(rows(r).length === 1, 'ولي الأمر يرى خطة ابنه');
r = await req('GET', `/remedial_plans?id=eq.${pid}`, { token: SU });
ok(rows(r).length === 1, 'المشرف يتابع الخطط');

console.log('— المتابعة');
r = await req('PATCH', `/remedial_plans?id=eq.${pid}`, { token: T2, body: { status: 'done' } });
ok(rows(r).length === 0, 'معلم آخر لا يعدّل الخطة');
r = await req('PATCH', `/remedial_plans?id=eq.${pid}`, { token: P, body: { status: 'done' } });
ok(rows(r).length === 0, 'ولي الأمر لا يعدّل الخطة');
r = await req('PATCH', `/remedial_plans?id=eq.${pid}`, { token: T, body: { notes: [{ at: '2026-10-10', by: 'معلم', note: 'تحسّن ملحوظ' }] } });
ok(rows(r)[0]?.notes?.length === 1, 'صاحب الخطة يضيف ملاحظة متابعة');
r = await req('PATCH', `/remedial_plans?id=eq.${pid}`, { token: T, body: { status: 'done', closed_at: new Date().toISOString() } });
ok(rows(r)[0]?.status === 'done', 'وينهي الخطة');
r = await req('PATCH', `/remedial_plans?id=eq.${pid}`, { token: T, body: { status: 'paused' } });
ok(r.status >= 400, 'حالة غير صحيحة تُرفض');
r = await req('DELETE', `/remedial_plans?id=eq.${pid}`, { token: T2 });
ok(rows(r).length === 0, 'معلم آخر لا يحذف');
r = await req('DELETE', `/remedial_plans?id=eq.${pid}`, { token: A });
ok(rows(r).length === 1, 'المدير يحذف');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
