// اختبارات 016: أسئلة مختلفة لكل طالب — اختيار الخادم ثابت، والتصحيح على أسئلة الطالب فقط.
// تُشغَّل على قاعدة بيانات فيها 001–016 والبيانات التجريبية (seed.sql).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const BASE = 'http://localhost:3001';
const ANON = readFileSync(process.argv[2], 'utf8').trim();
const SQL = (q) => execFileSync('psql', ['postgres://postgres:postgres@localhost:54322/postgres', '-tA', '-c', q]).toString().trim();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗ FAIL:', m); };
async function req(method, path, { token, body } = {}) {
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };
  if (token) headers['x-itqan-session'] = token;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let json; try { json = JSON.parse(t); } catch { json = t; }
  return { status: r.status, json };
}
const rpc = (fn, body, token) => req('POST', `/rpc/${fn}`, { token, body });
const login = async (id, pw) => (await rpc('itqan_login', { p_national_id: id, p_password: pw })).json.token;

SQL("delete from itqan.login_attempts");
const A = await login('1010', 'admin123');
SQL("update users set password='stud12345' where role='student'");
const S = await login('4040', 'stud12345');
const S2 = await login('5050', 'stud12345');
const future = new Date(Date.now() + 86400e3).toISOString();
const questions = Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}`, type: 'mcq', question_text: `س${i + 1}`, options: ['a', 'b'], correct_option_index: 0, marks: i === 0 ? 5 : 1 }));
await req('POST', '/quizzes', { token: A, body: { id: 'qp1', title: 'مجموعة', teacher_id: 'u-teach', created_by: 'u-admin', status: 'published', duration_minutes: 10, end_date: future,
  questions_per_student: 3, questions, assignments: [{ target_type: 'class', target_id: 'c1' }, { target_type: 'class', target_id: 'c2' }], allowed_retake_student_ids: [] } });
ok(SQL("select questions_per_student from quizzes where id='qp1'") === '3', 'الإعداد محفوظ');

console.log('— اختيار الأسئلة');
const s1 = (await rpc('itqan_served_questions', { p_quiz_id: 'qp1' }, S)).json;
const s1b = (await rpc('itqan_served_questions', { p_quiz_id: 'qp1' }, S)).json;
const s2 = (await rpc('itqan_served_questions', { p_quiz_id: 'qp1' }, S2)).json;
ok(s1.ok && s1.question_ids.length === 3, 'الطالب يأخذ 3 أسئلة من 10');
ok(JSON.stringify(s1.question_ids) === JSON.stringify(s1b.question_ids), 'نفس الأسئلة في كل مرة');
ok(s2.ok && JSON.stringify([...s1.question_ids].sort()) !== JSON.stringify([...s2.question_ids].sort()), 'طالب آخر يأخذ مجموعة مختلفة');
ok((await rpc('itqan_served_questions', { p_quiz_id: 'qp1' }, A)).json.error === 'no_session', 'غير الطالب لا يستخدمها');
SQL("update quizzes set status='draft' where id='qp1'");
ok((await rpc('itqan_served_questions', { p_quiz_id: 'qp1' }, S)).json.error === 'quiz_not_available', 'اختبار غير متاح: رفض');
SQL("update quizzes set status='published' where id='qp1'");

console.log('— التصحيح');
const mine = s1.question_ids;
const others = questions.map((q) => q.id).filter((id) => !mine.includes(id));
const possible = questions.filter((q) => mine.includes(q.id)).reduce((s, q) => s + q.marks, 0);
await rpc('itqan_start_quiz', { p_quiz_id: 'qp1' }, S);
// يجيب صح على أسئلته، وعلى أسئلة ليست له أيضاً (لا يجب أن تُحسب)
const answers = questions.map((q) => ({ question_id: q.id, selected_option: 0 }));
let r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qp1', p_answers: answers, p_time_spent: 20, p_client_id: 'sp1', p_integrity: { leaves: 0, away_seconds: 0 } }, S);
const sub = r.json.submission;
ok(r.json.ok && Number(sub.total_possible_score) === possible && Number(sub.score) === possible && Number(sub.percentage) === 100, `الدرجة على أسئلته فقط (${sub.score}/${sub.total_possible_score})`);
ok(sub.answers_json.length === 3 && sub.answers_json.every((a) => mine.includes(a.question_id)), 'ورقة الإجابة فيها أسئلته فقط');
ok(sub.integrity && sub.integrity.leaves === 0, 'سجل الخروج ما زال يُحفظ');
r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qp1', p_answers: answers, p_time_spent: 20, p_client_id: 'sp1', p_integrity: { leaves: 0, away_seconds: 0 } }, S);
ok(r.json.ok && Number(r.json.submission.total_possible_score) === possible && r.json.submission.answers_json.length === 3, 'إعادة الإرسال لا تغيّر شيئاً');

await rpc('itqan_start_quiz', { p_quiz_id: 'qp1' }, S2);
const mine2 = s2.question_ids;
r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qp1', p_answers: questions.map((q) => ({ question_id: q.id, selected_option: mine2.includes(q.id) ? 1 : 0 })), p_time_spent: 20, p_client_id: 'sp2', p_integrity: { leaves: 1, away_seconds: 3 } }, S2);
ok(r.json.ok && Number(r.json.submission.score) === 0 && Number(r.json.submission.percentage) === 0, 'الإجابات الصحيحة على أسئلة ليست له لا تُحسب (0%)');

console.log('— بدون الإعداد');
SQL("update quizzes set questions_per_student=null where id='qp1'; delete from submissions where quiz_id='qp1'; delete from itqan.quiz_attempts");
ok((await rpc('itqan_served_questions', { p_quiz_id: 'qp1' }, S)).json.question_ids.length === 10, 'فارغ = كل الأسئلة');
await rpc('itqan_start_quiz', { p_quiz_id: 'qp1' }, S);
r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qp1', p_answers: answers, p_time_spent: 20, p_client_id: 'sp3', p_integrity: { leaves: 0, away_seconds: 0 } }, S);
ok(r.json.ok && Number(r.json.submission.total_possible_score) === 14 && r.json.submission.answers_json.length === 10, 'التصحيح على كل الأسئلة كالمعتاد (وورقة الإجابة بلا عناصر زائدة)');
SQL("update quizzes set questions_per_student=20 where id='qp1'");
ok((await rpc('itqan_served_questions', { p_quiz_id: 'qp1' }, S)).json.question_ids.length === 10, 'عدد أكبر من الأسئلة = كل الأسئلة');

SQL("delete from submissions where quiz_id='qp1'; delete from quizzes where id='qp1'");
console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
