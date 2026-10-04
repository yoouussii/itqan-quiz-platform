-- =====================================================================
-- منصة إتقان: 022 — الحضور (الغياب والتأخر والاستئذان)
--  - سجل لكل طالب ويوم ونوع (غياب / تأخر / استئذان).
--  - الاستيراد من «سجل الغياب» (Google Sheets أو ملف Excel): شيت لكل صف، لكل طالب 3 صفوف،
--    والأعمدة أسابيع (الأحد–الخميس). المنصة تحوّل «الأسبوع N، اليوم» إلى تاريخ من تاريخ بداية الفصل.
--  - مطابقة الأسماء على الخادم (توحيد الهمزات والتاء المربوطة والمسافات، ثم تطابق الكلمات)،
--    وما لم يتطابق يُحفظ ليربطه المسؤول بالطالب يدوياً مرة واحدة.
--  - الربط الحي: Apps Script في الشيت يرسل التحديثات برمز ربط سري (يُخزَّن مُجزّأً).
--  - الصلاحيات: can_view_attendance (عرض اللوحة) و can_manage_attendance (استيراد وتسجيل وإعداد).
--    الطالب يرى سجله، وولي الأمر يرى سجل أبنائه.
--
-- يتطلب 003 و009 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.attendance_records (
  id          bigserial primary key,
  student_id  text not null,
  day         date not null,
  kind        text not null check (kind in ('absent', 'late', 'excused')),
  -- sheet: من سجل الغياب (يُستبدل عند كل مزامنة) — manual: سُجّل من المنصة (لا تمسه المزامنة)
  source      text not null default 'manual' check (source in ('sheet', 'manual')),
  note        text not null default '',
  created_by  text,
  created_at  timestamptz not null default now(),
  unique (student_id, day, kind)
);
create index if not exists attendance_day_idx on public.attendance_records (day);
create index if not exists attendance_student_idx on public.attendance_records (student_id);

alter table public.attendance_records enable row level security;
revoke all on public.attendance_records from public, anon, authenticated;
grant select, insert, delete on public.attendance_records to anon, authenticated;
grant usage on sequence public.attendance_records_id_seq to anon, authenticated;

-- هل يرى المستخدم الحالي حضور هذا الطالب؟ (صاحب الصلاحية ضمن فرعه)
create or replace function itqan.attendance_in_scope(p_student text, p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select itqan.has_perm(p_perm)
     and (itqan.my_branch() is null or itqan.user_branch(p_student) is null or itqan.user_branch(p_student) = itqan.my_branch());
$$;

drop policy if exists attendance_select on public.attendance_records;
create policy attendance_select on public.attendance_records for select to anon, authenticated
  using (
    student_id = (select itqan.uid())
    or student_id = any(itqan.my_children())
    or itqan.attendance_in_scope(student_id, 'can_view_attendance')
    or itqan.attendance_in_scope(student_id, 'can_manage_attendance')
  );
drop policy if exists attendance_insert on public.attendance_records;
create policy attendance_insert on public.attendance_records for insert to anon, authenticated
  with check (source = 'manual' and created_by = (select itqan.uid()) and itqan.attendance_in_scope(student_id, 'can_manage_attendance'));
drop policy if exists attendance_delete on public.attendance_records;
create policy attendance_delete on public.attendance_records for delete to anon, authenticated
  using (itqan.attendance_in_scope(student_id, 'can_manage_attendance'));

-- ---------------------------------------------------------------------
-- الإعداد، والأسماء غير المطابقة، والربط اليدوي، وسجل المزامنة (داخل itqan: عبر الدوال فقط)
-- ---------------------------------------------------------------------
create table if not exists itqan.attendance_config (
  id            int primary key default 1 check (id = 1),
  start_date    date,
  weeks         int not null default 18,
  threshold     int not null default 3,
  -- اسم الشيت ← معرّف الصف (اختياري؛ يساعد على التمييز بين الأسماء المتشابهة)
  sheet_classes jsonb not null default '{}'::jsonb,
  token_hash    text,
  updated_at    timestamptz not null default now()
);
insert into itqan.attendance_config (id) values (1) on conflict do nothing;

create table if not exists itqan.attendance_aliases (
  name_norm  text primary key,
  student_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists itqan.attendance_unmatched (
  sheet      text not null,
  name_norm  text not null,
  raw_name   text not null,
  marks      jsonb not null default '[]'::jsonb,
  primary key (sheet, name_norm)
);

create table if not exists itqan.attendance_sync_log (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  source  text not null,
  by_name text not null default '',
  summary jsonb not null default '{}'::jsonb
);

alter table itqan.attendance_config enable row level security;
alter table itqan.attendance_aliases enable row level security;
alter table itqan.attendance_unmatched enable row level security;
alter table itqan.attendance_sync_log enable row level security;
revoke all on itqan.attendance_config, itqan.attendance_aliases, itqan.attendance_unmatched, itqan.attendance_sync_log from public, anon, authenticated;

-- توحيد الاسم العربي للمطابقة: حذف التشكيل والتطويل، توحيد الهمزات (ا) والتاء المربوطة (ه) والألف المقصورة (ي) والمسافات
create or replace function itqan.norm_name(p text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
           translate(regexp_replace(lower(coalesce(p, '')), '[ً-ْـ]', '', 'g'), 'أإآٱةى', 'ااااهي'),
           '\s+', ' ', 'g'));
$$;

-- كلمات الاسم بعد ضم «عبد/أبو/آل/بن…» لما بعدها، لمقارنة الأسماء المختصرة بالكاملة
create or replace function itqan.name_tokens(p text)
returns text[] language plpgsql immutable set search_path = '' as $$
declare w text[] := string_to_array(itqan.norm_name(p), ' '); out text[] := '{}'; i int := 1;
begin
  while i <= coalesce(array_length(w, 1), 0) loop
    if w[i] in ('عبد', 'ابو', 'ال', 'بن', 'ابن', 'بنت', 'ام') and i < array_length(w, 1) then
      out := out || (w[i] || w[i + 1]); i := i + 2;
    else
      out := out || w[i]; i := i + 1;
    end if;
  end loop;
  return out;
end $$;

-- يحدد الطالب المقصود باسم من الشيت: ربط يدوي ← تطابق تام ← كلمات أحدهما ضمن الآخر (بالترتيب نفسه للاسم الأول)
create or replace function itqan.attendance_resolve(p_name text, p_class text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_norm text := itqan.norm_name(p_name); v_tok text[] := itqan.name_tokens(p_name); v_id text; v_n int;
begin
  if v_norm = '' then return null; end if;
  select a.student_id into v_id from itqan.attendance_aliases a where a.name_norm = v_norm;
  if v_id is not null then return v_id; end if;

  -- تطابق تام (داخل الصف إن حُدد، وإلا في المدرسة كلها بشرط أن يكون وحيداً)
  select min(u.id::text), count(*) into v_id, v_n from public.users u
  where u.role::text = 'student' and itqan.norm_name(u.name) = v_norm
    and (p_class is null or u.class_id = p_class);
  if v_n = 1 then return v_id; end if;

  -- الاسم الأول نفسه، وكل كلمات الاسم الأقصر موجودة في الأطول
  select min(u.id::text), count(*) into v_id, v_n from public.users u
  where u.role::text = 'student'
    and (p_class is null or u.class_id = p_class)
    and (itqan.name_tokens(u.name))[1] = v_tok[1]
    and (itqan.name_tokens(u.name) @> v_tok or v_tok @> itqan.name_tokens(u.name))
    and least(coalesce(array_length(v_tok, 1), 0), coalesce(array_length(itqan.name_tokens(u.name), 1), 0)) >= 2;
  if v_n = 1 then return v_id; end if;
  return null;
end $$;

-- إدراج علامات طالب من الشيت (تستبدل علامات الشيت السابقة له خلال الفصل، ولا تمس اليدوي)
create or replace function itqan.attendance_apply(p_student text, p_marks jsonb, p_start date, p_weeks int)
returns int language plpgsql security definer set search_path = '' as $$
declare m jsonb; v_day date; v_kind text; v_n int := 0;
begin
  delete from public.attendance_records r
  where r.student_id = p_student and r.source = 'sheet' and r.day >= p_start and r.day < p_start + p_weeks * 7;
  for m in select * from jsonb_array_elements(coalesce(p_marks, '[]'::jsonb)) loop
    -- [الأسبوع، يوم الأسبوع 0=الأحد…4=الخميس، النوع]
    continue when (m ->> 0) !~ '^\d+$' or (m ->> 1) !~ '^[0-6]$';
    v_kind := m ->> 2;
    continue when v_kind not in ('absent', 'late', 'excused');
    continue when (m ->> 0)::int < 1 or (m ->> 0)::int > p_weeks;
    v_day := p_start + ((m ->> 0)::int - 1) * 7 + (m ->> 1)::int;
    insert into public.attendance_records (student_id, day, kind, source, created_by)
    values (p_student, v_day, v_kind, 'sheet', 'sheet')
    on conflict (student_id, day, kind) do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- الاستيراد: من صفحة الحضور (بالجلسة والصلاحية) أو من Apps Script (برمز الربط)
-- p_payload: {"sheets":[{"sheet":"ثالث","students":[{"name":"…","marks":[[1,2,"absent"],…]}]}]}
-- ---------------------------------------------------------------------
create or replace function public.itqan_attendance_import(p_payload jsonb, p_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cfg itqan.attendance_config;
  v_source text; v_by text := '';
  s jsonb; st jsonb; v_class text; v_id text;
  v_matched int := 0; v_marks int := 0; v_unmatched jsonb := '[]'::jsonb; v_sheets int := 0;
begin
  select * into v_cfg from itqan.attendance_config where id = 1;
  if p_token is not null and p_token <> '' then
    if v_cfg.token_hash is null or itqan.hash_token(p_token) <> v_cfg.token_hash then
      raise exception 'invalid_token';
    end if;
    v_source := 'sheet_sync';
  else
    if not itqan.has_perm('can_manage_attendance') then raise exception 'forbidden'; end if;
    v_source := 'upload';
    select coalesce(u.name, '') into v_by from public.users u where u.id::text = itqan.uid();
  end if;
  if v_cfg.start_date is null then raise exception 'no_start_date'; end if;
  if jsonb_typeof(p_payload -> 'sheets') <> 'array' then raise exception 'bad_payload'; end if;

  for s in select * from jsonb_array_elements(p_payload -> 'sheets') loop
    v_sheets := v_sheets + 1;
    v_class := nullif(v_cfg.sheet_classes ->> (s ->> 'sheet'), '');
    delete from itqan.attendance_unmatched u where u.sheet = s ->> 'sheet';
    for st in select * from jsonb_array_elements(coalesce(s -> 'students', '[]'::jsonb)) loop
      continue when itqan.norm_name(st ->> 'name') = '';
      v_id := itqan.attendance_resolve(st ->> 'name', v_class);
      if v_id is null then
        insert into itqan.attendance_unmatched (sheet, name_norm, raw_name, marks)
        values (s ->> 'sheet', itqan.norm_name(st ->> 'name'), btrim(st ->> 'name'), coalesce(st -> 'marks', '[]'::jsonb))
        on conflict (sheet, name_norm) do update set marks = excluded.marks, raw_name = excluded.raw_name;
        v_unmatched := v_unmatched || jsonb_build_object('sheet', s ->> 'sheet', 'name', btrim(st ->> 'name'));
      else
        v_matched := v_matched + 1;
        v_marks := v_marks + itqan.attendance_apply(v_id, st -> 'marks', v_cfg.start_date, v_cfg.weeks);
      end if;
    end loop;
  end loop;

  insert into itqan.attendance_sync_log (source, by_name, summary)
  values (v_source, v_by, jsonb_build_object('sheets', v_sheets, 'matched', v_matched, 'marks', v_marks, 'unmatched', jsonb_array_length(v_unmatched)));
  delete from itqan.attendance_sync_log where id not in (select id from itqan.attendance_sync_log order by id desc limit 50);

  return jsonb_build_object('sheets', v_sheets, 'matched', v_matched, 'marks', v_marks, 'unmatched', v_unmatched);
end $$;

-- الإعداد وحالة الربط (للعرض في صفحة الحضور)
create or replace function public.itqan_attendance_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cfg itqan.attendance_config;
begin
  if not (itqan.has_perm('can_view_attendance') or itqan.has_perm('can_manage_attendance')) then return null; end if;
  select * into v_cfg from itqan.attendance_config where id = 1;
  return jsonb_build_object(
    'start_date', v_cfg.start_date, 'weeks', v_cfg.weeks, 'threshold', v_cfg.threshold,
    'sheet_classes', v_cfg.sheet_classes, 'has_token', v_cfg.token_hash is not null,
    'log', (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'source', l.source, 'by', l.by_name, 'summary', l.summary) order by l.id desc), '[]'::jsonb)
            from (select * from itqan.attendance_sync_log order by id desc limit 10) l),
    'unmatched', (select coalesce(jsonb_agg(jsonb_build_object('sheet', u.sheet, 'name', u.raw_name, 'count', jsonb_array_length(u.marks)) order by u.sheet, u.raw_name), '[]'::jsonb)
                  from itqan.attendance_unmatched u));
end $$;

create or replace function public.itqan_attendance_config_save(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not itqan.has_perm('can_manage_attendance') then raise exception 'forbidden'; end if;
  update itqan.attendance_config set
    start_date = case when p ? 'start_date' then nullif(p ->> 'start_date', '')::date else start_date end,
    weeks = case when p ? 'weeks' then least(greatest(coalesce((p ->> 'weeks')::int, 18), 1), 30) else weeks end,
    threshold = case when p ? 'threshold' then least(greatest(coalesce((p ->> 'threshold')::int, 3), 1), 60) else threshold end,
    sheet_classes = case when jsonb_typeof(p -> 'sheet_classes') = 'object' then p -> 'sheet_classes' else sheet_classes end,
    updated_at = now()
  where id = 1;
end $$;

-- رمز ربط جديد للشيت (يظهر مرة واحدة؛ القديم يتوقف)
create or replace function public.itqan_attendance_new_token()
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not itqan.has_perm('can_manage_attendance') then raise exception 'forbidden'; end if;
  update itqan.attendance_config set token_hash = itqan.hash_token(v_token), updated_at = now() where id = 1;
  return v_token;
end $$;

-- ربط اسم من الشيت بطالب، وتطبيق علاماته فوراً
create or replace function public.itqan_attendance_link(p_sheet text, p_name text, p_student_id text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_cfg itqan.attendance_config; v_u itqan.attendance_unmatched; v_n int := 0;
begin
  if not itqan.attendance_in_scope(p_student_id, 'can_manage_attendance') then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.users u where u.id::text = p_student_id and u.role::text = 'student') then raise exception 'not_student'; end if;
  select * into v_cfg from itqan.attendance_config where id = 1;
  insert into itqan.attendance_aliases (name_norm, student_id) values (itqan.norm_name(p_name), p_student_id)
  on conflict (name_norm) do update set student_id = excluded.student_id;
  select * into v_u from itqan.attendance_unmatched u where u.sheet = p_sheet and u.name_norm = itqan.norm_name(p_name);
  if found and v_cfg.start_date is not null then
    v_n := itqan.attendance_apply(p_student_id, v_u.marks, v_cfg.start_date, v_cfg.weeks);
    delete from itqan.attendance_unmatched u where u.sheet = p_sheet and u.name_norm = v_u.name_norm;
  end if;
  return v_n;
end $$;

revoke execute on function itqan.attendance_resolve(text, text), itqan.attendance_apply(text, jsonb, date, int) from public, anon, authenticated;
revoke all on function public.itqan_attendance_import(jsonb, text), public.itqan_attendance_config(), public.itqan_attendance_config_save(jsonb),
  public.itqan_attendance_new_token(), public.itqan_attendance_link(text, text, text) from public;
grant execute on function public.itqan_attendance_import(jsonb, text), public.itqan_attendance_config(), public.itqan_attendance_config_save(jsonb),
  public.itqan_attendance_new_token(), public.itqan_attendance_link(text, text, text) to anon, authenticated;
grant execute on function itqan.attendance_in_scope(text, text), itqan.norm_name(text), itqan.name_tokens(text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 022: الحضور (الغياب والتأخر والاستئذان) والربط مع سجل الغياب' as result;
