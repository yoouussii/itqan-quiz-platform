-- =====================================================================
-- منصة إتقان: 034 — الزيارات الصفية والاستبيانات
--  الزيارات الصفية:
--   - المشرف أو المدير (أو من لديه can_class_visits) يقيّم حصة المعلم ببنود قابلة للتعديل،
--     مع نقاط القوة والتوصيات. المعلم يرى زياراته ويؤكد الاطلاع، ويصله إشعار.
--  الاستبيانات:
--   - من لديه can_manage_surveys ينشئ استبياناً (تقييم 1–5، اختيار، نص) لفئات (أولياء أمور/طلاب/معلمون…).
--   - إجابة واحدة لكل مستخدم، ومجهولة الهوية إن اختير ذلك (لا يُخزَّن صاحبها مع الإجابة).
--   - إشعار للفئة المستهدفة عند النشر.
--
-- يتطلب 003 و009 قبله. آمن لإعادة التشغيل.
-- =====================================================================

-- ---------------------------------------------------------------------
-- الزيارات الصفية
-- ---------------------------------------------------------------------
create or replace function itqan.can_visit()
returns boolean language sql stable security definer set search_path = '' as $$
  select itqan.has_perm('can_class_visits') or coalesce(itqan.my_role() = 'supervisor', false);
$$;

create table if not exists public.class_visits (
  id              text primary key default ('cv-' || encode(extensions.gen_random_bytes(6), 'hex')),
  teacher_id      text not null,
  visitor_id      text not null,
  visitor_name    text not null default '',
  day             date not null default current_date,
  class_id        text,
  subject_id      text,
  lesson          text not null default '',
  -- [{"title": "...", "max": 5, "score": 4}]
  items           jsonb not null default '[]'::jsonb,
  strengths       text not null default '',
  recommendations text not null default '',
  teacher_ack_at  timestamptz,
  teacher_note    text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists class_visits_teacher_idx on public.class_visits (teacher_id);

alter table public.class_visits enable row level security;
revoke all on public.class_visits from public, anon, authenticated;
grant select, insert, update, delete on public.class_visits to anon, authenticated;

drop policy if exists cv_select on public.class_visits;
create policy cv_select on public.class_visits for select to anon, authenticated
  using (teacher_id = itqan.uid() or visitor_id = itqan.uid() or itqan.is_admin() or itqan.can_visit());
drop policy if exists cv_insert on public.class_visits;
create policy cv_insert on public.class_visits for insert to anon, authenticated
  with check (visitor_id = itqan.uid() and itqan.can_visit() and teacher_id <> itqan.uid() and teacher_ack_at is null);
drop policy if exists cv_update on public.class_visits;
create policy cv_update on public.class_visits for update to anon, authenticated
  using (visitor_id = itqan.uid() or itqan.is_admin()) with check (visitor_id = itqan.uid() or itqan.is_admin());
drop policy if exists cv_delete on public.class_visits;
create policy cv_delete on public.class_visits for delete to anon, authenticated
  using (visitor_id = itqan.uid() or itqan.is_admin());

-- المعلم يؤكد الاطلاع (ويكتب ملاحظته) دون تعديل التقييم
create or replace function public.itqan_visit_ack(p_id text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.class_visits set teacher_ack_at = now(), teacher_note = left(coalesce(p_note, ''), 1000)
   where id = p_id and teacher_id = itqan.uid();
  if not found then raise exception 'not_found'; end if;
end $$;

-- بنود التقييم (قابلة للتعديل من المدير)
create table if not exists itqan.visit_config (
  id    int primary key default 1 check (id = 1),
  items jsonb not null default '[]'::jsonb
);
insert into itqan.visit_config (id, items) values (1, $j$[
  {"title": "التخطيط للدرس وإعداده", "max": 5},
  {"title": "التهيئة وإثارة الدافعية", "max": 5},
  {"title": "وضوح أهداف الدرس وتحقيقها", "max": 5},
  {"title": "التمكن العلمي من المادة", "max": 5},
  {"title": "تنوع استراتيجيات التدريس", "max": 5},
  {"title": "توظيف الوسائل والتقنية", "max": 5},
  {"title": "إدارة الصف وتنظيم الوقت", "max": 5},
  {"title": "تفاعل الطلاب ومشاركتهم", "max": 5},
  {"title": "مراعاة الفروق الفردية", "max": 5},
  {"title": "التقويم المستمر والتغذية الراجعة", "max": 5},
  {"title": "الواجبات والأنشطة", "max": 5},
  {"title": "غلق الدرس وتلخيصه", "max": 5}
]$j$::jsonb) on conflict (id) do nothing;
alter table itqan.visit_config enable row level security;
revoke all on itqan.visit_config from public, anon, authenticated;

create or replace function public.itqan_visit_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select items from itqan.visit_config where id = 1 and itqan.uid() is not null;
$$;
create or replace function public.itqan_visit_config_save(p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not itqan.is_admin() then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'bad_items'; end if;
  update itqan.visit_config set items = p_items where id = 1;
end $$;

-- إشعار المعلم بالزيارة
create or replace function itqan.visit_notify_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
  values ('ntf-cv-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement',
          'زيارة صفية جديدة',
          'سجّل ' || coalesce(nullif(new.visitor_name, ''), 'المشرف') || ' زيارة صفية لحصتك'
            || case when new.lesson <> '' then ' (' || new.lesson || ')' else '' end
            || '. يمكنك الاطلاع على التقييم والتوصيات من صفحة «الزيارات الصفية».',
          jsonb_build_object('user_ids', jsonb_build_array(new.teacher_id)),
          'visit', new.id, new.visitor_id, new.visitor_name);
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists class_visit_notify on public.class_visits;
create trigger class_visit_notify after insert on public.class_visits
  for each row execute function itqan.visit_notify_trigger();

-- ---------------------------------------------------------------------
-- الاستبيانات
-- ---------------------------------------------------------------------
create table if not exists public.surveys (
  id          text primary key default ('sv-' || encode(extensions.gen_random_bytes(6), 'hex')),
  title       text not null check (length(title) between 1 and 150),
  description text not null default '',
  -- الفئات المستهدفة: parent / student / teacher / supervisor
  roles       text[] not null default '{parent}',
  -- [{"id":"q1","type":"rating"|"choice"|"text","text":"...","options":["..."],"required":true}]
  questions   jsonb not null default '[]'::jsonb,
  anonymous   boolean not null default true,
  is_open     boolean not null default false,
  closes_at   timestamptz,
  created_by  text,
  created_by_name text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.survey_responses (
  id         bigserial primary key,
  survey_id  text not null references public.surveys (id) on delete cascade,
  -- فارغ في الاستبيان المجهول
  user_id    text,
  user_name  text not null default '',
  answers    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists survey_responses_survey_idx on public.survey_responses (survey_id);

-- من أجاب (لمنع التكرار، بما في ذلك المجهول)
create table if not exists itqan.survey_respondents (
  survey_id text not null references public.surveys (id) on delete cascade,
  user_id   text not null,
  at        timestamptz not null default now(),
  primary key (survey_id, user_id)
);

alter table public.surveys enable row level security;
alter table public.survey_responses enable row level security;
alter table itqan.survey_respondents enable row level security;
revoke all on public.surveys, public.survey_responses from public, anon, authenticated;
revoke all on itqan.survey_respondents from public, anon, authenticated;
grant select, insert, update, delete on public.surveys to anon, authenticated;
grant select, delete on public.survey_responses to anon, authenticated;

create or replace function itqan.survey_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select itqan.has_perm('can_manage_surveys');
$$;

drop policy if exists sv_select on public.surveys;
create policy sv_select on public.surveys for select to anon, authenticated
  using (itqan.survey_manager() or (is_open and itqan.my_role() = any(roles)));
drop policy if exists sv_insert on public.surveys;
create policy sv_insert on public.surveys for insert to anon, authenticated
  with check (itqan.survey_manager() and created_by = itqan.uid());
drop policy if exists sv_update on public.surveys;
create policy sv_update on public.surveys for update to anon, authenticated
  using (itqan.is_admin() or (itqan.survey_manager() and created_by = itqan.uid()))
  with check (itqan.is_admin() or (itqan.survey_manager() and created_by = itqan.uid()));
drop policy if exists sv_delete on public.surveys;
create policy sv_delete on public.surveys for delete to anon, authenticated
  using (itqan.is_admin() or (itqan.survey_manager() and created_by = itqan.uid()));

drop policy if exists svr_select on public.survey_responses;
create policy svr_select on public.survey_responses for select to anon, authenticated
  using (itqan.survey_manager());
drop policy if exists svr_delete on public.survey_responses;
create policy svr_delete on public.survey_responses for delete to anon, authenticated
  using (itqan.is_admin());

-- الإجابة: مرة واحدة، والاستبيان مفتوح وموجّه لفئة المستخدم
create or replace function public.itqan_survey_submit(p_survey text, p_answers jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.surveys; v_uid text := itqan.uid(); v_role text := itqan.my_role(); v_name text;
begin
  if v_uid is null then raise exception 'forbidden'; end if;
  select * into v from public.surveys where id = p_survey;
  if v.id is null or not v.is_open or (v.closes_at is not null and v.closes_at < now()) then raise exception 'closed'; end if;
  if not (v_role = any(v.roles)) then raise exception 'not_audience'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'bad_answers'; end if;
  insert into itqan.survey_respondents (survey_id, user_id) values (p_survey, v_uid);
  select name into v_name from public.users where id::text = v_uid;
  insert into public.survey_responses (survey_id, user_id, user_name, answers)
  values (p_survey, case when v.anonymous then null else v_uid end, case when v.anonymous then '' else coalesce(v_name, '') end, p_answers);
exception when unique_violation then
  raise exception 'already_answered';
end $$;

-- الاستبيانات المفتوحة لي، مع ما إذا كنت أجبت
create or replace function public.itqan_my_surveys()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('answered',
           exists (select 1 from itqan.survey_respondents r where r.survey_id = s.id and r.user_id = itqan.uid())) order by s.created_at desc), '[]'::jsonb)
    from public.surveys s
   where s.is_open and (s.closes_at is null or s.closes_at >= now()) and itqan.my_role() = any(s.roles);
$$;

-- عدد المجيبين لكل استبيان (للمدير)
create or replace function public.itqan_survey_counts()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when itqan.survey_manager() then coalesce((select jsonb_object_agg(survey_id, n) from
    (select survey_id, count(*) as n from itqan.survey_respondents group by survey_id) x), '{}'::jsonb) end;
$$;

-- إشعار الفئة المستهدفة عند فتح الاستبيان أول مرة
create or replace function itqan.survey_notify_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_open and (tg_op = 'INSERT' or not old.is_open) then
    insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
    values ('ntf-sv-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement',
            'استبيان جديد: ' || new.title,
            coalesce(nullif(new.description, ''), 'نسعد بمشاركتك في هذا الاستبيان') || ' — افتح صفحة «الاستبيانات» للإجابة.',
            jsonb_build_object('roles', to_jsonb(new.roles)),
            'survey', new.id, new.created_by, new.created_by_name);
  end if;
  return null;
exception when others then
  return null;
end $$;
drop trigger if exists survey_notify on public.surveys;
create trigger survey_notify after insert or update of is_open on public.surveys
  for each row execute function itqan.survey_notify_trigger();

revoke all on function public.itqan_visit_ack(text, text), public.itqan_visit_config(), public.itqan_visit_config_save(jsonb),
  public.itqan_survey_submit(text, jsonb), public.itqan_my_surveys(), public.itqan_survey_counts() from public;
grant execute on function public.itqan_visit_ack(text, text), public.itqan_visit_config(), public.itqan_visit_config_save(jsonb),
  public.itqan_survey_submit(text, jsonb), public.itqan_my_surveys(), public.itqan_survey_counts() to anon, authenticated;
grant execute on function itqan.can_visit(), itqan.survey_manager() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 034: الزيارات الصفية والاستبيانات' as result;
