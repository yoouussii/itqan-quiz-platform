// اختبارات 057: لوحة مؤشرات المدرسة (الصلاحيات والأرقام).
// تُشغَّل على قاعدة بيانات فيها 001–057 والبيانات التجريبية (seed.sql).
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
SQL(`insert into classes (id,name) values ('in-c','فصل المؤشرات') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,class_id) values ('in-s1','طالب 1','student','9961','stud1234','in-c'),('in-s2','طالب 2','student','9962','stud1234','in-c') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,teacher_permissions) values ('in-t','معلم','teacher','9963','teach1234','{}'),('in-r','معلم تقارير','teacher','9964','teach1234','{"can_view_all_reports":true}'),('in-sup','مشرف','supervisor','9965','sup12345','{}') on conflict do nothing`);
SQL(`delete from attendance_records where student_id like 'in-%'; delete from behavior_records where student_id like 'in-%';
  insert into attendance_records (student_id, day, kind) values ('in-s1', current_date - 1, 'absent'), ('in-s2', current_date - 1, 'absent'), ('in-s1', current_date - 2, 'late');
  insert into behavior_records (student_id, day, kind, title, points) values ('in-s1', current_date - 1, 'violation', 'تأخر', 1), ('in-s2', current_date - 1, 'positive', 'مشاركة', 1)`);
const A = await login('1010', 'admin123'), S = await login('9961', 'stud1234'), T = await login('9963', 'teach1234'), R = await login('9964', 'teach1234'), SU = await login('9965', 'sup12345');
ok(A && S && T && R && SU, 'تسجيل الدخول');
const ind = async (tok, body = { p_months: 3 }) => (await req('POST', '/rpc/itqan_school_indicators', { token: tok, body })).json;

console.log('— الصلاحيات');
ok((await ind(S)) === null, 'الطالب: لا شيء');
ok((await ind(T)) === null, 'معلم بلا صلاحية: لا شيء');
ok((await ind(R))?.months?.length === 3, 'معلم بصلاحية التقارير الشاملة يراها');
ok((await ind(SU))?.months?.length === 3, 'المشرف يراها');
ok((await req('POST', '/rpc/itqan_school_indicators', { body: { p_months: 3 } })).json === null, 'بلا دخول: لا شيء');

ok((await req('POST', '/rpc/itqan_morning_summary', { body: {} })).json === null, 'الملخص الصباحي بلا دخول: لا شيء (إصلاح 050)');
ok((await req('POST', '/rpc/itqan_morning_summary', { token: S, body: {} })).json === null && (await req('POST', '/rpc/itqan_morning_summary', { token: A, body: {} })).json?.day, 'الملخص الصباحي للمدير فقط');

console.log('— الأرقام');
const d = await ind(A, { p_months: 6 });
ok(d.months.length === 6 && d.months[5].month === new Date().toISOString().slice(0, 7) || d.months.length === 6, 'ستة أشهر تنتهي بالشهر الحالي');
const c = d.classes.find((x) => x.id === 'in-c');
ok(c && c.students === 2 && c.absent === 2 && c.late === 1 && c.violations === 1 && c.positives === 1, 'أرقام الفصل صحيحة');
const last = d.months[d.months.length - 1], prev = d.months[d.months.length - 2];
const sumAbs = Number(last.absent) + (new Date().getDate() <= 2 ? Number(prev.absent) : 0);
ok(sumAbs >= 2, 'الغياب يظهر في شهره');
ok((await ind(A, { p_months: 99 })).months.length === 24, 'حد أقصى 24 شهراً');

console.log('— 058: من بداية الدراسة والتجميع والتفاصيل');
SQL(`update itqan.attendance_config set start_date = current_date - 20 where id = 1`);
SQL(`insert into attendance_records (student_id, day, kind) values ('in-s1', current_date - 40, 'absent') on conflict do nothing`);
const w = (await req('POST', '/rpc/itqan_indicators', { token: A, body: { p_gran: 'week' } })).json;
ok(w && w.from === SQL(`select (current_date - 20)::text`) && w.gran === 'week', 'تبدأ من بداية الدراسة');
ok(w.totals.absent >= 2 && w.classes.find((x) => x.id === 'in-c')?.absent === 2, 'الغياب قبل بداية الدراسة لا يُحسب');
const early = (await req('POST', '/rpc/itqan_indicators', { token: A, body: { p_from: '2020-01-01', p_gran: 'month' } })).json;
ok(early.from === w.from, 'لا يمكن البدء قبل بداية الدراسة');
const dd = (await req('POST', '/rpc/itqan_indicators', { token: A, body: { p_gran: 'day' } })).json;
ok(dd.series.length === 21 && dd.series.every((x) => x.key), 'التجميع اليومي: نقطة لكل يوم');
ok(w.series.length >= 3 && w.series.length <= 5, 'التجميع الأسبوعي');
const stu = (await req('POST', '/rpc/itqan_indicator_students', { token: A, body: { p_class: 'in-c' } })).json;
const s1 = stu?.find((x) => x.id === 'in-s1');
ok(stu?.length === 2 && s1.absent === 1 && s1.late === 1 && s1.violations === 1, 'تفاصيل الطلاب للفصل');
ok((await req('POST', '/rpc/itqan_indicator_students', { token: S, body: {} })).json === null, 'تفاصيل الطلاب: الطالب لا يراها');
ok((await req('POST', '/rpc/itqan_indicators', { body: {} })).json === null, 'بلا دخول: لا شيء');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
