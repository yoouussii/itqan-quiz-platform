-- =====================================================================
-- منصة إتقان: 018 — سجل الشهادات والتحقق منها
--  - كل شهادة تصدر من صفحة «الشهادات» تُسجَّل برقم تسلسلي (ITQ-2026-0001) ورمز تحقق عشوائي.
--  - رمز QR على الشهادة يفتح صفحة عامة (بدون تسجيل دخول) تؤكد أن الشهادة أصلية أو ملغاة.
--  - يصدر الشهادات المدير ومن لديه صلاحية «منح الجوائز» (can_award_badges).
--  - يرى السجل: المدير وأصحاب الصلاحية، والطالب شهاداته، وولي الأمر شهادات أبنائه.
--  - لا تُعدَّل الشهادة بعد صدورها؛ يمكن فقط إلغاؤها (المدير أو من أصدرها) مع ذكر السبب.
--  - الشعاران الافتراضيان للشهادة (الشركة والمدرسة) يُضبطان هنا ويغيّرهما المدير من الإعدادات.
--
-- يتطلب 003 و009 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
-- =====================================================================

create sequence if not exists public.certificates_serial_seq;

create table if not exists public.certificates (
  id              text primary key default gen_random_uuid()::text,
  serial          text not null unique,
  code            text not null unique,
  student_id      text,
  student_name    text not null check (length(btrim(student_name)) between 1 and 120),
  class_name      text not null default '',
  -- excellence / pass / appreciation / thanks / participation / custom
  kind            text not null default 'appreciation',
  title           text not null default '',
  reason          text not null default '',
  detail          text not null default '',
  score           text not null default '',
  school_name     text not null default '',
  signer_name     text not null default '',
  signer_title    text not null default '',
  issued_on       date not null default current_date,
  -- القالب والألوان المستخدمة (لإعادة الطباعة بنفس الشكل)
  style           jsonb not null default '{}'::jsonb,
  created_by      text not null,
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  revoked_by      text,
  revoke_reason   text not null default ''
);
create index if not exists certificates_student_idx on public.certificates (student_id);
create index if not exists certificates_created_idx on public.certificates (created_at desc);

-- الرقم التسلسلي ورمز التحقق يولّدهما الخادم دائماً (لا يختارهما المستخدم)
create or replace function itqan.certificates_insert_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.serial := 'ITQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.certificates_serial_seq')::text, 4, '0');
  new.code := upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 10));
  new.created_at := now();
  new.revoked_at := null;
  new.revoked_by := null;
  new.revoke_reason := '';
  new.student_name := btrim(new.student_name);
  return new;
end $$;

drop trigger if exists itqan_certificates_insert on public.certificates;
create trigger itqan_certificates_insert before insert on public.certificates
  for each row execute function itqan.certificates_insert_trigger();

-- بعد الصدور: لا يتغير إلا الإلغاء (مرة واحدة، مع سببه)
create or replace function itqan.certificates_update_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_revoke boolean := new.revoked_at is not null and old.revoked_at is null;
  v_reason text := left(coalesce(new.revoke_reason, ''), 300);
begin
  new := old;
  if v_revoke then
    new.revoked_at := now();
    new.revoked_by := itqan.uid();
    new.revoke_reason := v_reason;
  end if;
  return new;
end $$;

drop trigger if exists itqan_certificates_update on public.certificates;
create trigger itqan_certificates_update before update on public.certificates
  for each row execute function itqan.certificates_update_trigger();

alter table public.certificates enable row level security;

drop policy if exists certificates_select on public.certificates;
create policy certificates_select on public.certificates for select to anon, authenticated
  using (
    (select itqan.has_perm('can_award_badges'))
    or created_by = (select itqan.uid())
    or student_id = (select itqan.uid())
    or exists (
      select 1 from public.users p
      where p.id::text = (select itqan.uid()) and p.role = 'parent'
        and coalesce(p.child_ids, '[]'::jsonb) ? certificates.student_id
    )
  );

drop policy if exists certificates_insert on public.certificates;
create policy certificates_insert on public.certificates for insert to anon, authenticated
  with check (created_by = (select itqan.uid()) and (select itqan.has_perm('can_award_badges')));

drop policy if exists certificates_update on public.certificates;
create policy certificates_update on public.certificates for update to anon, authenticated
  using (created_by = (select itqan.uid()) or (select itqan.is_admin()))
  with check (created_by = (select itqan.uid()) or (select itqan.is_admin()));

drop policy if exists certificates_delete on public.certificates;
create policy certificates_delete on public.certificates for delete to anon, authenticated
  using ((select itqan.is_admin()));

grant usage on sequence public.certificates_serial_seq to anon, authenticated;

-- التحقق العام من شهادة برمز التحقق (يعمل بدون تسجيل دخول، ويعرض بيانات الشهادة فقط)
create or replace function public.itqan_verify_certificate(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'found', true,
      'serial', c.serial,
      'student_name', c.student_name,
      'class_name', c.class_name,
      'kind', c.kind,
      'title', c.title,
      'reason', c.reason,
      'detail', c.detail,
      'score', c.score,
      'school_name', c.school_name,
      'signer_name', c.signer_name,
      'signer_title', c.signer_title,
      'issued_on', c.issued_on,
      'revoked', c.revoked_at is not null,
      'revoked_at', c.revoked_at
    )
    from public.certificates c
    where c.code = upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'))
    limit 1
  ), jsonb_build_object('found', false));
$$;

revoke execute on function public.itqan_verify_certificate(text) from public;
grant execute on function public.itqan_verify_certificate(text) to anon, authenticated;

-- الشعاران الافتراضيان للشهادات (ملفات داخل الموقع). لا يغيّر قيمة اختارها المدير.
insert into public.app_settings (key, value, updated_at) values
  ('cert_company_logo', to_jsonb('/brand/company-logo.png'::text), now()),
  ('cert_school_logo', to_jsonb('/brand/school-logo.png'::text), now())
on conflict (key) do nothing;

notify pgrst, 'reload schema';

select '✓ تم تحديث 018: سجل الشهادات والتحقق منها' as result;
