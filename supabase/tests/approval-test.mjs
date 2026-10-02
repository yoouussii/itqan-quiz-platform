// اختبارات فرض اعتماد الاختبارات (008) على نسخة محلية من قاعدة البيانات.
// التشغيل: نفس إعداد security-test.mjs، ثم 004 و008، ثم:
//   node supabase/tests/approval-test.mjs <ملف-مفتاح-anon>
import { readFileSync } from 'node:fs';
const BASE = 'http://localhost:3001';
const ANON = readFileSync(process.argv[2], 'utf8').trim();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } };
async function req(method, path, { token, body, prefer } = {}) {
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };
  if (token) headers['x-itqan-session'] = token;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
const rpc = (fn, body, token) => req('POST', `/rpc/${fn}`, { token, body });
const login = async (id, pw) => (await rpc('itqan_login', { p_national_id: id, p_password: pw })).json;
const statusOf = async (id, token) => (await req('GET', `/quizzes?id=eq.${id}&select=status`, { token })).json?.[0]?.status;
const quiz = (id, teacher) => ({
  id, title: id, teacher_id: teacher, created_by: teacher, status: 'published', duration_minutes: 10,
  questions: [{ id: 'q1', type: 'mcq', question_text: 'x', options: ['a', 'b'], correct_option_index: 0, marks: 1 }],
  assignments: [{ target_type: 'class', target_id: 'c1' }],
});

const admin = (await login('1010', 'admin123')).token;
// المشرف يُمنح صلاحية «اعتماد الاختبارات» من المدير
await req('PATCH', '/users?id=eq.u-sup', { token: admin, body: { teacher_permissions: { can_view_activity_log: true, can_approve_quizzes: true } } });
const teach = (await login('2020', 'teach123')).token;
const sup = (await login('3030', 'sup12345')).token;
const student = (await login('4040', 'itqan123')).token;
ok(admin && teach && sup && student, 'تسجيل الدخول للجميع');

console.log('— الاشتراط مفعّل افتراضياً (بدون صف في app_settings)');
let r = await req('POST', '/quizzes', { token: teach, body: quiz('ap1', 'u-teach'), prefer: 'return=representation' });
ok(r.status < 300, 'المعلم ينشئ اختباراً');
ok((await statusOf('ap1', admin)) === 'pending_approval', 'يُحفظ «بانتظار الاعتماد» رغم إرساله منشوراً');
const sq = (await rpc('itqan_student_quizzes', {}, student)).json;
ok(Array.isArray(sq) && !sq.some((q) => q.id === 'ap1'), 'الطالب لا يراه');

r = await req('PATCH', '/quizzes?id=eq.ap1', { token: teach, body: { status: 'published' } });
ok((await statusOf('ap1', admin)) === 'pending_approval', 'المعلم لا يستطيع نشره بنفسه');
r = await req('PATCH', '/quizzes?id=eq.qz3', { token: teach, body: { status: 'published' } });
ok((await statusOf('qz3', admin)) === 'pending_approval', 'نشر مسودة يحوّلها للاعتماد لا للنشر');

r = await req('PATCH', '/quizzes?id=eq.ap1', { token: admin, body: { status: 'published' } });
ok((await statusOf('ap1', admin)) === 'published', 'المدير يعتمده');
ok((await rpc('itqan_student_quizzes', {}, student)).json.some((q) => q.id === 'ap1'), 'بعد الاعتماد يراه الطالب');
r = await req('PATCH', '/quizzes?id=eq.ap1', { token: teach, body: { title: 'ap1 معدّل' } });
ok(r.status < 300 && (await statusOf('ap1', admin)) === 'published', 'تعديل المعلم لاختباره المعتمد لا يلغي نشره');

console.log('— من يملك صلاحية الاعتماد ينشر مباشرة');
r = await req('POST', '/quizzes', { token: sup, body: quiz('ap2', 'u-sup') });
ok(r.status < 300 && (await statusOf('ap2', admin)) === 'published', 'المشرف صاحب الصلاحية ينشر مباشرة');
r = await req('POST', '/quizzes', { token: admin, body: quiz('ap3', 'u-teach') });
ok(r.status < 300 && (await statusOf('ap3', admin)) === 'published', 'المدير ينشر مباشرة');

console.log('— الإعدادات');
r = await req('POST', '/app_settings', { token: teach, body: { key: 'require_quiz_approval', value: false } });
ok(r.status >= 400, 'المعلم لا يستطيع إلغاء الاشتراط');
r = await req('POST', '/app_settings', { token: admin, body: { key: 'require_quiz_approval', value: false }, prefer: 'resolution=merge-duplicates' });
ok(r.status < 300, 'المدير يلغي الاشتراط');
r = await req('POST', '/quizzes', { token: teach, body: quiz('ap4', 'u-teach') });
ok(r.status < 300 && (await statusOf('ap4', admin)) === 'published', 'بعد الإلغاء ينشر المعلم مباشرة');
r = await req('POST', '/app_settings', { token: admin, body: { key: 'require_quiz_approval', value: true }, prefer: 'resolution=merge-duplicates' });
r = await req('POST', '/quizzes', { token: teach, body: quiz('ap5', 'u-teach') });
ok((await statusOf('ap5', admin)) === 'pending_approval', 'إعادة التفعيل تعيد الاشتراط');
ok((await req('GET', '/app_settings', { token: student })).json.length >= 1, 'الإعدادات مقروءة للمستخدمين المسجلين');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
