/** توحيد النص العربي للبحث: بلا تشكيل، وتوحيد الألف والتاء المربوطة والياء، وأرقام عربية ← لاتينية */
export function normalizeArabic(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim();
}
