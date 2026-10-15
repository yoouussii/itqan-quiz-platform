-- =====================================================================
-- منصة إتقان: 077 — بانر «لوحة الشرف» التلقائي
--  - نوع بانر جديد (honor): لا يحتاج صوراً ولا أسماء يدوية؛ تظهر فيه تلقائياً أسماء الطلاب
--    الذين حصلوا على «ممتاز» (النسبة التي يحددها المدير، افتراضياً 90%) في اختبار خلال آخر أيام محددة،
--    من جميع الفصول، تشجيعاً لهم ولزملائهم.
--  - الاسم الأول والأخير فقط + الفصل + الاختبار. أفضل نتيجة لكل طالب مرة واحدة.
--  - لا يُحسب «إعادة الاختبار»، ولا الطلاب في الفروع الأخرى (كل فرع يرى طلابه).
--  - الإعدادات في عمود config: {"min": 90, "days": 7, "limit": 30}
--
-- يتطلب 006 و009. آمن لإعادة التشغيل.
-- =====================================================================

alter table public.banners drop constraint if exists banners_kind_check;
alter table public.banners add constraint banners_kind_check check (kind in ('wide', 'gallery', 'honor'));
alter table public.banners add column if not exists config jsonb not null default '{}'::jsonb;

create index if not exists submissions_completed_at_idx on public.submissions (completed_at desc);

create or replace function public.itqan_honor_roll(p_min numeric default 90, p_days int default 7, p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_branch text := itqan.my_branch();
  v_min numeric := greatest(50, least(100, coalesce(p_min, 90)));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(90, coalesce(p_days, 7))));
  v_limit int := greatest(1, least(60, coalesce(p_limit, 30)));
begin
  if itqan.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', x.short_name, 'class', x.class_name, 'quiz', x.quiz_title,
                                        'pct', round(x.percentage), 'at', x.completed_at)
                     order by x.percentage desc, x.completed_at desc)
    from (
      select * from (
        select distinct on (s.student_id)
               s.student_id, s.percentage, s.completed_at, q.title quiz_title, c.name class_name,
               case when array_length(regexp_split_to_array(btrim(u.name), '\s+'), 1) > 1
                    then split_part(btrim(u.name), ' ', 1) || ' ' || (regexp_split_to_array(btrim(u.name), '\s+'))[array_length(regexp_split_to_array(btrim(u.name), '\s+'), 1)]
                    else btrim(u.name) end short_name
        from public.submissions s
        join public.users u on u.id::text = s.student_id::text and u.role::text = 'student'
        join public.quizzes q on q.id::text = s.quiz_id::text
        left join public.classes c on c.id::text = u.class_id::text
        where s.completed_at >= v_since
          and coalesce(s.status, 'completed') = 'completed'
          and not coalesce(s.is_retake, false)
          and coalesce(s.total_possible_score, 0) > 0
          and s.percentage >= v_min
          and coalesce(u.name, '') <> ''
          and (v_branch is null or itqan.user_branch(s.student_id::text) = v_branch)
        order by s.student_id, s.percentage desc, s.completed_at desc
      ) best
      order by best.percentage desc, best.completed_at desc
      limit v_limit
    ) x), '[]'::jsonb);
end $$;

revoke all on function public.itqan_honor_roll(numeric, int, int) from public;
grant execute on function public.itqan_honor_roll(numeric, int, int) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 077: بانر «لوحة الشرف» التلقائي' as result;
