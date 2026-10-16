import './utils/safeStorage'; // أولاً: ذاكرة محلية بلا بيانات قديمة عند امتلائها
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';
import { loadSettings } from './services/settingsService';
import { applyBrandColor } from './utils/brand';
import { applyLang, loadEnglish, loadLangPref } from './i18n';
import { registerServiceWorker } from './services/pushService';

// لون المدرسة المحفوظ يُطبَّق قبل أول رسم حتى لا يظهر اللون الافتراضي لحظة
applyBrandColor(loadSettings().brand_color);
applyLang(loadLangPref());
// تثبيت الموقع كتطبيق وإشعارات الجوال
registerServiceWorker();

const start = () => ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
// من اختار الإنجليزية: يُحمَّل قاموسها قبل أول رسم (وإن تعذّر تظهر الواجهة بالعربية)
if (loadLangPref() === 'en') loadEnglish().catch(() => undefined).finally(start);
else start();
