// اختبارات 052: متجر النقاط (المكافآت، الرصيد، الاستبدال، المعالجة، الصلاحيات).
// تُشغَّل على قاعدة بيانات فيها 001–052 والبيانات التجريبية (seed.sql).
//   node supabase/tests/points-store-test.mjs <ملف-مفتاح-anon>
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
const login = async (id, pw) => (await req('POST', '/rpc/itqan_login', { body: { p_national_id: id, p_password: pw } })).json.token;
const rows = (r) => (Array.isArray(r.json) ? r.json : []);


SQL('delete from itqan.login_attempts');
SQL(`insert into users (id,name,role,national_id,password,class_id) values
  ('ps-s','طالب المتجر','student','9901','stud1234','c1'),('ps-s2','طالب آخر','student','9902','stud1234','c1') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,child_ids) values ('ps-p','ولي أمر المتجر','parent','9903','par1234','["ps-s"]') on conflict do nothing`);
SQL(`insert into users (id,name,role,national_id,password,teacher_permissions) values
  ('ps-m','مسؤول المتجر','teacher','9904','teach1234','{"can_manage_store":true}'),('ps-t','معلم','teacher','9905','teach1234','{}') on conflict do nothing`);
SQL(`delete from store_redemptions; delete from store_items; delete from student_awards where student_id in ('ps-s','ps-s2');
  insert into student_awards (id,student_id,title,points) values ('ps-a1','ps-s','جائزة',100),('ps-a2','ps-s2','جائزة',5)`);

const A = await login('1010', 'admin123'), S = await login('9901', 'stud1234'), S2 = await login('9902', 'stud1234');
const P = await login('9903', 'par1234'), M = await login('9904', 'teach1234'), T = await login('9905', 'teach1234');
ok(A && S && S2 && P && M && T, 'تسجيل الدخول');
const rpc = (fn, tok, body = {}) => req('POST', `/rpc/${fn}`, { token: tok, body });

console.log('— المكافآت');
let r = await req('POST', '/store_items', { token: T, body: { title: 'قلم', cost: 10 } });
ok(r.status >= 400, 'معلم بلا صلاحية لا يضيف مكافأة');
r = await req('POST', '/store_items', { token: S, body: { title: 'قلم', cost: 10 } });
ok(r.status >= 400, 'الطالب لا يضيف مكافأة');
r = await req('POST', '/store_items', { token: M, body: { title: 'قلم مميز', emoji: '🖊️', cost: 40, stock: 1, created_by: 'ps-m' } });
const pen = rows(r)[0]?.id;
ok(r.status < 300 && pen, 'مسؤول المتجر يضيف مكافأة');
r = await req('POST', '/store_items', { token: A, body: { title: 'يوم بلا زي', cost: 50 } });
const day = rows(r)[0]?.id;
ok(r.status < 300 && day, 'المدير يضيف مكافأة');
ok(rows(await req('GET', '/store_items?select=id', { token: S })).length === 2, 'الطالب يرى المكافآت');

console.log('— الرصيد والاستبدال');
const bal = async (tok, sid) => (await rpc('itqan_store_balance', tok, sid ? { p_student: sid } : {})).json;
ok((await bal(S))?.balance === 100, 'الرصيد = المكتسب');
ok((await bal(P, 'ps-s'))?.balance === 100 && (await bal(P, 'ps-s2')) === null, 'ولي الأمر يرى رصيد ابنه فقط');
r = await rpc('itqan_store_redeem', S2, { p_item: pen });
ok(r.status >= 400 && /not_enough/.test(JSON.stringify(r.json)), 'لا استبدال بنقاط غير كافية');
r = await rpc('itqan_store_redeem', P, { p_item: pen });
ok(r.status >= 400, 'ولي الأمر لا يستبدل');
const nb = Number(SQL(`select count(*) from notifications where ref_type='store'`));
r = await rpc('itqan_store_redeem', S, { p_item: pen });
const red1 = r.json?.id;
ok(r.status < 300 && r.json?.status === 'pending' && r.json?.balance === 60, 'الطالب يستبدل ويُخصم من رصيده');
ok(SQL(`select stock from store_items where id='${pen}'`) === '0', 'تنقص الكمية');
ok(Number(SQL(`select count(*) from notifications where ref_type='store'`)) === nb + 1 && SQL(`select audience from notifications where ref_type='store' order by created_at desc limit 1`).includes('ps-m'), 'إشعار للمسؤولين');
r = await rpc('itqan_store_redeem', S, { p_item: pen });
ok(r.status >= 400 && /out_of_stock/.test(JSON.stringify(r.json)), 'نفدت الكمية');
r = await req('POST', '/store_redemptions', { token: S, body: { student_id: 'ps-s', item_title: 'x', cost: 1, status: 'delivered' } });
ok(r.status >= 400, 'لا إدخال مباشر للطلبات');
await req('PATCH', `/store_redemptions?id=eq.${red1}`, { token: S, body: { status: 'delivered' } });
ok(SQL(`select status from store_redemptions where id='${red1}'`) === 'pending', 'لا تعديل مباشر للطلبات');
ok(rows(await req('GET', '/store_redemptions?select=id', { token: P })).length === 1 && rows(await req('GET', '/store_redemptions?select=id', { token: S2 })).length === 0, 'ولي الأمر يرى طلب ابنه، وغيره لا');

console.log('— المعالجة');
r = await rpc('itqan_store_handle', T, { p_id: red1, p_status: 'approved' });
ok(r.status >= 400, 'معلم بلا صلاحية لا يعتمد');
r = await rpc('itqan_store_handle', M, { p_id: red1, p_status: 'approved' });
ok(r.status < 300 && r.json?.status === 'approved' && r.json?.handled_by_name === 'مسؤول المتجر', 'المسؤول يعتمد');
const aud = SQL(`select audience from notifications where ref_type='store' and ref_id='${red1}' order by created_at desc limit 1`);
ok(aud.includes('ps-s') && aud.includes('ps-p'), 'إشعار للطالب وولي أمره');
r = await rpc('itqan_store_handle', M, { p_id: red1, p_status: 'delivered' });
ok(r.json?.status === 'delivered', 'التسليم');
r = await rpc('itqan_store_handle', M, { p_id: red1, p_status: 'rejected' });
ok(r.status >= 400, 'لا رفض بعد التسليم');
ok((await bal(S))?.balance === 60 && (await bal(S))?.earned === 100, 'المكتسب ثابت والرصيد بعد الصرف');

r = await rpc('itqan_store_redeem', S, { p_item: day });
const red2 = r.json?.id;
ok(r.json?.balance === 10, 'استبدال ثانٍ');
r = await rpc('itqan_store_handle', A, { p_id: red2, p_status: 'rejected', p_note: 'غير متاح هذا الأسبوع' });
ok(r.json?.status === 'rejected' && (await bal(S))?.balance === 60, 'الرفض يعيد النقاط');
r = await rpc('itqan_store_redeem', S, { p_item: day });
const red3 = r.json?.id;
ok((await rpc('itqan_store_cancel', S2, { p_id: red3 })).json === false, 'لا يلغي طلب غيره');
ok((await rpc('itqan_store_cancel', S, { p_id: red3 })).json === true && (await bal(S))?.balance === 60, 'الطالب يلغي طلبه وتعود النقاط');
await req('PATCH', `/store_items?id=eq.${day}`, { token: M, body: { active: false } });
r = await rpc('itqan_store_redeem', S, { p_item: day });
ok(r.status >= 400 && /unavailable/.test(JSON.stringify(r.json)), 'المكافأة الموقوفة لا تُستبدل');

console.log('— صورة المكافأة (054)');
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
r = await req('POST', '/store_items', { token: M, body: { title: 'كوب', cost: 5, image: IMG } });
const cup = rows(r)[0]?.id;
ok(r.status < 300 && cup, 'مكافأة بصورة');
r = await req('POST', '/store_items', { token: M, body: { title: 'خبيث', cost: 5, image: 'javascript:alert(1)' } });
ok(r.status >= 400, 'تُرفض الصورة التي ليست data:image');
r = await rpc('itqan_store_redeem', S, { p_item: cup });
ok(r.status < 300 && SQL(`select item_image = '${IMG}' from store_redemptions where id='${r.json?.id}'`) === 't', 'الطلب يحفظ نسخة من الصورة');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
