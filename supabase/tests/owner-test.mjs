// اختبارات 038: لوحة صاحب المنصة والاشتراك — المفتاح، الإحصاءات، الاشتراك، سجل المدارس.
// تُشغَّل على قاعدة بيانات فيها 001–038 والبيانات التجريبية (seed.sql).
//   node supabase/tests/owner-test.mjs <ملف-مفتاح-anon>
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
const KEY = 'owner-test-key-1234567890';
SQL('delete from itqan.login_attempts');
SQL(`update itqan.owner_config set key_hash = null, license = '{}' where id = 1; delete from itqan.owner_schools where true`);
const A = await (await rpc('itqan_login', { p_national_id: '1010', p_password: 'admin123' })).json.token;

console.log('— المفتاح');
let r = await rpc('itqan_owner_stats', { p_key: KEY });
ok(r.status >= 400, 'بلا مفتاح مضبوط: مرفوض');
r = await rpc('set_owner_key', { p_key: KEY });
ok(r.status >= 400, 'ضبط المفتاح غير متاح من الموقع');
r = await req('POST', '/rpc/set_owner_key', { token: A, body: { p_key: KEY } });
ok(r.status >= 400, 'ولا لمدير المدرسة');
SQL(`select itqan.set_owner_key('${KEY}')`);
ok(SQL(`select key_hash <> '${KEY}' from itqan.owner_config`) === 't', 'المفتاح مخزَّن مشفّراً');
let threw = false; try { SQL(`select itqan.set_owner_key('short')`); } catch { threw = true; }
ok(threw, 'المفتاح القصير يُرفض');

console.log('— الإحصاءات');
r = await rpc('itqan_owner_stats', { p_key: 'wrong-key-xxxxxxxxxxxx' });
ok(r.status >= 400 && /forbidden/.test(JSON.stringify(r.json)), 'مفتاح خاطئ: مرفوض');
r = await rpc('itqan_owner_stats', { p_key: KEY });
ok(r.status < 300 && r.json?.users?.admin >= 1 && r.json?.db_bytes > 0 && 'submissions_30d' in r.json, 'المفتاح الصحيح يعرض الإحصاءات');

console.log('— الاشتراك');
r = await rpc('itqan_license');
ok(r.status < 300 && JSON.stringify(r.json) === '{}', 'بلا اشتراك: بلا قيود');
r = await rpc('itqan_owner_set_license', { p_key: 'wrong-key-xxxxxxxxxxxx', p: { plan: 'x' } });
ok(r.status >= 400, 'تعديل الاشتراك بمفتاح خاطئ مرفوض');
const in10 = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
r = await rpc('itqan_owner_set_license', { p_key: KEY, p: { plan: 'أساسية', expires_at: in10, max_students: 300, block_on_expiry: true, note: 'سري' } });
ok(r.status < 300 && r.json?.plan === 'أساسية' && r.json?.max_students === 300, 'صاحب المنصة يضبط الاشتراك');
r = await rpc('itqan_license');
ok(r.json?.days_left === 10 && r.json?.block_on_expiry === true && !('note' in r.json) && typeof r.json?.students === 'number', 'الموقع يرى الأيام المتبقية بلا الملاحظة');
r = await rpc('itqan_owner_set_license', { p_key: KEY, p: { expires_at: 'not-a-date', max_students: 'abc' } });
ok(r.status < 300 && !('expires_at' in r.json) && !('max_students' in r.json), 'القيم غير الصحيحة تُتجاهل');
await rpc('itqan_owner_set_license', { p_key: KEY, p: { expires_at: '2020-01-01', block_on_expiry: true } });
r = await rpc('itqan_license');
ok(r.json?.days_left < 0, 'الاشتراك المنتهي يظهر بأيام سالبة');
await rpc('itqan_owner_set_license', { p_key: KEY, p: {} });
r = await rpc('itqan_license');
ok(JSON.stringify(r.json) === '{}', 'مسح الاشتراك يعيده بلا قيود');

console.log('— سجل المدارس');
r = await rpc('itqan_owner_school_save', { p_key: KEY, p: { name: 'مدرسة 2', url: 'http://insecure.example', anon_key: 'k' } });
ok(r.status >= 400, 'الرابط يجب أن يكون https');
r = await rpc('itqan_owner_school_save', { p_key: KEY, p: { name: 'مدرسة 2', url: 'https://abc.supabase.co/', anon_key: 'anon-2' } });
ok(r.status < 300 && r.json?.url === 'https://abc.supabase.co', 'إضافة مدرسة (وحذف / الأخيرة)');
const sid = r.json?.id;
r = await rpc('itqan_owner_school_save', { p_key: KEY, p: { id: sid, name: 'مدرسة 2 المعدلة', url: 'https://abc.supabase.co', anon_key: 'anon-2' } });
ok(r.json?.name === 'مدرسة 2 المعدلة', 'تعديل مدرسة');
r = await rpc('itqan_owner_schools', { p_key: 'wrong-key-xxxxxxxxxxxx' });
ok(r.status >= 400, 'القائمة بمفتاح خاطئ مرفوضة');
r = await rpc('itqan_owner_schools', { p_key: KEY });
ok(Array.isArray(r.json) && r.json.length === 1, 'عرض القائمة');
await rpc('itqan_owner_school_delete', { p_key: KEY, p_id: sid });
r = await rpc('itqan_owner_schools', { p_key: KEY });
ok(Array.isArray(r.json) && r.json.length === 0, 'حذف مدرسة من القائمة');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
