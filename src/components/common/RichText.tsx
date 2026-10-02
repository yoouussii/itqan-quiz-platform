import React, { useMemo } from 'react';

/**
 * عرض النصوص المنسّقة (من محرر Quill) بشكل آمن للطلاب والمعلم والآدمن.
 * - النصوص العادية القديمة (بدون وسوم) تُعرض كما هي.
 * - النصوص المنسّقة تمر عبر منقّي (Sanitizer) يسمح بوسوم وأنماط محددة فقط
 *   فلا يمكن حقن سكربتات أو روابط خطيرة.
 */

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SPAN', 'OL', 'UL', 'LI',
  'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'A', 'SUB', 'SUP', 'DIV',
]);
const DROP_WITH_CONTENT = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM',
  'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO',
]);
const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE']);

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]{3,20})$/i;
const SAFE_SIZE = /^\d{1,3}(\.\d+)?(px|em|rem|%)$/i;

function cleanStyle(style: string): string {
  const out: string[] = [];
  style.split(';').forEach((decl) => {
    const idx = decl.indexOf(':');
    if (idx < 0) return;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if ((prop === 'color' || prop === 'background-color') && SAFE_COLOR.test(val)) {
      out.push(`${prop}:${val}`);
    } else if (prop === 'font-size' && SAFE_SIZE.test(val)) {
      out.push(`${prop}:${val}`);
    } else if (prop === 'text-align' && /^(left|right|center|justify)$/i.test(val)) {
      out.push(`${prop}:${val}`);
    } else if (prop === 'direction' && /^(rtl|ltr)$/i.test(val)) {
      out.push(`${prop}:${val}`);
    }
  });
  return out.join(';');
}

/** هل النص يحتوي وسوم HTML؟ */
export function looksLikeHtml(text: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

/** تحويل HTML إلى HTML آمن. inline=true يحوّل الفقرات إلى أسطر داخل سطر واحد */
export function sanitizeHtml(html: string, inline = false): string {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') return '';

  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.getElementById('root');
  if (!root) return '';

  const walk = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.parentNode?.removeChild(child);
        return;
      }
      const el = child as HTMLElement;
      const tag = el.tagName;

      if (DROP_WITH_CONTENT.has(tag)) {
        el.remove();
        return;
      }

      walk(el); // نظّف الأبناء أولاً

      if (!ALLOWED_TAGS.has(tag)) {
        // وسم غير مسموح: نُبقي محتواه فقط
        while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
        el.remove();
        return;
      }

      // الخصائص: نُبقي style المنقّى، و href الآمن للروابط فقط
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name === 'style') {
          const cleaned = cleanStyle(attr.value);
          if (cleaned) el.setAttribute('style', cleaned);
          else el.removeAttribute('style');
        } else if (name === 'href' && tag === 'A') {
          if (!/^(https?:|mailto:)/i.test(attr.value.trim())) el.removeAttribute('href');
        } else if (name === 'class' && /^(ql-[a-z0-9-]+\s*)+$/i.test(attr.value.trim())) {
          // نُبقي فئات Quill البسيطة (محاذاة/اتجاه)
        } else {
          el.removeAttribute(attr.name);
        }
      });

      if (tag === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });
  };
  walk(root);

  if (inline) {
    // حوّل الفقرات إلى نص متصل مع <br> بينها
    const blocks = Array.from(root.querySelectorAll('p,div,h1,h2,h3,h4,blockquote')).filter((el) =>
      BLOCK_TAGS.has(el.tagName)
    );
    blocks.forEach((el, i) => {
      const span = doc.createElement('span');
      const style = el.getAttribute('style');
      if (style) span.setAttribute('style', style);
      while (el.firstChild) span.appendChild(el.firstChild);
      if (i < blocks.length - 1) span.appendChild(doc.createElement('br'));
      el.replaceWith(span);
    });
  }

  return root.innerHTML;
}

interface RichTextProps {
  html?: string | null;
  className?: string;
  /** للعرض داخل سطر واحد مثل خيارات الإجابة */
  inline?: boolean;
}

export const RichText: React.FC<RichTextProps> = ({ html, className = '', inline = false }) => {
  const text = html ?? '';
  const isHtml = looksLikeHtml(text);
  const safe = useMemo(() => (isHtml ? sanitizeHtml(text, inline) : ''), [text, isHtml, inline]);

  if (!text) return null;

  if (!isHtml) {
    return inline ? (
      <span className={className}>{text}</span>
    ) : (
      <div className={`whitespace-pre-wrap ${className}`}>{text}</div>
    );
  }

  return inline ? (
    <span className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: safe }} />
  ) : (
    <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: safe }} />
  );
};

/** نص عادي من HTML (للبحث أو التحقق من الفراغ) */
export function stripHtml(html: string): string {
  if (!html) return '';
  if (!looksLikeHtml(html)) return html;
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, '');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').trim();
}
