/**
 * صور الأسئلة.
 * - الصورة تُضغط على جهاز المعلم (حتى 1000 بكسل)، وتبقى في السؤال كـ data URL أثناء التحرير.
 * - عند حفظ الاختبار تُرفع للخادم (060) ويُحفظ مكانها رابط قصير «itqan-media:<id>»، فيبقى تحميل الاختبارات خفيفاً.
 * - عند العرض يُجلب الرابط القصير مرة واحدة ويُحفظ في الذاكرة.
 * - إن لم يكن الخادم جاهزاً (لم يُشغَّل 060) تبقى الصورة داخل السؤال وتعمل كما هي.
 */
import { supabase, isSupabaseConfigured, isMissingRpc } from '../services/supabase';

export const MEDIA_SCHEME = 'itqan-media:';
export const MEDIA_ID_RE = /^itqan-media:(qm-[0-9a-f]{18})$/;
export const DATA_IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_SIDE = 1000;

/** ضغط صورة (ملف أو data URL أو Blob) إلى JPEG بخلفية بيضاء (أو PNG للرسوم الصغيرة) */
export async function compressImage(src: Blob | string, maxSide = MAX_SIDE): Promise<string | null> {
  try {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('image'));
      im.src = url;
    });
    if (typeof src !== 'string') URL.revokeObjectURL(url);
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0 || w0 * h0 < 400) return null; // نقطة أو خط زخرفي
    const k = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.round(w0 * k), h = Math.round(h0 * k);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const png = c.toDataURL('image/png');
    const jpg = c.toDataURL('image/jpeg', 0.85);
    // الرسوم البيانية والأشكال الهندسية تبقى PNG إن كانت أصغر
    return png.length < jpg.length ? png : jpg;
  } catch {
    return null;
  }
}

// ── الجلب للعرض (مجمّع ومخزّن في الذاكرة) ──
const cache = new Map<string, string>();
/** صورة مضمّنة ← رابطها القصير (ما رُفع أو جُلب من الخادم في هذه الجلسة) */
const uploaded = new Map<string, string>();
const waiting = new Map<string, Array<(v: string | null) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const ids = Array.from(waiting.keys()).slice(0, 40);
  const cbs = ids.map((id) => [id, waiting.get(id)!] as const);
  ids.forEach((id) => waiting.delete(id));
  let rows: Array<{ id: string; mime: string; data: string }> = [];
  if (isSupabaseConfigured()) {
    const { data } = await supabase.rpc('itqan_media_get', { p_ids: ids });
    rows = (data as typeof rows) || [];
  }
  const found = new Map(rows.map((r) => [r.id, `data:${r.mime};base64,${r.data}`]));
  cbs.forEach(([id, fns]) => {
    const v = found.get(id) || null;
    if (v) { cache.set(id, v); uploaded.set(v, `${MEDIA_SCHEME}${id}`); }
    fns.forEach((fn) => fn(v));
  });
  if (waiting.size) timer = setTimeout(() => void flush(), 0);
}

/** رابط الصورة الفعلي لمعرّف «qm-…» */
export function loadMedia(id: string): Promise<string | null> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const list = waiting.get(id) || [];
    list.push(resolve);
    waiting.set(id, list);
    if (!timer) timer = setTimeout(() => void flush(), 30);
  });
}

/** يملأ صور «data-media» داخل عنصر معروض */
export function hydrateMediaIn(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll<HTMLImageElement>('img[data-media]').forEach((img) => {
    const id = img.dataset.media || '';
    if (img.getAttribute('src')) return;
    void loadMedia(id).then((src) => { if (src) img.src = src; else img.alt = '⚠'; });
  });
}

/** نسخة من HTML بصور كاملة (للطباعة) */
export async function inlineMediaHtml(html: string): Promise<string> {
  if (!html || !html.includes(MEDIA_SCHEME)) return html;
  const ids = Array.from(new Set(Array.from(html.matchAll(/itqan-media:(qm-[0-9a-f]{18})/g)).map((m) => m[1])));
  const urls = await Promise.all(ids.map((id) => loadMedia(id)));
  let out = html;
  ids.forEach((id, i) => { if (urls[i]) out = out.split(`${MEDIA_SCHEME}${id}`).join(urls[i]!); });
  return out;
}

// ── الرفع عند الحفظ ──
let serverReady: boolean | null = null;

/** رفع صورة واحدة ← «itqan-media:…» أو null إن لم يكن الخادم جاهزاً */
export async function uploadImage(dataUrl: string): Promise<string | null> {
  const known = uploaded.get(dataUrl);
  if (known) return known;
  if (serverReady === false || !isSupabaseConfigured()) return null;
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
  if (!m || dataUrl.length > 1_400_000) return null;
  const { data, error } = await supabase.rpc('itqan_media_put', { p_mime: m[1], p_data: m[2] });
  if (error) {
    if (isMissingRpc(error)) serverReady = false;
    return null;
  }
  serverReady = true;
  const ref = `${MEDIA_SCHEME}${data as string}`;
  uploaded.set(dataUrl, ref);
  cache.set(String(data), dataUrl);
  return ref;
}

/** يستبدل الصور المضمّنة في HTML بروابط قصيرة بعد رفعها (ما يفشل رفعه يبقى كما هو) */
export async function externalizeHtml(html: string): Promise<string> {
  if (!html || !html.includes('data:image/')) return html;
  const srcs = Array.from(new Set(Array.from(html.matchAll(/src="(data:image\/[^"]+)"/g)).map((m) => m[1])));
  let out = html;
  for (const s of srcs) {
    const ref = await uploadImage(s);
    if (ref) out = out.split(`src="${s}"`).join(`src="${ref}"`);
  }
  return out;
}

/** رفع صور أسئلة الاختبار كلها: يُرجع الأسئلة بعد الاستبدال، وهل تغيّر شيء */
export async function externalizeQuestions<T extends { question_text?: string; options?: string[]; explanation?: string; sub_questions?: any[] }>(qs: T[]): Promise<{ questions: T[]; changed: boolean }> {
  let changed = false;
  const fix = async (h?: string) => {
    if (!h || !h.includes('data:image/')) return h;
    const n = await externalizeHtml(h);
    if (n !== h) changed = true;
    return n;
  };
  const out: T[] = [];
  for (const q of qs) {
    const nq: any = { ...q, question_text: await fix(q.question_text), explanation: await fix(q.explanation) };
    if (Array.isArray(q.options)) nq.options = await Promise.all(q.options.map((o) => fix(o)));
    if (Array.isArray(q.sub_questions)) nq.sub_questions = await Promise.all(q.sub_questions.map(async (s) => ({ ...s, question_text: await fix(s.question_text), explanation: await fix(s.explanation), options: Array.isArray(s.options) ? await Promise.all(s.options.map((o: string) => fix(o))) : s.options })));
    out.push(nq);
  }
  return { questions: out, changed };
}
