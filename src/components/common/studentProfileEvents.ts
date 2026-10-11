/** فتح ملف الطالب الشامل من أي مكان في المنصة (خفيف: لا يحمّل نافذة الملف نفسها) */
export const STUDENT_EVENT = 'itqan:student';
export const openStudentProfile = (id: string) => window.dispatchEvent(new CustomEvent(STUDENT_EVENT, { detail: { id } }));
