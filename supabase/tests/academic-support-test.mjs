// اختبارات 042: الدعم الأكاديمي (الصلاحيات، المستويات، الإشعارات) وملاحظات الحضور.
// تُشغَّل على قاعدة بيانات فيها 001–042 والبيانات التجريبية (seed.sql).
//   node supabase/tests/academic-support-test.mjs <ملف-مفتاح-anon>
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
SQL(`insert into users (id,name,role,national_id,password,teacher_permissions) values
  ('as-t','معلم الدعم','teacher','9701','teach1234','{"can_academic_support":true}'),
  ('as-t2','معلم بلا صلاحية','teacher','9702','teach1234','{}'),
  ('as-t3','معلم دعم آخر','teacher','9708','teach1234','{"can_academic_support":true}'),
  ('as-sup','مشرف الدعم','supervisor','9703','sup12345','{"can_academic_support":true}'),
  ('as-n','كاتب ملاحظات','teacher','9709','teach1234','{"can_note_attendance":true}'),
  ('as-cat','مسؤول مواد الدعم','teacher','9710','teach1234','{"can_manage_acs_catalog":true}') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,class_id) values ('as-s','طالب الدعم','student','9704','stud1234','c1'),('as-s2','طالب آخر','student','9707','stud1234','c1') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,child_ids) values ('as-p','ولي أمر الدعم','parent','9705','par1234','["as-s"]') on conflict do nothing`);

const A = await login('1010', 'admin123');
const T = await login('9701', 'teach1234'), T2 = await login('9702', 'teach1234'), T3 = await login('9708', 'teach1234');
const SU = await login('9703', 'sup12345'), S = await login('9704', 'stud1234'), S2 = await login('9707', 'stud1234');
const P = await login('9705', 'par1234'), N = await login('9709', 'teach1234');
ok(A && T && T2 && T3 && SU && S && S2 && P && N, 'تسجيل الدخول');

console.log('— الإضافة');
const rec = (o) => ({ student_id: 'as-s', teacher_id: 'as-t', teacher_name: 'معلم الدعم', subject_id: 's1', start_level: 40, target_level: 80, plan: 'حصتان أسبوعياً', ...o });
let r = await req('POST', '/academic_support', { token: T2, body: rec({ teacher_id: 'as-t2' }) });
ok(r.status >= 400, 'معلم بلا صلاحية لا يضيف');
r = await req('POST', '/academic_support', { token: S, body: rec({ teacher_id: 'as-s' }) });
ok(r.status >= 400, 'الطالب لا يضيف');
r = await req('POST', '/academic_support', { token: T, body: rec({ teacher_id: 'as-t3' }) });
ok(r.status >= 400, 'لا يضيف باسم غيره');
r = await req('POST', '/academic_support', { token: T, body: rec({ student_id: 'u-teach' }) });
ok(r.status >= 400, 'لا يُضاف إلا طالب');
const nb = Number(SQL(`select count(*) from notifications where ref_type='academic_support'`));
r = await req('POST', '/academic_support', { token: T, body: rec({ current_level: 99, status: 'done' }) });
const id = rows(r)[0]?.id;
ok(r.status < 300 && id?.startsWith('as-') && rows(r)[0].current_level === 40 && rows(r)[0].status === 'active', 'معلم الدعم يضيف (الحالي = الاستلام، والحالة نشطة)');
const aud = JSON.parse(SQL(`select audience from notifications where ref_type='academic_support' order by created_at desc limit 1`) || '{}');
ok(Number(SQL(`select count(*) from notifications where ref_type='academic_support'`)) === nb + 1 && aud.student_ids?.includes('as-s') && aud.user_ids?.includes('as-p'), 'إشعار للطالب وولي أمره');

console.log('— العرض');
ok(rows(await req('GET', `/academic_support?id=eq.${id}`, { token: S })).length === 1, 'الطالب يرى سجله');
ok(rows(await req('GET', `/academic_support?id=eq.${id}`, { token: P })).length === 1, 'ولي الأمر يرى سجل ابنه');
ok(rows(await req('GET', `/academic_support?id=eq.${id}`, { token: S2 })).length === 0, 'طالب آخر لا يراه');
ok(rows(await req('GET', `/academic_support?id=eq.${id}`, { token: T3 })).length === 0, 'معلم دعم آخر لا يرى طلاب غيره');
ok(rows(await req('GET', `/academic_support?id=eq.${id}`, { token: T2 })).length === 0, 'معلم بلا صلاحية لا يراه');
ok(rows(await req('GET', `/academic_support?id=eq.${id}`, { token: SU })).length === 1, 'المشرف صاحب الصلاحية يرى الكل');
ok(rows(await req('GET', `/academic_support?id=eq.${id}`, { token: A })).length === 1, 'المدير يرى الكل');

console.log('— القياسات');
r = await req('POST', '/academic_support_progress', { token: T3, body: { support_id: id, level: 90, created_by: 'as-t3' } });
ok(r.status >= 400, 'معلم آخر لا يسجل قياساً');
r = await req('POST', '/academic_support_progress', { token: S, body: { support_id: id, level: 100, created_by: 'as-s' } });
ok(r.status >= 400, 'الطالب لا يسجل قياساً');
r = await req('POST', '/academic_support_progress', { token: T, body: { support_id: id, level: 55, note: 'تحسن في الكسور', at: '2026-10-01', created_by: 'as-t' } });
ok(r.status < 300 && SQL(`select current_level from academic_support where id='${id}'`) === '55', 'قياس جديد يحدّث المستوى الحالي');
r = await req('POST', '/academic_support_progress', { token: T, body: { support_id: id, level: 70, at: '2026-10-08', created_by: 'as-t' } });
const pid = rows(r)[0]?.id;
ok(SQL(`select current_level from academic_support where id='${id}'`) === '70', 'آخر قياس (بالتاريخ) هو الحالي');
ok(Number(SQL(`select count(*) from notifications where ref_type='academic_support' and title like '%قياس%'`)) >= 2, 'إشعار عند كل قياس');
ok(rows(await req('GET', `/academic_support_progress?support_id=eq.${id}`, { token: P })).length === 2, 'ولي الأمر يرى القياسات');
await req('DELETE', `/academic_support_progress?id=eq.${pid}`, { token: T });
ok(SQL(`select current_level from academic_support where id='${id}'`) === '55', 'حذف قياس يعيد الحالي للسابق');

console.log('— الملاحظات والتقييمات اليومية');
r = await req('POST', '/academic_support_progress', { token: T, body: { support_id: id, rating: 'very_good', note: 'حل تمارين الكسور بشكل صحيح', at: '2026-10-09', created_by: 'as-t' } });
ok(r.status < 300 && rows(r)[0]?.level === null, 'ملاحظة بتقييم بلا مستوى');
ok(SQL(`select current_level from academic_support where id='${id}'`) === '55', 'الملاحظة لا تغيّر المستوى الحالي');
ok(SQL(`select body from notifications where ref_type='academic_support' order by created_at desc limit 1`).includes('جيد جداً'), 'إشعار الملاحظة يذكر التقييم');
r = await req('POST', '/academic_support_progress', { token: T, body: { support_id: id, note: '', created_by: 'as-t' } });
ok(r.status >= 400, 'لا يُحفظ إدخال فارغ');
r = await req('POST', '/academic_support_progress', { token: T, body: { support_id: id, rating: 'bad', created_by: 'as-t' } });
ok(r.status >= 400, 'تقييم غير معروف مرفوض');
SQL(`insert into itqan.attendance_config (id, start_date) values (1, '2026-08-23') on conflict (id) do update set start_date = excluded.start_date`);
r = await req('POST', '/rpc/itqan_school_calendar', { token: P, body: {} });
ok(r.json?.start_date === '2026-08-23', 'تاريخ بداية الفصل متاح لولي الأمر (لحساب الأسبوع)');
ok((await req('POST', '/rpc/itqan_school_calendar', { body: {} })).json === null, 'بلا دخول: لا شيء');

console.log('— الحماية');
await req('PATCH', `/academic_support?id=eq.${id}`, { token: T, body: { start_level: 90, current_level: 100, student_id: 'as-s2' } });
ok(SQL(`select start_level||'|'||current_level||'|'||student_id from academic_support where id='${id}'`) === '40|55|as-s', 'الاستلام والحالي والطالب ثابتة');
await req('PATCH', `/academic_support?id=eq.${id}`, { token: T3, body: { plan: 'تلاعب' } });
ok(SQL(`select plan from academic_support where id='${id}'`) === 'حصتان أسبوعياً', 'معلم آخر لا يعدّل');
await req('PATCH', `/academic_support?id=eq.${id}`, { token: T, body: { status: 'done', target_level: 75 } });
ok(SQL(`select status||'|'||(closed_at is not null)||'|'||target_level from academic_support where id='${id}'`) === 'done|true|75', 'إنهاء البرنامج يسجل تاريخه');

console.log('— ملاحظات الحضور');
SQL(`insert into attendance_records (student_id, day, kind, source) values ('as-s','2026-10-04','absent','sheet') on conflict do nothing`);
const note = { student_id: 'as-s', day: '2026-10-04', kind: 'absent', note: 'اعتذر ولي الأمر: مراجعة طبية', visible_to_parent: true };
r = await req('POST', '/attendance_notes', { token: T2, body: { ...note, created_by: 'as-t2' } });
ok(r.status >= 400, 'بلا صلاحية: لا ملاحظة');
ok(rows(await req('GET', `/attendance_records?student_id=eq.as-s`, { token: N })).length >= 1, 'صاحب صلاحية الملاحظات يرى سجل الحضور');
r = await req('POST', '/attendance_notes', { token: N, body: { ...note, created_by: 'as-n', created_by_name: 'كاتب ملاحظات' } });
const nid = rows(r)[0]?.id;
ok(r.status < 300 && nid, 'صاحب الصلاحية يسجل ملاحظة');
ok(rows(await req('GET', `/attendance_notes?student_id=eq.as-s`, { token: P })).length === 1, 'ولي الأمر يرى الملاحظة المسموح بها');
await req('PATCH', `/attendance_notes?id=eq.${nid}`, { token: N, body: { visible_to_parent: false } });
ok(rows(await req('GET', `/attendance_notes?student_id=eq.as-s`, { token: P })).length === 0, 'الملاحظة الداخلية لا تظهر لولي الأمر');
ok(rows(await req('GET', `/attendance_notes?student_id=eq.as-s`, { token: A })).length === 1, 'المدير يراها');
// المزامنة تحذف سجلات الشيت وتعيدها: الملاحظة تبقى
SQL(`delete from attendance_records where student_id='as-s' and source='sheet'`);
SQL(`insert into attendance_records (student_id, day, kind, source) values ('as-s','2026-10-04','absent','sheet')`);
ok(SQL(`select count(*) from attendance_notes where student_id='as-s'`) === '1', 'الملاحظة تبقى بعد مزامنة سجل الغياب');
await req('DELETE', `/attendance_notes?id=eq.${nid}`, { token: T2 });
ok(SQL(`select count(*) from attendance_notes where id=${nid}`) === '1', 'بلا صلاحية: لا حذف');
await req('DELETE', `/attendance_notes?id=eq.${nid}`, { token: N });
ok(SQL(`select count(*) from attendance_notes where id=${nid}`) === '0', 'صاحب الصلاحية يحذف');

console.log('— مواد وفصول الدعم (047)');
SQL(`delete from academic_support where acs_class_id is not null; delete from acs_classes where true; delete from acs_subjects where true`);
const CAT = await login('9710', 'teach1234');
r = await req('POST', '/acs_subjects', { token: T2, body: { name: 'مهارات القراءة', created_by: 'as-t2' } });
ok(r.status >= 400, 'معلم بلا صلاحية الدعم لا ينشئ مادة دعم');
r = await req('POST', '/acs_subjects', { token: T, body: { name: 'مهارات القراءة', created_by: 'as-t3' } });
ok(r.status >= 400, 'معلم الدعم لا ينشئ مادة باسم غيره');
r = await req('POST', '/acs_subjects', { token: CAT, body: { name: 'مهارات القراءة' } });
const sub = rows(r)[0]?.id;
ok(r.status < 300 && sub, 'صاحب صلاحية إدارة المواد ينشئ مادة دعم');
r = await req('POST', '/acs_subjects', { token: A, body: { name: ' مهارات القراءة ' } });
ok(r.status >= 400, 'لا تتكرر أسماء مواد الدعم');
r = await req('POST', '/acs_classes', { token: A, body: { name: 'مجموعة القراءة 1', subject_id: sub, teacher_id: 'as-t' } });
const grp = rows(r)[0]?.id;
ok(r.status < 300 && grp, 'المدير ينشئ فصل دعم');
ok(rows(await req('GET', '/acs_classes?select=id', { token: S })).length === 1, 'الطالب يقرأ أسماء فصول الدعم (لبطاقته)');
r = await req('PATCH', `/acs_classes?id=eq.${grp}`, { token: T3, body: { name: 'تغيير' } });
ok(SQL(`select name from acs_classes where id='${grp}'`) === 'مجموعة القراءة 1', 'معلم دعم لا يعدّل فصل معلم آخر');
r = await req('PATCH', `/acs_classes?id=eq.${grp}`, { token: T, body: { teacher_id: 'as-t3' } });
ok(SQL(`select teacher_id from acs_classes where id='${grp}'`) === 'as-t', 'معلم الدعم لا ينقل فصله لمعلم آخر');
r = await req('POST', '/academic_support', { token: T, body: rec({ student_id: 'as-s2', subject_id: null, acs_subject_id: sub, acs_class_id: grp }) });
ok(r.status < 300 && rows(r)[0]?.acs_class_id === grp, 'معلم الدعم يضيف طالباً بمادة وفصل الدعم');
ok(/مهارات القراءة/.test(SQL(`select body from notifications where ref_type='academic_support' and body like '%طالب آخر%' order by created_at desc limit 1`)) && /مجموعة القراءة 1/.test(SQL(`select body from notifications where ref_type='academic_support' and body like '%طالب آخر%' order by created_at desc limit 1`)), 'إشعار الانضمام يذكر مادة الدعم وفصله');
await req('DELETE', `/acs_classes?id=eq.${grp}`, { token: CAT });
ok(SQL(`select count(*) from academic_support where student_id='as-s2'`) === '1' && SQL(`select coalesce(acs_class_id,'null') from academic_support where student_id='as-s2'`) === 'null', 'حذف فصل الدعم يزيل الارتباط ولا يحذف سجل الطالب');

console.log('— المعلم ينشئ فصله ومادته (049)');
r = await req('POST', '/acs_subjects', { token: T3, body: { name: 'الحساب الذهني', created_by: 'as-t3' } });
const sub3 = rows(r)[0]?.id;
ok(r.status < 300 && sub3, 'معلم الدعم ينشئ مادة دعم');
r = await req('POST', '/acs_classes', { token: T3, body: { name: 'مجموعة الحساب', subject_id: sub3, teacher_id: 'as-t', created_by: 'as-t3' } });
ok(r.status >= 400, 'معلم الدعم لا ينشئ فصلاً لمعلم آخر');
r = await req('POST', '/acs_classes', { token: T3, body: { name: 'مجموعة الحساب', subject_id: sub3, teacher_id: 'as-t3', created_by: 'as-t3' } });
const grp3 = rows(r)[0]?.id;
ok(r.status < 300 && grp3, 'معلم الدعم ينشئ فصلاً مُسنداً له');
await req('PATCH', `/acs_classes?id=eq.${grp3}`, { token: T3, body: { name: 'مجموعة الحساب أ' } });
ok(SQL(`select name from acs_classes where id='${grp3}'`) === 'مجموعة الحساب أ', 'يعدّل فصله');
await req('PATCH', `/acs_subjects?id=eq.${sub}`, { token: T3, body: { name: 'تغيير' } });
ok(SQL(`select name from acs_subjects where id='${sub}'`) === 'مهارات القراءة', 'لا يعدّل مادة أنشأها غيره');
await req('DELETE', `/acs_subjects?id=eq.${sub}`, { token: T3 });
ok(SQL(`select count(*) from acs_subjects where id='${sub}'`) === '1', 'لا يحذف مادة أنشأها غيره');
await req('PATCH', `/acs_classes?id=eq.${grp3}`, { token: CAT, body: { name: 'مجموعة الحساب' } });
ok(SQL(`select name from acs_classes where id='${grp3}'`) === 'مجموعة الحساب', 'مسؤول القائمة يعدّل فصل المعلم');
r = await req('POST', '/academic_support', { token: T, body: rec({ student_id: 'as-s', subject_id: null, acs_class_id: grp3 }) });
ok(r.status >= 400, 'المعلم لا يربط طالبه بفصل معلم آخر');
r = await req('POST', '/academic_support', { token: T3, body: rec({ student_id: 'as-s2', teacher_id: 'as-t3', teacher_name: 'معلم 3', subject_id: null, acs_subject_id: sub3, acs_class_id: grp3 }) });
const sid3 = rows(r)[0]?.id;
ok(r.status < 300 && rows(r)[0]?.acs_class_id === grp3, 'المعلم يربط طالبه بفصله');
await req('PATCH', `/academic_support?id=eq.${id}`, { token: T, body: { acs_class_id: grp3 } });
ok(SQL(`select coalesce(acs_class_id,'null') from academic_support where id='${id}'`) === 'null', 'لا ينقل طالبه لفصل معلم آخر بالتعديل');
SQL(`insert into acs_classes (id,name) values ('acscl-open','مجموعة مفتوحة') on conflict do nothing`);
await req('PATCH', `/academic_support?id=eq.${id}`, { token: T, body: { acs_class_id: 'acscl-open' } });
ok(SQL(`select acs_class_id from academic_support where id='${id}'`) === 'acscl-open', 'فصل بلا معلم متاح للجميع');
await req('DELETE', `/acs_classes?id=eq.${grp3}`, { token: T3 });
ok(SQL(`select count(*) from acs_classes where id='${grp3}'`) === '0' && SQL(`select coalesce(acs_class_id,'null') from academic_support where id='${sid3}'`) === 'null', 'يحذف فصله ويبقى سجل الطالب');
await req('DELETE', `/acs_subjects?id=eq.${sub3}`, { token: T3 });
ok(SQL(`select count(*) from acs_subjects where id='${sub3}'`) === '0', 'يحذف مادته');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
