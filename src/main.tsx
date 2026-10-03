import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';
import { loadSettings } from './services/settingsService';
import { applyBrandColor } from './utils/brand';

// لون المدرسة المحفوظ يُطبَّق قبل أول رسم حتى لا يظهر اللون الافتراضي لحظة
applyBrandColor(loadSettings().brand_color);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
