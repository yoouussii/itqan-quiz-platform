// اختبارات 056: أهداف الطالب الشخصية (الصلاحيات، الحد، التحقيق والإشعار).
// تُشغَّل على قاعدة بيانات فيها 001–056 والبيانات التجريبية (seed.sql).
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
SQL(`insert into users (id,name,role,national_id,password,class_id) values ('sg-s','طالب الأهداف','student','9951','stud1234','c1'),('sg-s2','طالب آخر','student','9952','stud1234','c1') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,child_ids) values ('sg-p','ولي أمر الأهداف','parent','9953','par1234','["sg-s"]'),('sg-p2','ولي أمر آخر','parent','9954','par1234','["sg-s2"]') on conflict do nothing`);
SQL(`delete from student_goals where student_id in ('sg-s','sg-s2')`);
const S = await login('9951', 'stud1234'), S2 = await login('9952', 'stud1234'), P = await login('9953', 'par1234'), P2 = await login('9954', 'par1234'), T = await login('1010', 'admin123');
ok(S && S2 && P && P2 && T, 'تسجيل الدخول');
const goal = (o) => ({ student_id: 'sg-s', kind: 'subject_avg', subject_id: 's1', target: 90, note: 'أريد التفوق', ...o });

console.log('— الإضافة');
let r = await req('POST', '/student_goals', { token: S, body: goal() });
const gid = rows(r)[0]?.id;
ok(r.status < 300 && gid, 'الطالب يضع هدفاً');
ok((await req('POST', '/student_goals', { token: S2, body: goal() })).status >= 400, 'لا يضع هدفاً لغيره');
ok((await req('POST', '/student_goals', { token: P, body: goal() })).status >= 400, 'ولي الأمر لا يضع هدفاً');
ok((await req('POST', '/student_goals', { token: S, body: goal({ target: 150 }) })).status >= 400, 'معدل فوق 100% مرفوض');
ok((await req('POST', '/student_goals', { token: S, body: goal({ achieved_at: new Date().toISOString() }) })).status >= 400, 'لا يُنشأ محققاً');
for (let i = 0; i < 5; i++) await req('POST', '/student_goals', { token: S, body: goal({ kind: 'points', subject_id: null, target: 100 + i }) });
ok((await req('POST', '/student_goals', { token: S, body: goal({ kind: 'quizzes', subject_id: null, target: 3 }) })).status >= 400, 'حد 6 أهداف قائمة');

console.log('— العرض');
ok(rows(await req('GET', '/student_goals?select=id', { token: P })).length === 6, 'ولي الأمر يرى أهداف ابنه');
ok(rows(await req('GET', '/student_goals?select=id', { token: P2 })).length === 0, 'ولي أمر آخر لا يراها');
ok(rows(await req('GET', '/student_goals?select=id', { token: S2 })).length === 0, 'طالب آخر لا يراها');
ok(rows(await req('GET', `/student_goals?id=eq.${gid}`, { token: T })).length === 1, 'الطاقم يراها');

console.log('— التحقيق');
const nb = Number(SQL(`select count(*) from notifications where ref_type='goal'`));
await req('PATCH', `/student_goals?id=eq.${gid}`, { token: S2, body: { achieved_at: new Date().toISOString() } });
ok(SQL(`select achieved_at is null from student_goals where id='${gid}'`) === 't', 'غيره لا يعدّله');
r = await req('PATCH', `/student_goals?id=eq.${gid}`, { token: S, body: { achieved_at: new Date().toISOString() } });
ok(r.status >= 400 && SQL(`select achieved_at is null from student_goals where id='${gid}'`) === 't', 'لا يُسجَّل محققاً قبل بلوغه فعلاً');
ok(JSON.stringify((await req('POST', '/rpc/itqan_goal_progress', { token: P, body: { p_student: 'sg-s' } })).json.find((x) => x.id === gid)) === JSON.stringify({ id: gid, value: null }), 'التقدم من الخادم: لا نتائج بعد');
ok((await req('POST', '/rpc/itqan_goal_progress', { token: P2, body: { p_student: 'sg-s' } })).json === null, 'ولي أمر آخر لا يرى التقدم');
// نتيجة 95% في المادة بعد وضع الهدف
SQL(`insert into quizzes (id,title,teacher_id,status,subject_id,pass_percentage,is_deleted) values ('sg-q','اختبار','u-teach','published','s1',50,false) on conflict do nothing;
  insert into submissions (id,quiz_id,student_id,percentage,completed_at,status) values ('sg-sub','sg-q','sg-s',95,now(),'completed') on conflict do nothing`);
ok((await req('POST', '/rpc/itqan_goal_progress', { token: S, body: { p_student: 'sg-s' } })).json.find((x) => x.id === gid)?.value === 95, 'التقدم 95% بعد النتيجة');
await req('PATCH', `/student_goals?id=eq.${gid}`, { token: S, body: { achieved_at: '2020-01-01T00:00:00Z', student_id: 'sg-s2' } });
ok(SQL(`select (achieved_at > now() - interval '1 minute')::text || student_id from student_goals where id='${gid}'`) === 'truesg-s', 'تاريخ التحقيق من الخادم والطالب ثابت');
const aud = SQL(`select audience from notifications where ref_type='goal' and ref_id='${gid}'`);
ok(Number(SQL(`select count(*) from notifications where ref_type='goal'`)) === nb + 1 && aud.includes('sg-p') && !aud.includes('sg-p2'), 'إشعار لولي أمره فقط');
await req('PATCH', `/student_goals?id=eq.${gid}`, { token: S, body: { achieved_at: null } });
ok(SQL(`select achieved_at is not null from student_goals where id='${gid}'`) === 't' && Number(SQL(`select count(*) from notifications where ref_type='goal'`)) === nb + 1, 'لا يُلغى التحقيق ولا يتكرر الإشعار');
ok((await req('POST', '/student_goals', { token: S, body: goal({ kind: 'quizzes', subject_id: null, target: 3 }) })).status < 300, 'الهدف المحقق لا يُحسب في الحد');
await req('DELETE', `/student_goals?id=eq.${gid}`, { token: S2 });
ok(SQL(`select count(*) from student_goals where id='${gid}'`) === '1', 'غيره لا يحذفه');
await req('DELETE', `/student_goals?id=eq.${gid}`, { token: S });
ok(SQL(`select count(*) from student_goals where id='${gid}'`) === '0', 'الطالب يحذف هدفه');

SQL(`delete from submissions where id='sg-sub'; delete from quizzes where id='sg-q'`);
console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
