-- =====================================================================
-- منصة إتقان: 062 — قسم نافس
--  - nafes_skills: مهارات/مجالات نافس لكل مادة وصف (قائمة افتراضية قابلة للتعديل).
--  - nafes_students: طلاب نافس في كل مادة، ومستواهم عند البداية وهدفهم.
--  - nafes_measures: قياسات الطالب (يدوية أو من اختبار تجريبي) بالدرجة ودرجات المهارات.
--  - quizzes.nafes = { subject, grade }: الاختبار تجريبي بنمط نافس (ناتج تعلم كل سؤال = مهارة نافس).
--  - question_bank.track = 'nafes': بنك أسئلة نافس منفصل عن بنك المدرسة.
--  - القراءة والكتابة للطاقم (المدير والمشرف والمعلم)، والمادة: math | science | reading، والصف: 3 | 6 | 9.
--
-- يتطلب 015 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.nafes_skills (
  id          text primary key default ('nsk-' || encode(extensions.gen_random_bytes(5), 'hex')),
  subject     text not null check (subject in ('math', 'science', 'reading')),
  grade       text not null check (grade in ('3', '6', '9')),
  domain      text not null default '' check (char_length(domain) <= 80),
  name        text not null check (char_length(trim(name)) between 1 and 160),
  sort        integer not null default 0,
  created_by  text,
  created_at  timestamptz not null default now()
);
create unique index if not exists nafes_skills_uq on public.nafes_skills (subject, grade, lower(trim(name)));

create table if not exists public.nafes_students (
  id            text primary key default ('nst-' || encode(extensions.gen_random_bytes(6), 'hex')),
  student_id    text not null references public.users(id) on delete cascade,
  subject       text not null check (subject in ('math', 'science', 'reading')),
  grade         text not null check (grade in ('3', '6', '9')),
  baseline      numeric check (baseline is null or (baseline >= 0 and baseline <= 100)),
  target        numeric not null default 85 check (target >= 0 and target <= 100),
  teacher_id    text,
  note          text not null default '' check (char_length(note) <= 500),
  created_at    timestamptz not null default now()
);
create unique index if not exists nafes_students_uq on public.nafes_students (student_id, subject);

create table if not exists public.nafes_measures (
  id           text primary key default ('nms-' || encode(extensions.gen_random_bytes(6), 'hex')),
  student_id   text not null references public.users(id) on delete cascade,
  subject      text not null check (subject in ('math', 'science', 'reading')),
  measured_on  date not null default current_date,
  score        numeric not null check (score >= 0 and score <= 100),
  -- درجات المهارات: { "<معرّف المهارة>": نسبة 0..100 }
  skills       jsonb not null default '{}'::jsonb,
  title        text not null default '' check (char_length(title) <= 120),
  note         text not null default '' check (char_length(note) <= 500),
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists nafes_measures_student on public.nafes_measures (student_id, subject, measured_on);

alter table public.quizzes add column if not exists nafes jsonb;
alter table public.question_bank add column if not exists track text not null default '';

-- الصلاحيات: الطاقم فقط
do $$
declare t text;
begin
  foreach t in array array['nafes_skills', 'nafes_students', 'nafes_measures'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format('create policy %I on public.%I for all to anon, authenticated using ((select itqan.is_staff())) with check ((select itqan.is_staff()))', t || '_staff', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- المهارات الافتراضية (مجالات نافس الرئيسية لكل مادة وصف)
insert into public.nafes_skills (subject, grade, domain, name, sort)
select v.subject, g.grade, v.domain, v.name, v.sort
from (values
  ('math', 'الأعداد والعمليات', 'الأعداد والعمليات عليها', 1),
  ('math', 'الجبر', 'الجبر والأنماط والعلاقات', 2),
  ('math', 'الهندسة والقياس', 'الهندسة والقياس', 3),
  ('math', 'البيانات والإحصاء', 'تمثيل البيانات والإحصاء والاحتمالات', 4),
  ('math', 'حل المسائل', 'حل المشكلات الرياضية والتفكير', 5),
  ('science', 'علوم الحياة', 'علوم الحياة', 1),
  ('science', 'العلوم الفيزيائية', 'العلوم الفيزيائية والكيميائية', 2),
  ('science', 'علوم الأرض والفضاء', 'علوم الأرض والفضاء', 3),
  ('science', 'الاستقصاء العلمي', 'مهارات الاستقصاء العلمي', 4),
  ('reading', 'الفهم القرائي', 'الفهم الحرفي (المباشر)', 1),
  ('reading', 'الفهم القرائي', 'الفهم الاستنتاجي', 2),
  ('reading', 'الفهم القرائي', 'الفهم النقدي', 3),
  ('reading', 'الفهم القرائي', 'الفهم التذوقي', 4),
  ('reading', 'المعجم', 'الرصيد المعجمي والمفردات', 5),
  ('reading', 'الظواهر اللغوية', 'الظواهر اللغوية والأسلوبية', 6)
) as v(subject, domain, name, sort)
cross join (values ('3'), ('6'), ('9')) as g(grade)
on conflict do nothing;

notify pgrst, 'reload schema';

select '✓ تم تحديث 062: قسم نافس' as result;
