// اختبارات 040: الواجبات — الصلاحيات، التسليم، حماية الدرجة، المرفقات، الإشعارات، التنظيف.
// تُشغَّل على قاعدة بيانات فيها 001–040 والبيانات التجريبية (seed.sql).
//   node supabase/tests/homework-test.mjs <ملف-مفتاح-anon>
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
SQL(`insert into users (id,name,role,national_id,password) values ('ht-2','معلم آخر','teacher','9802','teach1234'),('hsup','مشرف','supervisor','9803','sup12345') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,class_id) values ('hst','طالب الواجب','student','9804','stud1234','c1'),('hst2','طالب فصل آخر','student','9807','stud1234','c2') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,child_ids) values ('hpar','ولي أمر الواجب','parent','9805','par1234','["hst"]') on conflict do nothing`);
SQL(`update users set assigned_class_ids='["c1"]'::jsonb, assigned_subject_ids='["s1"]'::jsonb where id='u-teach'`);

const A = await login('1010', 'admin123');
const T = await login('2020', 'teach123');
const T2 = await login('9802', 'teach1234');
const SU = await login('9803', 'sup12345');
const S = await login('9804', 'stud1234');
const S2 = await login('9807', 'stud1234');
const P = await login('9805', 'par1234');
ok(A && T && T2 && SU && S && S2 && P, 'تسجيل الدخول');

const hw = (o) => ({ class_id: 'c1', subject_id: 's1', teacher_id: 'u-teach', teacher_name: 'معلم', title: 'حل تمارين ص 20', body: 'التمارين 1-5', links: [{ title: 'شرح', url: 'https://youtu.be/x' }], due_at: '2026-12-01T18:00:00Z', max_score: 10, ...o });
console.log('— النشر');
let r = await req('POST', '/homework', { token: S, body: hw({ teacher_id: 'hst' }) });
ok(r.status >= 400, 'الطالب لا ينشر واجباً');
r = await req('POST', '/homework', { token: SU, body: hw({ teacher_id: 'hsup' }) });
ok(r.status >= 400, 'المشرف لا ينشر واجباً');
r = await req('POST', '/homework', { token: T2, body: hw({ teacher_id: 'ht-2' }) });
ok(r.status >= 400, 'معلم بلا إسناد للفصل لا ينشر');
r = await req('POST', '/homework', { token: T, body: hw({ class_id: 'c2' }) });
ok(r.status >= 400, 'المعلم لا ينشر لفصل غير مسند');
r = await req('POST', '/homework', { token: T, body: hw({ teacher_id: 'ht-2' }) });
ok(r.status >= 400, 'لا ينشر باسم غيره');
const nb = Number(SQL(`select count(*) from notifications where ref_type='homework'`));
r = await req('POST', '/homework', { token: T, body: hw() });
const hid = rows(r)[0]?.id;
ok(r.status < 300 && hid?.startsWith('hw-'), 'المعلم ينشر واجباً لفصله المسند');
const aud = JSON.parse(SQL(`select audience from notifications where ref_type='homework' order by created_at desc limit 1`) || '{}');
ok(Number(SQL(`select count(*) from notifications where ref_type='homework'`)) === nb + 1 && aud.student_ids?.includes('hst') && !aud.student_ids?.includes('hst2') && aud.user_ids?.includes('hpar'), 'إشعار لطلاب الفصل وأولياء أمورهم فقط');
r = await req('POST', '/homework', { token: A, body: hw({ class_id: 'c2', teacher_id: 'u-admin', allow_submission: false }) });
const hid2 = rows(r)[0]?.id;
ok(r.status < 300 && hid2, 'المدير ينشر لأي فصل');

console.log('— العرض');
ok(rows(await req('GET', `/homework?id=eq.${hid}`, { token: S })).length === 1, 'طالب الفصل يرى الواجب');
ok(rows(await req('GET', `/homework?id=eq.${hid}`, { token: S2 })).length === 0, 'طالب فصل آخر لا يراه');
ok(rows(await req('GET', `/homework?id=eq.${hid}`, { token: P })).length === 1, 'ولي الأمر يرى واجب ابنه');
ok(rows(await req('GET', `/homework?id=eq.${hid}`, { token: SU })).length === 1, 'المشرف يرى');
ok(rows(await req('GET', `/homework?id=eq.${hid}`)).length === 0, 'بلا دخول: لا شيء');

console.log('— المرفقات');
const b64 = Buffer.from('%PDF-1.4 test').toString('base64');
r = await req('POST', '/homework_files', { token: T2, body: { homework_id: hid, name: 'x.pdf', mime: 'application/pdf', data: b64, uploaded_by: 'ht-2' } });
ok(r.status >= 400, 'معلم آخر لا يرفق بواجب غيره');
r = await req('POST', '/homework_files', { token: T, body: { homework_id: hid, name: 'ورقة.pdf', mime: 'application/pdf', data: b64, uploaded_by: 'u-teach', size: 99999999 } });
const fid = rows(r)[0]?.id;
ok(r.status < 300 && fid && rows(r)[0].size === Math.floor(b64.length * 3 / 4), 'المعلم يرفق ملفاً (الحجم يُحسب على الخادم)');
ok(rows(await req('GET', `/homework_files?id=eq.${fid}&select=data`, { token: S })).length === 1, 'الطالب يحمّل المرفق');
ok(rows(await req('GET', `/homework_files?id=eq.${fid}&select=id`, { token: S2 })).length === 0, 'طالب فصل آخر لا يحمّله');

console.log('— التسليم');
r = await req('POST', '/homework_submissions', { token: S2, body: { homework_id: hid, student_id: 'hst2', answer: 'x' } });
ok(r.status >= 400, 'طالب من فصل آخر لا يسلّم');
r = await req('POST', '/homework_submissions', { token: S, body: { homework_id: hid, student_id: 'hst2', answer: 'x' } });
ok(r.status >= 400, 'لا يسلّم باسم غيره');
r = await req('POST', '/homework_submissions', { token: S, body: { homework_id: hid, student_id: 'hst', answer: 'إجابتي', score: 10, feedback: 'x' } });
const sid = rows(r)[0]?.id;
ok(r.status < 300 && sid, 'الطالب يسلّم');
ok(SQL(`select coalesce(score::text,'null')||feedback from homework_submissions where id='${sid}'`) === 'null', 'الدرجة المرسلة مع التسليم تُهمل');
r = await req('POST', '/homework_submissions', { token: S, body: { homework_id: hid, student_id: 'hst', answer: 'مرة ثانية' } });
ok(r.status >= 400, 'تسليم واحد لكل واجب');
r = await req('POST', '/homework_submissions', { token: S2, body: { homework_id: hid2, student_id: 'hst2', answer: 'x' } });
ok(r.status >= 400, 'لا تسليم إن كان الواجب بلا تسليم إلكتروني');
r = await req('PATCH', `/homework_submissions?id=eq.${sid}`, { token: S, body: { score: 10, feedback: 'ممتاز' } });
ok(SQL(`select coalesce(score::text,'null') from homework_submissions where id='${sid}'`) === 'null', 'الطالب لا يكتب درجته');
r = await req('PATCH', `/homework_submissions?id=eq.${sid}`, { token: S, body: { answer: 'إجابة معدلة' } });
ok(SQL(`select answer from homework_submissions where id='${sid}'`) === 'إجابة معدلة', 'الطالب يعدّل قبل التصحيح');
r = await req('POST', '/homework_files', { token: S, body: { submission_id: sid, name: 'حل.jpg', mime: 'image/jpeg', data: b64, uploaded_by: 'hst' } });
const sfid = rows(r)[0]?.id;
ok(r.status < 300 && sfid, 'الطالب يرفق ملفاً بتسليمه');
ok(rows(await req('GET', `/homework_submissions?id=eq.${sid}`, { token: P })).length === 1, 'ولي الأمر يرى تسليم ابنه');
ok(rows(await req('GET', `/homework_files?id=eq.${sfid}&select=id`, { token: S2 })).length === 0, 'طالب آخر لا يرى ملف التسليم');

console.log('— التصحيح');
r = await req('PATCH', `/homework_submissions?id=eq.${sid}`, { token: T2, body: { score: 1 } });
ok(SQL(`select coalesce(score::text,'null') from homework_submissions where id='${sid}'`) === 'null', 'معلم آخر لا يصحح');
const ng = Number(SQL(`select count(*) from notifications where title like 'تصحيح واجب:%'`));
r = await req('PATCH', `/homework_submissions?id=eq.${sid}`, { token: T, body: { score: 9, feedback: 'أحسنت', answer: 'تلاعب' } });
ok(SQL(`select score||'|'||feedback||'|'||answer||'|'||graded_by from homework_submissions where id='${sid}'`) === '9|أحسنت|إجابة معدلة|u-teach', 'المعلم يصحح ولا يغيّر الإجابة');
const gaud = JSON.parse(SQL(`select audience from notifications where title like 'تصحيح واجب:%' order by created_at desc limit 1`) || '{}');
ok(Number(SQL(`select count(*) from notifications where title like 'تصحيح واجب:%'`)) === ng + 1 && gaud.student_ids?.includes('hst') && gaud.user_ids?.includes('hpar'), 'إشعار التصحيح للطالب وولي أمره');
r = await req('PATCH', `/homework_submissions?id=eq.${sid}`, { token: S, body: { answer: 'بعد التصحيح' } });
ok(SQL(`select answer from homework_submissions where id='${sid}'`) === 'إجابة معدلة', 'لا تعديل بعد التصحيح');
r = await req('POST', '/homework_files', { token: S, body: { submission_id: sid, name: 'z.jpg', mime: 'image/jpeg', data: b64, uploaded_by: 'hst' } });
ok(r.status >= 400, 'لا مرفقات بعد التصحيح');

console.log('— المساحة والتنظيف');
r = await rpc('itqan_homework_storage', {}, T);
ok(r.status < 300 && r.json.files >= 2 && r.json.bytes > 0, 'إحصاء مساحة المرفقات');
ok((await rpc('itqan_homework_storage', {}, S)).status >= 400, 'الطالب لا يرى الإحصاء');
ok((await rpc('itqan_homework_purge', { p_before: '2099-01-01' }, A)).status >= 400, 'لا تنظيف بتاريخ مستقبلي');
ok((await rpc('itqan_homework_purge', { p_before: '2000-01-01' }, T)).status >= 400, 'المعلم لا ينظّف');
SQL(`update homework set created_at = now() - interval '400 days' where id='${hid}'`);
r = await rpc('itqan_homework_purge', { p_before: new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10) }, A);
ok(r.status < 300 && r.json === 1 && SQL(`select count(*) from homework_files where homework_id='${hid}' or submission_id='${sid}'`) === '0' && SQL(`select count(*) from homework where id='${hid2}'`) === '1', 'المدير يحذف القديم بمرفقاته وتسليماته فقط');

console.log('— الحذف');
r = await req('DELETE', `/homework?id=eq.${hid2}`, { token: T });
ok(SQL(`select count(*) from homework where id='${hid2}'`) === '1', 'المعلم لا يحذف واجب غيره');
r = await req('DELETE', `/homework?id=eq.${hid2}`, { token: A });
ok(SQL(`select count(*) from homework where id='${hid2}'`) === '0', 'المدير يحذف');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
