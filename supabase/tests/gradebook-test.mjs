// اختبارات 033: كشف الدرجات — أوزان الاختبارات، الأعمدة اليدوية ودرجاتها، والصلاحيات.
// تُشغَّل على قاعدة بيانات فيها 001–033 والبيانات التجريبية (seed.sql).
//   node supabase/tests/gradebook-test.mjs <ملف-مفتاح-anon>
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const BASE = 'http://localhost:3001';
const ANON = readFileSync(process.argv[2], 'utf8').trim();
const SQL = (q) => execFileSync('psql', ['postgres://postgres:postgres@localhost:54322/postgres', '-tA', '-c', q]).toString().trim();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗ FAIL:', m); };
async function req(method, path, { token, body, prefer } = {}) {
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: prefer || 'return=representation' };
  if (token) headers['x-itqan-session'] = token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let json; try { json = JSON.parse(t); } catch { json = t; }
  return { status: r.status, json };
}
const rpc = (fn, body, token) => req('POST', `/rpc/${fn}`, { token, body: body || {} });
const login = async (id, pw) => (await rpc('itqan_login', { p_national_id: id, p_password: pw })).json.token;
const rows = (r) => (Array.isArray(r.json) ? r.json : []);

SQL('delete from itqan.login_attempts');
SQL(`insert into users (id,name,role,national_id,password) values ('gt-2','معلم آخر','teacher','9702','teach1234'),('gsup','مشرف','supervisor','9703','sup12345') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,class_id) values ('gst','طالب الكشف','student','9704','stud1234','c1') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,child_ids) values ('gpar','ولي أمر الكشف','parent','9705','par1234','["gst"]') on conflict do nothing`);
SQL(`insert into quizzes (id,title,status,teacher_id,created_by,subject_id) values ('gq-1','اختبار المعلم','published','u-teach','u-teach','s1') on conflict do nothing`);

const A = await login('1010', 'admin123');
const T = await login('2020', 'teach123');
const T2 = await login('9702', 'teach1234');
const SU = await login('9703', 'sup12345');
const S = await login('9704', 'stud1234');
const P = await login('9705', 'par1234');
ok(A && T && T2 && SU && S && P, 'تسجيل الدخول');

console.log('— أوزان الاختبارات');
const upsert = (tok, body) => req('POST', '/gradebook_weights', { token: tok, body, prefer: 'resolution=merge-duplicates,return=representation' });
let r = await upsert(T2, { quiz_id: 'gq-1', weight: 3, updated_by: 'gt-2' });
ok(r.status >= 400, 'معلم آخر لا يغيّر وزن اختبار غيره');
r = await upsert(T, { quiz_id: 'gq-1', weight: 2, updated_by: 'u-teach' });
ok(r.status < 300, 'صاحب الاختبار يحدد الوزن');
r = await upsert(T, { quiz_id: 'gq-1', weight: 0.5, updated_by: 'u-teach' });
ok(r.status < 300 && SQL(`select weight from gradebook_weights where quiz_id='gq-1'`) === '0.50', 'ويعدّله');
r = await upsert(A, { quiz_id: 'gq-1', weight: 1.5, updated_by: 'u-admin' });
ok(r.status < 300, 'المدير يعدّل أي وزن');
r = await upsert(T, { quiz_id: 'gq-1', weight: 200, updated_by: 'u-teach' });
ok(r.status >= 400, 'الوزن بين 0 و100');
r = await req('GET', '/gradebook_weights?quiz_id=eq.gq-1', { token: SU });
ok(rows(r).length === 1, 'المشرف يقرأ الأوزان');
r = await req('GET', '/gradebook_weights?quiz_id=eq.gq-1', { token: S });
ok(rows(r).length === (SQL(`select to_regproc('itqan.family_class_ids') is not null`) === 't' ? 1 : 0), 'الطالب يقرأ الأوزان بعد 035 فقط (قراءة)');

console.log('— الأعمدة اليدوية');
r = await req('POST', '/gradebook_columns', { token: S, body: { class_id: 'c1', subject_id: 's1', title: 'x', created_by: 'gst' } });
ok(r.status >= 400, 'الطالب لا يضيف عموداً');
r = await req('POST', '/gradebook_columns', { token: SU, body: { class_id: 'c1', subject_id: 's1', title: 'x', created_by: 'gsup' } });
ok(r.status >= 400, 'المشرف لا يضيف عموداً');
r = await req('POST', '/gradebook_columns', { token: T, body: { class_id: 'c1', subject_id: 's1', title: 'المشاركة', max_score: 10, weight: 1, created_by: 'gt-2' } });
ok(r.status >= 400, 'لا يضيف باسم غيره');
r = await req('POST', '/gradebook_columns', { token: T, body: { class_id: 'c1', subject_id: 's1', title: 'المشاركة', max_score: 10, weight: 1, created_by: 'u-teach' } });
ok(r.status < 300 && rows(r)[0]?.id?.startsWith('gc-'), 'المعلم يضيف عموداً');
const col = rows(r)[0]?.id;
r = await req('PATCH', `/gradebook_columns?id=eq.${col}`, { token: T2, body: { weight: 5 } });
ok(rows(r).length === 0, 'معلم آخر لا يعدّل العمود');
r = await req('PATCH', `/gradebook_columns?id=eq.${col}`, { token: T, body: { weight: 2 } });
ok(rows(r).length === 1, 'صاحب العمود يعدّله');

console.log('— الدرجات');
const mark = (tok, body) => req('POST', '/gradebook_marks', { token: tok, body, prefer: 'resolution=merge-duplicates,return=representation' });
r = await mark(T2, { column_id: col, student_id: 'gst', score: 9, updated_by: 'gt-2' });
ok(r.status >= 400, 'معلم آخر لا يرصد في عمود غيره');
r = await mark(T, { column_id: col, student_id: 'gst', score: 8, updated_by: 'u-teach' });
ok(r.status < 300, 'صاحب العمود يرصد');
r = await mark(T, { column_id: col, student_id: 'gst', score: 9.5, updated_by: 'u-teach' });
ok(r.status < 300 && SQL(`select score from gradebook_marks where column_id='${col}'`) === '9.50', 'ويعدّل الدرجة');
r = await mark(T, { column_id: col, student_id: 'gst', score: -1, updated_by: 'u-teach' });
ok(r.status >= 400, 'لا درجات سالبة');
r = await req('GET', `/gradebook_marks?column_id=eq.${col}`, { token: SU });
ok(rows(r).length === 1, 'المشرف يقرأ الدرجات');
r = await req('GET', `/gradebook_marks?column_id=eq.${col}`, { token: P });
ok(rows(r).length === (SQL(`select to_regproc('itqan.family_class_ids') is not null`) === 't' ? 1 : 0), 'ولي الأمر يقرأ درجة ابنه فقط (بعد 035)');
r = await req('DELETE', `/gradebook_columns?id=eq.${col}`, { token: T2 });
ok(rows(r).length === 0, 'معلم آخر لا يحذف العمود');
r = await req('DELETE', `/gradebook_columns?id=eq.${col}`, { token: A });
ok(rows(r).length === 1 && SQL(`select count(*) from gradebook_marks where column_id='${col}'`) === '0', 'المدير يحذف العمود ودرجاته معه');

console.log('— الطالب وولي الأمر (035)');
const has035 = SQL(`select to_regproc('itqan.family_class_ids') is not null`) === 't';
if (has035) {
  r = await req('POST', '/gradebook_columns', { token: T, body: { class_id: 'c1', subject_id: 's1', title: 'الواجبات', max_score: 10, weight: 1, created_by: 'u-teach' } });
  const col2 = rows(r)[0]?.id;
  r = await req('POST', '/gradebook_columns', { token: T, body: { class_id: 'c2', subject_id: 's1', title: 'فصل آخر', max_score: 10, weight: 1, created_by: 'u-teach' } });
  const col3 = rows(r)[0]?.id;
  await mark(T, { column_id: col2, student_id: 'gst', score: 7, updated_by: 'u-teach' });
  SQL(`insert into users (id,name,role,national_id,password,class_id) values ('gst2','طالب آخر','student','9706','stud1234','c1') on conflict do nothing`);
  await mark(T, { column_id: col2, student_id: 'gst2', score: 3, updated_by: 'u-teach' });
  r = await req('GET', `/gradebook_marks?column_id=eq.${col2}`, { token: P });
  ok(rows(r).length === 1 && rows(r)[0].student_id === 'gst', 'ولي الأمر يقرأ درجة ابنه فقط');
  r = await req('GET', `/gradebook_marks?column_id=eq.${col2}`, { token: S });
  ok(rows(r).length === 1 && rows(r)[0].student_id === 'gst', 'الطالب يقرأ درجته فقط');
  r = await req('GET', '/gradebook_columns?subject_id=eq.s1', { token: P });
  ok(rows(r).some((c) => c.id === col2) && !rows(r).some((c) => c.id === col3), 'ولي الأمر يرى أعمدة فصل ابنه فقط');
  r = await req('GET', '/gradebook_weights?quiz_id=eq.gq-1', { token: P });
  ok(rows(r).length === 1, 'ولي الأمر يقرأ الأوزان');
  r = await mark(P, { column_id: col2, student_id: 'gst', score: 10, updated_by: 'gpar' });
  ok(r.status >= 400, 'ولي الأمر لا يعدّل الدرجات');
  r = await req('PATCH', `/gradebook_columns?id=eq.${col2}`, { token: S, body: { weight: 0 } });
  ok(rows(r).length === 0, 'الطالب لا يعدّل الأعمدة');
}

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
