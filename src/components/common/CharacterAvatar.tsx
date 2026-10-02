import React, { useId } from 'react';

/**
 * صور رمزية على شكل شخصيات مرسومة (SVG) بدلاً من الإيموجي:
 * طلاب وطالبات ومعلمون ومعلمات بأزياء محلية (ثوب، شماغ، حجاب).
 */
type Headwear = 'none' | 'hijab' | 'shemagh' | 'ghutra' | 'cap';

export interface CharacterPreset {
  key: string;
  label: string;
  bg: [string, string];
  skin: string;
  hair: string;
  outfit: string;
  headwear: Headwear;
  /** لون غطاء الرأس (حجاب/شماغ) */
  wear?: string;
  beard?: boolean;
  glasses?: boolean;
}

export const CHARACTER_PRESETS: CharacterPreset[] = [
  { key: 'c-boy-1', label: 'طالب', bg: ['#6366f1', '#8b5cf6'], skin: '#f1c7a1', hair: '#1f2937', outfit: '#ffffff', headwear: 'none' },
  { key: 'c-boy-2', label: 'طالب بنظارة', bg: ['#0ea5e9', '#2563eb'], skin: '#d9a679', hair: '#3f2a1d', outfit: '#ffffff', headwear: 'none', glasses: true },
  { key: 'c-boy-3', label: 'طالب بشماغ', bg: ['#f97316', '#dc2626'], skin: '#e8b48a', hair: '#1f2937', outfit: '#ffffff', headwear: 'shemagh', wear: '#dc2626' },
  { key: 'c-grad', label: 'خرّيج', bg: ['#10b981', '#047857'], skin: '#c68b5e', hair: '#111827', outfit: '#1e293b', headwear: 'cap' },
  { key: 'c-girl-1', label: 'طالبة', bg: ['#ec4899', '#f43f5e'], skin: '#f3cfae', hair: '#000', outfit: '#1e3a8a', headwear: 'hijab', wear: '#1e3a8a' },
  { key: 'c-girl-2', label: 'طالبة بحجاب وردي', bg: ['#a855f7', '#ec4899'], skin: '#e0ac82', hair: '#000', outfit: '#9d174d', headwear: 'hijab', wear: '#f9a8d4' },
  { key: 'c-girl-3', label: 'طالبة بنظارة', bg: ['#14b8a6', '#0e7490'], skin: '#c99068', hair: '#000', outfit: '#0f766e', headwear: 'hijab', wear: '#134e4a', glasses: true },
  { key: 'c-girl-4', label: 'طالبة بحجاب بنفسجي', bg: ['#f59e0b', '#ea580c'], skin: '#f1c7a1', hair: '#000', outfit: '#4c1d95', headwear: 'hijab', wear: '#7c3aed' },
  { key: 'c-man-1', label: 'معلم بغترة', bg: ['#334155', '#0f172a'], skin: '#d9a679', hair: '#1f2937', outfit: '#ffffff', headwear: 'ghutra', wear: '#ffffff', beard: true },
  { key: 'c-man-2', label: 'معلم بنظارة', bg: ['#0284c7', '#1e40af'], skin: '#e8b48a', hair: '#27272a', outfit: '#f8fafc', headwear: 'none', beard: true, glasses: true },
  { key: 'c-woman-1', label: 'معلمة', bg: ['#be185d', '#7e22ce'], skin: '#f3cfae', hair: '#000', outfit: '#111827', headwear: 'hijab', wear: '#111827', glasses: true },
  { key: 'c-woman-2', label: 'معلمة بحجاب أخضر', bg: ['#65a30d', '#15803d'], skin: '#c68b5e', hair: '#000', outfit: '#14532d', headwear: 'hijab', wear: '#166534' },
];

export const findCharacter = (key?: string | null) => CHARACTER_PRESETS.find((c) => c.key === key);

export const CharacterSvg: React.FC<{ preset: CharacterPreset; className?: string; title?: string }> = ({ preset: p, className, title }) => {
  const uid = useId().replace(/:/g, '');
  const bgId = `bg-${uid}`;
  const checkId = `chk-${uid}`;
  const covered = p.headwear === 'hijab';
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={title || p.label}>
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.bg[0]} />
          <stop offset="1" stopColor={p.bg[1]} />
        </linearGradient>
        <pattern id={checkId} width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill={p.wear || '#dc2626'} />
          <rect width="2" height="2" fill="#ffffff" opacity="0.85" />
        </pattern>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${bgId})`} />

      {/* الكتفان والملابس */}
      <path d="M8 64 C8 50 19 44 32 44 C45 44 56 50 56 64 Z" fill={p.outfit} />
      {p.outfit === '#ffffff' || p.outfit === '#f8fafc' ? (
        <path d="M32 46 L32 58" stroke="#cbd5e1" strokeWidth="1.2" strokeLinecap="round" />
      ) : null}

      {/* الحجاب يحيط بالوجه والرقبة */}
      {covered && (
        <path d="M16 31 C16 17 23 10 32 10 C41 10 48 17 48 31 L48 41 C48 48 41 52 32 52 C23 52 16 48 16 41 Z" fill={p.wear} />
      )}

      {/* الرقبة والرأس */}
      {!covered && <rect x="27" y="36" width="10" height="9" rx="3" fill={p.skin} />}
      {!covered && <path d="M27 40 Q32 43 37 40 L37 37 L27 37 Z" fill="#000" opacity="0.08" />}
      {covered ? (
        <ellipse cx="32" cy="29.5" rx="10" ry="11" fill={p.skin} />
      ) : (
        <circle cx="32" cy="28" r="11.5" fill={p.skin} />
      )}

      {/* الشعر */}
      {p.headwear === 'none' && (
        <path d="M20.5 27 C20 17 26 13.5 32 13.5 C39 13.5 44.5 17.5 43.5 27 C42 21.5 38 19.5 32 19.5 C26 19.5 22.5 21.5 20.5 27 Z" fill={p.hair} />
      )}

      {/* اللحية والشارب */}
      {p.beard && (
        <>
          <path d="M20.6 29 C21.5 39 26.5 41 32 41 C37.5 41 42.5 39 43.4 29 C41.5 35 37.5 37 32 37 C26.5 37 22.5 35 20.6 29 Z" fill={p.hair} />
          <path d="M28.5 33.2 Q32 31.8 35.5 33.2" stroke={p.hair} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      )}

      {/* العينان والابتسامة */}
      <circle cx="28" cy="28.5" r="1.5" fill="#1f2937" />
      <circle cx="36" cy="28.5" r="1.5" fill="#1f2937" />
      {!p.beard && <circle cx="25.5" cy="32" r="1.6" fill="#f472b6" opacity="0.35" />}
      {!p.beard && <circle cx="38.5" cy="32" r="1.6" fill="#f472b6" opacity="0.35" />}
      <path d={p.beard ? 'M29.5 35 Q32 36.6 34.5 35' : 'M28.5 33.5 Q32 36.5 35.5 33.5'} stroke="#7f1d1d" strokeWidth="1.3" fill="none" strokeLinecap="round" />

      {/* النظارة */}
      {p.glasses && (
        <g stroke="#111827" strokeWidth="1.1" fill="none">
          <circle cx="28" cy="28.5" r="3.2" />
          <circle cx="36" cy="28.5" r="3.2" />
          <path d="M31.2 28.5 L32.8 28.5" />
        </g>
      )}

      {/* الشماغ / الغترة مع العقال */}
      {(p.headwear === 'shemagh' || p.headwear === 'ghutra') && (
        <>
          <path
            d="M15 46 L17.5 25 C18 15.5 24.5 10.5 32 10.5 C39.5 10.5 46 15.5 46.5 25 L49 46 C45 42 42.8 36 42.6 26 C40 22.5 36 21 32 21 C28 21 24 22.5 21.4 26 C21.2 36 19 42 15 46 Z"
            fill={p.headwear === 'shemagh' ? `url(#${checkId})` : p.wear}
            stroke={p.headwear === 'ghutra' ? '#e2e8f0' : 'none'}
            strokeWidth="0.8"
          />
          <path d="M20.5 18.5 Q32 12 43.5 18.5" stroke="#111827" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </>
      )}

      {/* قبعة التخرج */}
      {p.headwear === 'cap' && (
        <>
          <path d="M22 19 L22 23 Q32 27 42 23 L42 19 Z" fill="#111827" />
          <path d="M14 17 L32 10 L50 17 L32 24 Z" fill="#1f2937" />
          <path d="M44 18.5 L46 27" stroke="#facc15" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="46" cy="27.5" r="1.4" fill="#facc15" />
        </>
      )}
    </svg>
  );
};
