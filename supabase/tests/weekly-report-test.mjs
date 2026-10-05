// اختبارات 051: التقرير الأسبوعي لولي الأمر (البيانات، الصلاحيات، الإشعار).
// تُشغَّل على قاعدة بيانات فيها 001–051 والبيانات التجريبية (seed.sql).
//   node supabase/tests/weekly-report-test.mjs <ملف-مفتاح-anon>
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
const login = async (id, pw) => (await req('POST', '/rpc/itqan_login', { body: { p_national_id: id, p_password: pw } })).json.token;
const rows = (r) => (Array.isArray(r.json) ? r.json : []);


SQL('delete from itqan.login_attempts');
SQL(`insert into users (id,name,role,national_id,password,class_id,gender) values
  ('wr-s','طالب التقرير','student','9801','stud1234','c1','male'),('wr-s2','طالب آخر','student','9802','stud1234','c1','male') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,child_ids) values ('wr-p','ولي أمر التقرير','parent','9803','par1234','["wr-s"]') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password) values ('wr-t','معلم','teacher','9804','teach1234') on conflict do nothing`);
// الأسبوع: الأحد 2026-09-20 – الخميس 2026-09-24
SQL(`delete from attendance_records where student_id='wr-s'; delete from behavior_records where student_id='wr-s'; delete from student_awards where student_id='wr-s';
  insert into attendance_records (student_id, day, kind) values ('wr-s','2026-09-21','absent'),('wr-s','2026-09-22','late'),('wr-s','2026-09-15','absent');
  insert into quizzes (id,title,teacher_id,status,target_type,class_id,pass_percentage,start_date,end_date,is_deleted) values
    ('wr-q1','اختبار الكسور','wr-t','published','class','c1',50,'2026-09-20 05:00+00','2026-09-21 18:00+00',false),
    ('wr-q2','اختبار الهندسة','wr-t','published','class','c1',50,'2026-09-20 05:00+00','2026-09-23 18:00+00',false),
    ('wr-q3','اختبار فصل آخر','wr-t','published','class','c-other',50,'2026-09-20 05:00+00','2026-09-23 18:00+00',false) on conflict do nothing;
  insert into submissions (id,quiz_id,student_id,percentage,completed_at,status) values
    ('wr-sub1','wr-q1','wr-s',60,'2026-09-21 08:00+00','completed'),('wr-sub2','wr-q1','wr-s',90,'2026-09-21 09:00+00','completed') on conflict do nothing;
  insert into homework (id,class_id,teacher_id,title,due_at,allow_submission) values
    ('wr-h1','c1','wr-t','واجب القراءة','2026-09-22 18:00+00',true),('wr-h2','c1','wr-t','واجب الإملاء','2026-09-23 18:00+00',true) on conflict do nothing;
  insert into homework_submissions (id,homework_id,student_id,submitted_at) values ('wr-hs1','wr-h1','wr-s','2026-09-22 10:00+00') on conflict do nothing;
  insert into behavior_records (student_id,day,kind,title,points) values ('wr-s','2026-09-22','positive','مشاركة متميزة',2),('wr-s','2026-09-23','violation','تأخر عن الحصة',1);
  insert into student_awards (id,student_id,title,points,created_at) values ('wr-aw','wr-s','نجمة الأسبوع',10,'2026-09-22 10:00+00')`);

const A = await login('1010', 'admin123'), S = await login('9801', 'stud1234'), S2 = await login('9802', 'stud1234');
const P = await login('9803', 'par1234'), T = await login('9804', 'teach1234');
ok(A && S && S2 && P && T, 'تسجيل الدخول');

console.log('— بيانات التقرير');
const rep = async (tok, sid = 'wr-s', day = '2026-09-23') => (await req('POST', '/rpc/itqan_weekly_report', { token: tok, body: { p_student: sid, p_day: day } })).json;
const d = await rep(P);
ok(d?.week_start === '2026-09-20' && d?.week_end === '2026-09-24', 'الأسبوع من الأحد إلى الخميس');
ok(d?.absent === 1 && d?.late === 1 && d?.excused === 0, 'الحضور: غياب وتأخر هذا الأسبوع فقط');
ok(d?.quizzes?.length === 1 && d.quizzes[0].pct === 90 && d.quiz_avg === 90, 'أفضل محاولة لكل اختبار ومعدلها');
ok(d?.missed?.length === 1 && d.missed[0].id === 'wr-q2', 'الاختبار الفائت لفصله فقط');
ok(d?.homework_due === 2 && d?.homework_done === 1 && d.homework_missing?.[0] === 'واجب الإملاء', 'الواجبات المسلّمة والناقصة');
ok(d?.behavior_pos === 1 && d?.behavior_neg === 1 && d.behavior_notes.length === 2, 'السلوك');
ok(d?.points === 10 + 18 + 5 + 10, 'النقاط: الاختبار والجوائز');

console.log('— الصلاحيات');
ok((await rep(S))?.student_id === 'wr-s', 'الطالب يرى تقريره');
ok((await rep(S2)) === null, 'طالب آخر لا يراه');
ok((await rep(P, 'wr-s2')) === null, 'ولي الأمر لا يرى غير أبنائه');
ok((await rep(T))?.student_id === 'wr-s', 'المعلم يرى التقرير');
ok((await req('POST', '/rpc/itqan_weekly_report', { body: { p_student: 'wr-s' } })).json === null, 'بلا دخول: لا شيء');
ok((await req('POST', '/rpc/weekly_parent_notify', { token: A, body: {} })).status >= 400, 'الإرسال غير متاح من الواجهة');

console.log('— الإشعار الأسبوعي');
const txt = SQL(`select itqan.weekly_report_text(itqan.weekly_report_data('wr-s','2026-09-23'))`);
ok(/غياب/.test(txt) && /90%/.test(txt) && /اختبار الهندسة/.test(txt) && /سلّم 1 من 2/.test(txt), 'نص الإشعار يلخص الأسبوع');
SQL(`insert into app_settings (key, value) values ('weekly_report', '{"enabled":false}') on conflict (key) do update set value = excluded.value`);
ok(SQL(`select itqan.weekly_parent_notify()`) === 'disabled', 'موقوف من الإعدادات');
SQL(`update app_settings set value = '{"enabled":true}' where key = 'weekly_report'`);
const before = Number(SQL(`select count(*) from notifications where ref_type='weekly_report'`));
ok(/^sent \d+$/.test(SQL(`select itqan.weekly_parent_notify()`)), 'يرسل التقارير');
const n = JSON.parse(SQL(`select row_to_json(x) from (select title, audience, ref_id from notifications where ref_type='weekly_report' and ref_id='wr-s' order by created_at desc limit 1) x`) || '{}');
ok(Number(SQL(`select count(*) from notifications where ref_type='weekly_report'`)) > before && n.audience?.user_ids?.[0] === 'wr-p' && n.title.includes('طالب التقرير'), 'إشعار لولي الأمر باسم ابنه');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
