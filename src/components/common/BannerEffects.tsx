import React, { useMemo } from 'react';
import type { BannerEffect } from '../../services/bannerService';

const CONFETTI_COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#facc15', '#ec4899'];
const EMOJI: Partial<Record<BannerEffect, string[]>> = {
  balloons: ['🎈', '🎈', '🎈', '🎉'],
  stars: ['✨', '⭐', '🌟'],
  trophies: ['🏆', '🥇', '🎖️', '⭐'],
};
const COUNT: Record<BannerEffect, number> = { none: 0, confetti: 40, balloons: 14, stars: 22, trophies: 14 };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * تأثير احتفالي يخرج من البانر عند ظهوره (مرة واحدة لكل ظهور).
 * يوضع داخل عنصر relative يحيط بالبانر، ولا يمنع الضغط على ما تحته.
 */
export const BannerEffects: React.FC<{ effect?: BannerEffect; playKey?: string | number }> = ({ effect = 'none', playKey }) => {
  // جسيمات عشوائية جديدة مع كل ظهور للبانر
  const particles = useMemo(() => {
    const n = COUNT[effect] || 0;
    return Array.from({ length: n }, (_, i) => {
      const delay = rand(0, effect === 'stars' ? 1.8 : 1.2);
      if (effect === 'confetti') {
        return {
          key: i, cls: 'fx-burst', text: '',
          style: {
            left: `${rand(15, 85)}%`, bottom: '12%',
            width: rand(6, 10), height: rand(10, 16), borderRadius: 2,
            backgroundColor: pick(CONFETTI_COLORS),
            '--dx': `${rand(-220, 220)}px`, '--dy': `${rand(-280, -110)}px`, '--rot': `${rand(-540, 540)}deg`,
            animationDelay: `${delay}s`, animationDuration: `${rand(2.4, 3.4)}s`,
          },
        };
      }
      if (effect === 'stars') {
        return {
          key: i, cls: 'fx-twinkle', text: pick(EMOJI.stars!),
          style: {
            left: `${rand(2, 96)}%`, top: `${rand(-25, 95)}%`, fontSize: rand(16, 30),
            animationDelay: `${delay}s`, animationDuration: `${rand(1.6, 2.6)}s`,
          },
        };
      }
      return {
        key: i, cls: 'fx-rise', text: pick(EMOJI[effect] || ['🎈']),
        style: {
          left: `${rand(4, 94)}%`, bottom: '0%', fontSize: rand(24, 40),
          '--sway': `${rand(-40, 40)}px`, '--rise': `${rand(-420, -260)}px`,
          animationDelay: `${delay}s`, animationDuration: `${rand(3.6, 5)}s`,
        },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect, playKey]);

  if (effect === 'none' || !particles.length || reducedMotion()) return null;
  return (
    <div key={playKey} className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
      {particles.map((p) => (
        <span key={p.key} className={`fx-particle ${p.cls}`} style={p.style as React.CSSProperties}>{p.text}</span>
      ))}
    </div>
  );
};
