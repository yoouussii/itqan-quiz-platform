import React, { Suspense, lazy } from 'react';
import type { RichTextEditorProps } from './RichTextEditorImpl';
import { uiDir } from '../../i18n';

/**
 * غلاف آمن للمحرر المنسّق:
 * - المحرر الحقيقي (Quill) يُحمَّل عند الحاجة فقط (lazy) فلا يؤثر على إقلاع التطبيق.
 * - لو فشل تحميله لأي سبب، يظهر مربع نص عادي بدلاً من انهيار الصفحة كلها.
 */
const Impl = lazy(() => import('./RichTextEditorImpl'));

class EditorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[RichTextEditor] failed, using plain text box:', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export const RichTextEditor: React.FC<RichTextEditorProps> = (props) => {
  const fallback = (
    <textarea
      dir={uiDir()}
      rows={props.variant === 'compact' ? 1 : 3}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
    />
  );
  return (
    <EditorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Impl {...props} />
      </Suspense>
    </EditorBoundary>
  );
};
