-- =====================================================================
-- منصة إتقان: 032 — إدارة العام الدراسي
--  - ترحيل السنة: نقل طلاب كل فصل إلى فصل السنة التالية دفعة واحدة (أو تخريجهم: بلا فصل)،
--    مع خيارات: أرشفة الاختبارات المنشورة، وبدء سجل حضور جديد، ومسح سجل السلوك.
--    النتائج والمشاركات تبقى كما هي (تظهر في التحليلات مع الاختبارات المؤرشفة).
--  - سجل بالترحيلات السابقة (itqan.year_archive).
--  - مساحة قاعدة البيانات وحجم كل جدول (للمدير) لمتابعة حد الخطة المجانية.
--
-- يتطلب 003 و022 و024 و029 و031 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists itqan.year_archive (
  id        bigserial primary key,
  label     text not null default '',
  done_at   timestamptz not null default now(),
  done_by   text,
  done_by_name text not null default '',
  summary   jsonb not null default '{}'::jsonb
);
alter table itqan.year_archive enable row level security;
revoke all on itqan.year_archive from public, anon, authenticated;

-- p = {label, map: {"<من فصل>": "<إلى فصل>" | "" (تخرّج)}, archive_quizzes, clear_attendance, clear_behavior}
create or replace function public.itqan_year_rollover(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_map jsonb := coalesce(p -> 'map', '{}'::jsonb);
  v_bad text; v_moved int := 0; v_grad int := 0; v_quizzes int := 0; v_att int := 0; v_beh int := 0;
  v_summary jsonb; v_name text;
begin
  if not itqan.is_admin() then raise exception 'forbidden'; end if;
  if jsonb_typeof(v_map) <> 'object' then raise exception 'bad_map'; end if;
  -- كل وجهة يجب أن تكون فصلاً موجوداً (أو فارغة = تخرّج)
  select x.value into v_bad from jsonb_each_text(v_map) x
   where x.value <> '' and not exists (select 1 from public.classes c where c.id = x.value) limit 1;
  if v_bad is not null then raise exception 'unknown_class: %', v_bad; end if;

  select count(*) filter (where nullif(v_map ->> u.class_id, '') is null) into v_grad
    from public.users u where u.role::text = 'student' and v_map ? u.class_id;
  -- تحديث واحد يقرأ القيم القديمة، فيصح نقل الثالث→الرابع والرابع→الخامس معاً
  update public.users u set class_id = nullif(v_map ->> u.class_id, ''), updated_at = now()
   where u.role::text = 'student' and v_map ? u.class_id
     and u.class_id is distinct from nullif(v_map ->> u.class_id, '');
  get diagnostics v_moved = row_count;

  update public.classes c set student_count = (select count(*) from public.users u where u.role::text = 'student' and u.class_id = c.id)
   where c.id is not null; -- Supabase يمنع UPDATE/DELETE بلا شرط

  if coalesce((p ->> 'archive_quizzes')::boolean, false) then
    update public.quizzes set status = 'archived', updated_at = now()
     where status = 'published' and coalesce(is_deleted, false) = false;
    get diagnostics v_quizzes = row_count;
  end if;

  if coalesce((p ->> 'clear_attendance')::boolean, false) then
    delete from public.attendance_records where true;
    get diagnostics v_att = row_count;
    delete from public.attendance_roster where true;
    delete from itqan.attendance_unmatched where true;
    delete from itqan.attendance_alerts where true;
    update itqan.attendance_config set start_date = null, seen_sheets = '{}'::jsonb, last_digest_week = null, updated_at = now() where id = 1;
  end if;

  if coalesce((p ->> 'clear_behavior')::boolean, false) then
    delete from public.behavior_records where true;
    get diagnostics v_beh = row_count;
  end if;

  v_summary := jsonb_build_object('moved', v_moved - v_grad, 'graduated', v_grad, 'archived_quizzes', v_quizzes,
                                  'attendance_deleted', v_att, 'behavior_deleted', v_beh, 'map', v_map);
  select name into v_name from public.users where id::text = itqan.uid();
  insert into itqan.year_archive (label, done_by, done_by_name, summary)
  values (coalesce(p ->> 'label', ''), itqan.uid(), coalesce(v_name, ''), v_summary);
  return v_summary;
end $$;

create or replace function public.itqan_year_history()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when itqan.is_admin() then coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'done_at', done_at, 'done_by_name', done_by_name, 'summary', summary) order by done_at desc)
      from itqan.year_archive), '[]'::jsonb) end;
$$;

-- مساحة قاعدة البيانات (الخطة المجانية في Supabase: 500 ميجابايت)
create or replace function public.itqan_db_usage()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_tables jsonb := '[]'::jsonb; r record; v_rows bigint;
begin
  if not itqan.is_admin() then return null; end if;
  -- أكبر 15 جدولاً مع العدد الفعلي للصفوف (الإحصاءات التقديرية قد تكون صفراً قبل ANALYZE)
  for r in select c.relname::text as name, n.nspname::text as schema, pg_catalog.pg_total_relation_size(c.oid) as bytes
             from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where c.relkind = 'r' and n.nspname in ('public', 'itqan')
            order by pg_catalog.pg_total_relation_size(c.oid) desc limit 15 loop
    execute format('select count(*) from %I.%I', r.schema, r.name) into v_rows;
    v_tables := v_tables || jsonb_build_object('name', r.name, 'schema', r.schema, 'bytes', r.bytes, 'rows', v_rows);
  end loop;
  return jsonb_build_object('db_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()), 'tables', v_tables);
end $$;

revoke all on function public.itqan_year_rollover(jsonb), public.itqan_year_history(), public.itqan_db_usage() from public;
grant execute on function public.itqan_year_rollover(jsonb), public.itqan_year_history(), public.itqan_db_usage() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 032: إدارة العام الدراسي' as result;
