-- =====================================================================
-- منصة إتقان: 031 — السلوك والمواظبة
--  - سجل سلوك لكل طالب: مخالفة (بدرجتها من الأولى إلى الخامسة) أو سلوك إيجابي (تعويض).
--  - درجة السلوك = الحد الأعلى − حسم المخالفات + التعويض (بين 0 والحد الأعلى).
--  - درجة المواظبة = الحد الأعلى − (أيام الغياب × حسم اليوم) − (مرات التأخر × حسم التأخر)، من سجل الحضور.
--  - الأرقام والقائمة المقترحة مأخوذة من قواعد السلوك والمواظبة (وزارة التعليم) وكلها قابلة للتعديل من الإعدادات.
--  - إشعار تلقائي للطالب وولي أمره عند تسجيل مخالفة (يمكن إيقافه).
--  - الصلاحيات: can_view_behavior (العرض)، can_record_behavior (التسجيل وحذف ما سجّله). الإعداد للمدير.
--
-- يتطلب 003 و009 و022 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.behavior_records (
  id              bigserial primary key,
  student_id      text not null,
  day             date not null default current_date,
  kind            text not null check (kind in ('violation', 'positive')),
  degree          int check (degree between 1 and 5),
  title           text not null,
  points          numeric(6, 2) not null default 0 check (points >= 0),
  note            text not null default '',
  created_by      text,
  created_by_name text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists behavior_student_idx on public.behavior_records (student_id);
create index if not exists behavior_day_idx on public.behavior_records (day);

alter table public.behavior_records enable row level security;
revoke all on public.behavior_records from public, anon, authenticated;
grant select, insert, delete on public.behavior_records to anon, authenticated;
grant usage on sequence public.behavior_records_id_seq to anon, authenticated;

create or replace function itqan.behavior_in_scope(p_student text, p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select itqan.has_perm(p_perm)
     and (itqan.my_branch() is null or itqan.user_branch(p_student) is null or itqan.user_branch(p_student) = itqan.my_branch());
$$;

drop policy if exists behavior_select on public.behavior_records;
create policy behavior_select on public.behavior_records for select to anon, authenticated
  using (
    student_id = (select itqan.uid())
    or student_id = any(itqan.my_children())
    or itqan.behavior_in_scope(student_id, 'can_view_behavior')
    or itqan.behavior_in_scope(student_id, 'can_record_behavior')
  );
drop policy if exists behavior_insert on public.behavior_records;
create policy behavior_insert on public.behavior_records for insert to anon, authenticated
  with check (created_by = (select itqan.uid()) and itqan.behavior_in_scope(student_id, 'can_record_behavior')
              and ((kind = 'violation' and degree is not null) or (kind = 'positive' and degree is null)));
drop policy if exists behavior_delete on public.behavior_records;
create policy behavior_delete on public.behavior_records for delete to anon, authenticated
  using ((select itqan.is_admin()) or (created_by = (select itqan.uid()) and itqan.behavior_in_scope(student_id, 'can_record_behavior')));

-- الإعداد (صف واحد)
create table if not exists itqan.behavior_config (
  id             int primary key default 1 check (id = 1),
  behavior_max   numeric(6, 2) not null default 100,
  attendance_max numeric(6, 2) not null default 100,
  -- حسم كل درجة مخالفة
  degree_points  jsonb not null default '{"1":1,"2":2,"3":3,"4":10,"5":15}'::jsonb,
  absence_points numeric(6, 2) not null default 1,
  late_points    numeric(6, 2) not null default 0.25,
  -- أقصى تعويض بالسلوك الإيجابي لكل سلوك
  positive_points numeric(6, 2) not null default 1,
  notify_parent  boolean not null default true,
  -- القائمة المقترحة: {"1":[..],"2":[..],…,"positive":[..]}
  catalog        jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);
insert into itqan.behavior_config (id, catalog) values (1, $c${
  "1": ["التأخر عن الطابور الصباحي أو عدم المشاركة فيه", "عدم التقيد بالزي المدرسي", "النوم داخل الفصل", "تكرار خروج الطالب من الفصل", "التأخر في الدخول إلى الحصص", "إحضار الهاتف الجوال بصورة غير مقبولة", "عدم إحضار الكتب والأدوات المدرسية"],
  "2": ["عدم حضور الحصة أو الهروب منها", "الدخول أو الخروج من الفصل دون استئذان", "إثارة الفوضى داخل الفصل أو المدرسة", "التلفظ بكلمات نابية على الطلاب", "الكتابة على الجدران أو الممتلكات", "إلحاق الضرر البسيط بممتلكات المدرسة"],
  "3": ["الإساءة أو الاستهزاء بالزملاء أو التنمر عليهم", "إتلاف ممتلكات المدرسة أو العبث بها", "التدخين أو حيازة مواده", "الهروب من المدرسة", "الغش في الاختبارات", "تصوير الطلاب أو المعلمين دون إذن"],
  "4": ["الاعتداء بالضرب على أحد الطلاب", "سرقة شيء من ممتلكات الطلاب أو المدرسة", "التهديد أو الابتزاز", "التحرش اللفظي أو الجسدي", "إشعال النار داخل المدرسة"],
  "5": ["الاعتداء على أحد منسوبي المدرسة", "حيازة الأسلحة أو ما في حكمها", "حيازة المخدرات أو ترويجها", "الإساءة للدين أو الوطن أو رموزه"],
  "positive": ["المشاركة الفاعلة في الإذاعة المدرسية", "التطوع وخدمة المدرسة", "مساعدة الزملاء والتعاون معهم", "التميز في نشاط مدرسي أو مسابقة", "الالتزام والانضباط المتميز", "المبادرة بعمل إيجابي"]
}$c$::jsonb)
on conflict (id) do nothing;
alter table itqan.behavior_config enable row level security;
revoke all on itqan.behavior_config from public, anon, authenticated;

create or replace function public.itqan_behavior_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(c) - 'id' - 'updated_at' from itqan.behavior_config c where c.id = 1
    and (itqan.uid() is not null);
$$;

create or replace function public.itqan_behavior_config_save(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not itqan.is_admin() then raise exception 'forbidden'; end if;
  update itqan.behavior_config set
    behavior_max   = case when p ? 'behavior_max' then greatest(1, least(1000, (p ->> 'behavior_max')::numeric)) else behavior_max end,
    attendance_max = case when p ? 'attendance_max' then greatest(1, least(1000, (p ->> 'attendance_max')::numeric)) else attendance_max end,
    degree_points  = case when jsonb_typeof(p -> 'degree_points') = 'object' then p -> 'degree_points' else degree_points end,
    absence_points = case when p ? 'absence_points' then greatest(0, (p ->> 'absence_points')::numeric) else absence_points end,
    late_points    = case when p ? 'late_points' then greatest(0, (p ->> 'late_points')::numeric) else late_points end,
    positive_points = case when p ? 'positive_points' then greatest(0, (p ->> 'positive_points')::numeric) else positive_points end,
    notify_parent  = case when p ? 'notify_parent' then coalesce((p ->> 'notify_parent')::boolean, notify_parent) else notify_parent end,
    catalog        = case when jsonb_typeof(p -> 'catalog') = 'object' then p -> 'catalog' else catalog end,
    updated_at     = now()
  where id = 1;
end $$;

-- إشعار الطالب وولي أمره عند تسجيل مخالفة
create or replace function itqan.behavior_notify_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_on boolean; v_name text;
begin
  select notify_parent into v_on from itqan.behavior_config where id = 1;
  if new.kind <> 'violation' or not coalesce(v_on, true) then return null; end if;
  select u.name into v_name from public.users u where u.id::text = new.student_id and u.role::text = 'student';
  if v_name is null then return null; end if; -- طلاب «سجل فقط» بلا حسابات
  insert into public.notifications (id, type, title, body, audience, ref_type, ref_id, created_by, created_by_name)
  values ('ntf-bhv-' || encode(extensions.gen_random_bytes(8), 'hex'), 'announcement',
          'ملاحظة سلوكية: ' || v_name,
          'سُجّلت ملاحظة سلوكية (مخالفة من الدرجة ' || new.degree || '): ' || new.title
            || case when new.note <> '' then ' — ' || new.note else '' end
            || '. نأمل التعاون مع المدرسة في متابعة الطالب، وللاستفسار يُرجى التواصل مع إدارة المدرسة.',
          jsonb_build_object('student_ids', jsonb_build_array(new.student_id),
            'user_ids', (select coalesce(jsonb_agg(p.id::text), '[]'::jsonb) from public.users p
                         where p.role::text = 'parent' and coalesce(p.child_ids, '[]'::jsonb) ? new.student_id)),
          'behavior', new.student_id, null, 'السلوك والمواظبة');
  return null;
exception when others then
  return null; -- الإشعار لا يُفشل التسجيل أبداً
end $$;

drop trigger if exists behavior_notify_after_insert on public.behavior_records;
create trigger behavior_notify_after_insert after insert on public.behavior_records
  for each row execute function itqan.behavior_notify_trigger();

revoke all on function public.itqan_behavior_config(), public.itqan_behavior_config_save(jsonb) from public;
grant execute on function public.itqan_behavior_config(), public.itqan_behavior_config_save(jsonb) to anon, authenticated;
grant execute on function itqan.behavior_in_scope(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 031: السلوك والمواظبة' as result;
