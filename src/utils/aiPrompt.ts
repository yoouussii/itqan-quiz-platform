/**
 * الذكاء الاصطناعي بدون تكلفة: المنصة تجهّز «طلباً» جاهزاً، ينسخه المعلم في أي شات مجاني
 * (ChatGPT أو Claude أو Gemini)، ثم يلصق الرد هنا. المنصة لا تتصل بأي خدمة ذكاء اصطناعي،
 * ولا يُرسل اسم الطالب أبداً (التصحيح يرسل نص الإجابة فقط).
 */
import { stripHtml } from '../components/common/RichText';

export const AI_SITES = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Claude', url: 'https://claude.ai/new' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
];

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // متصفحات بلا إذن الحافظة: نسخ عبر عنصر مؤقت
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export type GenType = 'mcq' | 'true_false' | 'essay';
export interface QuestionsPromptInput {
  lesson: string;
  count: number;
  types: GenType[];
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  grade: string;
  subject: string;
}

const DIFF: Record<QuestionsPromptInput['difficulty'], string> = { easy: 'سهلة', medium: 'متوسطة', hard: 'صعبة', mixed: 'متنوعة بين السهل والمتوسط والصعب' };
const TYPE_AR: Record<GenType, string> = { mcq: 'اختيار من متعدد (4 خيارات)', true_false: 'صح أو خطأ', essay: 'مقالي قصير' };

/** طلب توليد أسئلة بنفس صيغة الاستيراد في المنصة (questionImport) */
export function questionsPrompt(p: QuestionsPromptInput): string {
  const types = (p.types.length ? p.types : (['mcq'] as GenType[])).map((x) => TYPE_AR[x]).join('، ');
  return `أنت معلم خبير في إعداد الاختبارات${p.subject ? ` لمادة ${p.subject}` : ''}${p.grade ? ` للصف ${p.grade}` : ''}.
اكتب ${p.count} سؤالاً من الدرس التالي فقط، صعوبتها ${DIFF[p.difficulty]}، وأنواعها: ${types}.

اكتب الأسئلة بهذه الصيغة حرفياً، بدون أي مقدمة أو خاتمة أو تنسيق Markdown:

1. نص السؤال (1 درجة)
أ) خيار
ب) خيار صحيح *
ج) خيار
د) خيار
الشرح: سبب صحة الإجابة في جملة واحدة

2. نص سؤال صح أو خطأ (1 درجة)
الإجابة: صح

3. نص سؤال مقالي (3 درجات)
الإجابة: الإجابة النموذجية باختصار

القواعد:
- ضع علامة * بعد الخيار الصحيح فقط، وخيار صحيح واحد لكل سؤال.
- نوّع موضع الإجابة الصحيحة بين أ وب وج ود.
- الخيارات الخاطئة معقولة وقريبة من الصحيح.
- لا تخرج عن محتوى الدرس.

الدرس:
"""
${p.lesson.trim()}
"""`;
}

/** طلب اقتراح درجة وملاحظة لإجابة مقالية (بدون اسم الطالب) */
export function gradingPrompt(p: { question: string; modelAnswer: string; answer: string; max: number }): string {
  return `أنت معلم يصحح إجابة طالب على سؤال مقالي بعدل.
السؤال: ${stripHtml(p.question)}
${p.modelAnswer ? `الإجابة النموذجية: ${stripHtml(p.modelAnswer)}\n` : ''}الدرجة الكاملة: ${p.max}

إجابة الطالب:
"""
${p.answer.trim()}
"""

اقترح درجة من 0 إلى ${p.max} (يمكن استخدام نصف درجة)، وملاحظة قصيرة مشجعة للطالب توضح ما أحسن فيه وما ينقصه.
اكتب الرد بهذه الصيغة فقط وبدون أي شيء آخر:
الدرجة: <رقم>
الملاحظة: <جملة أو جملتان>`;
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** قراءة رد الذكاء الاصطناعي على طلب التصحيح */
export function parseGradingReply(text: string, max: number): { marks?: number; feedback?: string } {
  const s = text.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/٫/g, '.').replace(/\*\*/g, '');
  const m = s.match(/(?:الدرجة|الدرجه|score|grade)\s*[:：]\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const f = s.match(/(?:الملاحظة|الملاحظه|ملاحظة|feedback|comment)\s*[:：]\s*([\s\S]+)/i);
  let marks = m ? Number(m[1].replace(',', '.')) : undefined;
  if (marks !== undefined) marks = Math.max(0, Math.min(max, Math.round(marks * 2) / 2));
  return { marks, feedback: f ? f[1].trim().split(/\n\s*\n/)[0].trim().slice(0, 1000) : undefined };
}

/**
 * طلب ترتيب نص ملف أسئلة (ورقة امتحان بأي تنسيق) بالصيغة التي يقرؤها محلل الاستيراد.
 * علامات الصور «[[IMG:n]]» تبقى في مكانها حتى تُلحق الصور بأسئلتها.
 */
export function structurePrompt(fileText: string): string {
  return `حوّل نص ورقة الامتحان التالية إلى أسئلة بالصيغة المطلوبة حرفياً، دون أن تغيّر صياغة أي سؤال أو تضيف أسئلة من عندك، وبدون أي مقدمة أو خاتمة أو تنسيق Markdown.

القواعد:
- احذف ترويسة الورقة (اسم المدرسة والطالب والصف والزمن) وجدول الدرجات والتوقيعات.
- اكتب عنوان كل قسم في سطر مستقل كما هو (مثل: السؤال الأول: اختر الإجابة الصحيحة).
- رقّم الأسئلة داخل كل قسم: 1. 2. 3.
- اختيار من متعدد: الخيارات في أسطر تبدأ بـ أ) ب) ج) د)، وضع * بعد الخيار الصحيح إن كان واضحاً.
- صح أو خطأ: اكتب العبارة ثم ( ) في آخرها، وإن عرفت الإجابة أضف سطر «الإجابة: صح» أو «الإجابة: خطأ».
- أكمل الفراغ: ضع ........ مكان الفراغ، وإن عرفت الإجابة أضف سطر «الإجابة: الكلمة».
- التوصيل: عنوان القسم يبدأ بكلمة «صل»، ثم كل زوج في سطر: 1. العنصر أ) ما يقابله
- القطعة أو المسألة التي تتبعها أسئلة: اكتب نصها كاملاً في سطر بعد عنوان القسم، ثم أسئلتها بالحروف: (أ) … (ب) …
- المقالي: السؤال فقط، والدرجة إن وُجدت بين قوسين في آخره مثل (2 درجة).
- أبقِ أي علامة مثل [[IMG:3]] كما هي في نفس موضعها بجانب سؤالها أو خيارها.

نص الورقة:
"""
${fileText.slice(0, 30000)}
"""`;
}
