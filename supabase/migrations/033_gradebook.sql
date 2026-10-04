-- =====================================================================
-- منصة إتقان: 033 — كشف الدرجات
--  - وزن كل اختبار في الكشف (gradebook_weights): الافتراضي 1، و0 = لا يُحتسب.
--  - أعمدة يدوية لكل فصل ومادة (مشاركة، واجبات، مهام أدائية…) بدرجة عظمى ووزن (gradebook_columns)،
--    ودرجات الطلاب فيها (gradebook_marks).
--  - القراءة للطاقم (مدير/معلم/مشرف). الكتابة: المدير، أو صاحب الاختبار/العمود.
--
-- يتطلب 003 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create or replace function itqan.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(itqan.my_role() in ('admin', 'teacher', 'supervisor'), false);
$$;

create table if not exists public.gradebook_weights (
  quiz_id    text primary key,
  weight     numeric(6, 2) not null default 1 check (weight >= 0 and weight <= 100),
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.gradebook_columns (
  id         text primary key default ('gc-' || encode(extensions.gen_random_bytes(6), 'hex')),
  class_id   text not null,
  subject_id text not null,
  title      text not null check (length(title) between 1 and 80),
  max_score  numeric(6, 2) not null default 10 check (max_score > 0 and max_score <= 1000),
  weight     numeric(6, 2) not null default 1 check (weight >= 0 and weight <= 100),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists gradebook_columns_cs_idx on public.gradebook_columns (class_id, subject_id);

create table if not exists public.gradebook_marks (
  column_id  text not null references public.gradebook_columns (id) on delete cascade,
  student_id text not null,
  score      numeric(6, 2) not null check (score >= 0),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (column_id, student_id)
);

alter table public.gradebook_weights enable row level security;
alter table public.gradebook_columns enable row level security;
alter table public.gradebook_marks enable row level security;
revoke all on public.gradebook_weights, public.gradebook_columns, public.gradebook_marks from public, anon, authenticated;
grant select, insert, update, delete on public.gradebook_weights, public.gradebook_columns, public.gradebook_marks to anon, authenticated;

-- صاحب الاختبار
create or replace function itqan.owns_quiz(p_quiz text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.quizzes q where q.id = p_quiz
                  and (q.teacher_id = itqan.uid() or q.created_by = itqan.uid()));
$$;
-- صاحب العمود اليدوي
create or replace function itqan.owns_gb_column(p_col text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gradebook_columns c where c.id = p_col and c.created_by = itqan.uid());
$$;

drop policy if exists gbw_select on public.gradebook_weights;
create policy gbw_select on public.gradebook_weights for select to anon, authenticated using (itqan.is_staff());
drop policy if exists gbw_write on public.gradebook_weights;
create policy gbw_write on public.gradebook_weights for all to anon, authenticated
  using (itqan.is_admin() or itqan.owns_quiz(quiz_id))
  with check ((itqan.is_admin() or itqan.owns_quiz(quiz_id)) and updated_by = itqan.uid());

drop policy if exists gbc_select on public.gradebook_columns;
create policy gbc_select on public.gradebook_columns for select to anon, authenticated using (itqan.is_staff());
drop policy if exists gbc_insert on public.gradebook_columns;
create policy gbc_insert on public.gradebook_columns for insert to anon, authenticated
  with check (created_by = itqan.uid() and itqan.my_role() in ('admin', 'teacher'));
drop policy if exists gbc_update on public.gradebook_columns;
create policy gbc_update on public.gradebook_columns for update to anon, authenticated
  using (itqan.is_admin() or created_by = itqan.uid()) with check (itqan.is_admin() or created_by = itqan.uid());
drop policy if exists gbc_delete on public.gradebook_columns;
create policy gbc_delete on public.gradebook_columns for delete to anon, authenticated
  using (itqan.is_admin() or created_by = itqan.uid());

drop policy if exists gbm_select on public.gradebook_marks;
create policy gbm_select on public.gradebook_marks for select to anon, authenticated using (itqan.is_staff());
drop policy if exists gbm_write on public.gradebook_marks;
create policy gbm_write on public.gradebook_marks for all to anon, authenticated
  using (itqan.is_admin() or itqan.owns_gb_column(column_id))
  with check ((itqan.is_admin() or itqan.owns_gb_column(column_id)) and updated_by = itqan.uid());

grant execute on function itqan.is_staff(), itqan.owns_quiz(text), itqan.owns_gb_column(text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 033: كشف الدرجات' as result;
