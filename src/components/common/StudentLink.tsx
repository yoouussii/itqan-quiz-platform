import React from 'react';
import { openStudentProfile } from './studentProfileEvents';
import { t } from '../../i18n';

/** اسم طالب قابل للضغط يفتح ملفه (خفيف: نافذة الملف تُحمَّل عند أول فتح) */
export const StudentLink: React.FC<{ id: string; name: string; className?: string }> = ({ id, name, className = '' }) => (
  <button type="button" onClick={(e) => { e.stopPropagation(); openStudentProfile(id); }} title={t('فتح ملف الطالب')}
    className={`text-start hover:underline decoration-indigo-400 underline-offset-4 ${className}`}>{name}</button>
);
