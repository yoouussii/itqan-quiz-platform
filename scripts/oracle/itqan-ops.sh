#!/bin/bash
# =====================================================================
# منصة إتقان — مراقبة المنصة ونسخة احتياطية يومية على سيرفر Oracle
#  1) المراقبة: كل 5 دقائق يتأكد أن المنصة وقاعدة البيانات تعملان، وإن توقفت
#     إحداهما (فحصان متتاليان) تصلك رسالة تيليجرام، ثم رسالة عند عودتها.
#     الفحص نفسه طلب حقيقي للخادم، فلا تتوقف قاعدة البيانات المجانية في الإجازات.
#  2) النسخة الاحتياطية: كل يوم 2:30 صباحاً (الرياض) نسخة كاملة من قاعدة البيانات
#     (الجداول والبيانات) في /var/backups/itqan، تُحفظ آخر 30 يوماً + نسخة كل شهر لسنة.
#     تصلك رسالة عند أي فشل، وملخص أسبوعي كل أحد.
#
# التثبيت (على السيرفر):
#   curl -fsSL https://raw.githubusercontent.com/yoouussii/itqan-quiz-platform/main/scripts/oracle/itqan-ops.sh -o itqan-ops.sh
#   sudo bash itqan-ops.sh
# بعد التثبيت:  sudo itqan-ops test | backup | status | reconfigure
# الأسرار (رابط قاعدة البيانات ورمز البوت) تُكتب مخفية، وتُحفظ في /etc/itqan-ops.env (للمدير root فقط).
#
# الاسترجاع (عند الحاجة فقط، في مشروع Supabase جديد فارغ):
#   . /opt/itqan-ops/pg.env
#   $PG_BIN/pg_restore --no-owner --no-privileges -d "رابط_قاعدة_البيانات_الجديدة" /var/backups/itqan/daily/itqan-YYYY-MM-DD.dump
#   (رسالة «schema public already exists» طبيعية). ثم أعد تشغيل «Supabase migrate» لإعادة المهام المجدولة.
# =====================================================================
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1
[ "$(id -u)" = 0 ] || { echo "شغّل الأمر بـ sudo"; exit 1; }

D=/opt/itqan-ops
ENV=/etc/itqan-ops.env
BK=/var/backups/itqan

q() { local v=${2//\'/\'\\\'\'}; printf "%s='%s'\n" "$1" "$v"; }

configure() {
  echo "==== إعداد المراقبة والنسخ الاحتياطي ===="
  echo "القيم تجدها في Vercel ← المشروع ← Settings ← Environment Variables، وفي Supabase ← Connect."
  read -rp "رابط المنصة (مثل https://itqan-quiz-platform.vercel.app): " PLATFORM_URL
  read -rp "VITE_SUPABASE_URL: " SUPA_URL
  read -rp "VITE_SUPABASE_ANON_KEY (المفتاح العام): " SUPA_ANON
  echo "رابط قاعدة البيانات: من Supabase ← Connect ← Session pooler (المنفذ 5432)، بعد وضع كلمة مرور قاعدة البيانات مكان [YOUR-PASSWORD]."
  read -rsp "DB URL (لن يظهر أثناء الكتابة): " DB_URL; echo
  echo "بوت تيليجرام: افتح @BotFather في تيليجرام ← /newbot ← انسخ الرمز (token). ثم افتح البوت الجديد وأرسل له أي رسالة."
  read -rsp "Telegram bot token (لن يظهر أثناء الكتابة): " TG_TOKEN; echo
  TG_CHAT=""
  if [ -n "$TG_TOKEN" ]; then
    read -rp "أرسلت رسالة للبوت؟ اضغط Enter للمتابعة… " _
    TG_CHAT=$(curl -fsS -m 20 "https://api.telegram.org/bot${TG_TOKEN}/getUpdates" | python3 -c 'import json,sys
d=json.load(sys.stdin).get("result",[])
ids=[u.get("message",{}).get("chat",{}).get("id") for u in d if u.get("message")]
print(ids[-1] if ids else "")' 2>/dev/null || true)
    [ -n "$TG_CHAT" ] && echo "    ✓ تم التعرف على محادثتك ($TG_CHAT)" || echo "    ✗ لم أجد رسالة للبوت. أرسل له رسالة ثم شغّل: sudo itqan-ops reconfigure"
  fi
  umask 077
  { q PLATFORM_URL "${PLATFORM_URL%/}"; q SUPA_URL "${SUPA_URL%/}"; q SUPA_ANON "$SUPA_ANON"; q DB_URL "$DB_URL"; q TG_TOKEN "$TG_TOKEN"; q TG_CHAT "$TG_CHAT"; } > "$ENV"
  chmod 600 "$ENV"
  echo "    ✓ حُفظ الإعداد في $ENV"
}

install_pg_client() {
  # pg_dump يجب أن يكون بإصدار قاعدة البيانات نفسه أو أحدث
  apt-get install -y -q postgresql-client-common postgresql-common curl ca-certificates >/dev/null
  # shellcheck disable=SC1090
  . "$ENV"
  local ver
  if ! ver=$(PGCONNECT_TIMEOUT=20 psql "$DB_URL" -tAc "show server_version_num" 2>/dev/null); then
    apt-get install -y -q postgresql-client >/dev/null
    ver=$(PGCONNECT_TIMEOUT=20 psql "$DB_URL" -tAc "show server_version_num") || { echo "✗ تعذر الاتصال بقاعدة البيانات. تأكد من رابط Session pooler وكلمة المرور، ثم: sudo itqan-ops reconfigure"; exit 1; }
  fi
  local major=$(( ${ver//[^0-9]/} / 10000 ))
  if [ ! -x "/usr/lib/postgresql/$major/bin/pg_dump" ]; then
    echo "    تثبيت أدوات PostgreSQL $major…"
    /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null 2>&1 || true
    apt-get update -q >/dev/null 2>&1 || true
    apt-get install -y -q "postgresql-client-$major" >/dev/null 2>&1 || apt-get install -y -q postgresql-client >/dev/null 2>&1 || true
  fi
  # أحدث pg_dump مثبّت بإصدار قاعدة البيانات أو أحدث (الأحدث يقرأ الأقدم)
  local best=""
  for b in /usr/lib/postgresql/*/bin/pg_dump; do
    [ -x "$b" ] || continue
    local m; m=$(basename "$(dirname "$(dirname "$b")")")
    [ "$m" -ge "$major" ] && { [ -z "$best" ] || [ "$m" -gt "$best" ]; } && best=$m
  done
  [ -n "$best" ] || { echo "✗ لم يُثبَّت pg_dump بإصدار $major أو أحدث"; exit 1; }
  echo "PG_BIN=/usr/lib/postgresql/$best/bin" > "$D/pg.env"
  echo "    ✓ أدوات قاعدة البيانات (الإصدار $best لقاعدة بإصدار $major)"
}

write_scripts() {
  mkdir -p "$D" "$BK/daily" "$BK/monthly" /var/lib/itqan-ops
  chmod 700 "$BK"

  cat > "$D/common.sh" <<'EOS'
# shellcheck disable=SC1091
. /etc/itqan-ops.env
[ -f /opt/itqan-ops/pg.env ] && . /opt/itqan-ops/pg.env
tg() {
  [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ] || return 0
  curl -fsS -m 20 "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT}" --data-urlencode "text=$1" >/dev/null || true
}
EOS

  cat > "$D/monitor.sh" <<'EOS'
#!/bin/bash
# فحص المنصة وقاعدة البيانات (كل 5 دقائق)
. /opt/itqan-ops/common.sh
S=/var/lib/itqan-ops
check() { # name label command...
  local name=$1 label=$2; shift 2
  local f="$S/$name.fails" n
  n=$(cat "$f" 2>/dev/null || echo 0)
  if "$@" >/dev/null 2>&1; then
    [ "$n" -ge 2 ] && tg "✅ منصة إتقان: عاد ${label} للعمل."
    echo 0 > "$f"
  else
    n=$((n + 1)); echo "$n" > "$f"
    [ "$n" -eq 2 ] && tg "⚠️ منصة إتقان: ${label} لا يستجيب منذ 10 دقائق. $(date -u -d '+3 hour' '+%H:%M')"
  fi
}
check site "الموقع" curl -fsS -m 25 -o /dev/null "$PLATFORM_URL"
check api "قاعدة البيانات" curl -fsS -m 25 -o /dev/null -X POST "$SUPA_URL/rest/v1/rpc/itqan_public_branding" \
  -H "apikey: $SUPA_ANON" -H "Authorization: Bearer $SUPA_ANON" -H "Content-Type: application/json" -d '{}'
date -u +%FT%TZ > "$S/last_monitor"
EOS

  cat > "$D/backup.sh" <<'EOS'
#!/bin/bash
# نسخة احتياطية كاملة يومية (الجداول والبيانات والدوال في public و itqan)
. /opt/itqan-ops/common.sh
set -o pipefail
BK=/var/backups/itqan
day=$(date -u -d '+3 hour' +%F)
out="$BK/daily/itqan-$day.dump"
log=/var/lib/itqan-ops/backup.log
if PGCONNECT_TIMEOUT=30 "$PG_BIN/pg_dump" "$DB_URL" -Fc -Z 6 --no-owner --no-privileges -n public -n itqan -f "$out.part" 2>"$log" \
   && "$PG_BIN/pg_restore" -l "$out.part" >/dev/null 2>>"$log"; then
  mv "$out.part" "$out"; chmod 600 "$out"
  # أول يوم في الشهر: نسخة شهرية
  [ "$(date -u -d '+3 hour' +%d)" = "01" ] && cp "$out" "$BK/monthly/itqan-$(date -u -d '+3 hour' +%Y-%m).dump"
  find "$BK/daily" -name 'itqan-*.dump' -mtime +30 -delete
  find "$BK/monthly" -name 'itqan-*.dump' -mtime +370 -delete
  echo "$day $(du -h "$out" | cut -f1)" > /var/lib/itqan-ops/last_backup
  # ملخص أسبوعي (الأحد)
  if [ "$(date -u -d '+3 hour' +%u)" = "7" ] || [ "${1:-}" = "--report" ]; then
    tg "🗄️ منصة إتقان: النسخة الاحتياطية تعمل. آخر نسخة $day ($(du -h "$out" | cut -f1))، المحفوظ $(ls "$BK/daily" | wc -l) يومية و$(ls "$BK/monthly" | wc -l) شهرية، والمساحة الحرة $(df -h "$BK" | awk 'NR==2{print $4}')."
  fi
else
  rm -f "$out.part"
  tg "❌ منصة إتقان: فشلت النسخة الاحتياطية اليومية ($day). $(tail -n 2 "$log" | cut -c1-200)"
  exit 1
fi
EOS

  cat > /usr/local/bin/itqan-ops <<'EOS'
#!/bin/bash
# أوامر المراقبة والنسخ الاحتياطي لمنصة إتقان
case "${1:-status}" in
  test)
    . /opt/itqan-ops/common.sh
    tg "👋 منصة إتقان: رسالة تجربة من سيرفر المراقبة. ستصلك التنبيهات هنا."
    bash /opt/itqan-ops/monitor.sh && echo "✓ فحص المنصة: $(cat /var/lib/itqan-ops/site.fails) أخطاء، قاعدة البيانات: $(cat /var/lib/itqan-ops/api.fails) أخطاء"
    bash /opt/itqan-ops/backup.sh --report && echo "✓ النسخة الاحتياطية: $(cat /var/lib/itqan-ops/last_backup)" ;;
  backup) bash /opt/itqan-ops/backup.sh --report && echo "✓ $(cat /var/lib/itqan-ops/last_backup)" ;;
  status)
    echo "آخر فحص: $(cat /var/lib/itqan-ops/last_monitor 2>/dev/null || echo —)"
    echo "أخطاء متتالية — الموقع: $(cat /var/lib/itqan-ops/site.fails 2>/dev/null || echo 0)، قاعدة البيانات: $(cat /var/lib/itqan-ops/api.fails 2>/dev/null || echo 0)"
    echo "آخر نسخة احتياطية: $(cat /var/lib/itqan-ops/last_backup 2>/dev/null || echo —)"
    ls -lh /var/backups/itqan/daily | tail -n 5 ;;
  reconfigure) bash /opt/itqan-ops/itqan-ops.sh --reconfigure ;;
  *) echo "الاستخدام: sudo itqan-ops test | backup | status | reconfigure" ;;
esac
EOS
  chmod 755 "$D/monitor.sh" "$D/backup.sh" /usr/local/bin/itqan-ops
  cp "$0" "$D/itqan-ops.sh" 2>/dev/null || true

  # المواعيد بتوقيت UTC: المراقبة كل 5 دقائق، والنسخة 23:30 UTC = 2:30 صباحاً بتوقيت الرياض
  cat > /etc/cron.d/itqan-ops <<'EOS'
SHELL=/bin/bash
*/5 * * * * root /opt/itqan-ops/monitor.sh
30 23 * * * root /opt/itqan-ops/backup.sh
EOS
  chmod 644 /etc/cron.d/itqan-ops
}

echo ">>> 1/4 الإعداد"
if [ ! -f "$ENV" ] || [ "${1:-}" = "--reconfigure" ]; then configure; else echo "    الإعداد موجود ($ENV). لتغييره: sudo itqan-ops reconfigure"; fi
echo ">>> 2/4 أدوات قاعدة البيانات"
mkdir -p "$D"
install_pg_client
echo ">>> 3/4 السكربتات والمواعيد"
write_scripts
echo "    ✓ المراقبة كل 5 دقائق، والنسخة الاحتياطية يومياً 2:30 ص"
echo ">>> 4/4 تجربة"
/usr/local/bin/itqan-ops test || echo "✗ فشلت التجربة. راجع الرسالة أعلاه."
echo ">>> تم. الأوامر: sudo itqan-ops status | test | backup | reconfigure"
