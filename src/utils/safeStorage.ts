/**
 * ذاكرة المتصفح المحلية بلا بيانات قديمة.
 *
 * المنصة تحفظ نسخة سريعة من البيانات (الاختبارات والأسئلة والمستخدمين والإعدادات…) في localStorage،
 * وحجمه محدود (~5MB). حين يمتلئ — وأكثر ما يحدث لحساب المدير لكثرة بياناته — كان الحفظ يفشل بصمت
 * فتبقى النسخة القديمة وتُقرأ في كل مرة: اختبار موجود لا يظهر، أو صورة محفوظة لا تظهر،
 * ويختلف ذلك من متصفح لآخر. وبعض المواضع كانت ترمي خطأً يوقف المزامنة في منتصفها.
 *
 * هنا (يُحمَّل قبل أي شيء آخر):
 *  - كل كتابة تُحفظ في ذاكرة الصفحة أولاً، فتقرأ الصفحة دائماً آخر قيمة طوال الجلسة.
 *  - إن امتلأت الذاكرة الدائمة: نحذف أكبر نسخ الكاش الأخرى (وهي ما زالت في ذاكرة الصفحة) ونعيد المحاولة،
 *    وإن فشلت نحذف النسخة القديمة من المفتاح نفسه بدل تركها، فتُجلب من الخادم في المرة القادمة.
 *  - لا ترمي الكتابة أي خطأ.
 */

// مفاتيح صغيرة تُبقي الجلسة والتفضيلات ولا تُحذف لإفساح المكان
const KEEP = /^(itqan_session|itqan_current_user|itqan_lang|itqan_theme|itqan_tour_|itqan_active_attempt|itqan_pending_attempts|sb-)/;

// قائمة المستخدمين: يُعرف منها المستخدم الحالي عند فتح الصفحة، فلا تُحذف كلها بل يبقى سجله هو
const USERS_KEY = 'itqan_users_v2';
const CUR_KEY = 'itqan_current_user_id_v2';
const onlyCurrentUser = (raw: string | null, curId: string | null): string => {
  try {
    const me = curId ? (JSON.parse(raw || '[]') as Array<{ id?: string }>).filter((u) => u && u.id === curId) : [];
    return JSON.stringify(me);
  } catch { return '[]'; }
};

function install() {
  if (typeof window === 'undefined' || typeof Storage === 'undefined') return;
  let local: Storage;
  try { local = window.localStorage; } catch { return; }
  if (!local || (Storage.prototype as any).__itqanSafe) return;

  const proto = Storage.prototype;
  const origGet = proto.getItem, origSet = proto.setItem, origRemove = proto.removeItem, origClear = proto.clear, origKey = proto.key;
  const mem = new Map<string, string>();

  const diskKeys = (s: Storage): string[] => {
    const out: string[] = [];
    try { for (let i = 0; i < s.length; i++) { const k = origKey.call(s, i); if (k !== null) out.push(k); } } catch { /* ignore */ }
    return out;
  };

  // يحذف أكبر نسخ الكاش (غير المفتاح الجاري حفظه) حتى يتسع المكان
  const makeRoom = (s: Storage, except: string, need: number): boolean => {
    const cands = diskKeys(s)
      .filter((k) => k !== except && !KEEP.test(k))
      .map((k) => ({ k, size: (origGet.call(s, k) || '').length }))
      .sort((a, b) => b.size - a.size);
    let freed = 0;
    for (const c of cands) {
      // نُبقي قيمته في ذاكرة الصفحة إن لم تكن فيها، فلا تتغير الصفحة الحالية
      const v = mem.has(c.k) ? mem.get(c.k)! : origGet.call(s, c.k);
      if (v !== null && !mem.has(c.k)) mem.set(c.k, v);
      try {
        origRemove.call(s, c.k);
        if (c.k === USERS_KEY) origSet.call(s, USERS_KEY, onlyCurrentUser(v, origGet.call(s, CUR_KEY)));
      } catch { /* ignore */ }
      freed += c.size;
      if (freed >= need * 1.2) return true;
    }
    return freed > 0;
  };

  proto.setItem = function (this: Storage, key: string, value: string) {
    if (this !== local) return origSet.call(this, key, value);
    const k = String(key), v = String(value);
    mem.set(k, v);
    try { origSet.call(this, k, v); return; } catch { /* ممتلئة */ }
    try { if (makeRoom(this, k, v.length)) { origSet.call(this, k, v); return; } } catch { /* ما زالت ممتلئة */ }
    // لا مكان: لا نترك نسخة قديمة تُقرأ لاحقاً (ونُبقي سجل المستخدم الحالي فقط من قائمة المستخدمين)
    try { origRemove.call(this, k); } catch { /* ignore */ }
    if (k === USERS_KEY) { try { origSet.call(this, k, onlyCurrentUser(v, origGet.call(this, CUR_KEY))); } catch { /* ignore */ } }
    if (!(window as any).__itqanStorageFull) {
      (window as any).__itqanStorageFull = true;
      console.warn('[itqan] ذاكرة المتصفح ممتلئة: تُستخدم بيانات الخادم مباشرة لهذه الجلسة');
    }
  };

  proto.getItem = function (this: Storage, key: string) {
    if (this === local) { const k = String(key); if (mem.has(k)) return mem.get(k)!; }
    return origGet.call(this, key);
  };

  proto.removeItem = function (this: Storage, key: string) {
    if (this === local) mem.delete(String(key));
    return origRemove.call(this, key);
  };

  proto.clear = function (this: Storage) {
    if (this === local) mem.clear();
    return origClear.call(this);
  };

  // تبويب آخر غيّر قيمة: نقرأها من الذاكرة الدائمة بدل نسختنا
  window.addEventListener('storage', (e) => {
    if (e.storageArea !== local) return;
    if (e.key === null) mem.clear(); else mem.delete(e.key);
  });

  Object.defineProperty(proto, '__itqanSafe', { value: true });
}

install();

/** «تحديث البيانات من الخادم»: يمسح نسخ الكاش المحلية (مع إبقاء الجلسة والتفضيلات) ثم يعيد التحميل */
export function resetLocalCache() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('itqan_') && !KEEP.test(k)) keys.push(k); }
    const users = localStorage.getItem(USERS_KEY), cur = localStorage.getItem(CUR_KEY);
    keys.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(USERS_KEY, onlyCurrentUser(users, cur));
  } catch { /* ignore */ }
  window.location.reload();
}
