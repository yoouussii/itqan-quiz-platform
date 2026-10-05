-- =====================================================================
-- منصة إتقان: 046 — أدوات التقويم المستحقة في سجلات المتابعة
--  - الأعمدة التي لم يحن وقتها (مثل اختبار نهاية الفصل) لا تُحسب على المعلم في نسبة الرصد.
--  - تلقائياً: الأداة الفارغة في كل السجلات تُعد «لم يحن وقتها».
--  - ويمكن للمسؤول تثبيت أي أداة: مستحقة (due) أو لم يحن وقتها (not_due).
--
-- يتطلب 043 قبله. آمن لإعادة التشغيل.
-- =====================================================================

alter table itqan.records_config add column if not exists tools jsonb not null default '{}'::jsonb;

create or replace function public.itqan_records_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v itqan.records_config;
begin
  if not (itqan.has_perm('can_view_class_records') or itqan.has_perm('can_manage_class_records')) then return null; end if;
  select * into v from itqan.records_config where id = 1;
  return jsonb_build_object('has_token', v.token_hash is not null, 'folders', v.folders, 'last_sync', v.last_sync, 'tools', v.tools,
    'log', case when itqan.has_perm('can_manage_class_records') then v.log else '[]'::jsonb end);
end $$;

-- { "اختبار نهاية الفصل": "not_due", "الواجبات": "due" } — المفاتيح غير المذكورة = تلقائي
create or replace function public.itqan_records_set_tools(p_tools jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if not itqan.has_perm('can_manage_class_records') then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_tools) <> 'object' or octet_length(p_tools::text) > 20000 then raise exception 'bad_payload'; end if;
  select coalesce(jsonb_object_agg(left(k, 120), val), '{}'::jsonb) into v
    from jsonb_each_text(p_tools) as e(k, val) where val in ('due', 'not_due');
  update itqan.records_config set tools = v, updated_at = now() where id = 1;
  return v;
end $$;

revoke all on function public.itqan_records_config(), public.itqan_records_set_tools(jsonb) from public;
grant execute on function public.itqan_records_config(), public.itqan_records_set_tools(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 046: أدوات التقويم المستحقة' as result;
