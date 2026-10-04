#!/usr/bin/env bash
# إعداد مدرسة جديدة على قاعدة بيانات Supabase فارغة: كل ملفات SQL بالترتيب + أول مدير نظام + اسم المدرسة.
#
# الاستخدام (يشغّله سير العمل «Setup new school» في GitHub Actions، أو يدوياً):
#   DATABASE_URL='postgresql://...' SCHOOL_NAME='مدارس المستقبل' ADMIN_ID='1012345678' ADMIN_NAME='مدير النظام' \
#     bash scripts/setup-school.sh
#
# كلمة مرور المدير الأولى: itqan123 (يُطلب منه تغييرها عند أول دخول).
# يرفض العمل على قاعدة بيانات فيها مستخدمون بالفعل، إلا مع FORCE=1 (الملفات آمنة لإعادة التشغيل).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?DATABASE_URL مطلوب}"
: "${ADMIN_ID:?ADMIN_ID (رقم هوية المدير) مطلوب}"
ADMIN_NAME="${ADMIN_NAME:-مدير النظام}"
SCHOOL_NAME="${SCHOOL_NAME:-}"

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)

echo "▶ الاتصال: $("${PSQL[@]}" -tAc "select current_user || ' @ ' || current_database()")"

existing=0
if [ "$("${PSQL[@]}" -tAc "select to_regclass('public.users') is not null")" = "t" ]; then
  existing=$("${PSQL[@]}" -tAc "select count(*) from public.users")
fi
if [ "$existing" != "0" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "::error::قاعدة البيانات فيها $existing مستخدم بالفعل. هذا السكربت لمدرسة جديدة فقط (أو فعّل force لإعادة التشغيل)."
  exit 1
fi

for f in $(ls supabase/migrations/[0-9][0-9][0-9]_*.sql | grep -v rollback | sort); do
  echo "▶ $f"
  if [ "$(basename "$f")" = "002_users_columns.sql" ]; then
    # 002 فيه ALTER TYPE الذي لا يعمل داخل معاملة
    "${PSQL[@]}" -f "$f" >/dev/null
  else
    "${PSQL[@]}" --single-transaction -f "$f" >/dev/null
  fi
done
# شعارات الشهادات الافتراضية (018) خاصة بالمدرسة الأساسية: المدرسة الجديدة ترفع شعاراتها من الإعدادات
"${PSQL[@]}" -qc "delete from public.app_settings where key in ('cert_company_logo', 'cert_school_logo')" >/dev/null

echo "▶ إنشاء مدير النظام واسم المدرسة"
"${PSQL[@]}" -v admin_id="$ADMIN_ID" -v admin_name="$ADMIN_NAME" -v school="$SCHOOL_NAME" <<'SQL'
-- (بدون on conflict: مشغّل تشفير كلمة المرور يعمل قبل فحص التعارض فيترك سجلاً يتيماً)
insert into public.users (id, name, role, national_id, password)
select 'admin-' || md5(random()::text), :'admin_name', 'admin', :'admin_id', 'itqan123'
where not exists (select 1 from public.users where national_id = :'admin_id');

insert into public.app_settings (key, value, updated_at)
select 'school_name', to_jsonb(:'school'::text), now() where :'school' <> ''
on conflict (key) do update set value = excluded.value, updated_at = now();
SQL

if [ -n "${OWNER_KEY:-}" ]; then
  echo "▶ ضبط مفتاح لوحة صاحب المنصة"
  # متغيرات psql (:'k') لا تُستبدل مع -c، فنمرّر الأمر من stdin
  printf '%s\n' "select itqan.set_owner_key(:'k');" | "${PSQL[@]}" -q -v k="$OWNER_KEY" >/dev/null
fi

echo "▶ التحقق"
"${PSQL[@]}" -tA <<'SQL'
select 'مديرو النظام: ' || count(*) from public.users where role::text = 'admin';
select 'كلمات مرور مشفّرة: ' || count(*) from itqan.credentials;
select 'كلمات مرور بنص صريح (يجب 0): ' || count(*) from public.users where password is not null;
select 'سياسات الحماية: ' || count(*) from pg_policies where schemaname = 'public';
select 'اسم المدرسة: ' || coalesce((select value #>> '{}' from public.app_settings where key = 'school_name'), '(لم يُحدَّد)');
SQL
echo "✓ تم إعداد المدرسة. ادخل برقم هوية المدير وكلمة المرور itqan123 ثم غيّرها."
