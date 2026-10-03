// اختبارات 021: تحدي اليوم (أسئلة بلا إجابات وتصحيح على الخادم)، الأيام المتتالية، ترتيب الفصل، والإعدادات.
// تُشغَّل على قاعدة بيانات فيها 001–021 والبيانات التجريبية (seed.sql).
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
const ME = '11111111-1111-1111-1111-111111111111';

SQL('delete from itqan.login_attempts');
SQL(`insert into subjects (id,name,color) values ('sb1','رياضيات','#2a78d6'),('sb2','علوم','#1baf7a') on conflict do nothing`);
SQL(`update quizzes set subject_id='sb1', pass_percentage=50 where id='qz1'`);
SQL(`insert into users (id,name,role,national_id,password,class_id) values ('u-st3','طالب ج','student','6060','stud123','c1') on conflict do nothing`);
let vals = [];
for (let i = 1; i <= 7; i++) vals.push(`('bq${i}','sb1','mcq','{"question_text":"س${i}","options":["أ","ب","ج"],"correct_option_index":${i % 3},"explanation":"شرح${i}"}',true,'u-teach')`);
vals.push(`('bq-tf','sb1','true_false','{"question_text":"صح؟","options":["صح","خطأ"],"correct_option_index":0}',true,'u-teach')`);
vals.push(`('bq-private','sb1','mcq','{"question_text":"خاص","options":["أ","ب"],"correct_option_index":0}',false,'u-teach')`);
vals.push(`('bq-essay','sb1','essay','{"question_text":"مقال"}',true,'u-teach')`);
vals.push(`('bq-other','sb2','mcq','{"question_text":"مادة أخرى","options":["أ","ب"],"correct_option_index":0}',true,'u-teach')`);
SQL(`insert into question_bank (id,subject_id,type,question,shared,created_by) values ${vals.join(',')} on conflict do nothing`);

const S = await login('4040', 'itqan123');
const S3 = await login('6060', 'stud123');
const T = await login('2020', 'teach123');
const A = await login('1010', 'admin123');
ok(S && S3 && T && A, 'تسجيل الدخول');

console.log('— قبل التحدي');
let r = await rpc('itqan_student_home', {}, S);
ok(r.json?.challenge?.enabled === true && r.json.challenge.done === false && r.json.challenge.count === 5, 'التحدي متاح ولم يُحل بعد (5 أسئلة)');
ok(r.json?.streak?.current === 0 && r.json.streak.week.length === 7, 'لا أيام متتالية بعد، و7 أيام للأسبوع');
r = await rpc('itqan_student_home', {}, T);
ok(r.json === null, 'المعلم لا يحصل على بيانات رئيسية الطالب');
r = await rpc('itqan_daily_challenge', {}, T);
ok(r.status >= 400, 'المعلم لا يبدأ تحدياً');

console.log('— بدء التحدي');
r = await rpc('itqan_daily_challenge', {}, S);
const qs = r.json?.questions || [];
ok(qs.length === 5, 'خمسة أسئلة');
const raw = JSON.stringify(qs);
ok(!/correct_option_index|شرح/.test(raw), 'الأسئلة بلا إجابات ولا شرح');
ok(qs.every((q) => q.subject_id === 'sb1' && ['mcq', 'true_false'].includes(q.type)) && !/bq-private|bq-essay|bq-other/.test(raw), 'من بنك مواد الطالب المشترك فقط (اختيار وصح/خطأ)');
ok(qs[0]?.subject_name === 'رياضيات' && Array.isArray(qs[0]?.options), 'السؤال فيه اسم المادة والاختيارات');
r = await rpc('itqan_daily_challenge', {}, S);
ok(JSON.stringify(r.json?.questions?.map((q) => q.id)) === JSON.stringify(qs.map((q) => q.id)), 'نفس الأسئلة عند الفتح مرة أخرى');
r = await req('POST', '/daily_challenge_attempts', { token: S, body: { student_id: ME, day: '2020-01-01', completed_at: new Date().toISOString(), points: 999 } });
ok(r.status >= 400, 'الطالب لا يكتب في جدول المحاولات مباشرة');
r = await req('PATCH', `/daily_challenge_attempts?student_id=eq.${ME}`, { token: S, body: { points: 999 } });
ok(r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0), 'الطالب لا يعدّل محاولته مباشرة');

console.log('— التسليم');
const correct = qs.map((q) => Number(SQL(`select question->>'correct_option_index' from question_bank where id='${q.id}'`)));
const answers = correct.map((c, i) => (i === 0 ? (c + 1) % 2 : c)); // خطأ في الأول فقط
r = await rpc('itqan_submit_daily_challenge', { p_answers: answers }, S);
ok(r.json?.correct === 4 && r.json.total === 5 && r.json.points === 17, 'التصحيح على الخادم: 4/5 = 17 نقطة');
ok(r.json?.results?.[0]?.correct === false && r.json.results[1].correct === true && r.json.results[0].correct_option_index === correct[0], 'النتيجة لكل سؤال مع الإجابة الصحيحة');
ok(r.json?.results?.some((x) => /^شرح/.test(x.explanation)), 'الشرح يظهر بعد التسليم');
r = await rpc('itqan_submit_daily_challenge', { p_answers: correct }, S);
ok(r.status >= 400 && /already_done/.test(JSON.stringify(r.json)), 'لا يُسلَّم مرتين في اليوم');
r = await rpc('itqan_daily_challenge', {}, S);
ok(r.status >= 400, 'لا يبدأ تحدياً جديداً في نفس اليوم');
ok(SQL(`select points||':'||source from student_awards where student_id='${ME}' and source='daily_challenge'`) === '17:daily_challenge', 'النقاط سُجّلت كجائزة من النظام');
r = await req('GET', '/daily_challenge_attempts?select=student_id', { token: S3 });
ok(Array.isArray(r.json) && r.json.length === 0, 'طالب آخر لا يرى محاولة غيره');
r = await req('GET', '/daily_challenge_attempts?select=student_id', { token: T });
ok(Array.isArray(r.json) && r.json.length === 1, 'المعلم يرى المحاولات');

console.log('— الأيام المتتالية');
r = await rpc('itqan_student_home', {}, S);
ok(r.json?.challenge?.done === true && r.json.challenge.points === 17, 'الرئيسية: التحدي محلول و17 نقطة');
ok(r.json?.streak?.current === 1 && r.json.streak.week[6].active === true && r.json.streak.week[5].active === false, 'يوم واحد متتالٍ (اليوم)');
const day = (n) => `(now() - interval '${n} days')`;
SQL(`insert into submissions (id,quiz_id,student_id,score,total_possible_score,percentage,completed_at) values
  ('s-y1','qz1','${ME}',1,10,10,${day(1)}),('s-y2','qz1','${ME}',1,10,10,${day(2)}),
  ('s-y5','qz1','${ME}',1,10,10,${day(5)}),('s-y6','qz1','${ME}',1,10,10,${day(6)}),('s-y7','qz1','${ME}',1,10,10,${day(7)}),('s-y8','qz1','${ME}',1,10,10,${day(8)})`);
r = await rpc('itqan_student_home', {}, S);
ok(r.json?.streak?.current === 3, 'السلسلة الحالية 3 أيام (اليوم وأمس وقبله)');
ok(r.json?.streak?.longest === 4, 'أطول سلسلة 4 أيام');

console.log('— ترتيب الفصل');
SQL(`insert into submissions (id,quiz_id,student_id,score,total_possible_score,percentage,completed_at) values ('s-st3','qz1','u-st3',10,10,100,now())`);
r = await rpc('itqan_student_home', {}, S);
const board = r.json?.leaderboard || [];
// st3: 10+20+5+15 = 50. أنا: أفضل نتيجة (10%) تحققت أول مرة قبل 8 أيام فلا تُحسب هذا الأسبوع، يبقى 17 من التحدي
ok(board.length === 2 && board[0].name === 'طالب ج' && board[0].points === 50, 'الأول: طالب ج بـ 50 نقطة');
ok(board[1].me === true && board[1].points === 17 && r.json.my_rank === 2, 'أنا الثاني بـ 17 نقطة (نقاط التحدي)');
ok(!board.some((b) => b.name === 'طالب ب'), 'طلاب الفصول الأخرى لا يظهرون');
r = await rpc('itqan_student_home', {}, S3);
ok(r.json?.challenge?.solved_by_classmates === 1, 'زميل الفصل يرى أن واحداً حلّ تحدي اليوم');

console.log('— الوقت على الخادم');
r = await rpc('itqan_daily_challenge', {}, S3);
ok(r.json?.seconds > 100 && r.json.seconds <= 120, 'الوقت 24 ثانية لكل سؤال (دقيقتان لخمسة)');
SQL(`update daily_challenge_attempts set started_at = now() - interval '100 seconds' where student_id='u-st3'`);
r = await rpc('itqan_daily_challenge', {}, S3);
ok(r.json?.seconds <= 20, 'إعادة الفتح لا تُصفّر العدّاد');
SQL(`update daily_challenge_attempts set started_at = now() - interval '10 minutes' where student_id='u-st3'`);
const ids3 = r.json.questions.map((q) => q.id);
const right3 = ids3.map((id) => Number(SQL(`select question->>'correct_option_index' from question_bank where id='${id}'`)));
r = await rpc('itqan_submit_daily_challenge', { p_answers: right3 }, S3);
ok(r.json?.correct === 0 && r.json.points === 5, 'الإجابات بعد انتهاء الوقت لا تُحسب');
SQL(`delete from daily_challenge_attempts where student_id='u-st3'; delete from student_awards where student_id='u-st3'`);

console.log('— نقاط التحدي بشكل الجوائز');
SQL(`insert into student_awards (id,student_id,title,points,created_at,source) values
  ('dc-old1','${ME}','تحدي اليوم',10,now()-interval '12 days','daily_challenge'),('dc-old2','${ME}','تحدي اليوم',8,now()-interval '20 days','daily_challenge'),
  ('dc-old3','${ME}','تحدي اليوم',6,now()-interval '60 days','daily_challenge'),('dc-st2','u-st2','تحدي اليوم',9,now(),'daily_challenge')`);
r = await rpc('itqan_challenge_awards', {}, S);
ok(Array.isArray(r.json) && r.json.length === 4 && r.json.every((a) => a.student_id === ME), 'الطالب يرى نقاط تحدياته فقط (كلها)');
r = await rpc('itqan_challenge_awards', {}, T);
const mineT = (r.json || []).filter((a) => a.student_id === ME);
const sum = (l) => l.reduce((x, a) => x + a.points, 0);
ok(mineT.length === 3 && sum(mineT) === 41, 'المعلم: الأسبوع يوماً بيوم وما قبله مجمّع (المجموع صحيح)');
ok(mineT.some((a) => a.id.startsWith('dc-agg-m') && a.points === 18) && mineT.some((a) => a.id.startsWith('dc-agg-o') && a.points === 6), 'التجميع: 8–30 يوماً، وأقدم من 30');
ok((r.json || []).some((a) => a.student_id === 'u-st2'), 'المعلم يرى طلاب الفصول الأخرى');
r = await req('GET', '/student_awards?select=id&source=neq.daily_challenge', { token: S });
ok(Array.isArray(r.json) && !r.json.some((a) => a.id.startsWith('dc-')), 'التحميل العام يستثني نقاط التحدي');

console.log('— الإعدادات');
r = await req('POST', '/app_settings?on_conflict=key', { token: T, body: { key: 'student_home', value: { challenge: false }, updated_at: new Date().toISOString() } });
ok(r.status >= 400, 'المعلم لا يغيّر إعدادات الرئيسية');
SQL(`insert into app_settings(key,value,updated_at) values ('student_home','{"challenge":false,"leaderboard":false}',now()) on conflict (key) do update set value=excluded.value`);
r = await rpc('itqan_student_home', {}, S3);
ok(r.json?.challenge?.enabled === false && r.json.leaderboard.length === 0, 'إيقاف التحدي والترتيب من الإعدادات');
r = await rpc('itqan_daily_challenge', {}, S3);
ok(r.status >= 400 && /challenge_disabled/.test(JSON.stringify(r.json)), 'لا يبدأ التحدي وهو موقوف');
SQL(`update app_settings set value='{"challenge_count":3}' where key='student_home'`);
r = await rpc('itqan_daily_challenge', {}, S3);
ok(r.json?.questions?.length === 3, 'عدد أسئلة التحدي من الإعدادات (3)');
SQL(`update app_settings set value='{"challenge_count":50}' where key='student_home'`);
r = await rpc('itqan_student_home', {}, S3);
ok(r.json?.challenge?.count === 10, 'العدد لا يتجاوز 10');
SQL("delete from app_settings where key='student_home'");

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
