-- =====================================================================
-- طوارئ فقط: إيقاف سياسات الحماية (RLS) إذا ظهرت مشكلة بعد أجزاء 003_security
--
-- يُبقي تسجيل الدخول الجديد وتشفير كلمات المرور كما هي (لا تعود النصوص الصريحة)،
-- ويفتح الجداول كما كانت قبل الحماية. شغّله، ثم أبلغ المطوّر بالمشكلة،
-- ثم أعد تشغيل الجزء 5 من 003_security بعد إصلاحها.
-- =====================================================================
do $$
declare t text; p record;
begin
  foreach t in array array['users','subjects','classes','quizzes','submissions','notifications',
                           'notification_reads','activity_log','student_awards','app_settings','user_avatars']
  loop
    continue when to_regclass('public.' || t) is null;
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I disable row level security', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
