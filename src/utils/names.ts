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

/** اسم عرض ولي الأمر: «والد أحمد» (أو «والدة أحمد»)، ولأكثر من ابن «والد أحمد وسعد» */
export function parentLabel(parent: { name?: string; gender?: string | null; child_ids?: string[] }, users: { id: string; name: string }[], t: (k: string, v?: Record<string, string>) => string): string {
  const firsts = (parent.child_ids || []).map((id) => users.find((u) => u.id === id)?.name).filter(Boolean).map((n) => nameParts(n as string)[0]);
  if (!firsts.length) return shortName(parent.name || '');
  const names = firsts.length > 2 ? `${firsts.slice(0, 2).join(' و')}…` : firsts.join(' و');
  return parent.gender === 'female' ? t('والدة {name}', { name: names }) : t('والد {name}', { name: names });
}
