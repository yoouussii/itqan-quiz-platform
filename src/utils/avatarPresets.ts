export interface AvatarPreset { key: string; emoji: string; from: string; to: string }

export const AVATAR_PRESETS: AvatarPreset[] = [
  { key: 'rocket', emoji: '🚀', from: '#6366f1', to: '#a855f7' },
  { key: 'star', emoji: '⭐', from: '#f59e0b', to: '#ef4444' },
  { key: 'book', emoji: '📚', from: '#0ea5e9', to: '#6366f1' },
  { key: 'owl', emoji: '🦉', from: '#78716c', to: '#44403c' },
  { key: 'lion', emoji: '🦁', from: '#f59e0b', to: '#b45309' },
  { key: 'cat', emoji: '🐱', from: '#ec4899', to: '#f43f5e' },
  { key: 'fox', emoji: '🦊', from: '#fb923c', to: '#ea580c' },
  { key: 'panda', emoji: '🐼', from: '#64748b', to: '#1e293b' },
  { key: 'atom', emoji: '⚛️', from: '#06b6d4', to: '#2563eb' },
  { key: 'bulb', emoji: '💡', from: '#facc15', to: '#f59e0b' },
  { key: 'palette', emoji: '🎨', from: '#a855f7', to: '#ec4899' },
  { key: 'trophy', emoji: '🏆', from: '#10b981', to: '#047857' },
];

export const parsePreset = (v?: string | null): AvatarPreset | undefined =>
  v && v.startsWith('preset:') ? AVATAR_PRESETS.find((p) => p.key === v.slice(7)) : undefined;
