import React from 'react';
import { Role } from '../../types';
import { ShieldCheck, UserCheck, GraduationCap, UserCog } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { parsePreset } from '../../utils/avatarPresets';
import { CharacterSvg, findCharacter } from './CharacterAvatar';

interface AvatarProps {
  name: string;
  role?: Role;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showBadge?: boolean;
  className?: string;
  /** معرّف المستخدم لعرض صورته الشخصية إن وُجدت */
  userId?: string;
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
  supervisor: 'from-sky-600 to-cyan-700 text-white shadow-sky-500/20',
  parent: 'from-rose-500 to-pink-600 text-white shadow-rose-500/20',
};

const badgeColors: Record<Role, string> = {
  admin: 'bg-indigo-600 text-white',
  teacher: 'bg-emerald-600 text-white',
  student: 'bg-amber-500 text-white',
  supervisor: 'bg-sky-600 text-white',
  parent: 'bg-rose-500 text-white',
};
const badgeTitles: Record<Role, string> = { admin: 'مدير نظام', teacher: 'معلم', student: 'طالب', supervisor: 'مشرف', parent: 'ولي أمر' };

export const Avatar: React.FC<AvatarProps> = ({
  name,
  role = 'student',
  size = 'md',
  showBadge = false,
  className = '',
  userId,
}) => {
  const { avatars } = useApp();
  const custom = userId ? avatars?.[userId] : undefined;
  const preset = parsePreset(custom);
  const character = custom?.startsWith('preset:') ? findCharacter(custom.slice(7)) : undefined;
  const isImage = !!custom && custom.startsWith('data:');

  const getInitials = (n: string) => {
    if (!n) return 'م';
    const parts = n.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
    return parts[0][0] || 'م';
  };

  const gradient = roleGradients[role] || 'from-slate-600 to-slate-700 text-white';

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      {isImage ? (
        <img src={custom} alt={name} data-avatar="image" className={`${sizeClasses[size]} rounded-2xl object-cover shadow-sm`} />
      ) : character ? (
        <CharacterSvg preset={character} title={name} className={`${sizeClasses[size]} rounded-2xl shadow-sm`} />
      ) : preset ? (
        <div
          data-avatar="preset"
          style={{ background: `linear-gradient(135deg, ${preset.from}, ${preset.to})` }}
          className={`${sizeClasses[size]} rounded-2xl shadow-sm flex items-center justify-center select-none`}
        >
          <span>{preset.emoji}</span>
        </div>
      ) : (
        <div
          className={`${sizeClasses[size]} rounded-2xl bg-gradient-to-tr ${gradient} font-bold font-cairo shadow-sm flex items-center justify-center select-none tracking-wider`}
        >
          <span>{getInitials(name)}</span>
        </div>
      )}

      {showBadge && (
        <span
          className={`absolute -bottom-1 -left-1 p-0.5 rounded-full border-2 border-white dark:border-slate-900 ${badgeColors[role] || badgeColors.student}`}
          title={badgeTitles[role] || 'مستخدم'}
        >
          {role === 'admin' && <ShieldCheck className="w-2.5 h-2.5" />}
          {role === 'teacher' && <UserCheck className="w-2.5 h-2.5" />}
          {role === 'student' && <GraduationCap className="w-2.5 h-2.5" />}
          {role === 'supervisor' && <UserCog className="w-2.5 h-2.5" />}
        </span>
      )}
    </div>
  );
};
