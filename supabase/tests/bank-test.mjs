// اختبارات 015: بنك الأسئلة — الطاقم فقط، المشترك والخاص، صلاحيات التعديل والحذف، عدّاد الاستخدام.
// تُشغَّل على قاعدة بيانات فيها 001–015 والبيانات التجريبية (seed.sql).
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
const rpc = (fn, body, token) => req('POST', `/rpc/${fn}`, { token, body });
const login = async (id, pw) => (await rpc('itqan_login', { p_national_id: id, p_password: pw })).json.token;
const ids = (r) => (Array.isArray(r.json) ? r.json.map((x) => x.id).sort().join(',') : 'ERR ' + JSON.stringify(r.json));

SQL("delete from itqan.login_attempts; delete from question_bank");
const A = await login('1010', 'admin123');
await req('POST', '/users', { token: A, body: { id: 'u-t2', name: 'معلم آخر', role: 'teacher', national_id: '2121', password: 'teach456' } });
SQL("update users set password='stud12345' where role='student'");
const T = await login('2020', 'teach123');
const T2 = await login('2121', 'teach456');
const SUP = await login('3030', 'sup12345');
const S = await login('4040', 'stud12345');
const q = (id, by, shared = true) => ({ id, subject_id: 's1', unit: 'الكسور', difficulty: 'easy', type: 'mcq', marks: 1, shared, created_by: by,
  question: { type: 'mcq', question_text: 'سؤال ' + id, options: ['a', 'b'], correct_option_index: 1, marks: 1, explanation: '' }, search_text: 'سؤال ' + id });

console.log('— الإضافة');
let r = await req('POST', '/question_bank', { token: T, body: [q('b1', 'u-teach'), q('b2', 'u-teach', false)] });
ok(r.status < 300, 'المعلم يضيف أسئلة باسمه');
r = await req('POST', '/question_bank', { token: T, body: q('b3', 'u-t2') });
ok(r.status >= 400, 'لا يضيف سؤالاً باسم معلم آخر');
r = await req('POST', '/question_bank', { token: S, body: q('b4', '11111111-1111-1111-1111-111111111111') });
ok(r.status >= 400, 'الطالب لا يضيف');
r = await req('POST', '/question_bank', { token: SUP, body: q('b5', 'u-sup') });
ok(r.status >= 400, 'المشرف لا يضيف (قراءة فقط)');
r = await req('POST', '/question_bank', { token: T2, body: q('b6', 'u-t2') });
r = await req('POST', '/question_bank', { token: A, body: q('b7', 'u-admin', false) });
ok(r.status < 300, 'المدير يضيف');

console.log('— القراءة');
ok(ids(await req('GET', '/question_bank?select=id', { token: T })) === 'b1,b2,b6', 'المعلم يرى المشترك وأسئلته الخاصة فقط');
ok(ids(await req('GET', '/question_bank?select=id', { token: T2 })) === 'b1,b6', 'المعلم الآخر لا يرى الخاص بغيره');
ok(ids(await req('GET', '/question_bank?select=id', { token: SUP })) === 'b1,b6', 'المشرف يرى المشترك');
ok(ids(await req('GET', '/question_bank?select=id', { token: A })) === 'b1,b2,b6,b7', 'المدير يرى الكل');
r = await req('GET', '/question_bank?select=id,question', { token: S });
ok(Array.isArray(r.json) && r.json.length === 0, 'الطالب لا يرى أي سؤال (فيها الإجابات)');
r = await req('GET', '/question_bank?select=id');
ok(!Array.isArray(r.json) || r.json.length === 0, 'بدون جلسة: لا شيء');

console.log('— التعديل والحذف');
r = await req('PATCH', '/question_bank?id=eq.b1', { token: T2, body: { unit: 'سرقة' } });
ok(SQL("select unit from question_bank where id='b1'") === 'الكسور', 'المعلم الآخر لا يعدّل سؤالاً مشتركاً ليس له');
r = await req('DELETE', '/question_bank?id=eq.b1', { token: T2 });
ok(SQL("select count(*) from question_bank where id='b1'") === '1', 'ولا يحذفه');
r = await req('PATCH', '/question_bank?id=eq.b1', { token: T, body: { unit: 'الوحدة 2', difficulty: 'hard' } });
ok(r.status < 300 && SQL("select unit||difficulty from question_bank where id='b1'") === 'الوحدة 2hard', 'صاحب السؤال يعدّل تصنيفه');
r = await req('PATCH', '/question_bank?id=eq.b1', { token: T, body: { created_by: 'u-t2' } });
ok(SQL("select created_by from question_bank where id='b1'") === 'u-teach', 'لا ينقل ملكية سؤاله لغيره');
r = await req('PATCH', '/question_bank?id=eq.b6', { token: A, body: { shared: false } });
ok(SQL("select shared from question_bank where id='b6'") === 'f', 'المدير يعدّل أي سؤال');
r = await req('PATCH', '/question_bank?id=eq.b1', { token: T, body: { difficulty: 'impossible' } });
ok(r.status >= 400, 'الصعوبة من القيم المسموحة فقط');

console.log('— عدّاد الاستخدام');
await rpc('itqan_bank_used', { p_ids: ['b1', 'b2', 'b7'] }, T2);
ok(SQL("select string_agg(id||':'||used_count, ',' order by id) from question_bank") === 'b1:1,b2:0,b6:0,b7:0', 'يزيد المشترك فقط لمن لا يملك الخاص');
await rpc('itqan_bank_used', { p_ids: ['b1'] }, S);
ok(SQL("select used_count from question_bank where id='b1'") === '1', 'الطالب لا يغيّر العدّاد');

r = await req('DELETE', '/question_bank?id=eq.b2', { token: T });
ok(SQL("select count(*) from question_bank where id='b2'") === '0', 'صاحب السؤال يحذفه');
r = await req('DELETE', '/question_bank?id=eq.b6', { token: A });
ok(SQL("select count(*) from question_bank where id='b6'") === '0', 'المدير يحذف أي سؤال');

SQL("delete from question_bank; delete from users where id='u-t2'");
console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
