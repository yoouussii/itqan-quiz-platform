/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // النصوص: IBM Plex Sans Arabic (أوضح في الأسئلة والأرقام)، والعناوين: Cairo
        sans: ['"IBM Plex Sans Arabic"', 'Cairo', 'system-ui', 'sans-serif'],
        cairo: ['Cairo', '"IBM Plex Sans Arabic"', 'sans-serif'],
      },
      fontSize: {
        // أصغر نص في الواجهة 13px بدل 12px لسهولة القراءة
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],
      },
      colors: {
        // اللون الأساسي للأزرار والروابط (#4338CA) وخلفية الصفحات (#F5F6FA)
        indigo: {
          50: '#eef0ff',
          100: '#e0e4ff',
          200: '#c7ccf5',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4338ca',
          700: '#3730a3',
          800: '#312e81',
          900: '#272466',
          950: '#1e1b4b',
        },
        slate: {
          50: '#f5f6fa',
          100: '#eef0f5',
          200: '#e4e6ef',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4338ca',
          700: '#3730a3',
          800: '#312e81',
          900: '#312e81',
          950: '#1e1b4b',
        },
        emerald: {
          50: '#ecfdf5',
          100: '#d1fae5',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
        }
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'card': '0 10px 30px -4px rgba(0, 0, 0, 0.08)',
        'elevated': '0 20px 40px -15px rgba(0, 0, 0, 0.12)',
        'dark-soft': '0 4px 20px -2px rgba(0, 0, 0, 0.4)',
      }
    },
  },
  plugins: [],
}
