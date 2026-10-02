// اختبارات 005: حذف الإشعارات. تُشغَّل بعد security-test.mjs و timer-test.mjs.
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
SQL(`update users set password='stud12345' where national_id in ('4040','5050')`);
const A = await login('1010', 'admin123'), T = await login('2020', 'teach123'), T2 = await login('2121', 'teach456');
const S1 = await login('4040', 'stud12345'), S2 = await login('5050', 'stud12345');
const n = (id, by) => ({ id, type: 'announcement', title: id, body: 'x', audience: { all: true, roles: ['student'] }, created_by: by });
await req('POST', '/notifications', { token: T, body: n('nt-t', 'u-teach') });
await req('POST', '/notifications', { token: A, body: n('nt-a', 'u-admin') });
await req('POST', '/notifications', { token: A, body: n('nt-b', 'u-admin') });

console.log('— الحذف من عندي');
let r = await req('POST', '/notification_reads', { token: S1, body: { user_id: '11111111-1111-1111-1111-111111111111', notification_id: 'nt-a', read_at: new Date().toISOString(), deleted_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates' });
ok(r.status < 300, 'الطالب يحذف الإشعار من عنده');
ok(SQL("select count(*) from notifications where id='nt-a'") === '1', 'ويبقى الإشعار عند الآخرين');
r = await req('POST', '/notification_reads', { token: S1, body: { user_id: 'u-st2', notification_id: 'nt-b', deleted_at: new Date().toISOString() } });
ok(r.status >= 400, 'لا يحذف إشعارات طالب آخر');
r = await req('DELETE', '/notifications?id=eq.nt-a', { token: S1, prefer: 'return=representation' });
ok(SQL("select count(*) from notifications where id='nt-a'") === '1', 'ولا يحذف الإشعار نهائياً');

console.log('— الحذف النهائي');
r = await req('DELETE', '/notifications?id=eq.nt-a', { token: T, prefer: 'return=representation' });
ok(SQL("select count(*) from notifications where id='nt-a'") === '1', 'المعلم لا يحذف إشعار المدير');
r = await req('DELETE', '/notifications?id=eq.nt-t', { token: T2, prefer: 'return=representation' });
ok(SQL("select count(*) from notifications where id='nt-t'") === '1', 'ولا إشعار معلم آخر');
r = await req('DELETE', '/notifications?id=eq.nt-t', { token: T, prefer: 'return=representation' });
ok(SQL("select count(*) from notifications where id='nt-t'") === '0', 'المعلم يحذف إعلانه من الجميع');
r = await req('DELETE', '/notifications?id=eq.nt-a', { token: A, prefer: 'return=representation' });
ok(SQL("select count(*) from notifications where id='nt-a'") === '0', 'المدير يحذف أي إشعار نهائياً');
ok(SQL("select count(*) from notification_reads where notification_id='nt-a'") === '0', 'وتُحذف حالات قراءته معه');

console.log('— المدير يمسح إشعارات مستخدم');
r = await req('POST', '/notification_reads', { token: A, body: { user_id: 'u-st2', notification_id: 'nt-b', read_at: new Date().toISOString(), deleted_at: new Date().toISOString() } });
ok(r.status < 300 && SQL("select count(*) from notification_reads where user_id='u-st2' and deleted_at is not null") === '1', 'المدير يمسح إشعاراً من عند طالب معيّن');
r = await req('GET', '/notification_reads', { token: S2 });
ok(r.json.length === 1 && r.json[0].deleted_at, 'والطالب يرى أنه محذوف عنده');
r = await req('GET', '/notification_reads', { token: S1 });
ok(r.json.every((x) => x.user_id === '11111111-1111-1111-1111-111111111111'), 'كل طالب يرى حالاته فقط');

console.log(`\nالنتيجة: ${pass} ناجح، ${fail} فاشل`);
process.exit(fail ? 1 : 0);
