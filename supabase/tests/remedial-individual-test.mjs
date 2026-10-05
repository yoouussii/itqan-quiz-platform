// اختبارات 055: اختبار علاجي فردي — أسئلة محددة لكل طالب والتصحيح عليها.
// تُشغَّل على قاعدة بيانات فيها 001–055 والبيانات التجريبية (seed.sql).
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
const S1 = SQL("select id from users where national_id='4040'"), S2id = SQL("select id from users where national_id='5050'");
const questions = Array.from({ length: 6 }, (_, i) => ({ id: `rq-${i + 1}`, type: 'mcq', question_text: `س${i + 1}`, options: ['a', 'b'], correct_option_index: 0, marks: i + 1 }));
SQL("delete from submissions where quiz_id='qr1'; delete from quizzes where id='qr1'; delete from itqan.quiz_attempts");
const r0 = await req('POST', '/quizzes', { token: A, body: { id: 'qr1', title: 'علاجي', teacher_id: 'u-teach', created_by: 'u-admin', status: 'published', duration_minutes: 10, end_date: future,
  questions_per_student: 2, student_questions: { [S1]: ['rq-2', 'rq-5'], [S2id]: ['rq-1', 'rq-6', 'rq-missing'] }, questions,
  assignments: [{ target_type: 'specific_students', target_id: `${S1},${S2id}` }], allowed_retake_student_ids: [] } });
ok(r0.status < 300, 'إنشاء اختبار علاجي فردي');

const a = (await rpc('itqan_served_questions', { p_quiz_id: 'qr1' }, S)).json;
const b = (await rpc('itqan_served_questions', { p_quiz_id: 'qr1' }, S2)).json;
ok(JSON.stringify(a.question_ids?.slice().sort()) === JSON.stringify(['rq-2', 'rq-5']), 'الطالب الأول يأخذ أسئلته المحددة');
ok(JSON.stringify(b.question_ids?.slice().sort()) === JSON.stringify(['rq-1', 'rq-6']), 'الطالب الثاني أسئلته (ويتجاهل المعرّف غير الموجود)');

await rpc('itqan_start_quiz', { p_quiz_id: 'qr1' }, S);
let r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qr1', p_answers: questions.map((q) => ({ question_id: q.id, selected_option: q.id === 'rq-2' ? 0 : 1 })), p_time_spent: 20, p_client_id: 'qr1-a', p_integrity: { leaves: 0, away_seconds: 0 } }, S);
const sub = r.json?.submission;
ok(sub && Number(sub.score) === 2 && Number(sub.total_possible_score) === 7 && Number(sub.percentage) === 29, 'الدرجة على أسئلته فقط (2 من 7)');
ok(sub && sub.answers_json.length === 2 && sub.answers_json.every((x) => ['rq-2', 'rq-5'].includes(x.question_id)), 'ورقة الإجابة فيها أسئلته فقط');

SQL("update quizzes set student_questions = null where id='qr1'");
ok((await rpc('itqan_served_questions', { p_quiz_id: 'qr1' }, S2)).json.question_ids.length === 2, 'بلا أسئلة محددة: يعود للاختيار العشوائي (016)');
SQL("update quizzes set questions_per_student = null where id='qr1'");
ok((await rpc('itqan_served_questions', { p_quiz_id: 'qr1' }, S2)).json.question_ids.length === 6, 'بلا إعداد: كل الأسئلة');
SQL("delete from submissions where quiz_id='qr1'; delete from quizzes where id='qr1'; delete from itqan.quiz_attempts");

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
