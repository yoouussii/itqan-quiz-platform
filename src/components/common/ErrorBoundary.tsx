import React from 'react';
import { uiDir, t } from '../../i18n';

interface State {
  error: Error | null;
  reloading?: boolean;
}

/** خطأ تحميل جزء من الموقع بعد نشر إصدار جديد (ملف الإصدار القديم لم يعد موجوداً) */
const isStaleChunk = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically|not a valid JavaScript MIME type|Unable to preload CSS/i
    .test(String((e as Error)?.message || e));

/** إعادة تحميل مرة واحدة كل دقيقة على الأكثر (حتى لا تتكرر بلا نهاية إن كان الخلل في الشبكة) */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem('itqan_chunk_reload') || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem('itqan_chunk_reload', String(Date.now()));
  } catch { /* ignore */ }
  window.location.reload();
  return true;
}

/** يمنع الشاشة البيضاء: يعرض رسالة واضحة + تفاصيل الخطأ بدل صفحة فارغة */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isStaleChunk(error) && reloadForNewVersion()) { this.setState({ reloading: true }); return; }
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
    // إصدار جديد من المنصة أو انقطاع لحظي: إعادة تحميل تلقائية بدل رسالة الخطأ
    if (this.state.reloading) {
      return <div dir={uiDir()} style={{ margin: '20vh auto', textAlign: 'center', fontSize: 15, fontWeight: 700, color: '#475569' }}>{t('جارٍ تحديث المنصة…')}</div>;
    }
    const stale = isStaleChunk(this.state.error);
    return (
      <div dir={uiDir()} style={{ maxWidth: 640, margin: '10vh auto', padding: 24, fontFamily: 'inherit' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{stale ? t('تعذّر تحميل الصفحة') : t('حدث خطأ غير متوقع')}</h1>
        <p style={{ fontSize: 13, marginBottom: 16, color: '#475569' }}>
          {stale ? t('تأكد من اتصالك بالإنترنت ثم اضغط «إعادة التحميل». لم تضِع بياناتك.') : t('لم تضِع بياناتك. جرّب إعادة التحميل، وإن تكرر الخطأ أرسل النص أدناه للمطوّر.')}
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
