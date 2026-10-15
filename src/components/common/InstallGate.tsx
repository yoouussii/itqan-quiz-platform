import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { InstallPage, detect } from '../legal/InstallPage';
import { isStandalone } from '../../services/pushService';

const SKIP_KEY = 'itqan_install_gate_skipped';

/**
 * شاشة كاملة «ثبّت المنصة على جوالك» للطالب وولي الأمر عند الدخول من الجوال والمنصة غير مثبتة.
 * «لاحقاً» يخفيها حتى الدخول التالي. لا تظهر على الحاسب، ولا أثناء الاختبار، ولا في وضع المعاينة.
 */
export const InstallGate: React.FC<{ preview?: boolean }> = ({ preview }) => {
  const { currentUser, currentView } = useApp();
  const [skipped, setSkipped] = useState(() => {
    try { return sessionStorage.getItem(SKIP_KEY) === '1'; } catch { return false; }
  });
  if (!currentUser || preview || skipped) return null;
  if (currentUser.role !== 'student' && currentUser.role !== 'parent') return null;
  if (currentView === 'take_quiz' || isStandalone() || detect() === 'desktop') return null;
  const skip = () => {
    setSkipped(true);
    try { sessionStorage.setItem(SKIP_KEY, '1'); } catch { /* ignore */ }
  };
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-50 dark:bg-slate-950" role="dialog" aria-modal="true" data-testid="install-gate">
      <InstallPage onSkip={skip} />
    </div>
  );
};
