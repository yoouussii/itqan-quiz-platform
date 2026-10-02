-- =====================================================================
-- منصة إتقان — الحماية: الجزء 2 من 5 (تشفير كلمات المرور الحالية وحماية الصلاحيات)
-- شغّل الأجزاء بالترتيب 1 ← 5. كل جزء آمن لإعادة التشغيل.
-- يجب أن تظهر في النهاية رسالة «✓ تم الجزء 2»؛ إن ظهر خطأ فالنص لم يُنسخ كاملاً.
-- =====================================================================

-- ---------------------------------------------------------------------
-- تشفير كلمات المرور: أي كلمة مرور تُكتب في users.password تتحول فوراً
-- إلى hash في itqan.credentials ويُمسح النص الصريح
-- ---------------------------------------------------------------------
-- عمود كلمة المرور يصبح فارغاً بعد التشفير، فلا يجوز أن يكون إلزامياً
alter table public.users alter column password drop not null;

create or replace function itqan.users_password_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.password is not null and new.password <> '' then
    insert into itqan.credentials (user_id, password_hash, updated_at)
    values (new.id::text, extensions.crypt(new.password, extensions.gen_salt('bf', 10)), now())
    on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now();
    -- تغيير كلمة المرور يُنهي جلسات المستخدم الأخرى
    if tg_op = 'UPDATE' then
      delete from itqan.sessions
      where user_id = new.id::text
        and token_hash is distinct from itqan.hash_token(itqan.request_token());
    end if;
  end if;
  new.password := null;
  return new;
end $$;

drop trigger if exists itqan_users_password on public.users;
create trigger itqan_users_password
  before insert or update of password on public.users
  for each row execute function itqan.users_password_trigger();

-- حماية الأدوار والصلاحيات: غير المدير لا يستطيع تغييرها (ولا لنفسه)
create or replace function itqan.users_guard_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- التعديل من لوحة Supabase (بدون جلسة) أو من المدير: بلا قيود
  if itqan.uid() is null or itqan.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.teacher_permissions := '{}'::jsonb;
    new.permissions := '{}'::jsonb;
    return new;
  end if;
  new.role := old.role;
  new.teacher_permissions := old.teacher_permissions;
  new.permissions := old.permissions;
  return new;
end $$;

drop trigger if exists itqan_users_guard on public.users;
create trigger itqan_users_guard
  before insert or update on public.users
  for each row execute function itqan.users_guard_trigger();

-- حذف المستخدم يحذف كلمة مروره وجلساته
create or replace function itqan.users_delete_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from itqan.credentials where user_id = old.id::text;
  delete from itqan.sessions where user_id = old.id::text;
  return old;
end $$;

drop trigger if exists itqan_users_delete on public.users;
create trigger itqan_users_delete
  after delete on public.users
  for each row execute function itqan.users_delete_trigger();

-- ترحيل كلمات المرور الحالية (يُطلق المشغّل أعلاه لكل صف)
update public.users set password = password where password is not null and password <> '';

select '✓ تم الجزء 2 من 5' as result;
