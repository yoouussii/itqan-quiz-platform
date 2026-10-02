-- =====================================================================
-- منصة إتقان: 008 — فرض اعتماد الاختبارات على الخادم
--
-- يتطلب 003 و 004 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
--  - جدول إعدادات النظام app_settings (إن لم يكن موجوداً) مع سياساته.
--  - «اشتراط اعتماد الاختبارات» مفعّل افتراضياً، ويُلغى من صفحة الإعدادات.
--  - المعلم الذي لا يملك صلاحية «اعتماد الاختبارات»: اختباره الجديد يُحفظ «بانتظار الاعتماد»
--    حتى لو أرسله الموقع (أو أي برنامج آخر) كمنشور، ولا يستطيع نشر اختبار لم يُعتمد بعد.
--  - المدير ومن يملك الصلاحية: ينشرون مباشرة كما كان.
-- =====================================================================

-- ---------- إعدادات النظام ----------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.app_settings enable row level security;
grant select, insert, update, delete on public.app_settings to anon, authenticated;

drop policy if exists settings_select on public.app_settings;
drop policy if exists settings_admin on public.app_settings;
create policy settings_select on public.app_settings for select to anon, authenticated
  using ((select itqan.uid()) is not null);
create policy settings_admin on public.app_settings for all to anon, authenticated
  using ((select itqan.is_admin())) with check ((select itqan.is_admin()));

-- اشتراط الاعتماد: مفعّل ما لم يُطفئه المدير صراحة
create or replace function itqan.approval_required()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when jsonb_typeof(s.value) = 'boolean' then (s.value #>> '{}')::boolean
                 when s.value #>> '{}' in ('true', 'false') then (s.value #>> '{}')::boolean
            end
     from public.app_settings s where s.key = 'require_quiz_approval'),
    true);
$$;

-- ---------- حارس الاختبارات (يحل محل نسخة 004) ----------
create or replace function itqan.quizzes_guard_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid text := itqan.uid();
  v_owner boolean;
  v_must_approve boolean;
  o jsonb; n jsonb;
begin
  -- لوحة Supabase (بدون جلسة)، أو دوال الخادم نفسها (مثل إلغاء إذن الإعادة بعد التسليم)، أو المدير: بلا قيود
  if v_uid is null or current_setting('itqan.internal', true) = '1' or itqan.is_admin() then
    return coalesce(new, old);
  end if;

  v_must_approve := tg_op <> 'DELETE' and itqan.approval_required() and not itqan.has_perm('can_approve_quizzes');

  if tg_op = 'INSERT' then
    -- الاختبار الجديد باسم منشئه
    if coalesce(to_jsonb(new) ->> 'teacher_id', '') <> v_uid and coalesce(to_jsonb(new) ->> 'created_by', '') <> v_uid then
      raise exception 'لا يمكن إنشاء اختبار باسم معلم آخر' using errcode = '42501';
    end if;
    -- بدون صلاحية الاعتماد: لا يُنشر مباشرة، بل يُحفظ بانتظار الاعتماد
    if v_must_approve and coalesce(to_jsonb(new) ->> 'status', 'published') = 'published' then
      new := jsonb_populate_record(new, jsonb_build_object('status', 'pending_approval'));
    end if;
    return new;
  end if;

  v_owner := coalesce(to_jsonb(old) ->> 'teacher_id', '') = v_uid or coalesce(to_jsonb(old) ->> 'created_by', '') = v_uid;

  if tg_op = 'DELETE' then
    if not v_owner then
      raise exception 'حذف الاختبار متاح لصاحبه أو للمدير فقط' using errcode = '42501';
    end if;
    return old;
  end if;

  -- نقل ملكية الاختبار للمدير فقط
  if (to_jsonb(new) ->> 'teacher_id') is distinct from (to_jsonb(old) ->> 'teacher_id') then
    raise exception 'نقل الاختبار لمعلم آخر متاح للمدير فقط' using errcode = '42501';
  end if;

  -- المالك بدون صلاحية الاعتماد لا يحوّل اختباراً غير معتمد (مسودة، بانتظار الاعتماد، مرفوض) إلى منشور
  if v_must_approve
     and coalesce(to_jsonb(new) ->> 'status', 'published') = 'published'
     and coalesce(to_jsonb(old) ->> 'status', 'published') <> 'published' then
    new := jsonb_populate_record(new, jsonb_build_object('status', 'pending_approval'));
  end if;

  if v_owner or itqan.has_perm('can_approve_quizzes') then
    return new;
  end if;

  -- غير المالك: تغيير قائمة إعادة المحاولة فقط (لمن يملك الصلاحية)
  o := to_jsonb(old) - 'allowed_retake_student_ids' - 'updated_at';
  n := to_jsonb(new) - 'allowed_retake_student_ids' - 'updated_at';
  if o = n and itqan.has_perm('can_manage_retakes') then
    return new;
  end if;
  raise exception 'تعديل الاختبار متاح لصاحبه أو للمدير فقط' using errcode = '42501';
end $$;

drop trigger if exists itqan_quizzes_guard on public.quizzes;
create trigger itqan_quizzes_guard
  before insert or update or delete on public.quizzes
  for each row execute function itqan.quizzes_guard_trigger();

notify pgrst, 'reload schema';

select '✓ تم تحديث 008: اشتراط الاعتماد ' || case when itqan.approval_required() then 'مفعّل' else 'غير مفعّل' end as result;
