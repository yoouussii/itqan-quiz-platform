// اختبارات 022: الحضور — مطابقة الأسماء، تحويل الأسبوع/اليوم إلى تاريخ، الاستبدال عند المزامنة، الربط اليدوي، رمز الشيت، والصلاحيات.
// تُشغَّل على قاعدة بيانات فيها 001–022 والبيانات التجريبية (seed.sql).
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
SQL(`insert into classes (id,name,grade_level,student_count) values ('c3','ثالث','x',0) on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,class_id) values
  ('s-a','أحمد عبدالرحمن أحمد دواس آل مانع القحطاني','student','7101','stud1234','c3'),
  ('s-b','خلف سعد بن صطام سعد سرحان','student','7102','stud1234','c3'),
  ('s-c','خميس عمر خميس سعد الغامدي','student','7103','stud1234','c3'),
  ('s-d','فاطمة علي الزهراني','student','7104','stud1234','c3'),
  ('s-e','محمد علي العتيبي','student','7105','stud1234','c3'),
  ('s-f','محمد علي العتيبي','student','7106','stud1234','c2'),
  ('u-att','وكيل شؤون الطلاب','teacher','7200','teach1234',null)
  on conflict do nothing`);
SQL(`update users set teacher_permissions='{"can_manage_attendance":true}' where id='u-att'`);

const A = await login('1010', 'admin123');
const T = await login('2020', 'teach123');
const W = await login('7200', 'teach1234');
const S = await login('7101', 'stud1234');
ok(A && T && W && S, 'تسجيل الدخول');

const payload = { sheets: [{ sheet: 'ثالث', students: [
  { name: 'احمد عبد الرحمن احمد دواس ال مانع القحطاني', marks: [[1, 2, 'absent'], [2, 0, 'late']] }, // همزات ومسافات مختلفة
  { name: 'خلف  سعد بن صطام سعد سرحان', marks: [[1, 2, 'absent']] }, // مسافة مضاعفة
  { name: 'خميس عمر الغامدي', marks: [[3, 4, 'excused']] }, // اسم مختصر
  { name: 'فاطمه علي الزهراني', marks: [[1, 0, 'absent']] }, // ة/ه
  { name: 'محمد علي العتيبي', marks: [[1, 1, 'absent']] }, // مكرر في صفين، يُحسم بربط الشيت بالصف
  { name: 'طالب غير موجود نهائياً', marks: [[1, 3, 'absent'], [2, 3, 'late']] },
] }] };

console.log('— الإعداد');
let r = await rpc('itqan_attendance_import', { p_payload: payload }, W);
ok(r.status >= 400 && /no_start_date/.test(JSON.stringify(r.json)), 'لا استيراد قبل تحديد تاريخ بداية الفصل');
r = await rpc('itqan_attendance_config_save', { p: { start_date: '2026-08-23', threshold: 3 } }, T);
ok(r.status >= 400, 'المعلم بلا صلاحية لا يغيّر الإعداد');
r = await rpc('itqan_attendance_config_save', { p: { start_date: '2026-08-23', threshold: 3 } }, W);
ok(r.status < 300, 'صاحب صلاحية إدارة الحضور يحفظ الإعداد');
r = await rpc('itqan_attendance_config', {}, T);
ok(r.json === null, 'المعلم بلا صلاحية لا يرى إعداد الحضور');

console.log('— الاستيراد ومطابقة الأسماء (بدون ربط الشيت بالصف)');
r = await rpc('itqan_attendance_import', { p_payload: payload }, T);
ok(r.status >= 400, 'المعلم بلا صلاحية لا يستورد');
r = await rpc('itqan_attendance_import', { p_payload: payload }, W);
ok(r.json?.matched === 4, `تطابق 4 أسماء رغم اختلاف الكتابة (${r.json?.matched})`);
ok(r.json?.unmatched?.length === 2 && r.json.unmatched.some((u) => u.name === 'محمد علي العتيبي'), 'المكرر في صفين وغير الموجود لا يُطابقان');
ok(SQL(`select string_agg(student_id||':'||day||':'||kind, ',' order by student_id, day) from attendance_records where student_id='s-a'`) === 's-a:2026-08-25:absent,s-a:2026-08-30:late', 'الأسبوع 1 الثلاثاء = 25/8، والأسبوع 2 الأحد = 30/8');
ok(SQL(`select day from attendance_records where student_id='s-c'`) === '2026-09-10', 'الاسم المختصر طوبق (الأسبوع 3 الخميس)');
ok(SQL(`select count(*) from attendance_records where student_id='s-d'`) === '1', 'فاطمه = فاطمة');

console.log('— ربط الشيت بالصف يحسم الأسماء المكررة');
await rpc('itqan_attendance_config_save', { p: { sheet_classes: { 'ثالث': 'c3' } } }, W);
r = await rpc('itqan_attendance_import', { p_payload: payload }, W);
ok(r.json?.matched === 5 && r.json.unmatched.length === 1, 'بعد ربط الشيت بالصف: 5 مطابقات وواحد غير موجود');
ok(SQL(`select count(*) from attendance_records where student_id='s-e'`) === '1' && SQL(`select count(*) from attendance_records where student_id='s-f'`) === '0', 'سُجّل لطالب الصف الصحيح فقط');

console.log('— الاستبدال: إلغاء العلامة في الشيت يحذفها، واليدوي باقٍ');
r = await req('POST', '/attendance_records', { token: W, body: { student_id: 's-a', day: '2026-09-01', kind: 'late', source: 'manual', created_by: 'u-att' } });
ok(r.status < 300, 'تسجيل يدوي من صاحب الصلاحية');
const p2 = JSON.parse(JSON.stringify(payload)); p2.sheets[0].students[0].marks = [[2, 0, 'late']];
await rpc('itqan_attendance_import', { p_payload: p2 }, W);
ok(SQL(`select string_agg(day||':'||kind||':'||source, ',' order by day) from attendance_records where student_id='s-a'`) === '2026-08-30:late:sheet,2026-09-01:late:manual', 'غياب الأسبوع 1 حُذف بعد إلغائه، والتسجيل اليدوي لم يتأثر');

console.log('— الأسماء غير المطابقة والربط اليدوي');
r = await rpc('itqan_attendance_config', {}, W);
ok(r.json?.unmatched?.length === 1 && r.json.unmatched[0].count === 2, 'غير المطابق محفوظ بعلاماته');
ok(r.json?.log?.length >= 3 && r.json.log[0].source === 'upload', 'سجل المزامنة');
r = await rpc('itqan_attendance_link', { p_sheet: 'ثالث', p_name: 'طالب غير موجود نهائياً', p_student_id: 's-c' }, W);
ok(r.json === 2, 'الربط اليدوي طبّق علامتين فوراً');
r = await rpc('itqan_attendance_config', {}, W);
ok(r.json?.unmatched?.length === 0, 'لم يبقَ أسماء غير مطابقة');
r = await rpc('itqan_attendance_import', { p_payload: payload }, W);
ok(r.json?.unmatched?.length === 0 && r.json.matched === 6, 'الربط يُتذكَّر في المزامنات التالية');

console.log('— رمز الربط مع Google Sheets');
r = await rpc('itqan_attendance_import', { p_payload: payload, p_token: 'wrong' }, null);
ok(r.status >= 400 && /invalid_token/.test(JSON.stringify(r.json)), 'رمز خاطئ مرفوض');
r = await rpc('itqan_attendance_new_token', {}, T);
ok(r.status >= 400, 'المعلم بلا صلاحية لا ينشئ رمزاً');
const tok = (await rpc('itqan_attendance_new_token', {}, W)).json;
ok(typeof tok === 'string' && tok.length === 48, 'إنشاء رمز ربط');
ok(!SQL(`select token_hash from itqan.attendance_config`).includes(tok), 'الرمز مخزّن مُجزّأً لا كما هو');
r = await rpc('itqan_attendance_import', { p_payload: payload, p_token: tok }, null);
ok(r.json?.matched === 6, 'المزامنة من الشيت بالرمز بدون تسجيل دخول');
r = await rpc('itqan_attendance_config', {}, W);
ok(r.json?.log?.[0]?.source === 'sheet_sync' && r.json.has_token === true, 'سجل المزامنة يوضح المصدر');

console.log('— من يرى السجل');
r = await req('GET', '/attendance_records?select=student_id', { token: S });
ok(Array.isArray(r.json) && r.json.length > 0 && r.json.every((x) => x.student_id === 's-a'), 'الطالب يرى سجله فقط');
r = await req('GET', '/attendance_records?select=student_id', { token: T });
ok(Array.isArray(r.json) && r.json.length === 0, 'المعلم بلا صلاحية لا يرى السجلات');
r = await req('GET', '/attendance_records?select=student_id', { token: A });
ok(Array.isArray(r.json) && r.json.length >= 7, 'المدير يرى الكل');
r = await req('POST', '/attendance_records', { token: T, body: { student_id: 's-a', day: '2026-09-02', kind: 'absent', source: 'manual', created_by: 'u-teach' } });
ok(r.status >= 400, 'المعلم بلا صلاحية لا يسجل');
r = await req('POST', '/attendance_records', { token: W, body: { student_id: 's-a', day: '2026-09-02', kind: 'absent', source: 'sheet', created_by: 'u-att' } });
ok(r.status >= 400, 'لا يمكن تزوير مصدر «الشيت» يدوياً');
SQL(`update users set teacher_permissions='{"can_view_attendance":true}' where id='u-teach'`);
r = await req('GET', '/attendance_records?select=student_id', { token: T });
ok(Array.isArray(r.json) && r.json.length >= 7, 'صلاحية العرض تكفي لرؤية السجلات');
r = await req('DELETE', `/attendance_records?student_id=eq.s-a`, { token: T });
ok(SQL(`select count(*) from attendance_records where student_id='s-a'`) !== '0', 'صلاحية العرض لا تسمح بالحذف');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
