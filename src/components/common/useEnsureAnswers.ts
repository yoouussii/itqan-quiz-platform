import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { Submission } from '../../types';

/**
 * للصفحات التي تحتاج إجابات الطلاب (التصحيح، تحليل الأسئلة، نواتج التعلم، ورقة الإجابة):
 * إجابات التسليمات الأقدم من 30 يوماً لا تُحمَّل تلقائياً للطاقم، فتُجلب هنا عند فتح الصفحة فقط.
 * `key` يحدد متى يُعاد الفحص (مثلاً معرّف الاختبار)، و`filter` يحدد التسليمات المطلوبة (الكل إن لم يُحدَّد).
 */
export function useEnsureAnswers(key: string, filter?: (s: Submission) => boolean, enabled = true): boolean {
  const { ensureAnswers, submissions } = useApp();
  const needed = enabled && submissions.some((s) => s.answers_pending && (!filter || filter(s)));
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!needed) return;
    let alive = true;
    setLoading(true);
    void ensureAnswers(filter).finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needed]);
  return needed && loading;
}
