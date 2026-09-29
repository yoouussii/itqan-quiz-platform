/**
 * Arabic Date Utilities (Hijri & Gregorian)
 */

export function formatArabicQuizDate(dateStr?: string): string {
  if (!dateStr) return 'بتاريخ حديث';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'بتاريخ حديث';

    // Try formatting in Hijri (Umm al-Qura)
    try {
      const hijriFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      return `بتاريخ: ${hijriFormatter.format(d)}`;
    } catch {
      // Fallback to standard Arabic Gregorian
      const gregFormatter = new Intl.DateTimeFormat('ar-SA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      return `بتاريخ: ${gregFormatter.format(d)}`;
    }
  } catch {
    return 'بتاريخ حديث';
  }
}

export function formatFullArabicDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';

    const gregFormatter = new Intl.DateTimeFormat('ar-SA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return gregFormatter.format(d);
  } catch {
    return dateStr;
  }
}
