/**
 * مواد مكررة قديمة في قاعدة البيانات (نفس المادة بمعرّف آخر).
 * كل معرّف قديم يُحوَّل تلقائياً إلى المعرّف الأصلي، ولا يُعاد رفعه إلى Supabase.
 * يمكن حذف هذا الملف بعد تنفيذ ملف التنظيف itqan_cleanup_subjects.sql على كل الأجهزة.
 */
export const RETIRED_SUBJECT_ALIASES: Record<string, string> = {
  'SUBJ-984': 'subj-1790785709984', // الرياضيات
  'SUBJ-930': 'subj-1790785731650', // اللغة العربية
  'subj-1790835370930': 'subj-1790785731650', // نسخة قديمة محذوفة من اللغة العربية
};

export const isRetiredSubject = (id?: string | null): boolean =>
  !!id && Object.prototype.hasOwnProperty.call(RETIRED_SUBJECT_ALIASES, id);

export const canonSubjectId = (id?: string | null): string | null | undefined =>
  id && isRetiredSubject(id) ? RETIRED_SUBJECT_ALIASES[id] : id;
