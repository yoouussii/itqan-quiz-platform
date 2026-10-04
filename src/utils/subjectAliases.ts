/**
 * مواد مكررة قديمة في قاعدة البيانات (نفس المادة بمعرّف آخر).
 * كل معرّف قديم يُحوَّل إلى المعرّف الأصلي — لكن فقط إن كانت المادة الأصلية موجودة فعلاً.
 * إن حُذفت الأصلية تبقى النسخة القديمة ظاهرة كما هي، حتى لا تختفي المادة من المنصة.
 */
export const RETIRED_SUBJECT_ALIASES: Record<string, string> = {
  'SUBJ-984': 'subj-1790785709984', // الرياضيات
  'SUBJ-930': 'subj-1790785731650', // اللغة العربية
  'subj-1790835370930': 'subj-1790785731650', // نسخة قديمة محذوفة من اللغة العربية
};

// معرّفات المواد الموجودة على الخادم (تُحدَّث عند كل مزامنة للمواد)
let knownSubjectIds: Set<string> | null = null;
export const setKnownSubjectIds = (ids: Iterable<string>) => {
  knownSubjectIds = new Set(ids);
};

/** نسخة قديمة مكررة يجب إخفاؤها؟ نعم فقط إن كانت المادة الأصلية موجودة */
export const isRetiredSubject = (id?: string | null): boolean =>
  !!id &&
  Object.prototype.hasOwnProperty.call(RETIRED_SUBJECT_ALIASES, id) &&
  (knownSubjectIds === null || knownSubjectIds.has(RETIRED_SUBJECT_ALIASES[id]));

export const canonSubjectId = (id?: string | null): string | null | undefined =>
  id && isRetiredSubject(id) ? RETIRED_SUBJECT_ALIASES[id] : id;
