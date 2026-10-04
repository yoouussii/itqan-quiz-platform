// اختبارات 032: إدارة العام الدراسي — ترحيل الطلاب دفعة واحدة، التخريج، الأرشفة، بدء سجل جديد، السجل، ومساحة قاعدة البيانات.
// تُشغَّل على قاعدة بيانات فيها 001–032 والبيانات التجريبية (seed.sql).
//   node supabase/tests/school-year-test.mjs <ملف-مفتاح-anon>
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
SQL(`insert into classes (id,name,grade_level,student_count) values ('y3','الثالث / أ','x',0),('y4','الرابع / أ','x',0),('y5','الخامس / أ','x',0),('yk','نادي','x',0) on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,class_id) values
  ('ys-3a','طالب ثالث ١','student','9301','stud1234','y3'),('ys-3b','طالب ثالث ٢','student','9302','stud1234','y3'),
  ('ys-4a','طالب رابع','student','9401','stud1234','y4'),('ys-5a','طالب خامس','student','9501','stud1234','y5'),
  ('ys-k','طالب النادي','student','9601','stud1234','yk')
  on conflict do nothing`);
SQL(`insert into quizzes (id,title,status,is_deleted) values ('yq-pub','منشور','published',false),('yq-dr','مسودة','draft',false) on conflict do nothing`);
SQL(`insert into submissions (id,quiz_id,student_id,score) values ('ysub','yq-pub','ys-3a',5) on conflict do nothing`);
SQL(`insert into behavior_records (student_id,kind,degree,title,points) values ('ys-3a','violation',1,'x',1)`);
SQL(`update itqan.attendance_config set start_date='2026-08-23' where id=1`);
SQL(`insert into attendance_records (student_id, day, kind) values ('ys-3a','2026-09-01','absent') on conflict do nothing`);

const A = await login('1010', 'admin123');
const T = await login('2020', 'teach123');
ok(A && T, 'تسجيل الدخول');

console.log('— الصلاحيات');
let r = await rpc('itqan_year_rollover', { p: { map: { y3: 'y4' } } }, T);
ok(r.status >= 400, 'المعلم لا يرحّل');
r = await rpc('itqan_db_usage', {}, T);
ok(r.json === null, 'المعلم لا يرى مساحة قاعدة البيانات');
r = await rpc('itqan_year_history', {}, T);
ok(r.json === null, 'المعلم لا يرى سجل الترحيل');
r = await rpc('itqan_year_rollover', { p: { map: { y3: 'nope' } } }, A);
ok(r.status >= 400 && /unknown_class/.test(JSON.stringify(r.json)), 'وجهة غير موجودة تُرفض');
ok(SQL(`select class_id from users where id='ys-3a'`) === 'y3', 'الرفض لا يغيّر شيئاً');

console.log('— مساحة قاعدة البيانات');
r = await rpc('itqan_db_usage', {}, A);
ok(r.json?.db_bytes > 0 && Array.isArray(r.json?.tables) && r.json.tables.some((x) => x.name === 'users'), 'الحجم الكلي وأكبر الجداول');

console.log('— الترحيل');
r = await rpc('itqan_year_rollover', { p: { label: '2026–2027', map: { y3: 'y4', y4: 'y5', y5: '' }, archive_quizzes: true, clear_attendance: true, clear_behavior: true } }, A);
ok(r.status < 300, 'المدير يرحّل');
ok(r.json?.moved === 3 && r.json?.graduated === 1, `الملخص: انتقل 3 وتخرّج 1 (${JSON.stringify(r.json)})`);
const cls = (id) => SQL(`select coalesce(class_id,'∅') from users where id='${id}'`);
ok(cls('ys-3a') === 'y4' && cls('ys-3b') === 'y4', 'الثالث ← الرابع');
ok(cls('ys-4a') === 'y5', 'الرابع ← الخامس (في نفس العملية، لا يُرحَّل مرتين)');
ok(cls('ys-5a') === '∅', 'الخامس تخرّج بلا فصل');
ok(cls('ys-k') === 'yk', 'فصل غير مذكور يبقى كما هو');
ok(SQL(`select student_count from classes where id='y4'`) === '2' && SQL(`select student_count from classes where id='y3'`) === '0', 'تحديث عدد طلاب الفصول');
ok(SQL(`select status from quizzes where id='yq-pub'`) === 'archived' && SQL(`select status from quizzes where id='yq-dr'`) === 'draft', 'أرشفة المنشور فقط');
ok(SQL(`select count(*) from submissions where id='ysub'`) === '1', 'النتائج السابقة باقية');
ok(SQL(`select count(*) from attendance_records`) === '0' && SQL(`select coalesce(start_date::text,'∅') from itqan.attendance_config`) === '∅', 'سجل حضور جديد');
ok(SQL(`select count(*) from behavior_records`) === '0', 'سجل سلوك جديد');

console.log('— السجل والخيارات');
r = await rpc('itqan_year_history', {}, A);
ok(Array.isArray(r.json) && r.json[0]?.label === '2026–2027' && r.json[0]?.summary?.graduated === 1, 'سجل الترحيلات');
SQL(`insert into behavior_records (student_id,kind,degree,title,points) values ('ys-3a','violation',1,'y',1)`);
r = await rpc('itqan_year_rollover', { p: { map: {}, archive_quizzes: false, clear_attendance: false, clear_behavior: false } }, A);
ok(r.status < 300 && r.json?.moved === 0 && SQL(`select count(*) from behavior_records`) === '1', 'بدون خيارات لا يُحذف شيء');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
