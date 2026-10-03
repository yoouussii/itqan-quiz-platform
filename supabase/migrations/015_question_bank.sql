-- =====================================================================
-- منصة إتقان: 015 — بنك الأسئلة
--  - أسئلة محفوظة حسب المادة والوحدة والصعوبة، يُبنى منها اختبار جديد بضغطة.
--  - يراها الطاقم فقط (المعلم والمشرف والمدير)، والطلاب لا يصلون إليها أبداً (فيها الإجابات).
--  - السؤال «مشترك» يراه كل الطاقم، أو «خاص» يراه صاحبه والمدير فقط.
--  - يضيف المعلم والمدير، ويعدّل أو يحذف صاحب السؤال أو المدير.
--
-- يتطلب 003 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.question_bank (
  id          text primary key,
  subject_id  text,
  -- الوحدة أو الدرس (نص حر)
  unit        text not null default '',
  difficulty  text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  -- ناتج التعلم أو المهارة (يُستخدم لاحقاً في تحليل نواتج التعلم)
  outcome     text not null default '',
  type        text not null default 'mcq',
  marks       numeric not null default 1,
  -- السؤال كاملاً بنفس شكل أسئلة الاختبار (النص، الاختيارات، الإجابة، الشرح، الأسئلة الفرعية)
  question    jsonb not null,
  -- نص السؤال بلا تنسيق للبحث
  search_text text not null default '',
  shared      boolean not null default true,
  created_by  text not null,
  used_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists question_bank_subject_idx on public.question_bank (subject_id, unit);
create index if not exists question_bank_owner_idx on public.question_bank (created_by);

alter table public.question_bank enable row level security;

drop policy if exists question_bank_select on public.question_bank;
create policy question_bank_select on public.question_bank for select to anon, authenticated
  using ((select itqan.is_staff()) and (shared or created_by = (select itqan.uid()) or (select itqan.is_admin())));

drop policy if exists question_bank_insert on public.question_bank;
create policy question_bank_insert on public.question_bank for insert to anon, authenticated
  with check (created_by = (select itqan.uid()) and (select itqan.my_role()) in ('admin', 'teacher'));

drop policy if exists question_bank_update on public.question_bank;
create policy question_bank_update on public.question_bank for update to anon, authenticated
  using (created_by = (select itqan.uid()) or (select itqan.is_admin()))
  with check (created_by = (select itqan.uid()) or (select itqan.is_admin()));

drop policy if exists question_bank_delete on public.question_bank;
create policy question_bank_delete on public.question_bank for delete to anon, authenticated
  using (created_by = (select itqan.uid()) or (select itqan.is_admin()));

-- عدّاد الاستخدام: أي معلم يستخدم سؤالاً مشتركاً يزيد عدّاده (دون صلاحية تعديل السؤال نفسه)
create or replace function public.itqan_bank_used(p_ids text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(itqan.is_staff(), false) then return; end if;
  update public.question_bank set used_count = used_count + 1
  where id = any(p_ids[1:200]) and (shared or created_by = itqan.uid() or itqan.is_admin());
end $$;

revoke execute on function public.itqan_bank_used(text[]) from public;
grant execute on function public.itqan_bank_used(text[]) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 015: بنك الأسئلة' as result;
