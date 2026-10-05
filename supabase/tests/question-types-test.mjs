// اختبارات 059: أنواع الأسئلة الجديدة — ما يستلمه الطالب، والتصحيح في الخادم.
// تُشغَّل على قاعدة بيانات فيها 001–059 والبيانات التجريبية (seed.sql).
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
const questions = [
  { id: 'n1', type: 'mcq', question_text: 'اختيار', options: ['a', 'b'], correct_option_index: 1, marks: 1 },
  { id: 'n2', type: 'multi_select', question_text: 'متعدد', options: ['a', 'b', 'c', 'd'], correct_indexes: [0, 2], marks: 2 },
  { id: 'n3', type: 'fill_blank', question_text: 'عاصمة مصر ____', accepted_answers: ['القاهرة', 'Cairo'], marks: 1 },
  { id: 'n4', type: 'numeric', question_text: 'ط تقريباً', correct_number: 3.14, tolerance: 0.01, marks: 1 },
  { id: 'n5', type: 'ordering', question_text: 'رتّب', items: [{ id: 'oa', text: 'واحد' }, { id: 'ob', text: 'اثنان' }, { id: 'oc', text: 'ثلاثة' }], marks: 2 },
  { id: 'n6', type: 'matching', question_text: 'وصّل', pairs: [{ id: 'm1', left: 'مصر', right: 'القاهرة' }, { id: 'm2', left: 'السعودية', right: 'الرياض' }], marks: 2 },
];
SQL("delete from submissions where quiz_id='qt1'; delete from quizzes where id='qt1'; delete from itqan.quiz_attempts");
let r = await req('POST', '/quizzes', { token: A, body: { id: 'qt1', title: 'أنواع جديدة', teacher_id: 'u-teach', created_by: 'u-admin', status: 'published', duration_minutes: 10, end_date: future,
  questions, assignments: [{ target_type: 'class', target_id: 'c1' }, { target_type: 'class', target_id: 'c2' }], allowed_retake_student_ids: [] } });
ok(r.status < 300, 'إنشاء اختبار بالأنواع الجديدة');

console.log('— ما يستلمه الطالب');
const start = (await rpc('itqan_start_quiz', { p_quiz_id: 'qt1' }, S)).json;
const sq = (await rpc('itqan_student_quizzes', {}, S)).json;
const row = Array.isArray(sq) ? sq.find((x) => x.id === 'qt1') : null;
ok(!!row, 'الاختبار يصل للطالب عبر itqan_student_quizzes');
const qs = row.questions;
const g = (id) => qs.find((x) => x.id === id);
ok(g('n2') && !('correct_indexes' in g('n2')) && g('n2').answers_hidden, 'لا مفاتيح لاختيار متعدد الإجابات');
ok(!('accepted_answers' in g('n3')) && !('correct_number' in g('n4')) && !('tolerance' in g('n4')), 'لا إجابات للفراغ والرقمي');
ok(!('pairs' in g('n6')) && g('n6').match_left.length === 2 && g('n6').match_right.every((x) => !['m1', 'm2'].includes(x.id)), 'التوصيل برموز لا تكشف الأزواج');
ok(g('n5').items.length === 3, 'عناصر الترتيب مرسلة (مخلوطة)');

console.log('— التصحيح');
const tok = (pid) => SQL(`select itqan.match_token('n6','${pid}')`);
const answers = [
  { question_id: 'n1', selected_option: 1 },
  { question_id: 'n2', selected_options: [2, 0] },
  { question_id: 'n3', text_answer: ' القاهره ' },
  { question_id: 'n4', text_answer: '٣٫١٤' },
  { question_id: 'n5', order: ['oa', 'ob', 'oc'] },
  { question_id: 'n6', matches: { m1: tok('m1'), m2: tok('m1') } },
];
r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qt1', p_answers: answers, p_time_spent: 20, p_client_id: 'qt1-s1', p_integrity: { leaves: 0, away_seconds: 0 } }, S);
const sub = r.json?.submission;
const a = (id) => sub?.answers_json?.find((x) => x.question_id === id);
ok(a('n1')?.is_correct && a('n2')?.is_correct && a('n3')?.is_correct && a('n4')?.is_correct && a('n5')?.is_correct, 'الأنواع الخمسة تُصحَّح صحيحة');
ok(Number(a('n6')?.marks_awarded) === 1 && a('n6')?.parts_correct === 1 && !a('n6')?.is_correct, 'التوصيل: درجة جزئية');
ok(Number(sub.score) === 8 && Number(sub.total_possible_score) === 9, 'المجموع 8 من 9');

SQL("update quizzes set allowed_retake_student_ids = array['" + SQL("select id from users where national_id='4040'") + "'] where id='qt1'");
await rpc('itqan_start_quiz', { p_quiz_id: 'qt1' }, S);
r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qt1', p_answers: [
  { question_id: 'n2', selected_options: [0] }, { question_id: 'n3', text_answer: 'الجيزة' }, { question_id: 'n4', text_answer: 'abc' },
  { question_id: 'n5', order: ['ob', 'oa', 'oc'] }, { question_id: 'n6', matches: {} }], p_time_spent: 20, p_client_id: 'qt1-s2', p_integrity: { leaves: 0, away_seconds: 0 } }, S);
const s2 = r.json?.submission;
ok(s2 && Number(s2.score) === 0 && s2.answers_json.every((x) => !x.is_correct), 'الإجابات الخاطئة والفارغة: صفر');
SQL("delete from submissions where quiz_id='qt1'; delete from quizzes where id='qt1'; delete from itqan.quiz_attempts");

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
