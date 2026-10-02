/** وصف الفئة المستهدفة للاختبار (الصفوف / الطلاب / الجميع) لعرضه في البطاقات والجداول */
export function describeQuizTarget(
  assignments: any[] | undefined,
  classes: Array<{ id: string; name: string }>
): string {
  const list = (assignments || []).filter((a) => a && a.target_type !== 'assigned_teacher');
  if (list.length === 0) return 'غير محدد';
  if (list.some((a) => a.target_type === 'all')) return 'جميع الطلاب';

  const parts: string[] = [];
  const classNames = Array.from(
    new Set(
      list
        .filter((a) => a.target_type === 'class' && a.target_id)
        .map((a) => classes.find((c) => c.id === a.target_id)?.name || a.target_name || 'صف محذوف')
    )
  );
  if (classNames.length) parts.push(classNames.join(' ، '));

  const studentAsg = list.filter((a) => a.target_type === 'specific_students' && a.target_id);
  if (studentAsg.length) {
    const n = new Set(
      studentAsg.flatMap((a) => String(a.target_id).split(',').map((s) => s.trim()).filter(Boolean))
    ).size;
    parts.push(`${n} طالب محدد`);
  }
  return parts.join(' + ') || 'غير محدد';
}
