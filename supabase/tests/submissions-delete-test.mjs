// اختبارات 007: حذف مشاركات الطلاب. تُشغَّل بعد security-test.mjs و timer-test.mjs.
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
const login = async (id, pw) => (await req('POST', '/rpc/itqan_login', { body: { p_national_id: id, p_password: pw } })).json.token;
SQL('delete from itqan.login_attempts');
SQL(`insert into submissions (id,quiz_id,student_id,score,total_possible_score,percentage) values ('del-1','qz2','u-st2',1,1,100),('del-2','qz2','u-st2',0,1,0),('del-3','qz2','u-st2',1,1,100) on conflict do nothing`);
const A = await login('1010', 'admin123'), T = await login('2020', 'teach123');
const S2 = await login('5050', (SQL("select 1 from itqan.credentials c join users u on u.id::text=c.user_id where u.national_id='5050' and c.password_hash = extensions.crypt('stud12345', c.password_hash)") === '1') ? 'stud12345' : 'stud123');
const count = (id) => SQL(`select count(*) from submissions where id='${id}'`);

let r = await req('DELETE', '/submissions?id=eq.del-1', { token: S2, prefer: 'return=representation' });
ok(count('del-1') === '1', 'الطالب لا يحذف مشاركته');
r = await req('DELETE', '/submissions?id=eq.del-1', { token: T, prefer: 'return=representation' });
ok(count('del-1') === '1', 'المعلم بدون صلاحية لا يحذف');
r = await req('PATCH', '/submissions?id=eq.del-1', { token: T, body: { score: 1 }, prefer: 'return=representation' });
ok(r.status < 300 && r.json.length === 1, 'المعلم ما زال يعدّل الدرجات (تصحيح المقالي)');
r = await req('DELETE', '/submissions?id=eq.del-1', { token: A, prefer: 'return=representation' });
ok(count('del-1') === '0', 'المدير يحذف المشاركة');
await req('PATCH', '/users?id=eq.u-teach', { token: A, body: { teacher_permissions: { can_delete_submissions: true } } });
r = await req('DELETE', '/submissions?id=in.(del-2,del-3)', { token: T, prefer: 'return=representation' });
ok(count('del-2') === '0' && count('del-3') === '0', 'المعلم صاحب الصلاحية يحذف عدة مشاركات');
await req('PATCH', '/users?id=eq.u-teach', { token: A, body: { teacher_permissions: {} } });
console.log(`\nالنتيجة: ${pass} ناجح، ${fail} فاشل`);
process.exit(fail ? 1 : 0);
