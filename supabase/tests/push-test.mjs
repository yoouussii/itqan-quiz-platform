// اختبارات 017: اشتراكات أجهزة الإشعارات، ومستلمو الإشعار (ومعهم أولياء الأمور)، واستدعاء دالة الإرسال.
// تُشغَّل على قاعدة بيانات فيها 001–017 والبيانات التجريبية (seed.sql).
// يحتاج أن تصل قاعدة البيانات إلى هذا الجهاز: PUSH_HOST (افتراضياً 172.17.0.1 لحاوية Docker).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
const BASE = 'http://localhost:3001';
const ANON = readFileSync(process.argv[2], 'utf8').trim();
const HOST = process.env.PUSH_HOST || '172.17.0.1';
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
const rpc = (fn, body, token) => req('POST', `/rpc/${fn}`, { token, body });
const login = async (id, pw) => (await rpc('itqan_login', { p_national_id: id, p_password: pw })).json.token;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// خادم يستقبل طلبات دالة الإرسال
const received = [];
const server = http.createServer((q, s) => { let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => { received.push({ auth: q.headers.authorization, body: JSON.parse(b || '{}') }); s.end('{}'); }); });
await new Promise((r) => server.listen(54400, '0.0.0.0', r));

SQL("delete from itqan.login_attempts; delete from push_subscriptions; delete from itqan.push_config");
const A = await login('1010', 'admin123');
SQL("update users set password='stud12345' where role='student'");
await req('POST', '/users', { token: A, body: { id: 'u-par', name: 'ولي أمر', role: 'parent', national_id: '6060', password: 'par12345', child_ids: ['11111111-1111-1111-1111-111111111111'] } });
const S = await login('4040', 'stud12345');
const S2 = await login('5050', 'stud12345');
const PAR = await login('6060', 'par12345');
const T = await login('2020', 'teach123');
const sub = (id, uid) => ({ endpoint: `https://push.example/${id}`, user_id: uid, p256dh: 'k' + id, auth: 'a' + id });

console.log('— اشتراكات الأجهزة');
let r = await req('POST', '/push_subscriptions', { token: S, body: sub('s1', '11111111-1111-1111-1111-111111111111') });
ok(r.status < 300, 'الطالب يسجّل جهازه');
r = await req('POST', '/push_subscriptions', { token: S, body: sub('x', 'u-st2') });
ok(r.status >= 400, 'لا يسجّل جهازاً باسم غيره');
await req('POST', '/push_subscriptions', { token: S2, body: sub('s2', 'u-st2') });
await req('POST', '/push_subscriptions', { token: PAR, body: sub('p1', 'u-par') });
await req('POST', '/push_subscriptions', { token: T, body: sub('t1', 'u-teach') });
await req('POST', '/push_subscriptions', { token: A, body: sub('a1', 'u-admin') });
r = await req('GET', '/push_subscriptions?select=endpoint', { token: S });
ok(Array.isArray(r.json) && r.json.length === 1 && r.json[0].endpoint.endsWith('/s1'), 'يرى اشتراكات أجهزته فقط');
r = await req('GET', '/push_subscriptions?select=endpoint');
ok(!Array.isArray(r.json) || r.json.length === 0, 'بدون جلسة: لا شيء');
ok((await req('GET', '/push_config', { token: A })).status >= 400, 'إعدادات الإرسال غير مكشوفة');

console.log('— المستلمون');
const rec = (aud, by = null) => SQL(`select coalesce(string_agg(r, ',' order by r), '') from itqan.notification_recipients('${JSON.stringify(aud)}'::jsonb, ${by ? `'${by}'` : 'null'}) r`);
ok(rec({ class_ids: ['c1'] }, 'u-teach') === '11111111-1111-1111-1111-111111111111,u-par', 'اختبار لشعبة أ: طلابها وأولياء أمورهم');
ok(rec({ student_ids: ['u-st2'] }) === 'u-st2', 'طالب محدد');
ok(rec({ all: true, roles: ['teacher', 'supervisor'] }, 'u-admin') === 'u-sup,u-teach', 'الطاقم فقط، بدون المرسل');
ok(rec({ user_ids: ['u-admin'] }) === 'u-admin', 'مستخدم محدد');
ok(rec({ all: true }, 'u-admin').split(',').length === 5 && !rec({ all: true }, 'u-admin').includes('u-admin'), 'الجميع عدا المرسل (5 من 6)');

console.log('— الإرسال');
r = await req('POST', '/notifications', { token: T, body: { id: 'n0', type: 'new_quiz', title: 'بلا إعداد', body: '', audience: { class_ids: ['c1'] }, created_by: 'u-teach' } });
ok(r.status < 300, 'قبل الإعداد: الإشعار يُحفظ ولا شيء يُرسل');
SQL(`insert into itqan.push_config (function_url, secret) values ('http://${HOST}:54400/send', 'sekret')`);
r = await req('POST', '/notifications', { token: T, body: { id: 'n1', type: 'new_quiz', title: 'اختبار جديد: الكسور', body: 'ينتهي غداً', audience: { class_ids: ['c1'] }, ref_type: 'quiz', ref_id: 'qz1', created_by: 'u-teach' } });
ok(r.status < 300, 'المعلم يرسل إشعار اختبار جديد');
for (let i = 0; i < 50 && received.length === 0; i++) await wait(100);
const got = received[0];
ok(!!got && got.auth === 'Bearer sekret', 'استُدعيت دالة الإرسال بالسرّ الصحيح');
ok(!!got && got.body.subscriptions.map((s) => s.endpoint.split('/').pop()).sort().join(',') === 'p1,s1', 'الأجهزة المستهدفة: الطالب وولي أمره فقط');
ok(!!got && got.body.url === '/quiz/qz1' && got.body.title === 'اختبار جديد: الكسور' && got.body.tag === 'n1', 'العنوان والنص والرابط');
received.length = 0;
await req('POST', '/notifications', { token: T, body: { id: 'n2', type: 'announcement', title: 'لا أحد', body: '', audience: { student_ids: ['nobody'] }, created_by: 'u-teach' } });
await wait(1500);
ok(received.length === 0, 'بلا أجهزة مستهدفة: لا يُستدعى شيء');
SQL("update itqan.push_config set function_url='http://10.255.255.1:9/x'");
r = await req('POST', '/notifications', { token: T, body: { id: 'n3', type: 'announcement', title: 'رابط معطل', body: '', audience: { class_ids: ['c1'] }, created_by: 'u-teach' } });
ok(r.status < 300 && SQL("select count(*) from notifications where id='n3'") === '1', 'رابط الدالة معطل: الإشعار يُحفظ رغم ذلك');

SQL("delete from push_subscriptions; delete from itqan.push_config; delete from notifications where id in ('n0','n1','n2','n3'); delete from users where id='u-par'");
server.close();
console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
