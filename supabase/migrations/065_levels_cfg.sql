-- =====================================================================
-- منصة إتقان: 065 — إعداد «تتبع مستويات الطلاب»
--  - levels_cfg: القياسات المحسوبة (rounds: null = تلقائي حتى آخر قياس فيه درجات)،
--    والمواد التي لا تُدرس في كل مرحلة فلا تدخل في النسب (off: { "<ملف المرحلة>": ["المادة", ...] }).
--  - يضبطه من يملك صلاحية إدارة سجلات المتابعة.
--
-- يتطلب 064 قبله. آمن لإعادة التشغيل.
-- =====================================================================

alter table itqan.records_config add column if not exists levels_cfg jsonb not null default '{}'::jsonb;

create or replace function public.itqan_records_set_levels(p_cfg jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not itqan.has_perm('can_manage_class_records') then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_cfg) <> 'object' or octet_length(p_cfg::text) > 20000 then raise exception 'bad_payload'; end if;
  update itqan.records_config set levels_cfg = p_cfg, updated_at = now() where id = 1;
  return p_cfg;
end $$;

create or replace function public.itqan_records_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v itqan.records_config;
begin
  if not (itqan.has_perm('can_view_class_records') or itqan.has_perm('can_manage_class_records')) then return null; end if;
  select * into v from itqan.records_config where id = 1;
  return jsonb_build_object('has_token', v.token_hash is not null, 'folders', v.folders, 'last_sync', v.last_sync, 'tools', v.tools,
    'levels_cfg', v.levels_cfg, 'sync_requested_at', v.sync_requested_at, 'sync_interval', v.sync_interval, 'last_poll', v.last_poll, 'last_scan', v.last_scan,
    'log', case when itqan.has_perm('can_manage_class_records') then v.log else '[]'::jsonb end);
end $$;

revoke all on function public.itqan_records_set_levels(jsonb), public.itqan_records_config() from public;
grant execute on function public.itqan_records_set_levels(jsonb), public.itqan_records_config() to anon, authenticated;

notify pgrst, 'reload schema';

select '✓ تم تحديث 065: إعداد تتبع مستويات الطلاب' as result;
