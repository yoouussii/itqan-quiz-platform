// اختبارات 014: إعدادات الحد من الغش وسجل الخروج من صفحة الاختبار.
// تُشغَّل على قاعدة بيانات فيها 001–014 والبيانات التجريبية (seed.sql).
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
SQL("update users set password='stud12345' where id in ('11111111-1111-1111-1111-111111111111','u-st2')");
const S = await login('4040', 'stud12345');
const S2 = await login('5050', 'stud12345');
const future = new Date(Date.now() + 86400e3).toISOString();

console.log('— إعدادات الاختبار');
const quiz = { id: 'qi1', title: 'نزاهة', teacher_id: 'u-teach', created_by: 'u-teach', status: 'published', duration_minutes: 10, end_date: future,
  shuffle_questions: true, shuffle_options: true, require_fullscreen: true,
  questions: [{ id: 'q1', type: 'mcq', question_text: 'x', options: ['a', 'b', 'c'], correct_option_index: 2, marks: 2 }],
  assignments: [{ target_type: 'class', target_id: 'c1' }, { target_type: 'class', target_id: 'c2' }], allowed_retake_student_ids: [] };
let r = await req('POST', '/quizzes', { token: A, body: quiz });
ok(r.status < 300, 'المدير ينشئ اختباراً بإعدادات الحد من الغش');
ok(SQL("select shuffle_questions::text || shuffle_options::text || require_fullscreen::text from quizzes where id='qi1'") === 'truetruetrue', 'الإعدادات محفوظة');
const mine = (await rpc('itqan_student_quizzes', {}, S)).json.find((q) => q.id === 'qi1');
ok(mine && mine.shuffle_questions === true && mine.require_fullscreen === true, 'الطالب يستلم الإعدادات مع الاختبار');
ok(mine && !JSON.stringify(mine.questions).includes('correct_option_index'), 'والإجابات ما زالت مخفية');

console.log('— التسليم مع سجل الخروج');
await rpc('itqan_start_quiz', { p_quiz_id: 'qi1' }, S);
r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qi1', p_answers: [{ question_id: 'q1', selected_option: 2 }], p_time_spent: 30, p_client_id: 'sub-i1',
  p_integrity: { leaves: 3, away_seconds: 47.6, fullscreen_exits: 1, hacked: 'x', score: 100 } }, S);
ok(r.json.ok && r.json.submission.percentage === 100, 'التصحيح على الخادم كما هو');
ok(JSON.stringify(r.json.submission.integrity) === JSON.stringify({ leaves: 3, away_seconds: 48, fullscreen_exits: 1 }), 'السجل محفوظ بالقيم المسموحة فقط ' + JSON.stringify(r.json.submission.integrity));
r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qi1', p_answers: [], p_time_spent: 30, p_client_id: 'sub-i1', p_integrity: { leaves: 0, away_seconds: 0 } }, S);
ok(r.json.ok && SQL("select integrity->>'leaves' from submissions where id='sub-i1'") === '3', 'إعادة الإرسال لا تمسح السجل');
r = await req('PATCH', '/submissions?id=eq.sub-i1', { token: S, body: { integrity: { leaves: 0, away_seconds: 0 } } });
ok(SQL("select integrity->>'leaves' from submissions where id='sub-i1'") === '3', 'الطالب لا يعدّل سجله مباشرة');

console.log('— قيم غير صالحة');
await rpc('itqan_start_quiz', { p_quiz_id: 'qi1' }, S2);
r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qi1', p_answers: [], p_time_spent: 5, p_client_id: 'sub-i2',
  p_integrity: { leaves: -5, away_seconds: 1e12, fullscreen_exits: 'many' } }, S2);
ok(r.json.ok && JSON.stringify(r.json.submission.integrity) === JSON.stringify({ leaves: 0, away_seconds: 100000 }), 'القيم السالبة والكبيرة والنصية تُضبط أو تُهمل ' + JSON.stringify(r.json.submission.integrity));

console.log('— الحالات الأخرى');
r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qi1', p_answers: [], p_time_spent: 5, p_client_id: 'sub-i3', p_integrity: { leaves: 1, away_seconds: 2 } }, S);
ok(r.json.ok === false && r.json.error === 'already_submitted', 'التسليم المكرر يُرفض كما في الدالة الأصلية');
ok(SQL("select integrity->>'leaves' from submissions where id='sub-i1'") === '3', 'ولا يغيّر سجل التسليم الأول');
r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qi1', p_answers: [], p_time_spent: 5, p_client_id: 'sub-i4', p_integrity: { leaves: 1, away_seconds: 2 } }, A);
ok(r.json.ok === false && r.json.error === 'no_session', 'غير الطالب لا يسلّم');
r = await rpc('itqan_submit_quiz_v2', { p_quiz_id: 'qi1', p_answers: [], p_time_spent: 5, p_client_id: 'sub-i5', p_integrity: { leaves: 1 } });
ok(r.json.ok === false, 'بدون جلسة يُرفض');
const T = await login('2020', 'teach123');
r = await req('GET', '/submissions?id=eq.sub-i1&select=integrity', { token: T });
ok(Array.isArray(r.json) && r.json[0]?.integrity?.leaves === 3, 'المعلم يقرأ السجل مع النتيجة');

SQL("delete from submissions where quiz_id='qi1'; delete from quizzes where id='qi1'");
console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
