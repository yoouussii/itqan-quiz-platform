// اختبارات 018: سجل الشهادات — من يصدر، من يرى، الرقم والرمز من الخادم، الإلغاء فقط، التحقق العام.
// تُشغَّل على قاعدة بيانات فيها 001–018 والبيانات التجريبية (seed.sql).
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

SQL("delete from itqan.login_attempts; delete from certificates; delete from users where id in ('u-t3','u-par3')");
const A = await login('1010', 'admin123');
await req('POST', '/users', { token: A, body: { id: 'u-t3', name: 'معلم بلا صلاحية', role: 'teacher', national_id: '2323', password: 'teach789' } });
await req('POST', '/users', { token: A, body: { id: 'u-par3', name: 'ولي أمر', role: 'parent', national_id: '6363', password: 'parent123', child_ids: ['u-st2'] } });
SQL("update users set password='stud12345' where role='student'");
SQL("update users set teacher_permissions = coalesce(teacher_permissions,'{}'::jsonb) || '{\"can_award_badges\":true}'::jsonb where id='u-teach'");
const T = await login('2020', 'teach123');
const T3 = await login('2323', 'teach789');
const S1 = await login('4040', 'stud12345');
const S2 = await login('5050', 'stud12345');
const P = await login('6363', 'parent123');

const cert = (by, extra = {}) => ({ student_id: 'u-st2', student_name: '  طالب ب  ', kind: 'excellence', title: 'شهادة تفوق', reason: 'التفوق في الرياضيات', school_name: 'مدرسة تجريبية', created_by: by, ...extra });

console.log('— الإصدار');
let r = await req('POST', '/certificates', { token: T, body: cert('u-teach', { serial: 'FAKE-1', code: 'AAAAAAAAAA', revoked_at: new Date().toISOString() }) });
ok(r.status < 300, 'المعلم صاحب صلاحية الجوائز يصدر شهادة');
const c1 = r.json?.[0] || {};
ok(/^ITQ-\d{4}-\d{4}$/.test(c1.serial || ''), `الرقم التسلسلي من الخادم (${c1.serial})`);
ok(/^[0-9A-F]{10}$/.test(c1.code || '') && c1.code !== 'AAAAAAAAAA', 'رمز التحقق عشوائي من الخادم لا من المستخدم');
ok(c1.revoked_at === null, 'لا يمكن إصدار شهادة ملغاة مسبقاً');
ok(c1.student_name === 'طالب ب', 'يُنظَّف اسم الطالب من المسافات');
r = await req('POST', '/certificates', { token: A, body: cert('u-admin', { student_id: '11111111-1111-1111-1111-111111111111', student_name: 'طالب أ' }) });
ok(r.status < 300, 'المدير يصدر');
const c2 = r.json?.[0] || {};
ok(Number(c2.serial?.slice(-4)) === Number(c1.serial?.slice(-4)) + 1, 'الأرقام متتالية');
r = await req('POST', '/certificates', { token: A, body: cert('u-admin', { student_id: null, student_name: 'ضيف من خارج المنصة' }) });
ok(r.status < 300, 'شهادة باسم مكتوب يدوياً (بدون حساب طالب)');
r = await req('POST', '/certificates', { token: T3, body: cert('u-t3') });
ok(r.status >= 400, 'معلم بلا صلاحية الجوائز لا يصدر');
r = await req('POST', '/certificates', { token: T, body: cert('u-admin') });
ok(r.status >= 400, 'لا يصدر باسم شخص آخر');
r = await req('POST', '/certificates', { token: S1, body: cert('11111111-1111-1111-1111-111111111111') });
ok(r.status >= 400, 'الطالب لا يصدر لنفسه');
r = await req('POST', '/certificates', { token: T, body: cert('u-teach', { student_name: '   ' }) });
ok(r.status >= 400, 'الاسم مطلوب');

console.log('— القراءة');
const count = async (tok) => { const x = await req('GET', '/certificates?select=id', { token: tok }); return Array.isArray(x.json) ? x.json.length : -1; };
ok(await count(A) === 3, 'المدير يرى الكل');
ok(await count(T) === 3, 'صاحب صلاحية الجوائز يرى السجل');
ok(await count(T3) === 0, 'معلم بلا صلاحية لا يرى السجل');
ok(await count(S2) === 1, 'الطالب يرى شهادته فقط');
ok(await count(S1) === 1, 'والطالب الآخر شهادته فقط');
ok(await count(P) === 1, 'ولي الأمر يرى شهادة ابنه');
ok(await count(undefined) === 0, 'بدون جلسة: لا شيء');

console.log('— لا تعديل، إلغاء فقط');
r = await req('PATCH', `/certificates?id=eq.${c1.id}`, { token: T, body: { student_name: 'اسم مزوّر', score: '100%' } });
ok(SQL(`select student_name || '|' || score from certificates where id='${c1.id}'`) === 'طالب ب|', 'محتوى الشهادة لا يتغير بعد الصدور');
r = await req('PATCH', `/certificates?id=eq.${c2.id}`, { token: T, body: { revoked_at: new Date().toISOString(), revoke_reason: 'x' } });
ok(SQL(`select revoked_at is null from certificates where id='${c2.id}'`) === 't', 'لا يلغي شهادة أصدرها غيره');
r = await req('PATCH', `/certificates?id=eq.${c1.id}`, { token: T, body: { revoked_at: '2000-01-01T00:00:00Z', revoke_reason: 'خطأ في الاسم', serial: 'X' } });
ok(SQL(`select (revoked_at > now() - interval '1 minute')::text || '|' || revoked_by || '|' || revoke_reason || '|' || serial from certificates where id='${c1.id}'`) === `true|u-teach|خطأ في الاسم|${c1.serial}`, 'من أصدرها يلغيها (الوقت والمُلغي من الخادم، والرقم لا يتغير)');
r = await req('PATCH', `/certificates?id=eq.${c1.id}`, { token: A, body: { revoked_at: null } });
ok(SQL(`select revoked_at is not null from certificates where id='${c1.id}'`) === 't', 'لا يمكن التراجع عن الإلغاء');
r = await req('DELETE', `/certificates?id=eq.${c2.id}`, { token: T });
ok(SQL(`select count(*) from certificates where id='${c2.id}'`) === '1', 'غير المدير لا يحذف');

console.log('— التحقق العام');
r = await rpc('itqan_verify_certificate', { p_code: c2.code.toLowerCase().replace(/(.{5})/, '$1-') });
ok(r.json?.found === true && r.json.student_name === 'طالب أ' && r.json.revoked === false, 'التحقق بدون تسجيل دخول (يقبل الأحرف الصغيرة والشرطة)');
ok(!('student_id' in (r.json || {})) && !('created_by' in (r.json || {})) && !('code' in (r.json || {})), 'لا يكشف معرّفات داخلية');
r = await rpc('itqan_verify_certificate', { p_code: c1.code });
ok(r.json?.found === true && r.json.revoked === true, 'الشهادة الملغاة تظهر «ملغاة»');
r = await rpc('itqan_verify_certificate', { p_code: 'ZZZZZZZZZZ' });
ok(r.json?.found === false, 'رمز غير موجود');
r = await rpc('itqan_verify_certificate', { p_code: c2.serial });
ok(r.json?.found === false, 'الرقم التسلسلي وحده لا يكفي للتحقق (الرمز العشوائي مطلوب)');

console.log('— الإعدادات');
ok(SQL("select value #>> '{}' from app_settings where key='cert_company_logo'") === '/brand/company-logo.png', 'شعار الشركة الافتراضي');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
