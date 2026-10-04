// اختبار دالة homework-drive (041) محلياً مع خادم يحاكي Google:
//   1) node supabase/tests/drive/mock-google.mjs            (منفذ 8899)
//   2) شغّل الدالة بـ deno مع GOOGLE_*_URL تشير للمحاكي (منفذ 8000)
//   3) node supabase/tests/drive/homework-drive-test.mjs <ملف-مفتاح-anon>
// يتطلب البيانات التجريبية (معلم 2000000001 لفصل c-3a، طالب 1100000001 في c-3a، طالب 1100000011 في c-3b).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const BASE = 'http://localhost:54321/rest/v1';
const FN = 'http://localhost:8000';
const ANON = readFileSync(process.argv[2], 'utf8').trim();
const SQL = (q) => execFileSync('psql', ['postgres://postgres:postgres@localhost:54322/postgres', '-tA', '-c', q]).toString().trim();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗ FAIL:', m); };
const H = (token, extra = {}) => ({ apikey: ANON, Authorization: `Bearer ${ANON}`, ...(token ? { 'x-itqan-session': token } : {}), ...extra });
const rest = async (method, path, token, body) => {
  const r = await fetch(BASE + path, { method, headers: H(token, { 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, json: j };
};
const login = async (id) => (await rest('POST', '/rpc/itqan_login', null, { p_national_id: id, p_password: 'Demo@2026' })).json.token;
const up = async (token, target, targetId, name, bytes, mime = 'application/pdf') => {
  const fd = new FormData(); fd.append('target', target); fd.append('target_id', targetId); fd.append('file', new Blob([bytes], { type: mime }), name);
  const r = await fetch(FN, { method: 'POST', headers: H(token), body: fd }); return { status: r.status, json: await r.json().catch(() => ({})) };
};
const mock = async () => (await fetch('http://localhost:8899/__log')).json();

SQL('delete from itqan.login_attempts');
const T = await login('2000000001'), S = await login('1100000001'), S2 = await login('1100000011');
ok(T && S && S2, 'تسجيل الدخول');
const hw = (await rest('POST', '/homework', T, { class_id: 'c-3a', subject_id: 's-math', teacher_id: 't-math', teacher_name: 'م', title: 'اختبار Drive' })).json[0];
ok(hw?.id, 'واجب للاختبار');

console.log('— الرفع');
let r = await up(null, 'homework', hw.id, 'a.pdf', 'x');
ok(r.status === 401, 'بلا جلسة: مرفوض');
r = await up(S, 'homework', hw.id, 'a.pdf', 'x');
ok(r.status === 403, 'الطالب لا يرفق بالواجب نفسه');
const before = (await mock()).files.length;
r = await up(T, 'homework', hw.id, 'ورقة عمل.pdf', '%PDF-1.4 hello');
const fid = r.json.id;
ok(r.status === 200 && fid && r.json.storage === 'drive', 'المعلم يرفع إلى Drive');
ok(SQL(`select storage||'|'||(drive_id is not null)||'|'||(data='')||'|'||size from homework_files where id='${fid}'`) === 'drive|true|true|14', 'في القاعدة: الرقم فقط بلا محتوى');
ok((await mock()).files.length === before + 1, 'الملف وصل Drive');

console.log('— الفتح');
let g = await fetch(`${FN}?id=${fid}`, { headers: H(S) });
ok(g.status === 200 && (await g.text()) === '%PDF-1.4 hello' && g.headers.get('content-type') === 'application/pdf', 'طالب الفصل يفتح الملف');
g = await fetch(`${FN}?id=${fid}`, { headers: H(S2) });
ok(g.status === 404, 'طالب فصل آخر لا يفتحه');
g = await fetch(`${FN}?id=${fid}`, { headers: H(null) });
ok(g.status === 401, 'بلا جلسة لا يفتح');

console.log('— الحماية');
r = await rest('POST', '/homework_files', T, { homework_id: hw.id, name: 'x', mime: 'application/pdf', data: '', storage: 'drive', drive_id: 'drv1', uploaded_by: 't-math' });
ok(r.status >= 400, 'لا يكتب المستخدم رقم ملف Drive بنفسه');
r = await rest('PATCH', `/homework_files?id=eq.${fid}`, T, { drive_id: 'drvX' });
ok(SQL(`select drive_id from homework_files where id='${fid}'`) !== 'drvX', 'لا يغيّر رقم الملف بعد رفعه');
r = await rest('POST', '/rpc/itqan_drive_trash_take', T, { p_limit: 5 });
ok(r.status >= 400, 'قائمة الحذف للخادم فقط');

console.log('— التسليم والحذف');
const sub = (await rest('POST', '/homework_submissions', S, { homework_id: hw.id, student_id: 'st-01', answer: 'حل' })).json[0];
r = await up(S, 'submission', sub.id, 'حل.jpg', 'JPEGDATA', 'image/jpeg');
ok(r.status === 200 && r.json.storage === 'drive', 'الطالب يرفق بتسليمه في Drive');
r = await up(S2, 'submission', sub.id, 'x.jpg', 'J', 'image/jpeg');
ok(r.status === 403, 'طالب آخر لا يرفق بتسليم غيره');
const driveOf = SQL(`select drive_id from homework_files where id='${fid}'`);
await rest('DELETE', `/homework_files?id=eq.${fid}`, T);
ok(SQL(`select count(*) from itqan.drive_trash where drive_id='${driveOf}'`) === '1', 'حذف الملف يضعه في قائمة حذف Drive');
await rest('DELETE', `/homework?id=eq.${hw.id}`, T);
ok(Number(SQL(`select count(*) from itqan.drive_trash`)) >= 2, 'حذف الواجب يضع ملفات تسليماته في القائمة');
const hw2 = (await rest('POST', '/homework', T, { class_id: 'c-3a', subject_id: 's-math', teacher_id: 't-math', teacher_name: 'م', title: 'تنظيف' })).json[0];
await up(T, 'homework', hw2.id, 'b.pdf', 'b');
await new Promise((x) => setTimeout(x, 800));
const m = await mock();
ok(SQL('select count(*) from itqan.drive_trash') === '0' && !m.files.includes(driveOf), 'الرفع التالي ينظّف ملفات Drive المحذوفة');
await rest('DELETE', `/homework?id=eq.${hw2.id}`, T);

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
