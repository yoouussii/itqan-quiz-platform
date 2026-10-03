// فحص الترجمة: كل نص داخل t('...') له ترجمة في src/i18n/en.ts؟
// ومع --raw <ملفات>: يعرض النصوص العربية في هذه الملفات التي لم تُغلَّف بـ t() بعد.
//   node scripts/i18n-check.mjs
//   node scripts/i18n-check.mjs --raw src/components/student/StudentDashboard.tsx
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(p) ? [p] : [];
});

const enSrc = readFileSync('src/i18n/en.ts', 'utf8');
const keys = new Set();
for (const m of enSrc.matchAll(/^\s*'((?:[^'\\]|\\.)*)'\s*:/gm)) keys.add(m[1].replace(/\\'/g, "'"));

const used = new Map();
for (const f of walk('src')) {
  if (f.endsWith('i18n/en.ts') || f.endsWith('i18n/index.ts')) continue;
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
    const k = m[1].replace(/\\'/g, "'");
    if (!used.has(k)) used.set(k, f);
  }
}
const missing = [...used].filter(([k]) => !keys.has(k));
console.log(`نصوص مترجمة: ${used.size - missing.length} / ${used.size}`);
for (const [k, f] of missing) console.log(`  ✗ ${k}    (${f})`);

const rawIdx = process.argv.indexOf('--raw');
if (rawIdx > 0) {
  for (const f of process.argv.slice(rawIdx + 1)) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => {
      const code = l.replace(/\/\/.*$|\{\/\*.*?\*\/\}|\/\*.*?\*\//g, '').replace(/\bt\(\s*'(?:[^'\\]|\\.)*'/g, '');
      if (/[؀-ۿ]/.test(code) && !/^\s*\*/.test(code)) console.log(`${f}:${i + 1}: ${l.trim()}`);
    });
  }
}
process.exit(missing.length ? 1 : 0);
