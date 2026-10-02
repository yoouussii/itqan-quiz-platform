-- =====================================================================
-- منصة إتقان: 005 — حذف الإشعارات
--
-- يتطلب 003 قبله. التشغيل: GitHub ← Actions ← Supabase migrate ← اختر هذا الملف.
-- آمن لإعادة التشغيل.
--
--  1. كل مستخدم يحذف إشعاراته من عنده (تختفي من كل أجهزته، ولا تُحذف عند غيره).
--  2. المدير يحذف أي إشعار نهائياً من الجميع، ويمسح إشعارات مستخدم معيّن.
--  3. مُرسل الإشعار (مثلاً المعلم صاحب الإعلان) يحذف ما أرسله من الجميع.
-- =====================================================================

-- حالة «محذوف عندي» بجانب «مقروء»
alter table public.notification_reads add column if not exists deleted_at timestamptz;

-- المدير يدير حالة الإشعارات لأي مستخدم (مسح إشعارات مستخدم معيّن)
drop policy if exists notification_reads_admin on public.notification_reads;
create policy notification_reads_admin on public.notification_reads for all to anon, authenticated
  using ((select itqan.is_admin())) with check ((select itqan.is_admin()));

-- الحذف النهائي: المدير أو مُرسل الإشعار
drop policy if exists notifications_admin on public.notifications;
create policy notifications_admin on public.notifications for delete to anon, authenticated
  using ((select itqan.is_admin()) or created_by = (select itqan.uid()));

-- عند حذف إشعار نهائياً تُحذف حالات قراءته
create or replace function itqan.notifications_delete_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notification_reads where notification_id = old.id;
  return old;
end $$;

drop trigger if exists itqan_notifications_delete on public.notifications;
create trigger itqan_notifications_delete
  after delete on public.notifications
  for each row execute function itqan.notifications_delete_trigger();

notify pgrst, 'reload schema';

select '✓ تم تحديث 005' as result;
