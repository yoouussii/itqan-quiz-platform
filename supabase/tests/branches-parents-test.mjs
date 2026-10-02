// اختبارات الفروع وأولياء الأمور والنوع (009) على نسخة محلية من قاعدة البيانات.
// التشغيل: نفس إعداد security-test.mjs، ثم 004 ← 009، ثم:
//   node supabase/tests/branches-parents-test.mjs <ملف-مفتاح-anon>
import { readFileSync } from 'node:fs';
const BASE = 'http://localhost:3001';
const ANON = readFileSync(process.argv[2], 'utf8').trim();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } };
async function req(method, path, { token, body, prefer } = {}) {
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };
  if (token) headers['x-itqan-session'] = token;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
const rpc = (fn, body, token) => req('POST', `/rpc/${fn}`, { token, body });
const login = async (id, pw) => (await rpc('itqan_login', { p_national_id: id, p_password: pw })).json?.token;
const ids = (r) => (Array.isArray(r.json) ? r.json.map((x) => x.id) : []);
const CHILD = '11111111-1111-1111-1111-111111111111';

const admin = await login('1010', 'admin123');
ok(!!admin, 'دخول المدير');

console.log('— إعداد الفروع (المدير)');
let r = await req('POST', '/branches', { token: admin, body: [{ id: 'b1', name: 'فرع البنين' }, { id: 'b2', name: 'فرع البنات' }] });
ok(r.status < 300, 'المدير يضيف فرعين');
await req('PATCH', '/users?id=eq.u-teach', { token: admin, body: { branch_id: 'b1', teacher_permissions: { can_add_students: true } } });
await req('PATCH', `/users?id=eq.${CHILD}`, { token: admin, body: { branch_id: 'b1', gender: 'male' } });
await req('PATCH', '/users?id=eq.u-st2', { token: admin, body: { branch_id: 'b2', gender: 'female' } });
await req('PATCH', '/classes?id=eq.c1', { token: admin, body: { branch_id: 'b1' } });
await req('PATCH', '/classes?id=eq.c2', { token: admin, body: { branch_id: 'b2' } });
r = await req('POST', '/users', { token: admin, body: { id: 'u-t2', name: 'معلمة فرع البنات', role: 'teacher', national_id: '2121', password: 'teach456', branch_id: 'b2' } });
ok(r.status < 300, 'المدير يضيف معلمة في فرع البنات');
r = await req('PATCH', '/users?id=eq.u-st2', { token: admin, body: { gender: 'other' } });
ok(r.status >= 400, 'النوع يقبل ذكر أو أنثى فقط');

const t1 = await login('2020', 'teach123');
const t2 = await login('2121', 'teach456');
const s1 = await login('4040', 'itqan123');
const s2 = await login('5050', 'stud123');
ok(t1 && t2 && s1 && s2, 'دخول المعلمين والطلاب');

console.log('— معلم الفرع يرى فرعه فقط');
let u = ids(await req('GET', '/users?select=id', { token: t1 }));
ok(u.includes(CHILD) && !u.includes('u-st2') && !u.includes('u-t2'), 'معلم فرع البنين لا يرى طالبة ولا معلمة فرع البنات');
ok(u.includes('u-admin'), 'ويرى المدير (لأسماء الإشعارات والاختبارات)');
u = ids(await req('GET', '/users?select=id', { token: t2 }));
ok(u.includes('u-st2') && !u.includes(CHILD), 'معلمة فرع البنات ترى فرعها فقط');
ok(ids(await req('GET', '/classes?select=id', { token: t1 })).join() === 'c1', 'الشعب: شعب فرعه فقط');
await req('POST', '/classes', { token: admin, body: { id: 'c-shared', name: 'شعبة مشتركة', grade_level: 'x' } });
const cl = ids(await req('GET', '/classes?select=id', { token: t1 }));
ok(cl.includes('c-shared') && !cl.includes('c2'), 'الشعبة بلا فرع يراها الجميع (010)، وشعبة الفرع الآخر لا');
const q1 = ids(await req('GET', '/quizzes?select=id', { token: t1 }));
const q2 = ids(await req('GET', '/quizzes?select=id', { token: t2 }));
ok(q1.includes('qz1') && q2.length === 0, 'الاختبارات: اختبارات معلمي فرعه فقط');
ok(ids(await req('GET', '/submissions?select=id', { token: t1 })).length === 0, 'لا يرى نتائج طلاب فرع آخر');
ok(ids(await req('GET', '/submissions?select=id', { token: t2 })).includes('sub-old'), 'ومعلمة الفرع الآخر ترى نتائج طالباتها');
ok(ids(await req('GET', '/users?select=id', { token: admin })).length >= 6, 'المدير يرى الجميع');

console.log('— الفرع يحدده المدير فقط');
r = await req('POST', '/users', { token: t1, body: { id: 'u-new', name: 'طالب جديد', role: 'student', national_id: '7070', password: 'x1234567', branch_id: 'b2' } });
const nb = (await req('GET', '/users?id=eq.u-new&select=branch_id', { token: admin })).json?.[0]?.branch_id;
ok(r.status < 300 && nb === 'b1', 'طالب يضيفه معلم الفرع يُسجَّل في فرعه حتى لو اختار فرعاً آخر');
await req('PATCH', `/users?id=eq.${CHILD}`, { token: t1, body: { branch_id: 'b2', child_ids: ['u-st2'] } });
const c = (await req('GET', `/users?id=eq.${CHILD}&select=branch_id,child_ids`, { token: admin })).json?.[0];
ok(c?.branch_id === 'b1' && (c?.child_ids || []).length === 0, 'المعلم لا يغيّر فرع الطالب ولا يربط أبناء');
r = await req('POST', '/classes', { token: admin, body: { id: 'c9', name: 'شعبة', grade_level: 'x', branch_id: 'b2' } });
await req('PATCH', '/users?id=eq.u-teach', { token: admin, body: { teacher_permissions: { can_add_students: true, can_manage_classes: true } } });
r = await req('PATCH', '/classes?id=eq.c9', { token: t1, body: { name: 'سرقة' }, prefer: 'return=representation' });
ok(Array.isArray(r.json) && r.json.length === 0, 'لا يعدّل شعبة فرع آخر');

console.log('— الاختبار «للجميع» لا يتجاوز الفرع');
await rpc('itqan_logout', {}, s1);
r = await req('POST', '/quizzes', { token: t1, body: { id: 'qall', title: 'للجميع', teacher_id: 'u-teach', created_by: 'u-teach', status: 'published', duration_minutes: 5,
  questions: [{ id: 'q1', type: 'mcq', question_text: 'x', options: ['a', 'b'], correct_option_index: 1, marks: 1 }], assignments: [{ target_type: 'all' }] } });
await req('PATCH', '/quizzes?id=eq.qall', { token: admin, body: { status: 'published' } });
const s1b = await login('4040', 'itqan123');
ok(ids(await rpc('itqan_student_quizzes', {}, s1b)).includes('qall'), 'طالب نفس الفرع يراه');
ok(!ids(await rpc('itqan_student_quizzes', {}, s2)).includes('qall'), 'طالبة الفرع الآخر لا تراه');

console.log('— ولي الأمر');
r = await req('POST', '/users', { token: admin, body: { id: 'u-par', name: 'والد الطالب طالب أ', role: 'parent', national_id: '6060', password: 'parent123', child_ids: [CHILD] } });
ok(r.status < 300, 'المدير ينشئ حساب ولي أمر مرتبطاً بابنه');
r = await req('POST', '/users', { token: t1, body: { id: 'u-par2', name: 'x', role: 'parent', national_id: '6161', password: 'parent123' } });
ok(r.status >= 400, 'المعلم لا ينشئ حساب ولي أمر');
const p = await login('6060', 'parent123');
ok(!!p, 'دخول ولي الأمر');
u = ids(await req('GET', '/users?select=id', { token: p }));
ok(u.length === 2 && u.includes('u-par') && u.includes(CHILD), 'يرى حسابه وحساب ابنه فقط');
ok(ids(await req('GET', '/quizzes?select=id', { token: p })).length === 0, 'لا يقرأ جدول الاختبارات مباشرة');
const cq = (await rpc('itqan_child_quizzes', { p_child: CHILD }, p)).json;
ok(Array.isArray(cq) && cq.some((q) => q.id === 'qall'), 'يرى اختبارات ابنه');
ok(!JSON.stringify(cq).includes('correct_option_index'), 'بدون الإجابات النموذجية');
ok(ids(await rpc('itqan_child_quizzes', { p_child: 'u-st2' }, p)).length === 0, 'لا يرى اختبارات طالب آخر');
ok(ids(await rpc('itqan_student_quizzes', {}, p)).length === 0, 'وليس له اختبارات باسمه');
const ps = await req('GET', '/submissions?select=student_id', { token: p });
ok(Array.isArray(ps.json) && ps.json.every((x) => x.student_id === CHILD), 'يرى نتائج ابنه فقط');
r = await rpc('itqan_start_quiz', { p_quiz_id: 'qall' }, p);
ok(!r.json?.ok, 'لا يبدأ اختباراً باسم ابنه');
r = await rpc('itqan_submit_quiz', { p_quiz_id: 'qall', p_answers: [], p_time_spent: 1 }, p);
ok(!r.json?.ok, 'ولا يسلّم اختباراً');
r = await req('PATCH', '/users?id=eq.u-par', { token: p, body: { child_ids: [CHILD, 'u-st2'] }, prefer: 'return=representation' });
const pc = (await req('GET', '/users?id=eq.u-par&select=child_ids', { token: admin })).json?.[0]?.child_ids || [];
ok(pc.length === 1, 'لا يضيف لنفسه أبناء آخرين');
r = await req('POST', '/branches', { token: t1, body: { id: 'b3', name: 'فرع' } });
ok(r.status >= 400, 'غير المدير لا يضيف فروعاً');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
