import React from 'react';
import { Role } from '../../types';
import { ShieldCheck, UserCheck, GraduationCap } from 'lucide-react';

interface AvatarProps {
  name: string;
  role?: Role;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showBadge?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
};

const roleGradients: Record<Role, string> = {
  admin: 'from-indigo-600 to-purple-700 text-white shadow-indigo-500/20',
  teacher: 'from-emerald-600 to-teal-700 text-white shadow-emerald-500/20',
  student: 'from-amber-500 to-orange-600 text-white shadow-amber-500/20',
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  role = 'student',
  size = 'md',
  showBadge = false,
  className = '',
}) => {
  // Extract Arabic initials or first letter
  const getInitials = (n: string) => {
    if (!n) return 'م';
    const parts = n.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`;
    }
    return parts[0][0] || 'م';
  };

  const gradient = roleGradients[role] || 'from-slate-600 to-slate-700 text-white';

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <div
        className={`${sizeClasses[size]} rounded-2xl bg-gradient-to-tr ${gradient} font-bold font-cairo shadow-sm flex items-center justify-center select-none tracking-wider`}
      >
        <span>{getInitials(name)}</span>
      </div>

      {showBadge && (
        <span
          className={`absolute -bottom-1 -left-1 p-0.5 rounded-full border-2 border-white dark:border-slate-900 ${
            role === 'admin'
              ? 'bg-indigo-600 text-white'
              : role === 'teacher'
              ? 'bg-emerald-600 text-white'
              : 'bg-amber-500 text-white'
          }`}
          title={
            role === 'admin' ? 'مدير نظام' : role === 'teacher' ? 'معلم' : 'طالب'
          }
        >
          {role === 'admin' && <ShieldCheck className="w-2.5 h-2.5" />}
          {role === 'teacher' && <UserCheck className="w-2.5 h-2.5" />}
          {role === 'student' && <GraduationCap className="w-2.5 h-2.5" />}
        </span>
      )}
    </div>
  );
};
