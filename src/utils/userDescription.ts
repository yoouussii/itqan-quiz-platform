import { SchoolClass, Subject, User } from '../types';

const join = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join('، ')} و${xs[xs.length - 1]}`);

/**
 * وصف المستخدم تحت اسمه:
 *  معلم الرياضيات والعلوم • الصف الثالث (أ)، (ب)
 *  الصف الثالث الابتدائي شعبة (أ) • المرحلة الابتدائية
 */
export function describeUser(u: User, subjects: Subject[], classes: SchoolClass[]): { title: string; details: string[] } {
  const subjectNames = (u.assigned_subject_ids || [])
    .map((id) => subjects.find((s) => s.id === id)?.name)
    .filter(Boolean) as string[];
  const classIds = Array.from(new Set([u.class_id, ...(u.assigned_class_ids || [])].filter(Boolean))) as string[];
  const myClasses = classIds.map((id) => classes.find((c) => c.id === id)).filter(Boolean) as SchoolClass[];
  const custom = u.job_title?.trim();

  if (u.role === 'student') {
    const cls = myClasses[0];
    return {
      title: cls ? cls.name : u.gender === 'female' ? 'طالبة' : 'طالب',
      details: cls?.grade_level ? [cls.grade_level] : [],
    };
  }
  if (u.role === 'teacher') {
    return {
      title: custom || (subjectNames.length ? `معلم ${join(subjectNames)}` : 'معلم'),
      details: myClasses.length ? [`الصفوف: ${myClasses.map((c) => c.name).join('، ')}`] : [],
    };
  }
  if (u.role === 'supervisor') {
    const d: string[] = [];
    if (subjectNames.length) d.push(`المواد: ${join(subjectNames)}`);
    if (myClasses.length) d.push(`الصفوف: ${myClasses.map((c) => c.name).join('، ')}`);
    return { title: custom || 'مشرف', details: d };
  }
  if (u.role === 'parent') {
    return { title: 'ولي أمر', details: (u.child_ids || []).length ? [`مرتبط بـ ${(u.child_ids || []).length} من الأبناء`] : [] };
  }
  return { title: custom || 'مدير النظام', details: [] };
}
