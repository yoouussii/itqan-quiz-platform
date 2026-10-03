"""مساعد الترجمة: يغلّف النصوص العربية الواضحة في JSX بـ t('...') ويضيف الاستيراد.
- نصوص JSX بين الوسوم:  <h1>نتائجي</h1>  ←  <h1>{t('نتائجي')}</h1>
- خصائص الواجهة: aria-label / title / placeholder / alt
لا يلمس النصوص داخل الكود (مثل المقارنات أو البيانات)، فتُراجع يدوياً:
  node scripts/i18n-check.mjs --raw <الملف>
الاستخدام: python3 scripts/i18n-wrap.py <ملفات>"""
import os, re, sys

AR = r"[؀-ۿ]"
# نص JSX: بين > (أو }) وبين < (أو {)، بلا رموز كود
JSX_TEXT = re.compile(r"(?<=[>}])([^<>{}'\"`=;&|$*]*" + AR + r"[^<>{}'\"`=;&|$*]*)(?=[<{])")
ATTR = re.compile(r"\b(aria-label|title|placeholder|alt|label|subtitle|hint|description)=\"([^\"]*" + AR + r"[^\"]*)\"")


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def wrap_text(m: re.Match) -> str:
    raw = m.group(1)
    if not raw.strip():
        return raw
    lead = raw[: len(raw) - len(raw.lstrip())]
    trail = raw[len(raw.rstrip()):]
    core = " ".join(raw.split())
    # مسافة بادئة/لاحقة داخل السطر لها معنى بين نص وتعبير؛ الأسطر الجديدة لا
    lead = " " if lead and "\n" not in lead else lead
    trail = " " if trail and "\n" not in trail else trail
    pre = "{' '}" if lead == " " else lead
    post = "{' '}" if trail == " " else trail
    return f"{pre}{{t('{esc(core)}')}}{post}"


def add_import(s: str, path: str) -> str:
    rel = os.path.relpath("src/i18n", os.path.dirname(path)).replace(os.sep, "/")
    if not rel.startswith("."):
        rel = "./" + rel
    m = re.search(r"import \{([^}]*)\} from '" + re.escape(rel) + "';", s)
    if m:
        names = [n.strip() for n in m.group(1).split(",") if n.strip()]
        if "t" not in names:
            names.append("t")
        return s[: m.start()] + "import { " + ", ".join(names) + " } from '" + rel + "';" + s[m.end():]
    lines = s.split("\n")
    last = max(i for i, l in enumerate(lines) if l.startswith("import "))
    while not lines[last].rstrip().endswith(";"):
        last += 1
    lines.insert(last + 1, f"import {{ t }} from '{rel}';")
    return "\n".join(lines)


# --literals: يغلّف أيضاً النصوص العربية بين علامتي ' ' داخل الكود (راجع الفرق: لا تغلّف بيانات تُقارن أو تُحفظ)
LITERAL = re.compile(r"(?<![\w.])(?<!(?<![\w$.])t\()'((?:[^'\\\n]|\\.)*" + AR + r"(?:[^'\\\n]|\\.)*)'")
literals = "--literals" in sys.argv
for path in [a for a in sys.argv[1:] if not a.startswith("--")]:
    s = open(path, encoding="utf-8").read()
    out = ATTR.sub(lambda m: f"{m.group(1)}={{t('{esc(m.group(2))}')}}", s)
    # إخفاء النصوص بين علامات التنصيص مؤقتاً حتى لا يُغلَّف ما بداخلها (مثل t('{title} يبدأ'))
    masked = []
    def _mask(m):
        masked.append(m.group(0))
        return f"\x00{len(masked) - 1}\x00"
    out = re.sub(r"'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`", _mask, out)
    out = JSX_TEXT.sub(wrap_text, out)
    out = re.sub(r"\x00(\d+)\x00", lambda m: masked[int(m.group(1))], out)
    if literals:
        lines = out.split("\n")
        for i, l in enumerate(lines):
            st = l.lstrip()
            if st.startswith(("//", "*", "/*", "import ")):
                continue
            # لا نلمس داخل القوالب `...${}...` (تُحوَّل يدوياً)
            if "`" in l:
                continue
            lines[i] = LITERAL.sub(lambda m: f"t('{m.group(1)}')", l)
        out = "\n".join(lines)
    if out != s:
        out = add_import(out, path)
        open(path, "w", encoding="utf-8").write(out)
        print("wrapped", path)
