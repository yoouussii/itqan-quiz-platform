-- =====================================================================
-- منصة إتقان: 079 — تحميل التسليمات «بالفرق» بدل تحميلها كاملة كل دقيقتين
--  - updated_at: يتحدّث تلقائياً مع كل إضافة أو تعديل (تصحيح، إعادة تصحيح، تعديل درجة).
--    الموقع يحفظ آخر وقت رآه، ثم يطلب ما تغيّر بعده فقط.
--  - deleted_submissions: سجل خفيف بمعرّفات التسليمات المحذوفة، ليعرف الموقع ما حُذف
--    دون إعادة تحميل كل شيء. يُنظَّف تلقائياً بعد 90 يوماً.
--  - فهارس على الطالب والاختبار ووقت التعديل لتسريع الاستعلامات.
--
-- يتطلب 003 و009. آمن لإعادة التشغيل. الموقع يعمل قبل تشغيله وبعده.
-- =====================================================================

alter table public.submissions add column if not exists updated_at timestamptz;
update public.submissions set updated_at = coalesce(completed_at, created_at, now()) where updated_at is null;
alter table public.submissions alter column updated_at set default now();
alter table public.submissions alter column updated_at set not null;

create index if not exists submissions_updated_at_idx on public.submissions (updated_at);
create index if not exists submissions_student_idx on public.submissions (student_id);
create index if not exists submissions_quiz_idx on public.submissions (quiz_id);

create or replace function itqan.touch_submission()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists itqan_submissions_touch on public.submissions;
create trigger itqan_submissions_touch before insert or update on public.submissions
  for each row execute function itqan.touch_submission();

-- سجل المحذوفات
create table if not exists itqan.deleted_submissions (
  id          text primary key,
  student_id  text,
  deleted_at  timestamptz not null default now()
);
create index if not exists deleted_submissions_at_idx on itqan.deleted_submissions (deleted_at);
alter table itqan.deleted_submissions enable row level security;
revoke all on itqan.deleted_submissions from public, anon, authenticated;

create or replace function itqan.log_submission_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into itqan.deleted_submissions (id, student_id, deleted_at)
  values (old.id::text, old.student_id::text, clock_timestamp())
  on conflict (id) do update set deleted_at = excluded.deleted_at;
  -- تنظيف خفيف لما مضى عليه أكثر من 90 يوماً
  if random() < 0.02 then
    delete from itqan.deleted_submissions where deleted_at < now() - interval '90 days';
  end if;
  return old;
end $$;

drop trigger if exists itqan_submissions_deleted on public.submissions;
create trigger itqan_submissions_deleted after delete on public.submissions
  for each row execute function itqan.log_submission_delete();

-- معرّفات ما حُذف بعد وقت معيّن (الموظف: الكل، الطالب: تسليماته، ولي الأمر: تسليمات أبنائه)
create or replace function public.itqan_deleted_submissions(p_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid text := itqan.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(d.id) from itqan.deleted_submissions d
    where d.deleted_at >= coalesce(p_since, now() - interval '90 days')
      and (coalesce(itqan.is_staff(), false) or d.student_id = v_uid or d.student_id = any (itqan.my_children()))
  ), '[]'::jsonb);
end $$;

revoke all on function public.itqan_deleted_submissions(timestamptz) from public;
grant execute on function public.itqan_deleted_submissions(timestamptz) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 079: تحميل التسليمات بالفرق' as result;
