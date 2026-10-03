import React from 'react';
import { ArrowRight, ShieldCheck, FileText } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { navigateTo } from '../../utils/router';

type Doc = 'privacy' | 'terms';

const UPDATED = 'أكتوبر 2026';
const SUPPORT_WHATSAPP = '+966543119854';

interface Section { title: string; body: React.ReactNode }

const Para: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[15.5px] leading-[1.95] text-slate-700 dark:text-slate-300">{children}</p>
);
const List: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="list-disc pr-5 space-y-1.5 text-[15.5px] leading-[1.9] text-slate-700 dark:text-slate-300 marker:text-indigo-600">
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ul>
);

function privacySections(school: string): Section[] {
  return [
    { title: 'من نحن', body: <Para>«منصة إتقان» منصة اختبارات إلكترونية تستخدمها {school} لتدريب الطلاب وتقييمهم ومتابعة نتائجهم. المدرسة هي المسؤولة عن البيانات التي تُدخلها، ومزوّد المنصة يعالجها نيابةً عنها ولغرض تشغيل الخدمة فقط، وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية.</Para> },
    { title: 'البيانات التي نجمعها', body: <List items={[
      'بيانات الحساب: الاسم، ورقم الهوية أو الرقم الأكاديمي، والدور (طالب، معلم، مشرف، ولي أمر، مدير)، والنوع، والفرع، والشعبة.',
      'لأولياء الأمور: ربط الحساب بحسابات الأبناء.',
      'بيانات الاختبارات: الإجابات، والدرجات، ووقت البدء والتسليم، والنقاط والأوسمة.',
      'صورة شخصية اختيارية يرفعها المستخدم بنفسه.',
      'سجل نشاط إداري (مثل نشر اختبار أو تعديل مستخدم) لأغراض المتابعة.',
    ]} /> },
    { title: 'ما لا نجمعه', body: <List items={[
      'لا نطلب البريد الإلكتروني ولا رقم الجوال ولا الموقع الجغرافي.',
      'لا نستخدم إعلانات ولا أدوات تتبّع تجارية، ولا نبيع البيانات أو نشاركها لأغراض تسويقية.',
      'كلمات المرور لا تُحفظ كنص، بل مشفّرة بطريقة لا يمكن استرجاعها.',
    ]} /> },
    { title: 'لماذا نستخدم البيانات', body: <List items={[
      'تشغيل الاختبارات وتصحيحها وعرض النتائج.',
      'تمكين المعلمين والإدارة من متابعة مستوى الطلاب، وتمكين ولي الأمر من متابعة أبنائه.',
      'إرسال إشعارات داخل المنصة (اختبار جديد، تذكير، نتيجة).',
      'حماية الحسابات ومنع إساءة الاستخدام.',
    ]} /> },
    { title: 'من يرى بياناتك', body: <List items={[
      'الطالب: بياناته ونتائجه فقط.',
      'ولي الأمر: بيانات أبنائه المرتبطين بحسابه فقط.',
      'المعلم والمشرف: طلاب فرعهم وفق الصلاحيات التي تمنحها الإدارة.',
      'مدير النظام في المدرسة: كل بيانات المدرسة.',
      'هذه القيود مطبّقة على الخادم نفسه وليس على الواجهة فقط.',
    ]} /> },
    { title: 'أين تُحفظ البيانات', body: <Para>تُحفظ البيانات لدى مزوّدي خدمات سحابية عالميين (قاعدة البيانات لدى Supabase، والموقع لدى Vercel)، وقد تكون خوادمهم خارج المملكة. الاتصال مشفّر بالكامل (HTTPS)، وقاعدة بيانات كل مدرسة منفصلة عن غيرها. تُحفظ على جهازك أيضاً نسخة مؤقتة من بياناتك لتسريع المنصة، وتُمسح عند تسجيل الخروج أو مسح بيانات المتصفح.</Para> },
    { title: 'مدة الاحتفاظ', body: <Para>تُحفظ البيانات طوال فترة استخدام المدرسة للمنصة. عند حذف المدرسة لحساب أو نتيجة تُحذف من قاعدة البيانات، وقد تبقى في النسخ الاحتياطية مدة محدودة ثم تُحذف تلقائياً. عند انتهاء التعاقد تُسلَّم بيانات المدرسة لها أو تُحذف بطلبها.</Para> },
    { title: 'حقوقك', body: <Para>لك الحق في معرفة بياناتك والاطلاع عليها، وطلب تصحيحها أو حذفها، والاعتراض على معالجتها. توجّه بطلبك إلى إدارة المدرسة، فهي التي تملك صلاحية تعديل الحسابات والنتائج.</Para> },
    { title: 'أمن البيانات', body: <List items={[
      'تشفير كلمات المرور، وقفل مؤقت للحساب بعد محاولات دخول خاطئة متكررة.',
      'جلسات دخول بمدة محدودة.',
      'قواعد حماية على كل جدول في قاعدة البيانات، واختبارات آلية تتحقق منها.',
      'نسخ احتياطي دوري.',
    ]} /> },
    { title: 'التواصل', body: <Para>لأي استفسار عن الخصوصية تواصل مع إدارة المدرسة، أو مع الدعم الفني للمنصة عبر واتساب: <a className="text-indigo-700 dark:text-indigo-400 font-semibold" dir="ltr" href={`https://wa.me/${SUPPORT_WHATSAPP.replace('+', '')}`} target="_blank" rel="noopener noreferrer">{SUPPORT_WHATSAPP}</a></Para> },
  ];
}

function termsSections(school: string): Section[] {
  return [
    { title: 'قبول الشروط', body: <Para>باستخدامك «منصة إتقان» في {school} فإنك توافق على هذه الشروط وعلى سياسة الخصوصية. إن كان المستخدم قاصراً فإن ولي أمره والمدرسة مسؤولان عن توجيهه للاستخدام السليم.</Para> },
    { title: 'الحسابات', body: <List items={[
      'تُنشئ إدارة المدرسة الحسابات، ولا يوجد تسجيل ذاتي.',
      'أنت مسؤول عن سرية كلمة مرورك، ويجب تغيير كلمة المرور الأولى عند أول دخول.',
      'لا يجوز مشاركة الحساب أو استخدام حساب شخص آخر.',
    ]} /> },
    { title: 'النزاهة الأكاديمية', body: <List items={[
      'يؤدي الطالب الاختبار بنفسه ودون مساعدة غير مسموح بها.',
      'المؤقت يعمل على الخادم ولا يتوقف بالخروج من الصفحة، ويُسلَّم الاختبار تلقائياً عند انتهاء الوقت.',
      'محاولات التحايل على المنصة أو الوصول لبيانات الآخرين مخالفة تُبلَّغ بها المدرسة.',
    ]} /> },
    { title: 'الاستخدام المقبول', body: <List items={[
      'تُستخدم المنصة لأغراض تعليمية فقط.',
      'يُمنع رفع محتوى مسيء أو مخالف للأنظمة أو منتهك لحقوق الغير في الأسئلة أو الصور أو البانرات.',
      'يُمنع محاولة اختراق المنصة أو تعطيلها أو إرسال طلبات آلية مكثفة.',
    ]} /> },
    { title: 'المحتوى والملكية', body: <Para>الأسئلة والاختبارات التي يضيفها المعلمون ملك للمدرسة. أما المنصة نفسها (التصميم والبرمجة والشعار) فملك لمطوّرها، ولا يجوز نسخها أو إعادة بيعها دون إذن.</Para> },
    { title: 'توفر الخدمة', body: <Para>نسعى لأن تعمل المنصة باستمرار، لكن قد تتوقف أحياناً للصيانة أو لأسباب خارجة عن الإرادة (مثل انقطاع مزوّدي الخدمة السحابية). في هذه الحالات يمكن للمعلم إعادة فتح الاختبار أو منح إعادة محاولة.</Para> },
    { title: 'حدود المسؤولية', body: <Para>النتائج في المنصة أداة تدريب ومتابعة، وتبقى الدرجات الرسمية من مسؤولية المدرسة. لا يتحمل مزوّد المنصة مسؤولية قرارات تُتخذ بناءً على محتوى أدخله المستخدمون.</Para> },
    { title: 'التعديلات', body: <Para>قد تُحدَّث هذه الشروط، ويُعرض تاريخ آخر تحديث أعلى الصفحة. استمرار الاستخدام بعد التحديث يعني الموافقة عليه.</Para> },
  ];
}

/** سياسة الخصوصية وشروط الاستخدام: متاحة قبل تسجيل الدخول وبعده */
export const LegalPage: React.FC<{ doc: Doc }> = ({ doc }) => {
  const { settings, currentUser } = useApp();
  const school = settings?.school_name?.trim() || 'المدرسة';
  const isPrivacy = doc === 'privacy';
  const sections = isPrivacy ? privacySections(school) : termsSections(school);
  const Icon = isPrivacy ? ShieldCheck : FileText;
  const other = isPrivacy ? { path: '/terms', label: 'شروط الاستخدام' } : { path: '/privacy', label: 'سياسة الخصوصية' };

  return (
    <div className="max-w-3xl mx-auto py-8 sm:py-10 px-4 sm:px-6" dir="rtl">
      <a href="/" onClick={(e) => { e.preventDefault(); navigateTo('/'); }}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 dark:text-indigo-400 hover:underline mb-6">
        <ArrowRight className="w-4 h-4" />{currentUser ? 'العودة للرئيسية' : 'العودة لتسجيل الدخول'}
      </a>
      <header className="flex items-start gap-4 mb-8">
        <span className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0"><Icon className="w-6 h-6" /></span>
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900 dark:text-white leading-tight">{isPrivacy ? 'سياسة الخصوصية' : 'شروط الاستخدام'}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">آخر تحديث: {UPDATED}</p>
        </div>
      </header>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-8">
        {sections.map((s, i) => (
          <section key={s.title} className="space-y-2.5">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{i + 1}. {s.title}</h2>
            {s.body}
          </section>
        ))}
      </div>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
        اقرأ أيضاً: <a href={other.path} onClick={(e) => { e.preventDefault(); navigateTo(other.path); }} className="text-indigo-700 dark:text-indigo-400 font-semibold hover:underline">{other.label}</a>
      </p>
    </div>
  );
};
