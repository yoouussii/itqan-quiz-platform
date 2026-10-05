// اختبارات 043: سجلات المتابعة وتتبع المستويات — الصلاحيات، الرفع، المزامنة برمز، الحذف.
// بيانات وهمية فقط. تُشغَّل على قاعدة فيها 001–043 والبيانات التجريبية (seed.sql).
//   node supabase/tests/class-records-test.mjs <ملف-مفتاح-anon>
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
const rows = (r) => (Array.isArray(r.json) ? r.json : []);
const grid = [['اسم الطالب', 'رياضيات'], [null, 'المشاركة', 'الواجبات', 'المجموع'], [null, 10, 10, 20], ['طالب أ', 8, 9, 17], ['طالب ب', 7, null, 7]];

SQL('delete from itqan.login_attempts');
SQL(`insert into users (id,name,role,national_id,password,teacher_permissions) values
  ('cr-m','مسؤول السجلات','teacher','9601','teach1234','{"can_manage_class_records":true}'),
  ('cr-v','مشاهد السجلات','supervisor','9602','sup12345','{"can_view_class_records":true}'),
  ('cr-t','معلم عادي','teacher','9603','teach1234','{}') on conflict do nothing`);
const M = await login('9601', 'teach1234'), V = await login('9602', 'sup12345'), T = await login('9603', 'teach1234');
ok(M && V && T, 'تسجيل الدخول');

console.log('— الرفع اليدوي');
const pay = (o = {}) => ({ kind: 'followup', file_key: 'upload:أ. معلم', file_name: 'أ. معلم', full: true, sheets: [{ sheet: 'رياضيات 1', grid }, { sheet: 'رياضيات 2', grid }], ...o });
let r = await rpc('itqan_records_import', { p_payload: pay() }, T);
ok(r.status >= 400, 'بلا صلاحية: لا رفع');
r = await rpc('itqan_records_import', { p_payload: pay() }, V);
ok(r.status >= 400, 'صلاحية العرض لا تكفي للرفع');
r = await rpc('itqan_records_import', { p_payload: pay() }, M);
ok(r.status < 300 && r.json.sheets === 2, 'المسؤول يرفع ملفاً بشيتين');
ok(SQL(`select last_edit_by||'|'||source from class_record_sheets where file_key='upload:أ. معلم' limit 1`) === 'مسؤول السجلات|upload', 'آخر تعديل = الرافع، والمصدر رفع يدوي');
r = await rpc('itqan_records_import', { p_payload: pay({ sheets: [{ sheet: 'رياضيات 1', grid }] }) }, M);
ok(SQL(`select count(*) from class_record_sheets where file_key='upload:أ. معلم'`) === '1', 'إعادة الرفع (كامل) تحذف الشيت المحذوف من الملف');
r = await rpc('itqan_records_import', { p_payload: pay({ kind: 'bad' }) }, M);
ok(r.status >= 400, 'نوع غير معروف مرفوض');
r = await rpc('itqan_records_import', { p_payload: pay({ file_key: 'upload:x', sheets: [{ sheet: 'كبير', grid: Array.from({ length: 450 }, () => ['x']) }] }) }, M);
ok(r.status < 300 && r.json.sheets === 0, 'الشيت الضخم يُتجاهل');

console.log('— العرض');
ok(rows(await req('GET', '/class_record_sheets?select=id', { token: V })).length >= 1, 'صاحب صلاحية العرض يرى');
ok(rows(await req('GET', '/class_record_sheets?select=id', { token: T })).length === 0, 'معلم بلا صلاحية لا يرى');
ok(rows(await req('GET', '/class_record_sheets?select=id')).length === 0, 'بلا دخول: لا شيء');
ok((await rpc('itqan_records_config', {}, T)).json === null, 'الإعداد مخفي عن غير المخوّل');

console.log('— المزامنة برمز (Apps Script)');
r = await rpc('itqan_records_setup', { p_folders: [{ id: 'FOLDER123456', kind: 'followup' }], p_new_token: true }, V);
ok(r.status >= 400, 'صلاحية العرض لا تنشئ رمزاً');
r = await rpc('itqan_records_setup', { p_folders: [{ id: 'FOLDER123456', kind: 'followup' }], p_new_token: true }, M);
const TOKEN = r.json;
ok(typeof TOKEN === 'string' && TOKEN.length >= 40, 'المسؤول ينشئ رمز الربط');
r = await rpc('itqan_records_import', { p_token: 'wrong', p_payload: pay({ file_key: 'drv1' }) });
ok(r.status >= 400, 'رمز خاطئ مرفوض');
r = await rpc('itqan_records_import', { p_token: TOKEN, p_payload: pay({ file_key: 'drv1', file_name: 'أ. سامي', last_edit_by: 'Sami Teacher', last_edit_at: '2026-10-01T08:30:00Z' }) });
ok(r.status < 300 && r.json.sheets === 2, 'Apps Script يرسل ملفاً من Drive');
ok(SQL(`select last_edit_by||'|'||to_char(last_edit_at at time zone 'UTC','YYYY-MM-DD HH24:MI')||'|'||source from class_record_sheets where file_key='drv1' limit 1`) === 'Sami Teacher|2026-10-01 08:30|drive', 'يُحفظ آخر من عدّل ووقته من Drive');
await rpc('itqan_records_import', { p_token: TOKEN, p_payload: pay({ kind: 'levels', file_key: 'drv2', file_name: 'الابتدائي' }) });
r = await rpc('itqan_records_prune', { p_kind: 'followup', p_keys: ['drv-other'], p_token: TOKEN });
ok(r.json === 2 && SQL(`select count(*) from class_record_sheets where file_key='drv1'`) === '0', 'ملف حُذف من المجلد يُحذف من المنصة');
ok(SQL(`select count(*) from class_record_sheets where file_key='upload:أ. معلم'`) === '1' && SQL(`select count(*) from class_record_sheets where file_key='drv2'`) === '2', 'التنظيف لا يمس المرفوع يدوياً ولا النوع الآخر');
r = await rpc('itqan_records_prune', { p_kind: 'followup', p_keys: ['x'], p_token: 'wrong' });
ok(r.status >= 400, 'التنظيف برمز خاطئ مرفوض');
const cfg = (await rpc('itqan_records_config', {}, M)).json;
ok(cfg.has_token && cfg.folders[0].id === 'FOLDER123456' && cfg.log.length >= 3, 'الإعداد وسجل المزامنة للمسؤول');
ok((await rpc('itqan_records_config', {}, V)).json.log.length === 0, 'سجل المزامنة مخفي عن المشاهد');

console.log('— الحذف');
await req('DELETE', `/class_record_sheets?file_key=eq.drv2`, { token: V });
ok(SQL(`select count(*) from class_record_sheets where file_key='drv2'`) === '2', 'المشاهد لا يحذف');
await req('DELETE', `/class_record_sheets?file_key=eq.drv2`, { token: M });
ok(SQL(`select count(*) from class_record_sheets where file_key='drv2'`) === '0', 'المسؤول يحذف');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
