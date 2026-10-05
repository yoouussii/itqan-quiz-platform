-- =====================================================================
-- منصة إتقان: 054 — صورة للمكافأة في متجر النقاط
--  - store_items.image: صورة مصغّرة (data URL بحد أقصى ~300KB) تظهر بدل الرمز.
--  - store_redemptions.item_image: نسخة منها في الطلب، فتبقى ظاهرة لو عُدّلت المكافأة أو حُذفت.
--
-- يتطلب 052 قبله. آمن لإعادة التشغيل.
-- =====================================================================

alter table public.store_items add column if not exists image text;
alter table public.store_items drop constraint if exists store_items_image_check;
alter table public.store_items add constraint store_items_image_check
  check (image is null or (image like 'data:image/%' and char_length(image) <= 400000));

alter table public.store_redemptions add column if not exists item_image text;

-- نسخ الصورة إلى الطلب عند إنشائه
create or replace function itqan.store_redemption_image()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.item_image is null and new.item_id is not null then
    select image into new.item_image from public.store_items where id = new.item_id;
  end if;
  return new;
end $$;
drop trigger if exists store_redemption_image on public.store_redemptions;
create trigger store_redemption_image before insert on public.store_redemptions
  for each row execute function itqan.store_redemption_image();

notify pgrst, 'reload schema';

select '✓ تم تحديث 054: صورة المكافأة' as result;
