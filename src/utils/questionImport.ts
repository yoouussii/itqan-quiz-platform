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
  /** معلومات لكل سؤال بالترتيب نفسه: القسم وكلماته وملاحظة */
  meta?: ImportMeta[];
  /** أسطر تُجوهلت (ترويسة، جدول درجات، توقيعات…) ليراها المعلم */
  ignored?: string[];
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

/** نوع القسم كما يُفهم من تعليمات الامتحان («اختر…»، «ضع علامة…»، «أكمل…»، «صل…»، «أجب…») */
export type SectionKind = 'mcq' | 'true_false' | 'fill_blank' | 'matching' | 'essay' | '';

export interface ImportMeta {
  /** عنوان القسم الذي جاء تحته السؤال (مثل «السؤال الثاني: ضع علامة ✓ أو ✗») */
  section?: string;
  /** كلمات القسم بين قوسين (أكمل الفراغ بالكلمات: …) */
  bank?: string[];
  /** ملاحظة للمعلم عن السؤال */
  note?: string;
}

interface Draft {
  text: string[];
  options: { text: string; correct: boolean; emphasis: boolean }[];
  answer?: string;
  explanation?: string;
  marks?: number;
  num?: number;
  kind: SectionKind;
  section?: string;
  bank?: string[];
  /** عناصر العمود الثاني في قسم التوصيل */
  right?: string[];
}

const clean = (s: string) => s.replace(new RegExp(EMPHASIS_MARK, 'g'), '').replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ── تمييز أنواع الأقسام والأسئلة ──
const ORDINALS = 'الأول|الاول|أول|اول|الثاني|ثاني|الثالث|ثالث|الرابع|رابع|الخامس|خامس|السادس|سادس|السابع|سابع|الثامن|ثامن|التاسع|تاسع|العاشر|عاشر';
const SECTION_RE = new RegExp(`^\\s*(?:(?:السؤال|سؤال)\\s*(?:${ORDINALS}|[0-9٠-٩]{1,2})|س\\s*[0-9٠-٩]{1,2}|(?:الجزء|القسم)\\s*(?:${ORDINALS}|[0-9٠-٩]{1,2}))(?=\\s|[:：\\-.)/]|$)\\s*[:：\\-.)/]?\\s*(.*)$`);
const KIND_HINTS: [SectionKind, RegExp][] = [
  ['matching', /(?:^|\s)(?:صل|صلي|وصل|وصّل|طابق|طابقي|اربط|اربطي)(?:\s|$)|العمود\s*\(?\s*[أاب]|من\s+العمود|بما\s+يناسبها|بما\s+يناسبه/],
  ['true_false', /صح\s*أو\s*خطأ|صواب\s*أو\s*خطأ|صحيحة\s*أو\s*خاطئة|علامة\s*\(?\s*[✓✔√]|[✓✔√]\s*\)?\s*(?:أو|أمام|و)|[×✗✘]\s*\)?\s*أمام|العبارة\s+(?:الصحيحة|الخاطئة)|العبارات\s+(?:الصحيحة|الخاطئة|التالية)/],
  ['fill_blank', /(?:^|\s)(?:أكمل|اكمل|أكملي|اكملي|املأ|املئي|املأي)(?:\s|$)|الفراغ|الفراغات/],
  ['mcq', /(?:^|\s)(?:اختر|اختاري|اختار|ضع\s+دائرة|ضعي\s+دائرة|ظلل|ظللي)(?:\s|$)|الإجابة\s+الصحيحة\s+(?:مما|من\s+بين|فيما)|اختيار\s+من\s+متعدد|الاختيار\s+من\s+متعدد|choose|circle|multiple\s+choice/i],
  ['essay', /(?:^|\s)(?:أجب|اجب|أجيبي|اجيبي|علل|عللي|اشرح|اشرحي|عرف|عرّف|عرفي|وضح|وضّح|وضحي|قارن|قارني|اذكر|اذكري|بم\s+تفسر|فسر|فسري|اكتب|اكتبي|أجب\s+عن)(?:\s|$)|answer\s+the/i],
];
const kindOf = (s: string): SectionKind => KIND_HINTS.find(([, re]) => re.test(s))?.[0] || '';
// سطر تعليمات بلا رقم: يبدأ بفعل أمر ويتكلم عن «ما يلي/الآتية…» أو ينتهي بنقطتين
const INSTRUCTION_RE = /^\s*(?:أجب|اجب|اختر|اختاري|ضع|ضعي|أكمل|اكمل|املأ|صل|وصل|طابق|اربط|علل|اشرح|عرف|عرّف|وضح|قارن|اذكر|ظلل|choose|answer|fill|match)(?:\s|$)/i;
const instructionLike = (s: string) => INSTRUCTION_RE.test(s) && (/[:：]\s*(?:\(.*\))?\s*$/.test(s) || /فيما\s+يلي|مما\s+يلي|ما\s+يلي|الآتية|الاتية|التالية|الآتي|المناسبة|العبارات|الأسئلة/.test(s));

// أسطر لا تخص الأسئلة: ترويسة الورقة وجدول الدرجات والتوقيعات
const JUNK_LINE_RE = /^\s*(?:المملكة\s+العربية|وزارة\s+التعليم|الإدارة\s+العامة|إدارة\s+(?:التعليم|تعليم)|مكتب\s+التعليم|مدرسة|مدارس|اسم\s+الطالب|اسم\s+الطالبة|الاسم\s*[:：]|الصف\s*[:：]|الفصل\s*[:：]|الشعبة|رقم\s+الجلوس|الزمن|المادة\s*[:：]|التاريخ|الدرجة\s*[:：]|الدرجة\s+النهائية|المصحح|المراجع|المدقق|توقيع|اسم\s+المعلم|معلم\s+المادة|انتهت\s+الأسئلة|مع\s+تمنياتي|مع\s+أطيب|بالتوفيق|وفقكم|وفقك|تمنياتي|المجموع|جدول\s+(?:درجات|الدرجات)|الفصل\s+الدراسي|العام\s+الدراسي|اختبار\s+(?:مادة|نهاية|منتصف|الفترة)|الاختبار\s+(?:النهائي|الشهري)|تابع\s+الأسئلة|انظر\s+خلف|اقلب\s+الورقة|يتبع|بسم\s+الله)/;
const JUNK_CUT_RE = /\s(?:جدول\s+(?:درجات|الدرجات)|توقيع\s+(?:المعلم|المعلمة|المصحح)|انتهت\s+الأسئلة|مع\s+تمنياتي|اسم\s+الطالب|المجموع\s+الكلي|انظر\s+خلف|اقلب\s+الورقة)[\s\S]*$/;
const STOP_RE = /^\s*(?:انتهت\s+الأسئلة|جدول\s+(?:درجات|الدرجات)\s+الاختبار)/;

// صح/خطأ في آخر العبارة: «( )» أو «(✓)» أو «(صح)»
const TF_TAIL_RE = /[([]\s*([✓✔√×✗✘xX]|صح|خطأ|خطا|صواب)?\s*[)\]]\s*\.?\s*$/;
// فراغ للإكمال: نقاط أو شرطات
const BLANK_RE = /\.{3,}|…+|_{3,}|-{4,}|ـ{3,}/;

/** خيارات في سطر واحد: «أ) الهضمي ب) الدوري ج) التنفسي» */
function splitInlineOptions(line: string): { head: string; opts: string[] } | null {
  const seqs = [['أ', 'ب', 'ج', 'د', 'ه', 'و'], ['a', 'b', 'c', 'd', 'e', 'f']];
  for (const seq of seqs) {
    const pos: { at: number; len: number }[] = [];
    let from = 0;
    for (const L of seq) {
      const alt = L === 'أ' ? '[أاإ]' : L === 'ه' ? 'هـ?' : L;
      const re = new RegExp(`(?:^|\\s)[([]?\\s*${alt}\\s*[)\\].\\-/]\\s*`, seq[0] === 'a' ? 'gi' : 'g');
      re.lastIndex = from;
      const m = re.exec(line);
      if (!m) break;
      pos.push({ at: m.index, len: m[0].length });
      from = m.index + m[0].length;
    }
    if (pos.length < 2) continue;
    const opts = pos.map((p, i) => line.slice(p.at + p.len, i + 1 < pos.length ? pos[i + 1].at : undefined).trim());
    if (opts.some((o) => !clean(o))) continue;
    return { head: line.slice(0, pos[0].at).trim(), opts };
  }
  return null;
}

/** أسئلة ملتصقة في سطر واحد (شائع في PDF): «… المتجددة: 2. سرعة الصوت …» */
function splitMergedQuestions(line: string, next: number): string[] {
  const out: string[] = [];
  let rest = line;
  let n = next;
  for (let guard = 0; guard < 30; guard++) {
    const re = new RegExp(`\\s(?:س\\s*)?(${n}|${String(n).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)])})\\s*[.\\-)]\\s+(?=\\S)`);
    const m = rest.match(re);
    if (!m || m.index === undefined || m.index < 3) break;
    out.push(rest.slice(0, m.index));
    rest = rest.slice(m.index + 1);
    n++;
  }
  out.push(rest);
  return out;
}

function toQuestion(d: Draft): { q: QuestionItem; review: boolean; note?: string } {
  let text = clean(d.text.join(' '));
  let marks = d.marks;
  const m = text.match(MARKS_RE);
  if (m && !TF_TAIL_RE.test(text.slice(m.index))) {
    marks = Number(toLatinDigits(m[1]).replace(',', '.')) || undefined;
    text = text.slice(0, m.index).trim();
  }
  const answer = d.answer ? clean(d.answer).replace(CORRECT_RE, '').trim() : '';
  let opts = d.options.map((o) => ({ ...o, text: clean(o.text) }));
  const mk = (rest: Partial<QuestionItem> & { type: QuestionItem['type'] }, t2 = text): QuestionItem => ({
    uid: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    question_text: `<p>${esc(t2)}</p>`, explanation: d.explanation ? `<p>${esc(d.explanation)}</p>` : '',
    options: [], correct_option_index: -1, marks: marks || 1, ...rest,
  });
  const tf = (correctTrue: boolean | null, t2 = text) => ({ q: mk({ type: 'true_false', options: ['صح', 'خطأ'], correct_option_index: correctTrue === false ? 1 : 0 }, t2), review: correctTrue === null });

  // توصيل: العناصر المرقمة يساراً وعناصر العمود الثاني بالترتيب (يراجع المعلم المقابلات)
  if (d.kind === 'matching' && d.text.length > 1) {
    d.right = d.right || [];
    const left = d.text.slice(1).map(clean).filter(Boolean);
    const pairs = left.map((l, i) => ({ id: rid('pr'), left: l, right: d.right![i] || '' }));
    return { q: mk({ type: 'matching', pairs, marks: marks || pairs.length }, clean(d.text[0]) || 'صل كل عنصر بما يناسبه'), review: false, note: d.right.length ? 'راجع المقابلات الصحيحة بعد الإضافة' : 'اكتب المقابلات بعد الإضافة' };
  }

  // خياران صح/خطأ = سؤال صح أو خطأ
  if (opts.length === 2 && opts.every((o) => TRUE_RE.test(o.text) || FALSE_RE.test(o.text))) {
    const c = opts.find((o) => o.correct);
    return tf(c ? TRUE_RE.test(c.text) : answer ? TRUE_RE.test(answer) || letterIndex(answer) === opts.findIndex((o) => TRUE_RE.test(o.text)) : null);
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
    return { q: mk({ type: 'mcq', options: opts.map((o) => `<p>${esc(o.text)}</p>`), correct_option_index: Math.max(0, Math.min(correct, opts.length - 1)) }), review: correct < 0 };
  }

  // صح/خطأ: «( )» في آخر العبارة، أو قسم «ضع علامة ✓ أو ✗»، أو «الإجابة: صح»
  const tail = text.match(TF_TAIL_RE);
  const tfAnswer = (s?: string): boolean | null => (!s ? null : /[✓✔√]|صح|صواب|^t/i.test(s) ? true : /[×✗✘xX]|خط|^f/i.test(s) ? false : null);
  if (answer && (TRUE_RE.test(answer) || FALSE_RE.test(answer))) return tf(TRUE_RE.test(answer), tail ? text.slice(0, tail.index).trim() : text);
  if ((tail && (d.kind === 'true_false' || d.kind === '' )) || (d.kind === 'true_false' && !BLANK_RE.test(text))) {
    return tf(tail ? tfAnswer(tail[1]) : null, tail ? text.slice(0, tail.index).trim() : text);
  }

  // أكمل الفراغ: نقاط أو شرطات في العبارة، أو قسم «أكمل»
  if (BLANK_RE.test(text) || d.kind === 'fill_blank') {
    const t2 = text.replace(/(?:\.{3,}|…+|_{3,}|-{4,}|ـ{3,})(?:\s*(?:\.{3,}|…+|_{3,}|-{4,}|ـ{3,}))*/g, '........');
    const acc = answer ? answer.split(/[،,/]| أو /).map((x) => x.trim()).filter(Boolean) : [];
    return { q: mk({ type: 'fill_blank', accepted_answers: acc.length ? acc : [''] }, t2), review: false, note: acc.length ? undefined : 'اكتب الإجابة المقبولة' };
  }

  // مقالي: الإجابة النصية تُحفظ كإجابة نموذجية في الشرح
  const model = answer ? `<p>${esc(answer)}</p>` : '';
  const q = mk({ type: 'essay', marks: marks || 2 });
  q.explanation = [model, q.explanation].filter(Boolean).join('');
  return { q, review: false };
}

export function parseQuestionsText(raw: string): ImportResult {
  // ردود الشات (ChatGPT وغيره) تضيف تنسيق Markdown: **عريض** و### عناوين و- نقاط
  const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.replace(/ /g, ' ').replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^\s*#{1,6}\s+/, '').replace(/^\s*[-•]\s+(?=\S)/, '').trimEnd());
  const drafts: Draft[] = [];
  const ignored: string[] = [];
  const key = new Map<number, string>();
  let cur: Draft | null = null;
  let inKey = false;
  let stopped = false;
  let numbered = 0;
  type Section = { title: string; kind: SectionKind; bank?: string[] };
  let section = null as Section | null;
  let matchQ: Draft | null = null;

  const push = () => {
    if (cur && cur !== matchQ && clean(cur.text.join(' '))) drafts.push(cur);
    cur = null;
  };
  const bankOf = (s: string) => {
    const m = s.match(/[([]([^()[\]]{3,})[)\]]\s*:?\s*$/);
    if (!m) return undefined;
    const words = m[1].split(/\s*[–—\-،,/|]\s*|\s{2,}/).map((w) => w.trim()).filter(Boolean);
    return words.length >= 2 ? words : undefined;
  };
  const startSection = (title: string, rest: string) => {
    push();
    matchQ = null;
    const kind = kindOf(rest || title);
    section = { title: clean(title), kind, bank: kind === 'fill_blank' ? bankOf(rest) : undefined };
    numbered = 0;
    if (kind === 'matching') {
      matchQ = { text: [clean(rest) || 'صل كل عنصر بما يناسبه'], options: [], kind, section: section.title, right: [] };
      drafts.push(matchQ);
    }
  };

  for (const line0 of lines) {
    let line = line0.trim();
    if (!line) continue;
    if (stopped) { ignored.push(line); continue; }
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

    // ترويسة الورقة والتوقيعات وجدول الدرجات لا تُقرأ كأسئلة
    if (STOP_RE.test(line)) { push(); stopped = true; ignored.push(line); continue; }
    if (JUNK_LINE_RE.test(line) && !QUESTION_RE.test(line)) { ignored.push(line); continue; }
    const cut = line.replace(JUNK_CUT_RE, '');
    if (cut !== line) { ignored.push(line.slice(cut.length).trim()); line = cut.trim(); if (!line) continue; }

    // عنوان قسم: «السؤال الثاني: ضع علامة (✓)…» أو سطر تعليمات «اختر الإجابة الصحيحة:»
    const sec = line.match(SECTION_RE);
    // «س1: علل …» سؤال، أما «س1: اختر الإجابة الصحيحة فيما يلي:» و«السؤال الأول …» فعناوين أقسام
    if (sec && (!/^\s*س\s*[0-9٠-٩]/.test(line) || !clean(sec[1]) || instructionLike(sec[1]))) { startSection(line, sec[1]); continue; }
    if (!QUESTION_RE.test(line) && (instructionLike(line) || (kindOf(line) && clean(line).split(' ').length <= 5 && !cur?.options.length && !BLANK_RE.test(line) && /^\s*(?:أسئلة|اسئلة|القسم|الجزء|أجب|اجب|اختر|أكمل|اكمل|صل|وصل|طابق|ضع|صح|علل|املأ)/.test(line)))) { startSection(line, line); continue; }

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

    // قسم التوصيل: المرقم عمود أول، والمسبوق بحرف عمود ثانٍ
    if (matchQ) {
      const mq = matchQ as Draft;
      const inl = splitInlineOptions(line);
      const qm = (inl ? inl.head : line).match(QUESTION_RE);
      if (qm) {
        // «1. القلب   أ) يضخ الدم»: الطرفان في سطر واحد
        const one = !inl && qm[2].match(/^(.+?)\s+[([]?\s*(?:[أاإبجدهوز]|[a-fA-F])\s*[)\].\-/]\s*(.+)$/);
        if (one) { mq.text.push(one[1]); mq.right!.push(clean(one[2])); continue; }
        mq.text.push(qm[2]);
      }
      if (inl) inl.opts.forEach((o) => mq.right!.push(clean(o)));
      else if (!qm) {
        const om = line.match(OPTION_RE);
        if (om) mq.right!.push(clean(om[2]));
        else if (/\t|\s{3,}/.test(line0)) {
          // جدول بعمودين بلا ترقيم
          const [a, b] = line0.trim().split(/\t+|\s{3,}/);
          if (a && b) { mq.text.push(a); mq.right!.push(b); }
        }
      }
      continue;
    }

    // الخيارات في سطر واحد
    const inline = splitInlineOptions(line);
    if (inline && cur && !inline.head && !QUESTION_RE.test(line)) {
      inline.opts.forEach((o) => {
        const correct = CORRECT_RE.test(o);
        (cur as Draft).options.push({ text: o.replace(CORRECT_RE, ' '), correct, emphasis: o.includes(EMPHASIS_MARK) });
      });
      continue;
    }
    const opt = line.match(OPTION_RE);
    if (opt && cur && !inline && (cur.options.length > 0 || letterIndex(opt[1]) === 0)) {
      let text = opt[2];
      const correct = CORRECT_RE.test(text);
      const emphasis = text.includes(EMPHASIS_MARK);
      text = text.replace(CORRECT_RE, ' ');
      cur.options.push({ text, correct, emphasis });
      continue;
    }

    const q = line.match(QUESTION_RE);
    if (q && clean(q[2])) {
      // أسئلة ملتصقة في سطر واحد تُفصل، وخيارات السطر نفسه تُلحق بسؤالها
      const parts = splitMergedQuestions(line, Number(toLatinDigits(q[1])) + 1);
      for (const part of parts) {
        const pm = part.match(QUESTION_RE);
        if (!pm) continue;
        push();
        numbered = Number(toLatinDigits(pm[1]));
        const sct = section as Section | null;
        cur = { text: [], options: [], num: numbered, kind: sct?.kind || '', section: sct?.title, bank: sct?.bank };
        const inl = splitInlineOptions(pm[2]);
        if (inl && inl.head) {
          cur.text.push(inl.head);
          inl.opts.forEach((o) => (cur as Draft).options.push({ text: o.replace(CORRECT_RE, ' '), correct: CORRECT_RE.test(o), emphasis: o.includes(EMPHASIS_MARK) }));
        } else cur.text.push(pm[2]);
      }
      continue;
    }
    // سطر تابع: يكمل آخر خيار أو نص السؤال
    if (cur) {
      const c = cur as Draft;
      if (c.options.length) c.options[c.options.length - 1].text += ` ${line}`;
      else c.text.push(line);
    } else {
      const sct = section as Section | null;
      // كلمات «أكمل» في سطر مستقل بعد العنوان
      if (sct && sct.kind === 'fill_blank' && !sct.bank) {
        const words = line.replace(/^[([]|[)\]]$/g, '').split(/\s*[–—\-،,/|]\s*|\s{2,}/).map((w) => w.trim()).filter(Boolean);
        if (words.length >= 2 && words.every((w) => w.length <= 25)) { sct.bank = words; continue; }
      }
      ignored.push(line);
    }
  }
  push();

  const needsReview: number[] = [];
  const meta: ImportMeta[] = [];
  const questions: QuestionItem[] = [];
  drafts.forEach((d) => {
    if (d.kind === 'matching' && d.text.length <= 1) return;
    const num = d.num ?? questions.length + 1;
    if (!d.answer && !d.options.some((o) => o.correct) && key.has(num)) d.answer = key.get(num);
    const { q, review, note } = toQuestion(d);
    questions.push(q);
    if (review) needsReview.push(questions.length);
    meta.push({ section: d.section, bank: d.bank, note });
  });
  return { questions, needsReview, meta, ignored };
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
