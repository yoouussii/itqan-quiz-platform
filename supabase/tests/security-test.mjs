// اختبارات الحماية (55 اختباراً) على نسخة محلية من قاعدة البيانات.
// التشغيل (يتطلب Docker):
//   1. docker run -d --name sbdb -e POSTGRES_PASSWORD=postgres -p 54322:5432 supabase/postgres:15.8.1.085
//   2. شغّل baseline.sql ثم 001 و002 ثم seed.sql ثم أجزاء 003_security بالترتيب 1 ← 5
//   3. شغّل PostgREST على المنفذ 3001 بمفتاح JWT محلي، ثم:
//      node supabase/tests/security-test.mjs <ملف-مفتاح-anon>
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
const login = async (id, pw) => (await rpc('itqan_login', { p_national_id: id, p_password: pw })).json;

console.log('— بدون تسجيل دخول');
for (const t of ['users', 'quizzes', 'submissions', 'classes', 'notifications']) {
  const r = await req('GET', `/${t}`); ok(Array.isArray(r.json) && r.json.length === 0, `لا يرى شيئاً من ${t}`);
}
let r = await req('POST', '/users', { body: { id: 'hack', name: 'x', role: 'admin', national_id: '999', password: 'x' } });
ok(r.status >= 400, 'لا يستطيع إنشاء حساب مدير');
r = await req('PATCH', '/users?id=eq.u-admin', { body: { name: 'hacked' }, prefer: 'return=representation' });
ok(Array.isArray(r.json) && r.json.length === 0, 'لا يستطيع تعديل المدير');
ok((await rpc('itqan_student_quizzes', {})).json.length === 0, 'لا يرى اختبارات عبر RPC');

console.log('— تسجيل الدخول');
ok((await login('4040', 'wrong')).ok === false, 'كلمة مرور خاطئة مرفوضة');
ok((await login('4040', '')).ok === false, 'كلمة مرور فارغة مرفوضة');
for (let i = 0; i < 8; i++) await login('5050', 'bad' + i);
let l = await login('5050', 'stud123');
ok(l.ok === false && l.error === 'locked', 'قفل بعد 8 محاولات خاطئة حتى مع الكلمة الصحيحة');
const st = await login('4040', 'itqan123');
ok(st.ok && st.token && st.user && !('password' in st.user), 'دخول الطالب ينجح ولا يُرجع كلمة المرور');
ok(st.password_is_default === true, 'يكتشف أن الطالب يستخدم كلمة المرور الافتراضية');
const S = st.token;

console.log('— الطالب');
r = await req('GET', '/users', { token: S });
ok(r.json.length === 1 && r.json[0].national_id === '4040', 'يرى حسابه فقط من جدول المستخدمين');
ok(r.json[0].password === null, 'عمود كلمة المرور فارغ (مشفّرة في جدول خاص)');
r = await req('GET', '/quizzes', { token: S });
ok(r.json.length === 0, 'لا يقرأ جدول الاختبارات مباشرة (فيه الإجابات)');
let qs = (await rpc('itqan_student_quizzes', {}, S)).json;
ok(qs.length === 1 && qs[0].id === 'qz1', 'يرى اختبار صفه فقط (لا اختبار صف آخر ولا المسودة)');
const qtext = JSON.stringify(qs[0].questions);
ok(!qtext.includes('correct_option_index') && !qtext.includes('secret'), 'الإجابات والشرح مخفية قبل التسليم');
ok(qs[0].teacher?.name === 'معلم' && !('national_id' in qs[0].teacher), 'يرى اسم المعلم فقط');
r = await req('PATCH', '/users?id=eq.11111111-1111-1111-1111-111111111111', { token: S, body: { role: 'admin' }, prefer: 'return=representation' });
ok(Array.isArray(r.json) && r.json.length === 0, 'لا يرقّي نفسه لمدير');
r = await req('POST', '/submissions', { token: S, body: { id: 'fake', quiz_id: 'qz1', student_id: '11111111-1111-1111-1111-111111111111', score: 10, total_possible_score: 10, percentage: 100 } });
ok(r.status >= 400, 'لا يُدخل درجة مزوّرة مباشرة');
r = await req('GET', '/submissions', { token: S });
ok(r.json.length === 0, 'لا يرى نتائج الطلاب الآخرين');
r = await req('PATCH', '/quizzes?id=eq.qz1', { token: S, body: { allowed_retake_student_ids: ['11111111-1111-1111-1111-111111111111'] }, prefer: 'return=representation' });
ok(Array.isArray(r.json) && r.json.length === 0, 'لا يمنح نفسه إعادة محاولة');
r = await req('POST', '/notifications', { token: S, body: { id: 'n1', type: 'announcement', title: 'x', body: 'x', audience: { all: true }, created_by: '11111111-1111-1111-1111-111111111111' } });
ok(r.status >= 400, 'لا يرسل إعلانات');
ok((await rpc('itqan_submit_quiz', { p_quiz_id: 'qz2', p_answers: [], p_time_spent: 5 }, S)).json.error === 'quiz_not_available', 'لا يسلّم اختبار صف آخر');

console.log('— التسليم والتصحيح على الخادم');
const answers = [
  { question_id: 'q1', selected_option: 1 },
  { question_id: 'q2', selected_option: null, text_answer: 'إجابتي' },
  { question_id: 'q3', selected_option: null, sub_answers: [{ sub_question_id: 's1', selected_option: 0 }, { sub_question_id: 's2', selected_option: 0 }] },
  { question_id: 'q1', selected_option: 1, score: 999 },
];
let sub = (await rpc('itqan_submit_quiz', { p_quiz_id: 'qz1', p_answers: answers, p_time_spent: 99999, p_client_id: 'sub-c1' }, S)).json;
ok(sub.ok && sub.submission.score == 4 && sub.submission.total_possible_score == 10 && sub.submission.percentage == 40, `الدرجة محسوبة على الخادم: ${sub.submission?.score}/10`);
ok(sub.submission.time_spent_seconds <= 900, 'الوقت المستغرق مقيّد بمدة الاختبار');
ok(JSON.stringify(sub.questions).includes('correct_option_index'), 'تُرجع الإجابات النموذجية بعد التسليم للمراجعة');
const essay = sub.submission.answers_json.find((a) => a.question_id === 'q2');
ok(essay.text_answer === 'إجابتي' && essay.marks_awarded == 0, 'إجابة المقالي محفوظة بانتظار التصحيح');
let again = (await rpc('itqan_submit_quiz', { p_quiz_id: 'qz1', p_answers: answers, p_time_spent: 5, p_client_id: 'sub-c1' }, S)).json;
ok(again.ok && again.submission.id === 'sub-c1', 'إعادة إرسال نفس المحاولة (انقطاع شبكة) لا تكرر التسليم');
again = (await rpc('itqan_submit_quiz', { p_quiz_id: 'qz1', p_answers: answers, p_time_spent: 5 }, S)).json;
ok(again.ok === false && again.error === 'already_submitted', 'لا يسلّم مرتين بدون إذن إعادة');
qs = (await rpc('itqan_student_quizzes', {}, S)).json;
ok(JSON.stringify(qs[0].questions).includes('correct_option_index'), 'بعد التسليم تظهر الإجابات في المراجعة');
r = await req('GET', '/submissions', { token: S });
ok(r.json.length === 1 && r.json[0].id === 'sub-c1', 'يرى نتيجته');

console.log('— المعلم');
const T = (await login('2020', 'teach123')).token;
r = await req('GET', '/users', { token: T }); ok(r.json.length === 5, 'يرى كل المستخدمين');
ok(r.json.every((u) => u.password === null), 'ولا يرى أي كلمة مرور');
r = await req('PATCH', '/users?id=eq.u-teach', { token: T, body: { teacher_permissions: { can_add_teachers: true }, role: 'admin', name: 'معلم 2' }, prefer: 'return=representation' });
ok(r.json[0]?.role === 'teacher' && !r.json[0]?.teacher_permissions?.can_add_teachers && r.json[0]?.name === 'معلم 2', 'يعدّل اسمه لكن لا يغيّر دوره أو صلاحياته');
r = await req('PATCH', '/quizzes?id=eq.qz1', { token: T, body: { allowed_retake_student_ids: ['11111111-1111-1111-1111-111111111111'] }, prefer: 'return=representation' });
ok(r.json.length === 1, 'يمنح الطالب إعادة محاولة');
qs = (await rpc('itqan_student_quizzes', {}, S)).json;
ok(!JSON.stringify(qs[0].questions).includes('correct_option_index'), 'أثناء إذن الإعادة تُخفى الإجابات مرة أخرى');
sub = (await rpc('itqan_submit_quiz', { p_quiz_id: 'qz1', p_answers: [{ question_id: 'q1', selected_option: 0 }], p_time_spent: 5 }, S)).json;
ok(sub.ok && sub.submission.is_retake === true, 'الطالب يعيد الاختبار');
r = await req('GET', '/quizzes?id=eq.qz1&select=allowed_retake_student_ids', { token: T });
ok(r.json[0].allowed_retake_student_ids.length === 0, 'إذن الإعادة أُلغي تلقائياً بعد استخدامه');
r = await req('POST', '/notifications', { token: T, body: { id: 'n2', type: 'announcement', title: 'x', body: 'x', audience: { all: true }, created_by: 'u-teach' } });
ok(r.status < 300, 'المعلم يرسل إشعاراً باسمه');
r = await req('POST', '/notifications', { token: T, body: { id: 'n3', type: 'announcement', title: 'x', body: 'x', audience: { all: true }, created_by: 'u-admin' } });
ok(r.status >= 400, 'ولا يرسل باسم غيره');
r = await req('GET', '/activity_log', { token: T }); ok(r.json.length === 0, 'لا يرى سجل النشاط بلا صلاحية');

console.log('— المشرف والمدير');
const SV = (await login('3030', 'sup12345')).token;
await req('POST', '/activity_log', { token: SV, body: { id: 'a1', actor_id: 'u-sup', action: 'test' } });
r = await req('GET', '/activity_log', { token: SV }); ok(r.json.length === 1, 'المشرف صاحب الصلاحية يرى سجل النشاط');
const A = (await login('1010', 'admin123')).token;
r = await req('PATCH', '/users?id=eq.u-sup', { token: A, body: { teacher_permissions: { can_view_activity_log: true, can_approve_quizzes: true }, assigned_class_ids: ['c1'] }, prefer: 'return=representation' });
ok(r.json[0]?.teacher_permissions?.can_approve_quizzes === true && r.json[0]?.assigned_class_ids?.[0] === 'c1', 'المدير يحفظ صلاحيات وفصول المشرف');
r = await req('PATCH', '/users?id=eq.11111111-1111-1111-1111-111111111111', { token: A, body: { password: 'newpass1' }, prefer: 'return=representation' });
ok(r.json[0]?.password === null, 'إعادة تعيين كلمة المرور تُخزَّن مشفّرة');
ok((await rpc('itqan_session_user', {}, S)).json === null, 'جلسة الطالب القديمة أُلغيت بعد تغيير كلمته');
ok((await login('4040', 'itqan123')).ok === false && (await login('4040', 'newpass1')).ok === true, 'الكلمة الجديدة فقط تعمل');
r = await req('POST', '/users', { token: A, body: { id: 'u-new', name: 'جديد', role: 'student', national_id: '6060', password: 'p123456', class_id: 'c1' }, prefer: 'return=representation' });
ok(r.status < 300 && r.json[0].password === null && (await login('6060', 'p123456')).ok, 'مستخدم جديد يُضاف ويدخل بكلمته');

console.log('— تغيير كلمة المرور والخروج');
const N = (await login('6060', 'p123456')).token;
ok((await rpc('itqan_change_password', { p_current: 'wrong', p_new: 'abcdef' }, N)).json.error === 'wrong_password', 'تغيير الكلمة يتطلب الحالية');
ok((await rpc('itqan_change_password', { p_current: 'p123456', p_new: 'abc' }, N)).json.error === 'too_short', 'الكلمة القصيرة مرفوضة');
ok((await rpc('itqan_change_password', { p_current: 'p123456', p_new: 'abcdef1' }, N)).json.ok, 'تغيير الكلمة ينجح');
ok((await rpc('itqan_session_user', {}, N)).json?.id === 'u-new', 'والجلسة الحالية تبقى');
await rpc('itqan_logout', {}, N);
ok((await rpc('itqan_session_user', {}, N)).json === null, 'تسجيل الخروج يُنهي الجلسة على الخادم');
r = await req('DELETE', '/users?id=eq.u-new', { token: A }); ok(r.status < 300 && !(await login('6060', 'abcdef1')).ok, 'حذف المستخدم يمنع دخوله');

console.log(`\nالنتيجة: ${pass} ناجح، ${fail} فاشل`);
process.exit(fail ? 1 : 0);
