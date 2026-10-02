import { QuizAssignment, User } from '../types';

/** الطلاب الموجّه إليهم الاختبار (الجميع، أو صفوف، أو أسماء محددة) */
export function targetStudents(assignments: Array<Partial<QuizAssignment>> | undefined, students: User[]): User[] {
  const list = (assignments || []).filter((a) => a && a.target_type !== 'assigned_teacher');
  if (list.some((a) => a.target_type === 'all')) return students;
  const classIds = new Set(list.filter((a) => a.target_type === 'class' && a.target_id).map((a) => a.target_id as string));
  const ids = new Set(
    list
      .filter((a) => a.target_type === 'specific_students' && a.target_id)
      .flatMap((a) => String(a.target_id).split(',').map((x) => x.trim()).filter(Boolean))
  );
  return students.filter((s) => ids.has(s.id) || (!!s.class_id && classIds.has(s.class_id)));
}
