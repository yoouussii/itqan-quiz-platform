// اختبارات 004: مؤقت الخادم، إخفاء الإجابات حتى انتهاء الإتاحة، صلاحيات تعديل الاختبارات.
// تُشغَّل بعد security-test.mjs على نفس قاعدة البيانات (انظر رأس ذلك الملف).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const BASE = 'http://localhost:3001';
const ANON = readFileSync(process.argv[2], 'utf8').trim();
const SQL = (q) => execFileSync('psql', ['postgres://postgres:postgres@localhost:54322/postgres', '-tA', '-c', q]).toString().trim();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗ FAIL:', m); };
async function req(method, path, { token, body, prefer } = {}) {
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };
  if (token) headers['x-itqan-session'] = token;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let json; try { json = JSON.parse(t); } catch { json = t; }
  return { status: r.status, json };
}
const rpc = (fn, body, token) => req('POST', `/rpc/${fn}`, { token, body });
const login = async (id, pw) => (await rpc('itqan_login', { p_national_id: id, p_password: pw })).json.token;
const hasAnswers = (qs) => JSON.stringify(qs).includes('correct_option_index');

SQL("delete from itqan.login_attempts");
const A = await login('1010', 'admin123');
await req('POST', '/users', { token: A, body: { id: 'u-t2', name: 'معلم آخر', role: 'teacher', national_id: '2121', password: 'teach456' } });
const T = await login('2020', 'teach123');
const T2 = await login('2121', 'teach456');
SQL("update users set password='stud12345' where id='11111111-1111-1111-1111-111111111111'");
const S = await login('4040', 'stud12345');
const future = new Date(Date.now() + 86400e3).toISOString();

console.log('— صلاحيات تعديل الاختبارات');
const quiz = { id: 'qz5', title: 'مؤقت', teacher_id: 'u-teach', created_by: 'u-teach', status: 'published', duration_minutes: 1, end_date: future,
  questions: [{ id: 'q1', type: 'mcq', question_text: 'x', options: ['a', 'b'], correct_option_index: 1, marks: 2, explanation: 'سر' },
              { id: 'q2', type: 'essay', question_text: 'اكتب', marks: 3 }],
  assignments: [{ target_type: 'class', target_id: 'c1' }], allowed_retake_student_ids: [] };
let r = await req('POST', '/quizzes', { token: T, body: quiz });
ok(r.status < 300, 'المعلم ينشئ اختباره');
r = await req('POST', '/quizzes', { token: T2, body: { ...quiz, id: 'qz6', teacher_id: 'u-teach', created_by: 'u-teach' } });
ok(r.status >= 400, 'لا ينشئ اختباراً باسم معلم آخر');
r = await req('PATCH', '/quizzes?id=eq.qz5', { token: T2, body: { title: 'سرقة' } });
ok(r.status >= 400 && SQL("select title from quizzes where id='qz5'") === 'مؤقت', 'معلم آخر لا يعدّل الاختبار');
r = await req('DELETE', '/quizzes?id=eq.qz5', { token: T2 });
ok(r.status >= 400 && SQL("select count(*) from quizzes where id='qz5'") === '1', 'ولا يحذفه');
r = await req('PATCH', '/quizzes?id=eq.qz5', { token: T2, body: { teacher_id: 'u-t2' } });
ok(r.status >= 400, 'ولا ينقل ملكيته لنفسه');
r = await req('PATCH', '/quizzes?id=eq.qz5', { token: T2, body: { allowed_retake_student_ids: [] } });
ok(r.status < 300, 'صاحب صلاحية الإعادة يغيّر قائمة الإعادة فقط');
r = await req('PATCH', '/quizzes?id=eq.qz5', { token: T, body: { title: 'مؤقت' } });
ok(r.status < 300, 'صاحب الاختبار يعدّله');
r = await req('POST', '/rpc/set_config', { token: S, body: { setting_name: 'itqan.internal', new_value: '1', is_local: false } });
ok(r.status >= 400, 'لا يمكن تفعيل صلاحيات الخادم من المتصفح');

// منذ 008: اختبار المعلم يحتاج اعتماد المدير قبل أن يظهر للطلاب
ok(SQL("select status from quizzes where id='qz5'") === 'pending_approval', 'اختبار المعلم ينتظر الاعتماد');
r = await req('PATCH', '/quizzes?id=eq.qz5', { token: A, body: { status: 'published' } });
ok(r.status < 300 && SQL("select status from quizzes where id='qz5'") === 'published', 'المدير يعتمده');

console.log('— مؤقت الخادم');
const s1 = (await rpc('itqan_start_quiz', { p_quiz_id: 'qz5' }, S)).json;
ok(s1.ok && s1.started_at && s1.ends_at, 'بدء الاختبار يسجّل وقت البدء');
const span = (new Date(s1.ends_at) - new Date(s1.started_at)) / 1000;
ok(Math.abs(span - 60) < 2, `وقت النهاية = البدء + المدة (${span} ثانية)`);
await new Promise((res) => setTimeout(res, 1200));
const s2 = (await rpc('itqan_start_quiz', { p_quiz_id: 'qz5' }, S)).json;
ok(s2.started_at === s1.started_at && s2.ends_at === s1.ends_at, 'إعادة البدء (تحديث الصفحة) تكمل نفس المؤقت');
ok((await rpc('itqan_start_quiz', { p_quiz_id: 'qz2' }, S)).json.error === 'quiz_not_available', 'لا يبدأ اختبار صف آخر');

console.log('— إخفاء الإجابات حتى انتهاء الإتاحة');
let qs = (await rpc('itqan_student_quizzes', {}, S)).json.find((q) => q.id === 'qz5');
ok(!hasAnswers(qs.questions), 'قبل التسليم: الإجابات مخفية');
const sub = (await rpc('itqan_submit_quiz', { p_quiz_id: 'qz5', p_answers: [{ question_id: 'q1', selected_option: 1 }, { question_id: 'q2', selected_option: null, text_answer: 'نص' }], p_time_spent: 9999 }, S)).json;
ok(sub.ok && sub.submission.score == 2, `التصحيح على الخادم: ${sub.submission?.score}/5`);
ok(sub.submission.time_spent_seconds <= 5, `الوقت المستغرق محسوب من الخادم: ${sub.submission?.time_spent_seconds} ثانية`);
ok(!hasAnswers(sub.questions) && sub.answers_revealed === false, 'بعد التسليم والاختبار ما زال متاحاً: الإجابات مخفية');
qs = (await rpc('itqan_student_quizzes', {}, S)).json.find((q) => q.id === 'qz5');
ok(!hasAnswers(qs.questions), 'وفي قائمة اختباراته كذلك');
ok(SQL("select count(*) from itqan.quiz_attempts where quiz_id='qz5'") === '0', 'المحاولة الجارية أُغلقت بعد التسليم');
ok((await rpc('itqan_start_quiz', { p_quiz_id: 'qz5' }, S)).json.error === 'already_submitted', 'لا يبدأ من جديد بعد التسليم');
SQL(`update quizzes set end_date = now() - interval '1 minute' where id='qz5'`);
qs = (await rpc('itqan_student_quizzes', {}, S)).json.find((q) => q.id === 'qz5');
ok(hasAnswers(qs.questions) && qs.answers_revealed === true, 'بعد انتهاء الإتاحة: تظهر الإجابات النموذجية');

console.log('— التواريخ القديمة (تاريخ بلا وقت)');
ok(SQL("select itqan.window_end('2026-11-01') = '2026-11-01 23:59:59.999+03'::timestamptz") === 't', 'نهاية اليوم بتوقيت الرياض');
ok(SQL("select itqan.window_end('2026-11-01T00:00:00+00:00') = '2026-11-01 23:59:59.999+03'::timestamptz") === 't', 'ونفس الشيء لمنتصف الليل UTC');
ok(SQL("select itqan.window_start('2026-11-01') = '2026-11-01 00:00+03'::timestamptz") === 't', 'بداية اليوم بتوقيت الرياض');
ok(SQL("select itqan.window_end('2026-11-01T21:30:00+00:00') = '2026-11-01T21:30:00+00:00'::timestamptz") === 't', 'الوقت الكامل يبقى كما هو');

console.log('— تصحيح المقالي');
const sid = sub.submission.id;
const graded = sub.submission.answers_json.map((a) => (a.question_id === 'q2' ? { ...a, marks_awarded: 3, graded: true, is_correct: true } : a));
r = await req('PATCH', `/submissions?id=eq.${sid}`, { token: T, body: { answers_json: graded, score: 5, percentage: 100 }, prefer: 'return=representation' });
ok(r.status < 300 && r.json[0]?.score == 5, 'المعلم يحفظ درجة المقالي');
r = await req('PATCH', `/submissions?id=eq.${sid}`, { token: S, body: { score: 100 }, prefer: 'return=representation' });
ok(Array.isArray(r.json) && r.json.length === 0 && SQL(`select score from submissions where id='${sid}'`) === '5', 'الطالب لا يغيّر درجته');

console.log(`\nالنتيجة: ${pass} ناجح، ${fail} فاشل`);
process.exit(fail ? 1 : 0);
