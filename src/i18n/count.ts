// الأعداد مع المعدود: العربية بقواعد التمييز (١، ٢، ٣–١٠، ١١+) والإنجليزية بالمفرد والجمع
import { isEn } from './index';

const en = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const questionsCount = (n: number) =>
  isEn() ? en(n, 'question') : `${n} ${n === 1 ? 'سؤال' : n === 2 ? 'سؤالان' : n <= 10 ? 'أسئلة' : 'سؤالاً'}`;

export const marksCount = (n: number) =>
  isEn() ? en(n, 'mark') : n === 1 ? 'درجة' : n === 2 ? 'درجتان' : n <= 10 ? `${n} درجات` : `${n} درجة`;

export const minutesCount = (n: number) => (isEn() ? `${n} min` : `${n} دقيقة`);

export const hoursCount = (h: number) =>
  isEn() ? en(h, 'hour') : h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h <= 10 ? `${h} ساعات` : `${h} ساعة`;

export const daysCount = (d: number) => (isEn() ? en(d, 'day') : `${d} ${d <= 10 ? 'أيام' : 'يوماً'}`);
