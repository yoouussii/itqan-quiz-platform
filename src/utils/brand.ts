// لون المدرسة: كل درجات اللون الأساسي (indigo في Tailwind) متغيرات CSS تُبدَّل من الإعدادات.
// درجة 600 (لون الأزرار) مختارة بحيث يكون النص الأبيض عليها واضحاً (تباين 4.5:1 على الأقل).

type Shades = Record<'50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '950', string>;

export interface BrandPreset { id: string; label: string; shades: Shades }

export const BRAND_PRESETS: BrandPreset[] = [
  { id: 'indigo', label: 'نيلي (الافتراضي)', shades: { 50: '#eef0ff', 100: '#e0e4ff', 200: '#c7ccf5', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4338ca', 700: '#3730a3', 800: '#312e81', 900: '#272466', 950: '#1e1b4b' } },
  { id: 'green', label: 'أخضر', shades: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#047857', 700: '#065f46', 800: '#064e3b', 900: '#053d2e', 950: '#022c22' } },
  { id: 'teal', label: 'فيروزي', shades: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0f766e', 700: '#115e59', 800: '#134e4a', 900: '#0f3d3a', 950: '#042f2e' } },
  { id: 'blue', label: 'أزرق', shades: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#1d4ed8', 700: '#1e40af', 800: '#1e3a8a', 900: '#1a2f6b', 950: '#172554' } },
  { id: 'purple', label: 'بنفسجي', shades: { 50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#a855f7', 600: '#7e22ce', 700: '#6b21a8', 800: '#581c87', 900: '#4a1772', 950: '#3b0764' } },
  { id: 'maroon', label: 'عنابي', shades: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#be123c', 700: '#9f1239', 800: '#881337', 900: '#6d0f2c', 950: '#4c0519' } },
];

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

/** تطبيق لون المدرسة على الصفحة كلها */
export function applyBrandColor(id?: string | null) {
  const preset = BRAND_PRESETS.find((p) => p.id === id) || BRAND_PRESETS[0];
  const root = document.documentElement.style;
  (Object.keys(preset.shades) as Array<keyof Shades>).forEach((k) => root.setProperty(`--brand-${k}`, rgb(preset.shades[k])));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', preset.shades[600]);
}

/** تصغير صورة الشعار قبل حفظها (أقصى بُعد 256px، PNG للحفاظ على الشفافية) */
export function resizeLogo(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذرت قراءة الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('الملف ليس صورة صالحة'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
