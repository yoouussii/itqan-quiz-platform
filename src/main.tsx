import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';
import { loadSettings } from './services/settingsService';
import { applyBrandColor } from './utils/brand';
import { applyLang, loadLangPref } from './i18n';
import { registerServiceWorker } from './services/pushService';

// لون المدرسة المحفوظ يُطبَّق قبل أول رسم حتى لا يظهر اللون الافتراضي لحظة
applyBrandColor(loadSettings().brand_color);
applyLang(loadLangPref());
// تثبيت الموقع كتطبيق وإشعارات الجوال
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
