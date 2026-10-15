#!/bin/bash
# =====================================================================
# منصة إتقان — تفعيل «الدخول الآمن» على خادم Jitsi (رموز JWT من المنصة)
#  - لا يدخل الحصة إلا من يفتحها من المنصة (الرمز يوقّعه خادم المنصة).
#  - المعلم «مشرف» تلقائياً، والطالب «مشارك» لا يستطيع طرد أحد أو كتم غيره.
#  - يلغي حسابات teacher/guest القديمة (secure domain).
#
# الاستخدام (على خادم Jitsi):
#   sudo bash itqan-jwt.sh DOMAIN APP_ID SECRET
# الأمر الكامل يظهر للمدير في المنصة: الحصص المباشرة ← إعدادات الخادم ← توليد السرّ.
# آمن لإعادة التشغيل، ويحفظ نسخة احتياطية من كل ملف يعدّله.
# =====================================================================
set -e
# لا أسئلة ولا إعادة تشغيل خدمات أثناء التثبيت (needrestart يعلّق Cloud Shell)
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1
H="$1"; APP="$2"; SECRET="$3"
if [ -z "$H" ] || [ -z "$APP" ] || [ -z "$SECRET" ]; then
  echo "usage: sudo bash itqan-jwt.sh DOMAIN APP_ID SECRET"; exit 1
fi
P=/etc/prosody/conf.avail/$H.cfg.lua
C=/etc/jitsi/meet/$H-config.js
J=/etc/jitsi/jicofo/jicofo.conf
PLUG=/usr/share/jitsi-meet/prosody-plugins
for f in "$P" "$C" "$J"; do [ -f "$f" ] || { echo "missing $f"; exit 1; }; done
TS=$(date +%Y%m%d%H%M%S)
cp "$P" "$P.$TS.bak"; cp "$C" "$C.$TS.bak"; cp "$J" "$J.$TS.bak"
echo ">>> backups: *.$TS.bak"

echo ">>> 1/5 Lua libraries for tokens (Lua 5.4)"
apt-get install -y -q libssl-dev luarocks liblua5.4-dev build-essential m4 2>&1 | grep -E "^(Setting up|E:)" || true
echo "    (luaossl build takes 1-3 minutes)"
lua5.4 -e 'require "cjson.safe"' 2>/dev/null || luarocks --lua-version 5.4 install lua-cjson 2>&1 | tail -n 1
lua5.4 -e 'require "basexx"' 2>/dev/null || luarocks --lua-version 5.4 install basexx 2>&1 | tail -n 1
lua5.4 -e 'require "openssl.hmac"' 2>/dev/null || luarocks --lua-version 5.4 install luaossl 2>&1 | tail -n 1
if [ ! -f "$PLUG/luajwtjitsi.lib.lua" ]; then
  lua5.4 -e 'require "luajwtjitsi"' 2>/dev/null || luarocks --lua-version 5.4 install luajwtjitsi 2>&1 | tail -n 1
fi
lua5.4 -e 'require "cjson.safe"; require "basexx"; require "openssl.hmac"; print("    libs OK")'

echo ">>> 2/5 token_affiliation module (teacher = moderator)"
curl -fsSL https://raw.githubusercontent.com/jitsi-contrib/prosody-plugins/main/token_affiliation/mod_token_affiliation.lua \
  -o "$PLUG/mod_token_affiliation.lua"

echo ">>> 3/5 prosody config"
python3 - "$P" "$H" "$APP" "$SECRET" <<'PY'
import re, sys
p, h, app, sec = sys.argv[1:]
s = open(p).read()

# حذف مضيف الضيوف (secure domain القديم): أُضيف في آخر الملف
i = s.find('VirtualHost "guest.%s"' % h)
if i >= 0:
    s = s[:i].rstrip() + '\n'

def block(src, header):
    """بداية ونهاية قسم يبدأ بـ header حتى أول VirtualHost/Component بعده"""
    a = src.find(header)
    if a < 0:
        sys.exit('not found: ' + header)
    m = re.compile(r'^(VirtualHost|Component)\s', re.M).search(src, a + len(header))
    return a, (m.start() if m else len(src))

# المضيف الرئيسي: المصادقة بالرمز
a, b = block(s, 'VirtualHost "%s"' % h)
body = s[a:b]
body = re.sub(r'^\s*(app_id|app_secret|allow_empty_token)\s*=.*\n', '', body, flags=re.M)
body, n = re.subn(r'^(\s*)authentication\s*=\s*"[^"]*"[^\n]*\n',
                  lambda m: '%sauthentication = "token"\n%sapp_id = "%s"\n%sapp_secret = "%s"\n%sallow_empty_token = false\n'
                  % (m.group(1), m.group(1), app, m.group(1), sec, m.group(1)), body, count=1, flags=re.M)
if n != 1:
    sys.exit('authentication line not found in main host')
s = s[:a] + body + s[b:]

# غرف الاجتماعات: التحقق من الرمز + صلاحية المعلم
a, b = block(s, 'Component "conference.%s" "muc"' % h)
body = s[a:b]
for mod in ('token_verification', 'token_affiliation'):
    if '"%s"' % mod not in body:
        body, n = re.subn(r'modules_enabled\s*=\s*\{', 'modules_enabled = {\n        "%s";' % mod, body, count=1)
        if n != 1:
            sys.exit('modules_enabled not found in conference component')
s = s[:a] + body + s[b:]
open(p, 'w').write(s)
print('    prosody config OK')
PY

echo ">>> 4/5 jitsi-meet + jicofo config"
sed -i '/config\.hosts\.anonymousdomain/d' "$C"
sed -i '/^jicofo\.authentication/d; /^jicofo\.conference\.enable-auto-owner/d' "$J"
echo 'jicofo.conference.enable-auto-owner = false' >> "$J"

echo ">>> 5/5 restart"
LOG=/var/log/prosody/prosody.log; L=$(wc -l < "$LOG" 2>/dev/null || echo 0)
systemctl restart prosody; sleep 3
systemctl restart jicofo jitsi-videobridge2; sleep 8
echo "==== services ===="; systemctl is-active prosody jicofo jitsi-videobridge2 nginx
echo "==== new prosody errors ===="
tail -n +$((L + 1)) "$LOG" 2>/dev/null | grep -iE "error" | tail -n 8 | cut -c1-220 || true
echo ">>> DONE. Rollback: for f in $P $C $J; do sudo cp \$f.$TS.bak \$f; done; sudo systemctl restart prosody jicofo"
