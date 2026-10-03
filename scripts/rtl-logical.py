"""تحويل أصناف Tailwind الاتجاهية (left/right) إلى منطقية (start/end) لتنقلب تلقائياً مع اتجاه اللغة.
الكود مكتوب للعربية (RTL)، فاليمين = البداية (start) واليسار = النهاية (end).
الاستخدام: python3 scripts/rtl-logical.py src/**/*.tsx"""
import re, sys

B = r"""(?<=[\s"'`:{(])"""          # بداية صنف (أو بعد بادئة مثل sm: أو hover:)
E = r"""(?=[\s"'`})]|$)"""            # نهاية صنف

RULES = [
    (re.compile(B + r"(-?)ml-(?=[\w\[\.])"), r"\1me-"),
    (re.compile(B + r"(-?)mr-(?=[\w\[\.])"), r"\1ms-"),
    (re.compile(B + r"pl-(?=[\w\[\.])"), r"pe-"),
    (re.compile(B + r"pr-(?=[\w\[\.])"), r"ps-"),
    # الموضع: left-1/2 مع translate للتوسيط يبقى كما هو
    (re.compile(B + r"(-?)left-(?!1/2)(?=[\w\[\.])"), r"\1end-"),
    (re.compile(B + r"(-?)right-(?!1/2)(?=[\w\[\.])"), r"\1start-"),
    (re.compile(B + r"text-right" + E), r"text-start"),
    (re.compile(B + r"text-left" + E), r"text-end"),
    (re.compile(B + r"border-l(?=-\d|" + E[3:]), r"border-e"),
    (re.compile(B + r"border-r(?=-\d|" + E[3:]), r"border-s"),
    (re.compile(B + r"rounded-tl(?=-|" + E[3:]), r"rounded-se"),
    (re.compile(B + r"rounded-tr(?=-|" + E[3:]), r"rounded-ss"),
    (re.compile(B + r"rounded-bl(?=-|" + E[3:]), r"rounded-ee"),
    (re.compile(B + r"rounded-br(?=-|" + E[3:]), r"rounded-es"),
    (re.compile(B + r"rounded-l(?=-|" + E[3:]), r"rounded-e"),
    (re.compile(B + r"rounded-r(?=-|" + E[3:]), r"rounded-s"),
]

total = 0
for f in sys.argv[1:]:
    s = open(f, encoding="utf-8").read()
    out = s
    for rx, rep in RULES:
        out, n = rx.subn(rep, out)
        total += n
    if out != s:
        open(f, "w", encoding="utf-8").write(out)
print("replaced", total)
