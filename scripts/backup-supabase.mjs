// نسخة احتياطية لجداول منصة إتقان عبر Supabase REST (تعمل على الخطة المجانية).
// الاستخدام: SUPABASE_URL=... SUPABASE_KEY=... node scripts/backup-supabase.mjs backup-dir
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const TABLES = [
  'users', 'subjects', 'classes', 'quizzes', 'submissions',
  'notifications', 'notification_reads', 'activity_log',
  'student_awards', 'app_settings', 'user_avatars', 'banners',
];
const PAGE = 1000;

const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const key = process.env.SUPABASE_KEY || '';
const outDir = process.argv[2] || 'backup';
if (!url || !key) {
  console.error('SUPABASE_URL و SUPABASE_KEY مطلوبان');
  process.exit(1);
}

async function fetchTable(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

await mkdir(outDir, { recursive: true });
let failed = 0;
for (const t of TABLES) {
  try {
    const rows = await fetchTable(t);
    await writeFile(join(outDir, `${t}.json`), JSON.stringify(rows, null, 1));
    console.log(`✓ ${t}: ${rows.length}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${e.message}`);
  }
}
// ملاحظة: كلمات المرور المشفّرة في المخطط الخاص itqan لا تُصدَّر عبر REST.
// للاستعادة الكاملة يحتفظ Supabase بها، ويمكن لكل مستخدم إعادة تعيين كلمته من المدير.
await writeFile(join(outDir, 'meta.json'), JSON.stringify({ created_at: new Date().toISOString(), tables: TABLES }, null, 1));
if (failed === TABLES.length) process.exit(1);
