-- =====================================================================
-- منصة إتقان: 067 — استيراد زيارات منصة مزن (بملف)
--  - المنسق التقني يحفظ ردود مزن (GetVisits وتفاصيل الزيارة) كملفات JSON ويرفعها هنا.
--  - لا يُخزَّن ولا يُرسَل أي توكن لمزن؛ الاستيراد عبر رفع ملف فقط (المدير أو من لديه الزيارات الصفية).
--  - مفتاح الزيارة رقمها في مزن، فإعادة الرفع تُحدِّث ولا تُكرِّر.
--
-- يتطلب 003 و034 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.mozn_visits (
  id               bigint primary key,
  visit_date       date,
  type_name        text not null default '',
  title            text not null default '',
  teacher_name     text not null default '',
  visitor_name     text not null default '',
  school_name      text not null default '',
  course_name      text not null default '',
  grade_name       text not null default '',
  section_name     text not null default '',
  period           text not null default '',
  students_count   int,
  mark             numeric,
  effect           numeric,
  total_score      numeric,
  grade_label      text not null default '',
  notes            text not null default '',
  recommendations  text not null default '',
  -- عنصر القائمة دائماً، والتفاصيل (الطلاب والبنود) عند رفعها
  data             jsonb not null default '{}'::jsonb,
  detail           jsonb,
  synced_at        timestamptz not null default now()
);
create index if not exists mozn_visits_date_idx on public.mozn_visits (visit_date desc);
create index if not exists mozn_visits_teacher_idx on public.mozn_visits (teacher_name);

alter table public.mozn_visits enable row level security;
revoke all on public.mozn_visits from public, anon, authenticated;
grant select, delete on public.mozn_visits to anon, authenticated;
drop policy if exists mv_select on public.mozn_visits;
create policy mv_select on public.mozn_visits for select to anon, authenticated
  using (itqan.is_admin() or itqan.can_visit());
drop policy if exists mv_delete on public.mozn_visits;
create policy mv_delete on public.mozn_visits for delete to anon, authenticated using (itqan.is_admin());

-- استيراد صفوف محضّرة في المتصفح من ملفات مزن المرفوعة
create or replace function public.itqan_mozn_import(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; n int := 0;
begin
  if not (itqan.is_admin() or itqan.can_visit()) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'bad_payload'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(r ->> 'id', '') !~ '^\d{1,15}$' then continue; end if;
    if octet_length(r::text) > 400000 then continue; end if;
    insert into public.mozn_visits as m (id, visit_date, type_name, title, teacher_name, visitor_name, school_name, course_name,
                                     grade_name, section_name, period, students_count, mark, effect, total_score, grade_label,
                                     notes, recommendations, data, detail, synced_at)
    values ((r ->> 'id')::bigint,
            case when coalesce(r ->> 'visit_date', '') ~ '^\d{4}-\d{2}-\d{2}' then left(r ->> 'visit_date', 10)::date end,
            left(coalesce(r ->> 'type_name', ''), 160), left(coalesce(r ->> 'title', ''), 400),
            left(coalesce(r ->> 'teacher_name', ''), 200), left(coalesce(r ->> 'visitor_name', ''), 200),
            left(coalesce(r ->> 'school_name', ''), 200), left(coalesce(r ->> 'course_name', ''), 200),
            left(coalesce(r ->> 'grade_name', ''), 120), left(coalesce(r ->> 'section_name', ''), 60), left(coalesce(r ->> 'period', ''), 40),
            case when coalesce(r ->> 'students_count', '') ~ '^\d+$' then (r ->> 'students_count')::int end,
            case when coalesce(r ->> 'mark', '') ~ '^-?\d+(\.\d+)?$' then (r ->> 'mark')::numeric end,
            case when coalesce(r ->> 'effect', '') ~ '^-?\d+(\.\d+)?$' then (r ->> 'effect')::numeric end,
            case when coalesce(r ->> 'total_score', '') ~ '^-?\d+(\.\d+)?$' then (r ->> 'total_score')::numeric end,
            left(coalesce(r ->> 'grade_label', ''), 60), left(coalesce(r ->> 'notes', ''), 8000), left(coalesce(r ->> 'recommendations', ''), 8000),
            coalesce(case when jsonb_typeof(r -> 'data') = 'object' then r -> 'data' end, '{}'::jsonb),
            case when jsonb_typeof(r -> 'detail') = 'object' then r -> 'detail' end, now())
    on conflict (id) do update set
      visit_date = coalesce(excluded.visit_date, m.visit_date), type_name = excluded.type_name, title = excluded.title,
      teacher_name = excluded.teacher_name, visitor_name = excluded.visitor_name, school_name = excluded.school_name,
      course_name = excluded.course_name, grade_name = excluded.grade_name, section_name = excluded.section_name, period = excluded.period,
      students_count = excluded.students_count, mark = excluded.mark, effect = excluded.effect, total_score = excluded.total_score,
      grade_label = excluded.grade_label, notes = excluded.notes, recommendations = excluded.recommendations, data = excluded.data,
      detail = coalesce(excluded.detail, m.detail), synced_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('rows', n);
end $$;

revoke all on function public.itqan_mozn_import(jsonb) from public;
grant execute on function public.itqan_mozn_import(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 067: استيراد زيارات مزن' as result;
