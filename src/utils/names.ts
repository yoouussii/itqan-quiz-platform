// الأسماء المركبة: «عبد الرحمن»، «أبو بكر»، «آل مانع»، «بن سعيد» تُعامل ككلمة واحدة
const JOIN_NEXT = new Set(['عبد', 'ابو', 'أبو', 'ال', 'آل', 'بن', 'ابن', 'بنت', 'أم', 'ام']);

/** يقسم الاسم إلى أجزاء مع ضم البادئات المركبة لما بعدها */
export function nameParts(full: string): string[] {
  const words = (full || '').trim().split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (JOIN_NEXT.has(words[i]) && i + 1 < words.length) {
      parts.push(`${words[i]} ${words[i + 1]}`);
      i++;
    } else parts.push(words[i]);
  }
  return parts;
}

/** الاسم الأول واسم العائلة: «احمد عبد الرحمن احمد … القحطاني» ← «احمد القحطاني» */
export function shortName(full: string): string {
  const p = nameParts(full);
  return p.length <= 2 ? p.join(' ') : `${p[0]} ${p[p.length - 1]}`;
}
