/**
 * استيراد الأسئلة من نص (ملف Word أو PDF أو نص ملصوق).
 *
 * الصيغة المدعومة (مرنة، وكل سؤال يُراجَع في المعاينة قبل إضافته):
 *   1. نص السؤال (2 درجة)
 *   أ) خيار
 *   ب) خيار صحيح *          ← النجمة أو ✓ أو (صح) = الإجابة الصحيحة، أو خيار بخط عريض/تحته خط في Word
 *   ج) خيار
 *   الإجابة: ب               ← بديل للعلامة
 *   الشرح: ...               ← اختياري
 * - صح/خطأ: سؤال بلا خيارات وإجابته «صح» أو «خطأ» (أو خياران صح/خطأ).
 * - مقالي: سؤال بلا خيارات (الإجابة النصية إن وُجدت تُحفظ كإجابة نموذجية في الشرح).
 * - مفتاح إجابات في آخر الملف: «مفتاح الإجابة» ثم أسطر مثل «1- ب».
 */
import type { QuestionItem } from '../components/teacher/QuizEditor';

export interface ImportResult {
  questions: QuestionItem[];
  /** أرقام الأسئلة (من 1) التي تحتاج مراجعة: اختيار من متعدد بلا إجابة صحيحة */
  needsReview: number[];
}

/** علامة داخلية يضعها محوّل Word للخيار المكتوب بخط عريض أو تحته خط */
export const EMPHASIS_MARK = '\u0001';

const AR_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'];
const EN_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const normLetter = (s: string): string => {
  const x = s.trim().replace(/[ـ]/g, '');
  if (/^[اأإآ]$/.test(x)) return 'أ';
  if (/^(ه|هـ|ة)$/.test(x)) return 'هـ';
  return x.toLowerCase();
};
const letterIndex = (s: string): number => {
  const l = normLetter(s);
  const a = AR_LETTERS.indexOf(l);
  return a >= 0 ? a : EN_LETTERS.indexOf(l);
};

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

const QUESTION_RE = /^\s*(?:(?:س|سؤال|السؤال|q|question)\s*)?([0-9٠-٩]{1,3})\s*[.\-)\]:،/]\s*(.*)$/i;
const OPTION_RE = /^\s*[([]?\s*(أ|ا|إ|ب|ج|د|هـ|ه|و|ز|ح|[a-hA-H])\s*[)\].\-:/]\s*(.+)$/;
const ANSWER_RE = /^\s*(?:الإجابة|الاجابة|الإجابة الصحيحة|الاجابة الصحيحة|الجواب|answer|ans|correct)\s*[:：\-=]\s*(.+)$/i;
const EXPLAIN_RE = /^\s*(?:الشرح|التوضيح|التعليل|explanation)\s*[:：\-]\s*(.+)$/i;
const KEY_HEADER_RE = /^\s*(?:مفتاح\s+الإجاب[ةه]|مفتاح\s+الاجاب[ةه]|الإجابات|الاجابات|answer\s+key|answers)\s*:?\s*$/i;
const KEY_LINE_RE = /^\s*([0-9٠-٩]{1,3})\s*[.\-)\]:،/]?\s*([^\s].*)$/;
const CORRECT_RE = /\s*(?:\*+|✓|✔|☑|\(\s*(?:صح|صحيح|صحيحة|correct)\s*\)|\[\s*x\s*\])\s*/i;
const MARKS_RE = /[([]\s*([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)\s*(?:درجة|درجات|درجتان|درجتين|marks?|pts?|points?)?\s*[)\]]\s*$/i;
const TRUE_RE = /^(?:صح|صحيح|صحيحة|true|t|✓|✔)$/i;
const FALSE_RE = /^(?:خطأ|خطا|خاطئ|خاطئة|false|f|✗|✘|x)$/i;

interface Draft {
  text: string[];
  options: { text: string; correct: boolean; emphasis: boolean }[];
  answer?: string;
  explanation?: string;
  marks?: number;
}

const clean = (s: string) => s.replace(new RegExp(EMPHASIS_MARK, 'g'), '').replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toQuestion(d: Draft): { q: QuestionItem; review: boolean } {
  let text = clean(d.text.join(' '));
  let marks = d.marks;
  const m = text.match(MARKS_RE);
  if (m) {
    marks = Number(toLatinDigits(m[1]).replace(',', '.')) || undefined;
    text = text.slice(0, m.index).trim();
  }
  const base = { uid: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, question_text: `<p>${esc(text)}</p>`, explanation: d.explanation ? `<p>${esc(d.explanation)}</p>` : '' };
  const answer = d.answer ? clean(d.answer).replace(CORRECT_RE, '').trim() : '';
  let opts = d.options.map((o) => ({ ...o, text: clean(o.text) }));

  // خياران صح/خطأ = سؤال صح أو خطأ
  if (opts.length === 2 && opts.every((o) => TRUE_RE.test(o.text) || FALSE_RE.test(o.text))) {
    const correctTrue = opts.find((o) => o.correct) ? TRUE_RE.test(opts.find((o) => o.correct)!.text) : answer ? TRUE_RE.test(answer) || letterIndex(answer) === opts.findIndex((o) => TRUE_RE.test(o.text)) : true;
    return { q: { ...base, type: 'true_false', options: ['صح', 'خطأ'], correct_option_index: correctTrue ? 0 : 1, marks: marks || 1 }, review: !opts.some((o) => o.correct) && !answer };
  }

  if (opts.length >= 2) {
    let correct = opts.findIndex((o) => o.correct);
    if (correct < 0 && answer) {
      const li = letterIndex(answer.split(/[\s)\].\-]/)[0] || '');
      if (li >= 0 && li < opts.length) correct = li;
      else {
        const byText = opts.findIndex((o) => o.text === answer);
        if (byText >= 0) correct = byText;
      }
    }
    // خيار واحد فقط بخط عريض أو تحته خط في Word
    if (correct < 0) {
      const emph = opts.map((o, i) => (o.emphasis ? i : -1)).filter((i) => i >= 0);
      if (emph.length === 1) correct = emph[0];
    }
    opts = opts.slice(0, 6);
    return {
      q: { ...base, type: 'mcq', options: opts.map((o) => `<p>${esc(o.text)}</p>`), correct_option_index: Math.max(0, Math.min(correct, opts.length - 1)), marks: marks || 1 },
      review: correct < 0,
    };
  }

  if (answer && (TRUE_RE.test(answer) || FALSE_RE.test(answer))) {
    return { q: { ...base, type: 'true_false', options: ['صح', 'خطأ'], correct_option_index: TRUE_RE.test(answer) ? 0 : 1, marks: marks || 1 }, review: false };
  }
  // مقالي: الإجابة النصية تُحفظ كإجابة نموذجية في الشرح
  const model = answer ? `<p>${esc(answer)}</p>` : '';
  return { q: { ...base, type: 'essay', options: [], correct_option_index: -1, marks: marks || 2, explanation: [model, base.explanation].filter(Boolean).join('') }, review: false };
}

export function parseQuestionsText(raw: string): ImportResult {
  const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.replace(/ /g, ' ').trimEnd());
  const drafts: Draft[] = [];
  const key = new Map<number, string>();
  let cur: Draft | null = null;
  let inKey = false;
  let numbered = 0;

  const push = () => {
    if (cur && clean(cur.text.join(' '))) drafts.push(cur);
    cur = null;
  };

  for (const line0 of lines) {
    const line = line0.trim();
    if (!line) continue;
    if (KEY_HEADER_RE.test(clean(line))) {
      push();
      inKey = true;
      continue;
    }
    if (inKey) {
      // في مفتاح الإجابات: «1- ب» أو عدة أزواج في سطر واحد «1-ب 2-أ»
      const pairs = Array.from(clean(line).matchAll(/([0-9٠-٩]{1,3})\s*[.\-)\]:،/]?\s*(صح|خطأ|خطا|true|false|[أابجدهوزحa-hA-H](?:ـ)?)(?=\s|$|[,،;])/gi));
      if (pairs.length) {
        pairs.forEach((p) => key.set(Number(toLatinDigits(p[1])), p[2]));
        continue;
      }
      const km = clean(line).match(KEY_LINE_RE);
      if (km) {
        key.set(Number(toLatinDigits(km[1])), km[2]);
        continue;
      }
      inKey = false;
    }

    const ans = line.match(ANSWER_RE);
    if (ans && cur) {
      cur.answer = ans[1];
      continue;
    }
    const exp = line.match(EXPLAIN_RE);
    if (exp && cur) {
      cur.explanation = clean(exp[1]);
      continue;
    }
    const opt = line.match(OPTION_RE);
    if (opt && cur && (cur.options.length > 0 || letterIndex(opt[1]) === 0)) {
      let text = opt[2];
      const correct = CORRECT_RE.test(text);
      const emphasis = text.includes(EMPHASIS_MARK);
      text = text.replace(CORRECT_RE, ' ');
      cur.options.push({ text, correct, emphasis });
      continue;
    }
    const q = line.match(QUESTION_RE);
    if (q && clean(q[2])) {
      push();
      numbered = Number(toLatinDigits(q[1]));
      cur = { text: [q[2]], options: [] };
      (cur as Draft & { num?: number }).num = numbered;
      continue;
    }
    // سطر تابع: يكمل آخر خيار أو نص السؤال
    if (cur) {
      const c = cur as Draft;
      if (c.options.length) c.options[c.options.length - 1].text += ` ${line}`;
      else c.text.push(line);
    }
  }
  push();

  const needsReview: number[] = [];
  const questions = drafts.map((d, i) => {
    const num = (d as Draft & { num?: number }).num ?? i + 1;
    if (!d.answer && !d.options.some((o) => o.correct) && key.has(num)) d.answer = key.get(num);
    const { q, review } = toQuestion(d);
    if (review) needsReview.push(i + 1);
    return q;
  });
  return { questions, needsReview };
}

/** تحويل HTML من Word (mammoth) إلى أسطر: القوائم المرقّمة تصبح «1.» و«أ)» حتى يفهمها المحلل */
export function wordHtmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  const emphasized = (el: Element) => {
    const text = (el.textContent || '').trim();
    if (!text) return false;
    const strong = Array.from(el.querySelectorAll('strong, b, u')).map((x) => x.textContent || '').join('').trim();
    return strong.length > 0 && strong.replace(/\s+/g, '') === text.replace(/\s+/g, '');
  };
  const walk = (node: Element, depth: number) => {
    for (const el of Array.from(node.children)) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'ol' || tag === 'ul') {
        Array.from(el.children).forEach((li, i) => {
          if (li.tagName.toLowerCase() !== 'li') return;
          const own = Array.from(li.childNodes).filter((n) => !(n instanceof Element && /^(ol|ul)$/i.test(n.tagName)));
          const text = own.map((n) => n.textContent || '').join(' ').trim();
          const mark = emphasized(li) ? EMPHASIS_MARK : '';
          // المستوى الأول: رقم السؤال (إن لم يكن مكتوباً)، والمستوى الثاني: حرف الخيار
          const prefix = depth === 0 ? (QUESTION_RE.test(text) ? '' : `${i + 1}. `) : OPTION_RE.test(text) ? '' : `${AR_LETTERS[i] || i + 1}) `;
          if (text) out.push(prefix + text + mark);
          Array.from(li.children).filter((c) => /^(ol|ul)$/i.test(c.tagName)).forEach((c) => walk({ children: [c] } as unknown as Element, depth + 1));
        });
      } else if (tag === 'table') {
        el.querySelectorAll('tr').forEach((tr) => out.push(Array.from(tr.querySelectorAll('td, th')).map((c) => (c.textContent || '').trim()).join(' ')));
      } else {
        const text = (el.textContent || '').trim();
        if (text) out.push(text + (emphasized(el) && OPTION_RE.test(text) ? EMPHASIS_MARK : ''));
      }
    }
  };
  walk(doc.body, 0);
  return out.join('\n');
}
