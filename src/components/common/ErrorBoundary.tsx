import React from 'react';
import { uiDir, t } from '../../i18n';

interface State {
  error: Error | null;
}

/** يمنع الشاشة البيضاء: يعرض رسالة واضحة + تفاصيل الخطأ بدل صفحة فارغة */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private resetSession = () => {
    try {
      localStorage.removeItem('itqan_current_user_id_v2');
      localStorage.removeItem('itqan_session_started_at');
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div dir={uiDir()} style={{ maxWidth: 640, margin: '10vh auto', padding: 24, fontFamily: 'inherit' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{t('حدث خطأ غير متوقع')}</h1>
        <p style={{ fontSize: 13, marginBottom: 16, color: '#475569' }}>
          {t('لم تضِع بياناتك. جرّب إعادة التحميل، وإن تكرر الخطأ أرسل النص أدناه للمطوّر.')}
        </p>
        <pre
          style={{
            direction: 'ltr', textAlign: 'left', fontSize: 11, background: '#f1f5f9', color: '#0f172a',
            padding: 12, borderRadius: 12, overflow: 'auto', maxHeight: 220, whiteSpace: 'pre-wrap',
          }}
        >
          {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
        </pre>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', borderRadius: 12, background: '#4f46e5', color: '#fff', fontWeight: 700, fontSize: 12 }}>
            {t('إعادة التحميل')}
          </button>
          <button onClick={this.resetSession} style={{ padding: '8px 16px', borderRadius: 12, background: '#e2e8f0', color: '#0f172a', fontWeight: 700, fontSize: 12 }}>
            {t('تسجيل خروج وإعادة التحميل')}
          </button>
        </div>
      </div>
    );
  }
}
