-- =====================================================================
-- منصة إتقان: 023 — استعادة المواد المحذوفة التي ما زالت مستخدمة
--  إن حُذفت مادة من «المواد والشعب» تبقى الاختبارات وبنك الأسئلة والمعلمون مرتبطين بمعرّفها،
--  فتختفي المادة من المنصة. هذا الملف يعيد إنشاء كل مادة مفقودة ما زال لها ارتباط،
--  بنفس معرّفها حتى ترجع كل الاختبارات والأسئلة والإسنادات كما كانت.
--  الاسم: معروف لبعض المواد، وإلا «مادة مستعادة» ويغيّره المدير من «المواد والشعب».
--
-- آمن لإعادة التشغيل: لا يغيّر أي مادة موجودة.
-- =====================================================================

with refs as (
  select subject_id::text id from public.quizzes where coalesce(subject_id::text, '') <> ''
  union select subject_id::text from public.question_bank where coalesce(subject_id::text, '') <> ''
  union select jsonb_array_elements_text(case when jsonb_typeof(assigned_subject_ids) = 'array' then assigned_subject_ids else '[]'::jsonb end) from public.users
  union select specialty_id::text from public.users where coalesce(specialty_id::text, '') <> ''
), missing as (
  select r.id from refs r where not exists (select 1 from public.subjects s where s.id::text = r.id)
)
insert into public.subjects (id, name, code, color, description, icon)
select m.id,
       case m.id when 'subj-1790785709984' then 'الرياضيات' when 'SUBJ-984' then 'الرياضيات'
                 when 'subj-1790785731650' then 'اللغة العربية' when 'SUBJ-930' then 'اللغة العربية'
                 else 'مادة مستعادة' end,
       m.id, '#2a78d6', 'استُعيدت تلقائياً لأن اختبارات أو معلمين ما زالوا مرتبطين بها', 'BookOpen'
from missing m
on conflict (id) do nothing;

select '✓ تم تحديث 023: المواد المستعادة = ' || count(*) as result
from public.subjects where description = 'استُعيدت تلقائياً لأن اختبارات أو معلمين ما زالوا مرتبطين بها';
