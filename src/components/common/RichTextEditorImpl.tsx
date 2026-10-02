import React from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

/**
 * محرر نصوص منسّق (مثل Word) مبني على Quill.
 * - تكبير/تصغير الخط، لون النص، لون الخلفية، المحاذاة، عريض، مائل، تسطير، قوائم.
 * - يحفظ التنسيق كـ inline styles (وليس classes) ليظهر صحيحاً عند الطلاب والآدمن
 *   بدون الحاجة لملف Quill CSS هناك.
 */

const FONT_SIZES = ['12px', '14px', '16px', '18px', '22px', '28px', '36px'];

// Quill يُؤخذ من react-quill بطريقة آمنة (الاستيراد المسمّى قد يكون undefined بعد البناء)
const Quill: any = (ReactQuill as any).Quill;

// تسجيل مرة واحدة فقط على مستوى الوحدة؛ أي فشل هنا لا يجب أن يُسقط التطبيق
try {
  if (Quill) {
    const SizeStyle = Quill.import('attributors/style/size');
    SizeStyle.whitelist = FONT_SIZES;
    Quill.register(SizeStyle, true);
    Quill.register(Quill.import('attributors/style/align'), true);
    Quill.register(Quill.import('attributors/style/direction'), true);
  }
} catch (e) {
  console.warn('[RichTextEditor] Quill style registration failed:', e);
}

// ثابتة خارج المكوّن حتى لا يُعاد إنشاء المحرر (وتضيع المؤشر) مع كل رندر
const FULL_MODULES = {
  toolbar: [
    [{ size: [false, ...FONT_SIZES] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ align: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ direction: 'rtl' }],
    ['clean'],
  ],
};

const COMPACT_MODULES = {
  toolbar: [
    [{ size: [false, ...FONT_SIZES] }],
    ['bold', 'italic', 'underline'],
    [{ color: [] }, { background: [] }],
    ['clean'],
  ],
};

const FULL_FORMATS = [
  'size', 'bold', 'italic', 'underline', 'strike', 'color', 'background',
  'align', 'list', 'bullet', 'direction',
];

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** compact = شريط أدوات مصغّر للخيارات والإجابات القصيرة */
  variant?: 'full' | 'compact';
  minHeight?: number;
}

const RichTextEditorImpl: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder,
  variant = 'full',
  minHeight,
}) => {
  const height = minHeight ?? (variant === 'compact' ? 40 : 90);

  return (
    <div
      className={`rich-editor ${variant === 'compact' ? 'rich-editor-compact' : ''}`}
      dir="rtl"
      style={{ ['--editor-min-height' as any]: `${height}px` }}
    >
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={(content: string, _delta: unknown, _source: unknown, editor: { getText: () => string }) => {
          // Quill يُرجع <p><br></p> عند الفراغ؛ نحوّله لنص فارغ ليعمل التحقق من الحقول
          const isEmpty = editor.getText().trim().length === 0;
          onChange(isEmpty ? '' : content);
        }}
        placeholder={placeholder}
        modules={variant === 'compact' ? COMPACT_MODULES : FULL_MODULES}
        formats={FULL_FORMATS}
      />
    </div>
  );
};

export default RichTextEditorImpl;
