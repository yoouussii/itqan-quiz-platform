import React, { Suspense, useEffect, useState } from 'react';
import { STUDENT_EVENT } from './studentProfileEvents';

const Host = React.lazy(() => import('./StudentProfile').then((m) => ({ default: m.StudentProfileHost })));

/** نافذة ملف الطالب تُحمَّل عند أول فتح فقط، ثم تتولى هي استقبال الطلبات التالية */
export const LazyStudentProfileHost: React.FC = () => {
  const [first, setFirst] = useState<string | null>(null);
  useEffect(() => {
    if (first) return;
    const on = (e: Event) => setFirst((e as CustomEvent).detail?.id || null);
    window.addEventListener(STUDENT_EVENT, on);
    return () => window.removeEventListener(STUDENT_EVENT, on);
  }, [first]);
  if (!first) return null;
  return <Suspense fallback={null}><Host initialId={first} /></Suspense>;
};
