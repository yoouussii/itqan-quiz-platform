-- =====================================================================
-- منصة إتقان: 060 — صور الأسئلة
--  - quiz_media: الصور المضافة للأسئلة (من الاستيراد أو المحرر) مضغوطة على جهاز المعلم.
--  - السؤال يحفظ رابطاً قصيراً «itqan-media:<id>» بدل الصورة نفسها، فيبقى تحميل الاختبارات خفيفاً،
--    وتُجلب الصورة عند عرض السؤال فقط.
--  - الرفع للطاقم فقط (بحد يومي)، والعرض لأي مستخدم مسجّل الدخول.
--  - إن لم يُشغَّل هذا الملف تبقى الصورة داخل السؤال نفسه (تعمل لكن أثقل).
--
-- يتطلب 003 قبله. آمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.quiz_media (
  id          text primary key default ('qm-' || encode(extensions.gen_random_bytes(9), 'hex')),
  mime        text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  data        text not null check (char_length(data) <= 1400000),
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists quiz_media_owner on public.quiz_media (created_by, created_at desc);

alter table public.quiz_media enable row level security;
revoke all on public.quiz_media from anon, authenticated;

-- رفع صورة (base64 بدون البادئة) ← معرّفها
create or replace function public.itqan_media_put(p_mime text, p_data text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id text;
begin
  if not itqan.is_staff() then raise exception 'not_allowed'; end if;
  if p_data is null or p_data !~ '^[A-Za-z0-9+/]+={0,2}$' then raise exception 'bad_image'; end if;
  if (select count(*) from public.quiz_media where created_by = itqan.uid() and created_at > now() - interval '1 day') >= 500 then
    raise exception 'media_daily_limit';
  end if;
  insert into public.quiz_media (mime, data, created_by) values (p_mime, p_data, itqan.uid()) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.itqan_media_put(text, text) from public;
grant execute on function public.itqan_media_put(text, text) to anon, authenticated;

-- جلب صور (حتى 40 في الطلب) لأي مستخدم مسجّل الدخول
create or replace function public.itqan_media_get(p_ids text[])
returns table (id text, mime text, data text) language sql stable security definer set search_path = '' as $$
  select m.id, m.mime, m.data from public.quiz_media m
   where itqan.uid() is not null and m.id = any (p_ids[1:40]);
$$;
revoke all on function public.itqan_media_get(text[]) from public;
grant execute on function public.itqan_media_get(text[]) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 060: صور الأسئلة' as result;
