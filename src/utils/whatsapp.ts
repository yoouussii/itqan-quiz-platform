// التواصل مع أولياء الأمور عبر واتساب (روابط wa.me برسالة جاهزة — بدون أي اشتراك مدفوع)
import type { User } from '../types';

/** توحيد رقم الجوال إلى الصيغة الدولية (السعودية افتراضياً): 05xxxxxxxx ← 9665xxxxxxxx */
export function normalizePhone(raw: string | null | undefined): string {
  let d = String(raw ?? '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('05') && d.length === 10) d = '966' + d.slice(1);
  else if (d.startsWith('5') && d.length === 9) d = '966' + d;
  return d.length >= 9 && d.length <= 15 ? d : '';
}

/** رابط فتح محادثة واتساب برسالة جاهزة (بدون رقم: يختار المستخدم جهة الاتصال) */
export const waLink = (phone: string, text: string) =>
  `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;

/** رقم ولي أمر الطالب: جوال ولي الأمر المسجل للطالب، وإلا جوال حساب ولي الأمر المرتبط به */
export function guardianPhone(student: Pick<User, 'id' | 'phone'>, users: User[]): string {
  const own = normalizePhone(student.phone);
  if (own) return own;
  const parent = users.find((u) => u.role === 'parent' && (u.child_ids || []).includes(student.id) && normalizePhone(u.phone));
  return parent ? normalizePhone(parent.phone) : '';
}

/** تعبئة قالب الرسالة: {الطالب} {التاريخ} {المدرسة} … */
export const fillTemplate = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{([^{}]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
