// اختبارات 031: السلوك والمواظبة — الصلاحيات، شروط التسجيل، الحذف، الإعداد، وإشعار الطالب وولي أمره.
// تُشغَّل على قاعدة بيانات فيها 001–031 والبيانات التجريبية (seed.sql).
//   node supabase/tests/behavior-test.mjs <ملف-مفتاح-anon>
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

SQL('delete from itqan.login_attempts');
SQL(`delete from behavior_records where student_id like 'bs-%'`);
SQL(`insert into users (id,name,role,national_id,password,class_id) values
  ('bs-1','طالب السلوك الأول','student','8101','stud1234',null),
  ('bs-2','طالب السلوك الثاني','student','8102','stud1234',null),
  ('bu-rec','وكيل السلوك','teacher','8200','teach1234',null),
  ('bu-view','مرشد طلابي','teacher','8201','teach1234',null)
  on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,child_ids) values ('bp-1','ولي أمر طالب السلوك','parent','8300','par1234','["bs-1"]') on conflict do nothing`);
SQL(`update users set teacher_permissions='{"can_record_behavior":true}' where id='bu-rec'`);
SQL(`update users set teacher_permissions='{"can_view_behavior":true}' where id='bu-view'`);

const A = await login('1010', 'admin123');
const T = await login('2020', 'teach123');
const R = await login('8200', 'teach1234');
const V = await login('8201', 'teach1234');
const S1 = await login('8101', 'stud1234');
const S2 = await login('8102', 'stud1234');
const P = await login('8300', 'par1234');
ok(A && T && R && V && S1 && S2 && P, 'تسجيل الدخول');

console.log('— الإعداد');
let r = await rpc('itqan_behavior_config', {}, S1);
ok(r.json?.behavior_max == 100 && r.json?.degree_points?.['4'] === 10 && r.json?.catalog?.['5']?.length > 0, 'القيم الافتراضية والقائمة المقترحة');
r = await rpc('itqan_behavior_config', {});
ok(r.json === null, 'الزائر بلا جلسة لا يرى الإعداد');
r = await rpc('itqan_behavior_config_save', { p: { behavior_max: 80 } }, R);
ok(r.status >= 400, 'غير المدير لا يغيّر الإعداد');
r = await rpc('itqan_behavior_config_save', { p: { behavior_max: 80, late_points: 0.5, degree_points: { 1: 1, 2: 2, 3: 4, 4: 10, 5: 15 } } }, A);
ok(r.status < 300, 'المدير يحفظ الإعداد');
r = await rpc('itqan_behavior_config', {}, A);
ok(r.json?.behavior_max == 80 && r.json?.late_points == 0.5 && r.json?.degree_points?.['3'] === 4 && r.json?.absence_points == 1, 'الحفظ الجزئي يغيّر المرسل فقط');
await rpc('itqan_behavior_config_save', { p: { behavior_max: 100, late_points: 0.25, degree_points: { 1: 1, 2: 2, 3: 3, 4: 10, 5: 15 } } }, A);

console.log('— التسجيل');
const rec = (o) => ({ student_id: 'bs-1', day: '2026-09-10', kind: 'violation', degree: 2, title: 'الدخول أو الخروج من الفصل دون استئذان', points: 2, note: '', created_by: 'bu-rec', created_by_name: 'وكيل السلوك', ...o });
r = await req('POST', '/behavior_records', { token: T, body: rec({ created_by: 'u-teach' }) });
ok(r.status >= 400, 'المعلم بلا صلاحية لا يسجّل');
r = await req('POST', '/behavior_records', { token: V, body: rec({ created_by: 'bu-view' }) });
ok(r.status >= 400, 'صلاحية العرض وحدها لا تسمح بالتسجيل');
r = await req('POST', '/behavior_records', { token: R, body: rec({ created_by: 'u-admin' }) });
ok(r.status >= 400, 'لا يسجّل باسم غيره');
r = await req('POST', '/behavior_records', { token: R, body: rec({ degree: null }) });
ok(r.status >= 400, 'المخالفة تتطلب درجة');
r = await req('POST', '/behavior_records', { token: R, body: rec({ kind: 'positive', degree: 3 }) });
ok(r.status >= 400, 'السلوك الإيجابي بلا درجة');
r = await req('POST', '/behavior_records', { token: S1, body: rec({ created_by: 'bs-1' }) });
ok(r.status >= 400, 'الطالب لا يسجّل');
const before = Number(SQL(`select count(*) from notifications where ref_type='behavior' and ref_id='bs-1'`));
r = await req('POST', '/behavior_records', { token: R, body: rec() });
ok(r.status < 300 && r.json?.[0]?.id, 'صاحب الصلاحية يسجّل مخالفة');
const vid = r.json?.[0]?.id;
r = await req('POST', '/behavior_records', { token: R, body: rec({ kind: 'positive', degree: null, title: 'التطوع وخدمة المدرسة', points: 1 }) });
ok(r.status < 300, 'ويسجّل سلوكاً إيجابياً');
const pid = r.json?.[0]?.id;
r = await req('POST', '/behavior_records', { token: A, body: rec({ student_id: 'bs-2', created_by: 'u-admin', degree: 1, points: 1, title: 'النوم داخل الفصل' }) });
ok(r.status < 300, 'المدير يسجّل');
const aid = r.json?.[0]?.id;

console.log('— الإشعار');
const after = Number(SQL(`select count(*) from notifications where ref_type='behavior' and ref_id='bs-1'`));
ok(after === before + 1, 'إشعار واحد للمخالفة ولا إشعار للسلوك الإيجابي');
const aud = JSON.parse(SQL(`select audience from notifications where ref_type='behavior' and ref_id='bs-1' order by created_at desc limit 1`) || '{}');
ok(aud.student_ids?.includes('bs-1') && aud.user_ids?.includes('bp-1'), 'الإشعار يصل للطالب وولي أمره');
await rpc('itqan_behavior_config_save', { p: { notify_parent: false } }, A);
await req('POST', '/behavior_records', { token: R, body: rec({ degree: 1, points: 1, title: 'تجربة بلا إشعار' }) });
ok(Number(SQL(`select count(*) from notifications where ref_type='behavior' and ref_id='bs-1'`)) === after, 'إيقاف الإشعار يعمل');
await rpc('itqan_behavior_config_save', { p: { notify_parent: true } }, A);
r = await req('POST', '/behavior_records', { token: R, body: rec({ student_id: 'R-ghost', title: 'طالب سجل فقط' }) });
ok(r.status < 300, 'التسجيل لطالب «سجل فقط» بلا حساب لا يفشل');

console.log('— العرض');
const ids = (x) => (Array.isArray(x.json) ? x.json : []).map((b) => b.student_id);
r = await req('GET', '/behavior_records?student_id=like.bs-*', { token: S1 });
ok(ids(r).length >= 2 && ids(r).every((s) => s === 'bs-1'), 'الطالب يرى سجله فقط');
r = await req('GET', '/behavior_records?student_id=like.bs-*', { token: S2 });
ok(ids(r).length === 1 && ids(r)[0] === 'bs-2', 'وطالب آخر يرى سجله فقط');
r = await req('GET', '/behavior_records?student_id=like.bs-*', { token: P });
ok(ids(r).length >= 2 && ids(r).every((s) => s === 'bs-1'), 'ولي الأمر يرى سجل ابنه فقط');
r = await req('GET', '/behavior_records?student_id=like.bs-*', { token: V });
ok(new Set(ids(r)).size === 2, 'صاحب صلاحية العرض يرى الجميع');
r = await req('GET', '/behavior_records?student_id=like.bs-*', { token: T });
ok(ids(r).length === 0, 'المعلم بلا صلاحية لا يرى شيئاً');

console.log('— الحذف');
r = await req('DELETE', `/behavior_records?id=eq.${aid}`, { token: R });
ok(Array.isArray(r.json) && r.json.length === 0, 'لا يحذف ما سجّله غيره');
r = await req('DELETE', `/behavior_records?id=eq.${vid}`, { token: V });
ok(Array.isArray(r.json) && r.json.length === 0, 'صلاحية العرض لا تحذف');
r = await req('DELETE', `/behavior_records?id=eq.${vid}`, { token: R });
ok(Array.isArray(r.json) && r.json.length === 1, 'يحذف ما سجّله بنفسه');
r = await req('DELETE', `/behavior_records?id=eq.${pid}`, { token: A });
ok(Array.isArray(r.json) && r.json.length === 1, 'المدير يحذف أي ملاحظة');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
